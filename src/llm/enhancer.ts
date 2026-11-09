import { buildLlmRequest } from './contracts';
import { compileMossLayout, detectPromptMode, enhancementInstructions, promptModeHint, promptModes, type PromptMode } from './prompts';
import { loadLlmSettings } from './settings';
import { streamEnhancement } from './transport';
import type { SwarmModel } from '../swarm/types';
import './styles.css';

interface EnhancerHost { prompt: string; model?: SwarmModel; width: number; height: number; apply(prompt: string, layout: boolean): boolean; settings(): void }
export function openPromptEnhancer(host: EnhancerHost): void {
  if (document.querySelector('.prompt-enhancer-dialog')) return;
  const previousFocus = document.activeElement as HTMLElement | null;
  const dialog = document.createElement('dialog');
  dialog.className = 'prompt-enhancer-dialog'; dialog.setAttribute('aria-labelledby', 'enhancer-title');
  dialog.innerHTML = `<header><div><span class="panel-kicker">PROMPT ASSISTANT</span><h2 id="enhancer-title">Enhance positive prompt</h2></div><button type="button" class="icon-button" data-close aria-label="Close prompt enhancer">×</button></header>
    <div class="enhancer-body"><label class="field"><span id="enhancer-mode-label">Prompt mode</span><select data-mode aria-labelledby="enhancer-mode-label" aria-describedby="enhancer-mode-help">${Object.entries(promptModes).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label><p class="helper-copy" data-context></p><p id="enhancer-mode-help" class="helper-copy" data-mode-help></p>
    <label class="field"><span>Your prompt or instruction</span><textarea data-input rows="3"></textarea></label>
    <section class="enhancer-thought-card" aria-labelledby="enhancer-thought-title" data-thought-card data-phase="idle">
      <div class="enhancer-thought-heading"><span class="enhancer-thought-charm" aria-hidden="true">✦<small>✧</small></span><div class="enhancer-thought-title"><h3 id="enhancer-thought-title">A little thinking</h3><p>Reasoning, when shared</p></div><span class="enhancer-thought-state"><i aria-hidden="true"></i><span data-thought-status>Waiting</span></span></div>
      <div class="enhancer-thought-content"><p class="enhancer-thought-empty" data-thought-empty>Room for a little inspiration…</p><pre data-thinking hidden></pre></div>
      <div class="enhancer-thought-footnote"><span aria-hidden="true">✧</span> Only the thoughts or summaries your provider shares.</div>
    </section>
    <label class="field"><span>Enhanced prompt <small>(editable after streaming)</small></span><textarea data-output rows="8"></textarea></label><p data-status role="status" aria-live="polite"></p></div>
    <footer><button type="button" class="ghost-button" data-settings>LLM settings</button><button type="button" class="secondary-button" data-run>Enhance</button><button type="button" class="secondary-button" data-stop disabled>Stop</button><button type="button" class="primary-button" data-apply disabled>Apply to positive prompt</button></footer>`;
  document.body.append(dialog);
  const input = dialog.querySelector<HTMLTextAreaElement>('[data-input]')!;
  const output = dialog.querySelector<HTMLTextAreaElement>('[data-output]')!;
  const thinking = dialog.querySelector<HTMLElement>('[data-thinking]')!;
  const thoughtCard = dialog.querySelector<HTMLElement>('[data-thought-card]')!;
  const thoughtStatus = dialog.querySelector<HTMLElement>('[data-thought-status]')!;
  const thoughtEmpty = dialog.querySelector<HTMLElement>('[data-thought-empty]')!;
  const status = dialog.querySelector<HTMLElement>('[data-status]')!;
  const modeSelect = dialog.querySelector<HTMLSelectElement>('[data-mode]')!;
  const run = dialog.querySelector<HTMLButtonElement>('[data-run]')!;
  const stop = dialog.querySelector<HTMLButtonElement>('[data-stop]')!;
  const apply = dialog.querySelector<HTMLButtonElement>('[data-apply]')!;
  let mode: PromptMode = 'auto';
  try { const value = localStorage.getItem('swarm-studio-prompt-mode'); if (value && Object.hasOwn(promptModes, value)) mode = value as PromptMode; } catch {}
  modeSelect.value = mode; input.value = host.prompt;
  let controller: AbortController | null = null;
  let complete = false;
  const context = () => { dialog.querySelector<HTMLElement>('[data-context]')!.textContent = `${host.model?.title || host.model?.name || 'No checkpoint selected'} · ${host.width} × ${host.height} · ${promptModes[mode === 'auto' ? detectPromptMode(host.model) : mode]}`; dialog.querySelector<HTMLElement>('[data-mode-help]')!.textContent = promptModeHint(mode, host.model); };
  context();
  modeSelect.addEventListener('change', () => { mode = modeSelect.value as PromptMode; complete = false; apply.disabled = true; context(); try { localStorage.setItem('swarm-studio-prompt-mode', mode); } catch {} });
  const close = () => dialog.close();
  dialog.querySelector('[data-close]')!.addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); const e = event as MouseEvent; if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } });
  dialog.addEventListener('close', () => { controller?.abort(); dialog.remove(); if (previousFocus?.isConnected) previousFocus.focus(); else document.querySelector<HTMLButtonElement>('[data-action="enhance-prompt"]')?.focus(); }, { once: true });
  dialog.querySelector('[data-settings]')!.addEventListener('click', () => { close(); host.settings(); });
  stop.addEventListener('click', () => controller?.abort());
  apply.addEventListener('click', () => {
    if (!complete || controller) return;
    try { const prompt = mode === 'moss-layout' ? compileMossLayout(output.value.trim(), host.width, host.height) : output.value.trim(); if (!prompt) throw new Error('The enhanced prompt is empty.'); if (!host.apply(prompt, mode === 'moss-layout')) throw new Error('The prompt or canvas changed while enhancing. Close and enhance again to preserve those edits.'); close(); }
    catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
  });
  run.addEventListener('click', async () => {
    if (controller) return;
    controller = new AbortController(); complete = false; apply.disabled = true; run.disabled = true; stop.disabled = false; modeSelect.disabled = true; input.readOnly = true; output.readOnly = true; output.value = ''; thinking.textContent = ''; status.textContent = 'Connecting…';
    const active = controller;
    thoughtCard.dataset.phase = 'waiting'; thoughtStatus.textContent = 'Listening'; thinking.hidden = true; thoughtEmpty.hidden = false; thoughtEmpty.textContent = 'Waiting for a little inspiration…';
    try {
      const settings = loadLlmSettings();
      const request = buildLlmRequest(settings, enhancementInstructions(mode, host.model, host.width, host.height, settings.customInstructions), input.value);
      await streamEnhancement(request, active.signal, delta => {
        if (!dialog.isConnected || active.signal.aborted || controller !== active) return;
        const phase = delta.kind === 'thinking' ? 'Thinking…' : 'Writing prompt…';
        if (status.textContent !== phase) status.textContent = phase;
        if (delta.kind === 'thinking') {
          thoughtCard.dataset.phase = 'thinking'; thoughtStatus.textContent = 'Thinking'; thoughtEmpty.hidden = true; thinking.hidden = false;
          const follow = thinking.scrollHeight - thinking.scrollTop - thinking.clientHeight < 36;
          thinking.textContent += delta.text;
          if (follow) thinking.scrollTop = thinking.scrollHeight;
        } else {
          output.value += delta.text;
          thoughtCard.dataset.phase = 'writing'; thoughtStatus.textContent = thinking.textContent ? 'Gathered' : 'Writing';
        }
      });
      if (!output.value.trim()) throw new Error('The provider returned no prompt. Increase the token limit or check the model.');
      complete = true; apply.disabled = false; status.textContent = mode === 'moss-layout' ? 'Ready to review. Apply validates and compiles layout coordinates.' : 'Ready to review and apply.';
      thoughtCard.dataset.phase = 'ready'; thoughtStatus.textContent = thinking.textContent ? 'Thoughts gathered' : 'Not shared';
      if (!thinking.textContent) thoughtEmpty.textContent = 'No reasoning text was shared. Your prompt is ready below.';
    } catch (error) { if (dialog.isConnected) status.textContent = active.signal.aborted ? 'Stopped. Partial output has not been applied.' : error instanceof Error ? error.message : String(error); }
    finally {
      if (!complete) { thoughtCard.dataset.phase = 'idle'; thoughtStatus.textContent = active.signal.aborted ? 'Paused' : 'No stream'; if (!thinking.textContent) thoughtEmpty.textContent = 'No reasoning text was received this time.'; }
      controller = null; run.disabled = false; stop.disabled = true; modeSelect.disabled = false; input.readOnly = false; output.readOnly = false;
    }
  });
  dialog.showModal(); input.focus();
  if (input.value.trim()) run.click();
}
