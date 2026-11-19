import type { GenerationDraft } from '../types';
import type { SwarmParamDefinition, SwarmParamGroup } from '../swarm/types';

export const paramKey = (value: unknown): string => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const parameterId = (param: SwarmParamDefinition): string => String(param.id ?? param.name ?? '');

/** One owner for controls already edited by the common Studio composer. */
const commonLocations: Record<string, string> = {
  prompt: '#prompt', negativeprompt: '#negative-prompt', model: '#model',
  width: '#width', height: '#height', steps: '#steps', cfgscale: '#cfg', seed: '#seed',
  variationseed: '#variation-seed', variationseedstrength: '#variation-strength',
  sampler: '#sampler', scheduler: '#scheduler', scheduletype: '#scheduler', images: '',
  loras: '#lora-add-select', loraweights: '#lora-add-select',
  initimage: '#init-file', initimagecreativity: '#init-creativity', donotsave: '#review-before-save',
  studioregionalprompt: '[data-action="open-region-editor"]',
};
export function commonParamLocation(param: SwarmParamDefinition): string | undefined {
  return commonLocations[paramKey(param.id)] ?? commonLocations[paramKey(param.name)];
}
function studioOwnsParam(param: SwarmParamDefinition): boolean {
  return [param.id, param.name].some(value => Object.hasOwn(commonLocations, paramKey(value)));
}
export function publicExtraParam(param: SwarmParamDefinition): boolean {
  return !!parameterId(param) && !studioOwnsParam(param) && !param.extra_hidden && param.visible !== false;
}
export function parameterGroup(param: SwarmParamDefinition, groups: SwarmParamGroup[]): SwarmParamGroup | undefined {
  const key = paramKey(param.group);
  return key ? groups.find(group => [group.id, group.name].some(value => paramKey(value) === key)) : undefined;
}
export function groupKey(group: SwarmParamGroup | undefined, fallback = 'Other'): string {
  return paramKey(group?.id ?? group?.name ?? fallback) || 'other';
}
export function groupRequiresToggle(group: SwarmParamGroup | undefined): boolean {
  return !!group?.toggles && !/initimage/.test(paramKey(group.name ?? group.id));
}
export interface AdvancedFeature {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  group?: SwarmParamGroup;
  toggleable: boolean;
  params: SwarmParamDefinition[];
}
const categoryRules: Array<[RegExp, string, string]> = [
  [/controlnet|imageprompt|ipadapter|reference/, 'Guidance & references', 'grid'],
  [/refin|upscal|seedvr/, 'Refine & upscale', 'sparkles'],
  [/video|motion|frameinterpol/, 'Video', 'film'],
  [/initimage|mask|inpaint/, 'Image input & editing', 'image'],
  [/sampling|sampler|guidance|conditioning|freeu/, 'Sampling & conditioning', 'sliders'],
  [/modelload|vae|unet|clip|textencoder/, 'Model components', 'chip'],
  [/backend|internal|precision|dtype|cache|performance|memory/, 'Performance & backend', 'chip'],
];
export function advancedCatalog(params: SwarmParamDefinition[], groups: SwarmParamGroup[]): AdvancedFeature[] {
  const buckets = new Map<string, AdvancedFeature>();
  const seen = new Set<string>();
  for (const param of [...params].sort((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0))) {
    if (!publicExtraParam(param)) continue;
    const key = paramKey(parameterId(param));
    if (seen.has(key)) continue;
    seen.add(key);
    const group = parameterGroup(param, groups);
    const id = groupKey(group, String(param.group || 'Other'));
    const name = group?.name || String(param.group || 'Other server options');
    const feature = buckets.get(id) ?? {
      id, name: /^(init image|sampling)$/i.test(name) ? `${name} extras` : name,
      category: '', icon: '', description: group?.description || '', group,
      toggleable: groupRequiresToggle(group), params: [],
    };
    feature.params.push(param);
    buckets.set(id, feature);
  }
  return [...buckets.values()].map(feature => {
    const text = paramKey(feature.name + feature.id + feature.params.map(parameterId).join(' '));
    const rule = categoryRules.find(([pattern]) => pattern.test(text));
    return { ...feature, category: rule?.[1] ?? 'Other server options', icon: rule?.[2] ?? 'sliders' };
  }).sort((a, b) => Number(a.group?.priority ?? 9999) - Number(b.group?.priority ?? 9999) || a.name.localeCompare(b.name));
}
export function featureValues(feature: AdvancedFeature, extras: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const param of feature.params) {
    const aliases = new Set([paramKey(param.id), paramKey(param.name)].filter(Boolean));
    for (const [key, value] of Object.entries(extras)) if (aliases.has(paramKey(key))) values[parameterId(param)] = value;
  }
  return values;
}
export function featureInStudio(feature: AdvancedFeature, draft: GenerationDraft): boolean {
  return (draft.advancedStudioFeatures ?? []).includes(feature.id)
    || draft.advancedEnabledGroups.includes(feature.id)
    || Object.keys(featureValues(feature, draft.extraParams)).length > 0;
}
export function featureEnabled(feature: AdvancedFeature, draft: GenerationDraft): boolean {
  return !(draft.advancedDisabledFeatures ?? []).includes(feature.id)
    && (!feature.toggleable || draft.advancedEnabledGroups.includes(feature.id));
}
export interface AdvancedStage { enabled: boolean; values: Record<string, unknown> }
/** Patch only the selected feature against the latest draft, preserving unrelated edits. */
export function applyAdvancedFeature(feature: AdvancedFeature, stage: AdvancedStage, draft: GenerationDraft, remove = false): Partial<GenerationDraft> {
  const aliases = new Set(feature.params.flatMap(param => [paramKey(param.id), paramKey(param.name)]).filter(Boolean));
  const extraParams = Object.fromEntries(Object.entries(draft.extraParams).filter(([key]) => !aliases.has(paramKey(key))));
  if (!remove) for (const param of feature.params) {
    const key = parameterId(param);
    if (Object.hasOwn(stage.values, key)) extraParams[key] = stage.values[key];
  }
  const enabled = new Set(draft.advancedEnabledGroups);
  const studio = new Set(draft.advancedStudioFeatures ?? []);
  const disabled = new Set(draft.advancedDisabledFeatures ?? []);
  enabled.delete(feature.id); disabled.delete(feature.id); studio.delete(feature.id);
  if (!remove) {
    studio.add(feature.id);
    if (stage.enabled && feature.toggleable) enabled.add(feature.id);
    if (!stage.enabled) disabled.add(feature.id);
  }
  return { extraParams, advancedEnabledGroups: [...enabled], advancedStudioFeatures: [...studio], advancedDisabledFeatures: [...disabled] };
}

