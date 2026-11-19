import type { GenerationDraft } from '../types';
import type { SwarmParamDefinition } from '../swarm/types';
import { advancedIcon as icon } from './icons';
import { commonParamLocation, featureEnabled, featureInStudio, featureValues, parameterId, type AdvancedFeature, type AdvancedStage } from './catalog';
import { serverDescription } from './description';
import './styles.css';

interface AdvancedHost {
  features: AdvancedFeature[];
  params: SwarmParamDefinition[];
  getDraft(): GenerationDraft;
  getPins(): string[];
  setPins(pins: string[]): void;
  /** Return a user-facing error if the capability snapshot is no longer current. */
  apply(feature: AdvancedFeature, stage: AdvancedStage, remove: boolean): string | void;
  locateCommon(selector: string): void;
}
const escape = (value: unknown): string => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const valueOptions = (param: SwarmParamDefinition): string[] => Array.isArray(param.values)
  ? param.values.map(value => typeof value === 'string' ? value : String(value.value ?? value.name ?? value.title ?? '')).filter(Boolean) : [];

export function openAdvancedFeatures(host: AdvancedHost, initialId = ''): void {
  if (document.querySelector('.af-dialog')) return;
  const previousFocus = document.activeElement as HTMLElement | null;
  const dialog = document.createElement('dialog');
  dialog.className = `af-dialog${initialId ? ' is-editing' : ''}`;
  dialog.setAttribute('aria-labelledby', 'af-title');
  dialog.innerHTML = `<div class="af-modal-inner">
    <header class="af-modal-header"><div><div class="af-kicker">SWARM STUDIO</div><h2 id="af-title">Advanced features</h2><p>Explore more controls. Send what you need to Studio.</p></div><button type="button" class="af-button af-quiet af-icon-button" data-close aria-label="Close Advanced">${icon('close')}</button></header>
    <div class="af-modal-tools"><label class="af-search">${icon('search')}<input data-search aria-label="Search features and controls" placeholder="Search features, controls, or parameter IDs…"></label><div class="af-views" role="group" aria-label="Catalog view">${['Pinned', 'In Studio', 'Browse'].map(view => `<button type="button" class="af-button" data-view="${view}" aria-pressed="${view === 'Browse'}">${view}</button>`).join('')}</div></div>
    <div class="af-modal-body"><aside class="af-browser"><label class="af-category">Browse by workflow<select data-category><option value="">All workflows</option>${[...new Set(host.features.map(feature => feature.category))].map(category => `<option>${escape(category)}</option>`).join('')}</select></label><div class="af-list-heading" data-list-heading></div><div class="af-feature-list" data-list></div></aside><section class="af-detail" data-detail aria-label="Feature settings"></section></div>
    </div>`;
  document.body.append(dialog);
  const search = dialog.querySelector<HTMLInputElement>('[data-search]')!;
  const category = dialog.querySelector<HTMLSelectElement>('[data-category]')!;
  const list = dialog.querySelector<HTMLElement>('[data-list]')!;
  const detail = dialog.querySelector<HTMLElement>('[data-detail]')!;
  let selected = host.features.find(feature => feature.id === initialId)?.id ?? host.features[0]?.id ?? '';
  let view = 'Browse';
  let loadingFile = false;
  let commonLocation = '';
  const stages = new Map<string, AdvancedStage>();
  const feature = () => host.features.find(item => item.id === selected);
  const stage = (item: AdvancedFeature): AdvancedStage => {
    let current = stages.get(item.id);
    if (!current) {
      const draft = host.getDraft();
      current = { enabled: featureInStudio(item, draft) ? featureEnabled(item, draft) : true, values: structuredClone(featureValues(item, draft.extraParams)) };
      stages.set(item.id, current);
    }
    return current;
  };
  const showError = (message: string) => { const status = detail.querySelector<HTMLElement>('[data-status]'); if (status) status.textContent = message; };
  const visibleFeatures = () => host.features.filter(item => {
    const query = search.value.trim().toLowerCase();
    return (!category.value || item.category === category.value)
      && (view !== 'Pinned' || host.getPins().includes(item.id))
      && (view !== 'In Studio' || featureInStudio(item, host.getDraft()))
      && (!query || [item.name, item.id, item.category, item.description, ...item.params.flatMap(param => [parameterId(param), param.name, param.description])].join(' ').toLowerCase().includes(query));
  });
  function renderList(): void {
    const items = visibleFeatures();
    dialog.querySelector('[data-list-heading]')!.textContent = `${view} · ${items.length} features`;
    list.innerHTML = items.map(item => `<button type="button" class="af-feature" data-feature="${escape(item.id)}" aria-current="${selected === item.id}">${icon(item.icon)}<span class="af-feature-copy"><b>${escape(item.name)}</b><small>${featureInStudio(item, host.getDraft()) ? featureEnabled(item, host.getDraft()) ? 'Enabled in Studio' : 'In Studio · off' : escape(item.category)}</small></span>${host.getPins().includes(item.id) ? `<span class="af-tiny-pin" aria-label="Pinned">${icon('pin')}</span>` : ''}${featureInStudio(item, host.getDraft()) && featureEnabled(item, host.getDraft()) ? '<span class="af-sent-dot" aria-label="Enabled in Studio"></span>' : ''}</button>`).join('');
    const query = search.value.trim().toLowerCase();
    const common = query ? host.params.filter(param => commonParamLocation(param) && !param.extra_hidden && param.visible !== false && [param.id, param.name, param.description].join(' ').toLowerCase().includes(query)) : [];
    list.innerHTML += common.map(param => `<button type="button" class="af-feature" data-common="${escape(parameterId(param))}">${icon('sliders')}<span class="af-feature-copy"><b>${escape(param.name || param.id)}</b><small>Already in Studio · open control</small></span>↗</button>`).join('');
    if (!items.length && !common.length) list.innerHTML = `<p class="af-empty">${!host.features.length ? 'No additional controls are available. Connect to Swarm to load this server’s features.' : view === 'Pinned' && !query ? 'Pin features while browsing to keep them close.' : view === 'In Studio' && !query ? 'Send a feature to Studio to see it here.' : 'No matching features. Try another search or workflow.'}</p>`;
  }
  function fieldMarkup(param: SwarmParamDefinition, index: number, item: AdvancedFeature): string {
    const key = parameterId(param), current = stage(item).values, value = current[key] ?? param.default ?? '';
    const type = String(param.type || '').toLowerCase(), subtype = String(param.subtype || '').toLowerCase();
    const id = `af-field-${index}`, explicit = Object.hasOwn(current, key), options = valueOptions(param);
    const isList = type === 'list';
    const caption = `<div class="af-field-caption"><label for="${id}">${escape(param.name || key)}${explicit ? '<span class="af-customized">Customized</span>' : ''}</label><button type="button" class="af-reset" data-reset="${index}" aria-label="Reset ${escape(param.name || key)} to server default">Reset</button></div>`;
    let control: string;
    if (/image/.test(type) || subtype === 'image') {
      control = `<div class="af-image-input">${typeof value === 'string' && value.startsWith('data:image/') ? `<img src="${escape(value)}" alt="${escape(param.name || key)} reference"><span>Image loaded</span>` : `<span>${value && value !== '[embedded data omitted]' ? 'Image reference loaded' : 'No image selected'}</span>`}<input id="${id}" type="file" accept="image/*" data-file="${index}" aria-label="${escape(param.name || key)}"><button type="button" class="af-reset" data-reset="${index}">Clear image</button><p class="af-field-hint">Uploaded images are kept for this session. Reattach them after reloading Studio.</p></div>`;
    } else if (options.length) {
      const selectedValues = Array.isArray(value) ? value.map(String) : isList ? String(value).split(',').map(v => v.trim()).filter(Boolean) : [String(value)];
      const choices = [...new Set([...selectedValues.filter(Boolean), ...options])];
      control = `<select id="${id}" data-field="${index}" ${isList ? 'multiple size="5"' : ''}>${!isList && !choices.includes('') ? `<option value="">Server default</option>` : ''}${choices.map(option => `<option value="${escape(option)}" ${selectedValues.includes(option) ? 'selected' : ''}>${escape(option)}</option>`).join('')}</select>`;
    } else if (/bool/.test(type)) {
      control = `<label class="af-check-field"><input id="${id}" type="checkbox" data-field="${index}" ${value === true || value === 'true' ? 'checked' : ''}><span>${escape(param.name || key)}</span></label>`;
    } else if (/int|decimal|double|float|number/.test(type)) {
      control = `<input id="${id}" type="number" data-field="${index}" value="${escape(value)}" ${param.min != null ? `min="${Number(param.min)}"` : ''} ${param.max != null ? `max="${Number(param.max)}"` : ''} step="${escape(param.step ?? (/^int/.test(type) ? 1 : 'any'))}">`;
    } else if (isList || /text|prompt/.test(subtype) || /\n/.test(String(value))) {
      control = `<textarea id="${id}" data-field="${index}" rows="3" ${isList ? 'data-list-value' : ''}>${escape(Array.isArray(value) ? value.join('\n') : value)}</textarea>`;
    } else control = `<input id="${id}" data-field="${index}" value="${escape(typeof value === 'object' ? JSON.stringify(value) : value)}">`;
    return `<div class="af-field">${caption}${control}${param.description ? `<div class="af-field-hint">${serverDescription(param.description)}</div>` : ''}</div>`;
  }
  function renderDetail(): void {
    const item = feature();
    if (!item) { detail.innerHTML = '<p class="af-empty">Choose a feature to explore its controls.</p>'; return; }
    const current = stage(item), inStudio = featureInStudio(item, host.getDraft());
    detail.innerHTML = `<div class="af-detail-scroll"><button type="button" class="af-button af-quiet af-mobile-back" data-back>‹ All features</button><div class="af-breadcrumb">${escape(item.category)} <span>/</span> ${escape(item.name)}</div><div class="af-feature-heading"><div class="af-feature-emblem">${icon(item.icon)}</div><div class="af-heading-copy"><h2>${escape(item.name)}</h2><div class="af-description">${serverDescription(item.description || 'Additional controls exposed by your connected Swarm server.')}</div></div><button type="button" class="af-button af-icon-button af-pin-button" data-pin aria-label="${host.getPins().includes(item.id) ? 'Unpin' : 'Pin'} ${escape(item.name)}" aria-pressed="${host.getPins().includes(item.id)}">${icon('pin')}</button></div><div class="af-status-line"><span class="af-badge ${inStudio ? 'is-sent' : ''}">${inStudio ? 'From Advanced · in Studio' : 'Not in Studio yet'}</span><span>${item.params.length} controls</span></div><div class="af-enable-row"><label><input type="checkbox" data-enabled ${current.enabled ? 'checked' : ''}>Enable feature</label><small data-enabled-copy>${current.enabled ? 'Included when sent to Studio' : 'Retain settings without running this feature'}</small></div><form class="af-fields" id="af-feature-form">${item.params.map((param, index) => fieldMarkup(param, index, item)).join('')}</form><div class="af-notice">${icon('sliders')}<span>Everyday controls stay in Studio. Untouched values use server defaults; edits apply when you send.</span></div><p class="af-error" data-status role="alert"></p></div><footer class="af-detail-footer"><div class="af-footer-copy">${inStudio ? 'Update the existing Studio pill.' : 'Adds a compact pill to Studio.'}<br>Edits apply only when you send.</div><div class="af-footer-actions">${inStudio ? '<button type="button" class="af-button af-remove" data-remove>Remove from Studio</button>' : ''}<button type="button" class="af-button af-primary" data-send>${inStudio ? 'Update Studio' : 'Send to Studio'} ${icon('arrow')}</button></div></footer>`;
    detail.querySelector('form')!.addEventListener('submit', event => { event.preventDefault(); commit(false); });
  }
  function refreshFilters(): void {
    const items = visibleFeatures();
    if (!items.some(item => item.id === selected)) selected = items[0]?.id ?? '';
    renderList(); renderDetail();
  }
  function commit(remove: boolean): void {
    const item = feature();
    if (!item || loadingFile) return;
    const form = detail.querySelector<HTMLFormElement>('form');
    if (!remove && form && !form.reportValidity()) return;
    try {
      const error = host.apply(item, stage(item), remove);
      if (error) { showError(error); return; }
      dialog.close();
    } catch (error) { showError(error instanceof Error ? error.message : String(error)); }
  }
  dialog.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.hasAttribute('data-close')) { dialog.close(); return; }
    if (button.dataset.feature) {
      selected = button.dataset.feature;
      renderList(); renderDetail(); dialog.classList.add('is-editing');
      detail.querySelector<HTMLElement>(window.matchMedia('(max-width: 700px)').matches ? '[data-back]' : '[data-pin]')?.focus();
    }
    if (button.dataset.view) {
      view = button.dataset.view; category.value = '';
      dialog.querySelectorAll<HTMLElement>('[data-view]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
      refreshFilters();
    }
    if (button.hasAttribute('data-back')) { dialog.classList.remove('is-editing'); list.querySelector<HTMLElement>(`[data-feature="${CSS.escape(selected)}"]`)?.focus(); }
    if (button.hasAttribute('data-pin')) {
      const pins = new Set(host.getPins()); pins.has(selected) ? pins.delete(selected) : pins.add(selected);
      host.setPins([...pins]); refreshFilters();
      if (!selected) { dialog.classList.remove('is-editing'); dialog.querySelector<HTMLElement>('[data-view="Browse"]')?.focus(); }
      else detail.querySelector<HTMLElement>('[data-pin]')?.focus();
    }
    if (button.hasAttribute('data-reset')) {
      const item = feature(), index = Number(button.dataset.reset), param = item?.params[index];
      if (item && param) { const top = detail.querySelector('.af-detail-scroll')!.scrollTop; delete stage(item).values[parameterId(param)]; renderDetail(); detail.querySelector('.af-detail-scroll')!.scrollTop = top; detail.querySelector<HTMLElement>(`#af-field-${index}`)?.focus(); }
    }
    if (button.hasAttribute('data-send')) commit(false);
    if (button.hasAttribute('data-remove')) commit(true);
    if (button.dataset.common) {
      const param = host.params.find(param => parameterId(param) === button.dataset.common);
      const location = param && commonParamLocation(param);
      if (location) { commonLocation = location; dialog.close(); }
    }
  });
  detail.addEventListener('input', event => {
    const input = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, item = feature();
    if (!item) return;
    if (input.hasAttribute('data-enabled')) {
      stage(item).enabled = (input as HTMLInputElement).checked;
      detail.querySelector('[data-enabled-copy]')!.textContent = stage(item).enabled ? 'Included when sent to Studio' : 'Retain settings without running this feature';
    }
    const index = input.dataset.field;
    if (index === undefined) return;
    const param = item.params[Number(index)]; if (!param) return;
    const key = parameterId(param);
    if (input instanceof HTMLInputElement && input.type === 'checkbox') stage(item).values[key] = input.checked;
    else if (input instanceof HTMLSelectElement && input.multiple) stage(item).values[key] = [...input.selectedOptions].map(option => option.value);
    else if (input.hasAttribute('data-list-value')) stage(item).values[key] = input.value.split('\n').map(value => value.trim()).filter(Boolean);
    else if (input.value === '') delete stage(item).values[key];
    else stage(item).values[key] = input instanceof HTMLInputElement && input.type === 'number' ? input.valueAsNumber : input.value;
  });
  detail.addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (!input.hasAttribute('data-file') || !input.files?.[0]) return;
    const item = feature(), param = item?.params[Number(input.dataset.file)], file = input.files[0];
    if (!item || !param) return;
    if (!file.type.startsWith('image/')) { showError('Choose an image file.'); return; }
    loadingFile = true;
    const send = detail.querySelector<HTMLButtonElement>('[data-send]')!; send.disabled = true;
    const reader = new FileReader();
    reader.onload = () => { if (dialog.isConnected) { stage(item).values[parameterId(param)] = String(reader.result); if (selected === item.id) renderDetail(); } };
    reader.onerror = () => showError('Could not read this image. Choose it again.');
    reader.onloadend = () => { loadingFile = false; detail.querySelector<HTMLButtonElement>('[data-send]')?.removeAttribute('disabled'); };
    reader.readAsDataURL(file);
  });
  search.addEventListener('input', refreshFilters); category.addEventListener('change', refreshFilters);
  dialog.addEventListener('close', () => {
    dialog.remove(); stages.clear();
    if (commonLocation) host.locateCommon(commonLocation);
    else if (previousFocus?.isConnected) previousFocus.focus();
    else document.querySelector<HTMLElement>('[data-action="open-advanced"]')?.focus();
  }, { once: true });
  renderList(); renderDetail(); dialog.showModal();
  (initialId ? detail.querySelector<HTMLElement>('[data-pin]') : search)?.focus();
}
