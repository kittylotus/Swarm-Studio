import { bindExpandedField, openExpandedEditor } from '../ui/expanded-editor';
import type { SwarmModel } from '../swarm/types';
import { buildLlmRequest } from './contracts';
import { compileMossLayout, detectPromptMode, enhancementInstructions, promptModeHint, promptModes, type PromptMode } from './prompts';
import { loadLlmSettings } from './settings';
import { streamEnhancement } from './transport';
import './styles.css';

interface EnhancerHost {
  prompt: string;
  model?: SwarmModel;
  width: number;
  height: number;
  apply(prompt: string, layout: boolean): boolean;
  settings(): void;
}

export function openPromptEnhancer(host: EnhancerHost): void {
  if (document.querySelector('.prompt-enhancer-dialog')) return;
  const previousFocus = document.activeElement as HTMLElement | null;
  const dialog = document.createElement('dialog');
  dialog.className = 'prompt-enhancer-dialog';
  dialog.setAttribute('aria-labelledby', 'enhancer-title');
  dialog.innerHTML = `
    <header class="enhancer-header">
      <span class="enhancer-spark" aria-hidden="true">✦</span>
      <h2 id="enhancer-title">Enhance positive prompt</h2>
      <button type="button" class="icon-button" data-close aria-label="Close prompt enhancer" autofocus>×</button>
    </header>
    <div class="enhancer-body">
      <div class="enhancer-context">
        <div class="field enhancer-mode"><select data-mode aria-label="Prompt mode">${Object.entries(promptModes).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></div>
        <p data-context></p>
        <button type="button" class="ghost-button enhancer-system" data-system aria-haspopup="dialog">System prompt<span data-system-edited hidden>Edited</span></button>
      </div>
      <div class="field"><span id="enhancer-input-label">Your prompt or instruction</span><textarea data-input aria-labelledby="enhancer-input-label" rows="3"></textarea></div>
      <section class="enhancer-thought-card" data-thought-card data-phase="idle">
        <button type="button" class="enhancer-thought-toggle" data-thought-toggle aria-expanded="false" aria-controls="enhancer-thought-body">
          <span class="enhancer-thought-charm" aria-hidden="true">✧</span>
          <span class="enhancer-thought-title">Reasoning</span>
          <span class="enhancer-thought-state" data-thought-status>Waiting</span>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="enhancer-thought-content" id="enhancer-thought-body" hidden>
          <p data-thought-empty>Reasoning appears when the provider shares it.</p>
          <pre data-thinking tabindex="0" aria-label="Provider reasoning" hidden></pre>
        </div>
      </section>
      <div class="field"><span id="enhancer-output-label">Enhanced prompt</span><textarea data-output aria-labelledby="enhancer-output-label" placeholder="Your enhanced prompt will appear here…" rows="5"></textarea></div>
    </div>
    <footer class="enhancer-footer">
      <button type="button" class="ghost-button" data-settings>LLM settings</button>
      <p data-status role="status" aria-live="polite"></p>
      <button type="button" class="primary-button" data-run>Enhance</button>
      <button type="button" class="primary-button" data-apply disabled hidden>Apply to positive prompt</button>
    </footer>`;
  document.body.append(dialog);

  const input = dialog.querySelector<HTMLTextAreaElement>('[data-input]')!;
  const output = dialog.querySelector<HTMLTextAreaElement>('[data-output]')!;
  const expandInput = bindExpandedField(input, 'Your prompt or instruction');
  const expandOutput = bindExpandedField(output, 'Enhanced prompt');
  const thoughtCard = dialog.querySelector<HTMLElement>('[data-thought-card]')!;
  const thoughtToggle = dialog.querySelector<HTMLButtonElement>('[data-thought-toggle]')!;
  const thoughtBody = dialog.querySelector<HTMLElement>('#enhancer-thought-body')!;
  const thinking = dialog.querySelector<HTMLElement>('[data-thinking]')!;
  const thoughtStatus = dialog.querySelector<HTMLElement>('[data-thought-status]')!;
  const thoughtEmpty = dialog.querySelector<HTMLElement>('[data-thought-empty]')!;
  const status = dialog.querySelector<HTMLElement>('[data-status]')!;
  const modeSelect = dialog.querySelector<HTMLSelectElement>('[data-mode]')!;
  const systemButton = dialog.querySelector<HTMLButtonElement>('[data-system]')!;
  const systemEdited = dialog.querySelector<HTMLElement>('[data-system-edited]')!;
  const run = dialog.querySelector<HTMLButtonElement>('[data-run]')!;
  const apply = dialog.querySelector<HTMLButtonElement>('[data-apply]')!;
  const settings = loadLlmSettings();
  const systemEdits = new Map<PromptMode, string>();
  let mode: PromptMode = 'auto';
  let controller: AbortController | null = null;
  let hasResult = false;
  let resultIsCurrent = false;

  try {
    const value = localStorage.getItem('swarm-studio-prompt-mode');
    if (value && Object.hasOwn(promptModes, value)) mode = value as PromptMode;
  } catch {}
  modeSelect.value = mode;
  (modeSelect.options[0]!).text = `Auto · ${promptModes[detectPromptMode(host.model)]}`;
  input.value = host.prompt;
  dialog.querySelector<HTMLElement>('[data-context]')!.textContent = `${host.model?.title || host.model?.name || 'No checkpoint selected'} · ${host.width} × ${host.height}`;

  const defaultSystemPrompt = () => enhancementInstructions(mode, host.model, host.width, host.height, settings.customInstructions);
  const syncControls = () => {
    const streaming = controller !== null;
    run.textContent = streaming ? 'Stop' : hasResult ? 'Enhance again' : 'Enhance';
    run.className = streaming ? 'danger-soft' : resultIsCurrent ? 'secondary-button' : 'primary-button';
    run.disabled = !streaming && !input.value.trim();
    apply.hidden = !hasResult;
    apply.disabled = !resultIsCurrent || !output.value.trim();
    modeSelect.disabled = systemButton.disabled = expandInput.disabled = input.readOnly = streaming;
    output.readOnly = streaming;
    expandOutput.disabled = streaming || (!hasResult && !output.value);
    systemEdited.hidden = !systemEdits.has(mode);
  };
  const invalidateResult = () => {
    if (resultIsCurrent) status.textContent = 'Prompt changed. Enhance again to apply.';
    resultIsCurrent = false;
    syncControls();
  };
  const showThought = (phase: string, label: string) => {
    thoughtCard.dataset.phase = phase;
    thoughtStatus.textContent = label;
  };

  input.addEventListener('input', invalidateResult);
  output.addEventListener('input', syncControls);
  modeSelect.addEventListener('change', () => {
    mode = modeSelect.value as PromptMode;
    invalidateResult();
    try { localStorage.setItem('swarm-studio-prompt-mode', mode); } catch {}
  });
  systemButton.addEventListener('click', () => {
    const defaults = defaultSystemPrompt();
    const current = systemEdits.get(mode) ?? defaults;
    openExpandedEditor({
      title: 'System prompt',
      value: current,
      trigger: systemButton,
      description: promptModeHint(mode, host.model),
      actions: editor => {
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.className = 'ghost-button';
        restore.textContent = 'Restore default';
        restore.disabled = editor.value === defaults;
        editor.addEventListener('input', () => { restore.disabled = editor.value === defaults; });
        restore.addEventListener('click', () => {
          editor.value = defaults;
          editor.setSelectionRange(0, 0);
          editor.scrollTop = 0;
          editor.dispatchEvent(new Event('input'));
        });
        return [restore];
      },
      save: value => {
        if (!value.trim()) return 'Enter system instructions or restore the default.';
        if (value === current) return;
        if (value === defaults) systemEdits.delete(mode);
        else systemEdits.set(mode, value);
        invalidateResult();
      },
    });
  });
  thoughtToggle.addEventListener('click', () => {
    thoughtBody.hidden = !thoughtBody.hidden;
    thoughtToggle.setAttribute('aria-expanded', String(!thoughtBody.hidden));
  });
  dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    controller?.abort();
    dialog.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
    else document.querySelector<HTMLButtonElement>('[data-action="enhance-prompt"]')?.focus();
  }, { once: true });
  dialog.querySelector('[data-settings]')!.addEventListener('click', () => {
    dialog.close();
    host.settings();
  });
  apply.addEventListener('click', () => {
    if (!resultIsCurrent || controller) return;
    try {
      const layout = mode === 'moss-layout';
      const prompt = layout ? compileMossLayout(output.value.trim(), host.width, host.height) : output.value.trim();
      if (!prompt) throw new Error('The enhanced prompt is empty.');
      if (!host.apply(prompt, layout)) throw new Error('The prompt or canvas changed while enhancing. Close and enhance again to preserve those edits.');
      dialog.close();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
    }
  });

  run.addEventListener('click', async () => {
    if (controller) {
      controller.abort();
      return;
    }
    const active = new AbortController();
    controller = active;
    hasResult = resultIsCurrent = false;
    output.value = '';
    thinking.textContent = '';
    thinking.hidden = true;
    thoughtEmpty.hidden = false;
    thoughtEmpty.textContent = 'Waiting for the provider…';
    status.textContent = 'Connecting…';
    showThought('waiting', 'Listening');
    syncControls();

    try {
      const request = buildLlmRequest(settings, systemEdits.get(mode) ?? defaultSystemPrompt(), input.value);
      await streamEnhancement(request, active.signal, delta => {
        if (!dialog.open || active.signal.aborted) return;
        const reasoning = delta.kind === 'thinking';
        const phase = reasoning ? 'Thinking…' : 'Writing prompt…';
        if (status.textContent !== phase) status.textContent = phase;
        if (reasoning) {
          showThought('thinking', 'Thinking');
          thoughtEmpty.hidden = true;
          thinking.hidden = false;
          const follow = thinking.scrollHeight - thinking.scrollTop - thinking.clientHeight < 36;
          thinking.textContent += delta.text;
          if (follow) thinking.scrollTop = thinking.scrollHeight;
        } else {
          output.value += delta.text;
          showThought('writing', thinking.textContent ? 'Available' : 'Waiting');
        }
      });
      active.signal.throwIfAborted();
      if (!dialog.open) return;
      if (!output.value.trim()) throw new Error('The provider returned no prompt. Increase the token limit or check the model.');
      hasResult = resultIsCurrent = true;
      status.textContent = mode === 'moss-layout' ? 'Ready to review. Apply validates and compiles layout coordinates.' : 'Ready to review and apply.';
      showThought(thinking.textContent ? 'ready' : 'idle', thinking.textContent ? 'Available' : 'Not shared');
      thoughtEmpty.textContent = 'The provider didn’t share reasoning for this run.';
    } catch (error) {
      if (!dialog.open) return;
      status.textContent = active.signal.aborted ? 'Stopped. Partial output has not been applied.' : error instanceof Error ? error.message : String(error);
      showThought(thinking.textContent ? 'ready' : 'idle', thinking.textContent ? 'Available' : 'Not shared');
      thoughtEmpty.textContent = 'No reasoning was received this time.';
    } finally {
      controller = null;
      syncControls();
    }
  });
  syncControls();
  dialog.showModal();
}
