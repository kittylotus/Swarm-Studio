import { buildLlmRequest, defaultLlmSettings, effortOptions, providers, type Provider, type LlmSettings, type LlmModelOption } from './contracts';
import { discoverLlmModels, streamEnhancement } from './transport';
export const LLM_STORAGE_KEY = 'swarm-studio-llm-v1';
const sessionKeys = new Map<Provider, string>();
const esc = (v: unknown) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function saved(): { active?: Provider; profiles?: Partial<Record<Provider, Partial<LlmSettings>>> } {
  try { return JSON.parse(localStorage.getItem(LLM_STORAGE_KEY) || '{}') || {}; } catch { return {}; }
}
export function loadLlmSettings(provider?: Provider): LlmSettings {
  const data = saved();
  const p = provider ?? (data.active && Object.hasOwn(providers, data.active) ? data.active : 'openai');
  const raw = data.profiles?.[p] ?? {};
  const defaults = defaultLlmSettings(p);
  return { ...defaults, baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : defaults.baseUrl, model: typeof raw.model === 'string' ? raw.model : '', apiKey: sessionKeys.get(p) ?? (raw.rememberKey && typeof raw.apiKey === 'string' ? raw.apiKey : ''), rememberKey: raw.rememberKey === true, effort: typeof raw.effort === 'string' && effortOptions(p).includes(raw.effort) ? raw.effort : 'default', maxTokens: Math.max(1024, Math.min(65536, Number(raw.maxTokens) || defaults.maxTokens)), customInstructions: typeof raw.customInstructions === 'string' ? raw.customInstructions : '' };
}
export function saveLlmSettings(settings: LlmSettings): void {
  const data = saved();
  const next = { ...settings, apiKey: settings.rememberKey ? settings.apiKey : '' };
  localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify({ active: settings.provider, profiles: { ...data.profiles, [settings.provider]: next } }));
  sessionKeys.set(settings.provider, settings.apiKey);
}

export function llmSettingsMarkup(): string {
  return `<section class="panel settings-card settings-pane-card"><div class="section-minihead"><h2>LLM enhancer</h2></div><p class="helper-copy">Connect a language model to rewrite positive prompts for the selected image checkpoint. Use ✦ Enhance beside Prompt to preview a streamed result before applying it.</p><form id="llm-settings-form"></form></section>`;
}