/** Request semantics are independent of catalog search, pins and the selected workflow. */
export function activeAdvancedParams(draft: GenerationDraft, params: SwarmParamDefinition[], groups: SwarmParamGroup[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const enabled = new Set(draft.advancedEnabledGroups);
  const disabled = new Set(draft.advancedDisabledFeatures ?? []);
  const isEnabled = (param: SwarmParamDefinition) => {
    const group = parameterGroup(param, groups), id = groupKey(group, String(param.group || 'Other'));
    return !disabled.has(id) && (!groupRequiresToggle(group) || enabled.has(id));
  };
  for (const [key, value] of Object.entries(draft.extraParams)) {
    const definition = params.find(param => [param.id, param.name].some(alias => !!alias && paramKey(alias) === paramKey(key)));
    // Review-before-save is deliberately owned by Studio but uses this request path.
    if (!definition) continue;
    const review = [definition.id, definition.name].some(v => paramKey(v) === 'donotsave');
    if (!review && (studioOwnsParam(definition) || !isEnabled(definition))) continue;
    // Compact persisted drafts omit embedded images; a placeholder is never a valid input.
    if (typeof value === 'string' && value === '[embedded data omitted]') continue;
    result[parameterId(definition)] = value;
  }
  for (const param of params) {
    const group = parameterGroup(param, groups);
    if (!publicExtraParam(param) || !groupRequiresToggle(group) || !isEnabled(param)) continue;
    const key = parameterId(param);
    if (!Object.hasOwn(result, key) && param.default !== undefined && param.default !== null && param.default !== '') result[key] = param.default;
  }
  return result;
}