export function bindLlmSettings(root: HTMLElement, notify: (message: string, error?: boolean) => void): void {
  const form = root.querySelector<HTMLFormElement>('#llm-settings-form');
  if (!form) return;
  let settings = loadLlmSettings();
  let models: LlmModelOption[] = [];
  let active: AbortController | null = null;
  let activeKind: 'models' | 'test' | null = null;
  let revision = 0;
  let discoveryAttempted = false;
  let pickerOpen = false;
  let activeOption = -1;
  let visibleModels: LlmModelOption[] = [];
  let pickerEvents: AbortController | null = null;
  const read = (): LlmSettings => {
    const data = new FormData(form);
    return { ...settings, baseUrl: String(data.get('baseUrl') || '').trim(), model: String(data.get('model') || '').trim(), apiKey: String(data.get('apiKey') || '').trim(), effort: String(data.get('effort') || 'default'), maxTokens: Number(data.get('maxTokens')), customInstructions: String(data.get('customInstructions') || ''), rememberKey: data.get('rememberKey') === 'on' };
  };
  const status = (message: string, error = false) => {
    const target = form.querySelector<HTMLElement>('[data-llm-status]');
    if (target) { target.textContent = message; target.classList.toggle('is-error', error); }
  };
  const busy = (value: boolean) => {
    form.querySelectorAll<HTMLButtonElement>('[data-llm-discover], [data-llm-test]').forEach(button => button.disabled = value);
    form.querySelector('[data-llm-discover]')?.classList.toggle('is-loading', value && activeKind === 'models');
    const cancel = form.querySelector<HTMLButtonElement>('[data-llm-cancel]'); if (cancel) cancel.hidden = !value;
  };
  const cancel = () => { active?.abort(); active = null; activeKind = null; revision++; busy(false); syncModels(); };
  const syncModels = () => {
    const input = form.querySelector<HTMLInputElement>('[name="model"]');
    const menu = form.querySelector<HTMLElement>('[data-llm-model-menu]');
    const list = form.querySelector<HTMLElement>('[data-llm-models]');
    const hint = form.querySelector<HTMLElement>('[data-llm-match-count]');
    if (!input || !menu || !list || !hint) return;
    const query = input.value.trim().toLocaleLowerCase();
    const matches = models.filter(model => `${model.id} ${model.label}`.toLocaleLowerCase().includes(query));
    visibleModels = matches.slice(0, 100);
    if (activeOption >= visibleModels.length) activeOption = -1;
    menu.hidden = !pickerOpen;
    input.setAttribute('aria-expanded', String(pickerOpen));
    list.setAttribute('aria-busy', String(activeKind === 'models'));
    list.innerHTML = visibleModels.map((model, index) => `<li role="option" id="llm-model-option-${index}" data-llm-model-index="${index}" tabindex="-1" aria-selected="${index === activeOption}"><b>${esc(model.id)}</b>${model.label !== model.id ? `<small>${esc(model.label)}</small>` : ''}</li>`).join('');
    if (pickerOpen && activeOption >= 0) input.setAttribute('aria-activedescendant', `llm-model-option-${activeOption}`);
    else input.removeAttribute('aria-activedescendant');
    hint.textContent = activeKind === 'models' ? 'Refreshing available models…' : matches.length > 100 ? `Showing 100 of ${matches.length} matches. Type to narrow the list.` : matches.length ? `${matches.length} matching model${matches.length === 1 ? '' : 's'}` : models.length ? 'No matching models. You can keep a custom ID.' : 'No models loaded. Enter an ID manually or refresh.';
  };
  const run = async (kind: 'models' | 'test') => {
    if (active) return;
    const controller = new AbortController(); active = controller; activeKind = kind;
    if (kind === 'models') discoveryAttempted = true;
    const current = read(), mine = ++revision, started = performance.now();
    busy(true); status(kind === 'models' ? 'Discovering available models…' : 'Testing the selected model and reasoning settings…');
    syncModels();
    try {
      if (kind === 'models') {
        const discovered = await discoverLlmModels(current, controller.signal);
        if (!form.isConnected || mine !== revision) return;
        models = discovered; activeOption = -1; syncModels();
        status(models.length ? `Found ${models.length} models. Type to filter, or keep a custom ID.` : 'The provider returned no text-generation models. You can still enter a model ID manually.');
      } else {
        let output = '';
        await streamEnhancement(buildLlmRequest(current, 'This is a connection test. Reply with exactly OK, without explanations.', 'Reply OK.'), controller.signal, delta => { if (delta.kind === 'output') output += delta.text; }, { idleMs: 15_000, timeoutMs: 30_000 });
        if (!form.isConnected || mine !== revision) return;
        if (!output.trim()) throw new Error('The connection returned no text. Check the model, output limit and reasoning settings.');
        status(`Connection OK · ${current.model} · ${((performance.now() - started) / 1000).toFixed(1)}s. Streaming and text output verified.`);
      }
    } catch (error) {
      if (form.isConnected && mine === revision) status(controller.signal.aborted ? 'Cancelled.' : error instanceof Error ? error.message : String(error), !controller.signal.aborted);
    } finally { if (mine === revision) { active = null; activeKind = null; busy(false); syncModels(); } }
  };
  const draw = () => {
    pickerEvents?.abort(); pickerEvents = new AbortController();
    pickerOpen = false; activeOption = -1;
    form.innerHTML = `<label class="field"><span id="llm-provider-label">Provider / API contract</span><select name="provider" aria-labelledby="llm-provider-label">${Object.entries(providers).map(([id, p]) => `<option value="${id}" ${settings.provider === id ? 'selected' : ''}>${p.label}</option>`).join('')}</select></label>
      <label class="field"><span>API base URL</span><input name="baseUrl" type="url" required value="${esc(settings.baseUrl)}" aria-describedby="llm-base-help"/></label><p id="llm-base-help" class="helper-copy">Include the API version path (for example /v1), without the completion endpoint. Custom endpoints and local servers are supported.</p>
      <label class="field"><span>API key</span><input name="apiKey" type="password" autocomplete="off" value="${esc(settings.apiKey)}"/></label>
      <label class="check-row"><input type="checkbox" name="rememberKey" ${settings.rememberKey ? 'checked' : ''}/>Remember key on this device</label><p class="helper-copy">Otherwise keys stay in this app session. Remembered keys use this device’s browser storage, outside Studio project exports. Prompts are sent to your chosen provider when you enhance.</p>
      <div class="field llm-model-picker" data-llm-picker><label id="llm-model-label" for="llm-model-input">LLM model ID</label><div class="llm-model-input-row"><input id="llm-model-input" name="model" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="llm-model-results" aria-describedby="llm-model-help" required autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Search or enter a model ID…" value="${esc(settings.model)}"/><button type="button" class="icon-button llm-model-refresh" data-llm-discover aria-label="Refresh LLM models" title="Refresh models using current connection fields"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1.5L20 8M4 16l2.3 2.5A7 7 0 0 0 17.9 17"/></svg></button></div><p id="llm-model-help" class="helper-copy">Focus to refresh once, then type to filter. Refresh uses current form values, even before saving.</p><div class="llm-model-menu" data-llm-model-menu hidden><ul id="llm-model-results" role="listbox" aria-label="Matching LLM models" data-llm-models></ul><p class="helper-copy" data-llm-match-count></p></div></div>
      <div class="llm-connection-tools"><button type="button" class="secondary-button" data-llm-test>Test connection</button><button type="button" class="ghost-button" data-llm-cancel hidden>Cancel check</button></div>
      <p class="llm-connection-status helper-copy" data-llm-status role="status" aria-live="polite">Test sends a short completion using the current fields; saving first is optional.</p>
      <label class="field"><span id="llm-effort-label">Reasoning effort</span><select name="effort" aria-labelledby="llm-effort-label">${effortOptions(settings.provider).map(v => `<option ${v === settings.effort ? 'selected' : ''} value="${v}">${v === 'default' ? 'Provider default · no override' : v}</option>`).join('')}</select></label><p class="helper-copy">Support depends on the selected model. Use provider default for models without reasoning controls. The modal displays thinking or summaries only when the provider returns them.</p>
      <label class="field"><span>Output token limit (including thinking)</span><input name="maxTokens" type="number" min="1024" max="65536" step="1" required value="${settings.maxTokens}"/></label>
      <label class="field"><span>Additional prompt preferences</span><textarea name="customInstructions" rows="3" placeholder="Optional style or formatting preferences">${esc(settings.customInstructions)}</textarea></label>
      <div class="form-actions"><button type="submit" class="primary-button">Save LLM connection</button></div>`;
    form.querySelector<HTMLSelectElement>('[name="provider"]')!.addEventListener('change', event => {
      const provider = (event.currentTarget as HTMLSelectElement).value as Provider;
      cancel(); models = []; discoveryAttempted = false;
      try { saveLlmSettings(read()); settings = loadLlmSettings(provider); draw(); form.querySelector<HTMLSelectElement>('[name="provider"]')?.focus(); }
      catch { notify('Could not save the LLM settings. Device storage may be full.', true); }
    });
    const picker = form.querySelector<HTMLElement>('[data-llm-picker]')!;
    const input = form.querySelector<HTMLInputElement>('[name="model"]')!;
    let suppressFocus = false;
    let pointerInteraction = false;
    const closePicker = () => { if (!pickerOpen && activeOption < 0) return; pickerOpen = false; activeOption = -1; syncModels(); };
    const openPicker = () => { pickerOpen = true; syncModels(); if (!discoveryAttempted && !active) void run('models'); };
    const choose = (index: number) => {
      const model = visibleModels[index]; if (!model) return;
      cancel(); input.value = model.id; closePicker(); status('Model selected. Test this connection or save it.');
      if (document.activeElement !== input) { suppressFocus = true; input.focus(); }
    };
    input.addEventListener('focus', () => { if (suppressFocus) { suppressFocus = false; return; } openPicker(); });
    input.addEventListener('click', openPicker);
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape' && pickerOpen) { event.preventDefault(); event.stopPropagation(); closePicker(); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); openPicker();
        if (!visibleModels.length) return;
        activeOption = event.key === 'ArrowDown' ? (activeOption + 1) % visibleModels.length : activeOption <= 0 ? visibleModels.length - 1 : activeOption - 1;
        syncModels(); form.querySelector(`#llm-model-option-${activeOption}`)?.scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter' && pickerOpen && activeOption >= 0) { event.preventDefault(); choose(activeOption); }
    });
    picker.addEventListener('focusout', () => queueMicrotask(() => { if (!pointerInteraction && !picker.contains(document.activeElement)) closePicker(); }));
    picker.querySelector('[data-llm-models]')!.addEventListener('mousedown', event => { if ((event.target as HTMLElement).closest('[data-llm-model-index]')) event.preventDefault(); });
    picker.querySelector('[data-llm-models]')!.addEventListener('click', event => { const option = (event.target as HTMLElement).closest<HTMLElement>('[data-llm-model-index]'); if (option) choose(Number(option.dataset.llmModelIndex)); });
    // Inline results change layout when closed. Let pointer clicks reach their target
    // before dismissing, so Test/Cancel cannot move out from under the pointer.
    document.addEventListener('pointerdown', () => { pointerInteraction = true; }, { signal: pickerEvents.signal });
    document.addEventListener('click', event => { if (!picker.contains(event.target as Node)) closePicker(); pointerInteraction = false; }, { signal: pickerEvents.signal });
    document.addEventListener('pointercancel', () => { pointerInteraction = false; if (!picker.contains(document.activeElement)) closePicker(); }, { signal: pickerEvents.signal });
    document.addEventListener('keydown', () => { pointerInteraction = false; }, { capture: true, signal: pickerEvents.signal });
    form.querySelector('[data-llm-discover]')!.addEventListener('click', () => { pickerOpen = true; input.focus(); void run('models'); });
    form.querySelector('[data-llm-test]')!.addEventListener('click', () => void run('test'));
    form.querySelector('[data-llm-cancel]')!.addEventListener('click', () => { cancel(); status('Cancelled.'); });
    syncModels();
  };
  draw();
  form.addEventListener('input', event => {
    const target = event.target as HTMLInputElement;
    if (!target.name) return;
    const wasActive = Boolean(active) && !(target.name === 'model' && activeKind === 'models');
    if (wasActive) { cancel(); status('Connection fields changed. Run the check again.'); }
    if (['baseUrl', 'apiKey'].includes(target.name)) { models = []; discoveryAttempted = false; activeOption = -1; syncModels(); if (!wasActive) status('Connection changed. Focus the model field to refresh, or test these settings.'); }
    if (target.name === 'model') { pickerOpen = true; activeOption = -1; syncModels(); }
  });
  const observer = new MutationObserver(() => { if (!form.isConnected) { cancel(); pickerEvents?.abort(); observer.disconnect(); } });
  observer.observe(root, { childList: true, subtree: true });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try { const next = read(); const url = new URL(next.baseUrl); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTP(S) API base URL without credentials, query or fragment.'); saveLlmSettings(next); settings = next; notify('LLM connection saved.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not save the LLM settings.', true); }
  });
}
