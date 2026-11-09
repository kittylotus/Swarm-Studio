import type { SwarmModel } from '../swarm/types';

export type PromptMode = 'auto' | 'anima' | 'illustrious' | 'krea' | 'moss' | 'moss-layout' | 'general';
export const promptModes: Record<PromptMode, string> = { auto: 'Auto · checkpoint', anima: 'Anima', illustrious: 'Illustrious', krea: 'Krea · natural language', moss: 'MOSS · caption', 'moss-layout': 'MOSS · layout', general: 'General' };

const isKrea2 = (model?: SwarmModel) => /krea[-_. ]?2/i.test([model?.name, model?.title, model?.architecture, model?.compat_class].join(' '));

export function detectPromptMode(model?: SwarmModel): Exclude<PromptMode, 'auto' | 'moss-layout'> {
  const identity = [model?.name, model?.title, model?.architecture, model?.compat_class].join(' ');
  if (/moss/i.test(identity)) return 'moss';
  if (/anima/i.test(identity)) return 'anima';
  if (/illustrious|noobai|noob[-_ ]?xl|wai[-_ ]?(?:nsfw|ill)/i.test(identity)) return 'illustrious';
  if (/krea/i.test(identity)) return 'krea';
  return 'general';
}

export function enhancementInstructions(mode: PromptMode, model: SwarmModel | undefined, width: number, height: number, custom = ''): string {
  const resolved = mode === 'auto' ? detectPromptMode(model) : mode;
  const aesthetic = /aesthetic/i.test([model?.name, model?.title].join(' '));
  const rules: Record<Exclude<PromptMode, 'auto'>, string> = {
    anima: String.raw`Anima accepts tags, natural-language captions, and hybrids. Prefer a compact tag anchor plus readable binding clauses for complex poses or multiple subjects; do not flatten useful prose into unrelated tags. Tags use lowercase and spaces, except score_*. Keep proper names and natural sentences correctly capitalized. Order tag anchors as quality/meta/year/rating, count, character, series, requested @artist, general details. Never invent a franchise, artist, rating or extra person.
For multiple subjects or deliberate spatial composition, use separate lines such as "Left: [named subject, appearance, action]. Right: [other subject, appearance, action]. Background: [setting]." These are caption labels, not hard region commands. Bind each outfit, gesture and gaze to its owner, and use the viewer's frame consistently for left/right. A prose-only result should contain at least two descriptive sentences. Preserve an existing ye-pop or deviantart dataset prefix on its own first line; do not add one by default.
${aesthetic ? 'This checkpoint is Anima Aesthetic: do not add score_* tags; a restrained masterpiece/best quality prefix is optional.' : 'For Anima Base/Turbo, a restrained masterpiece, best quality, score_7 anchor is available; do not stack every score. If the user explicitly requests Aesthetic, omit score_* tags.'}`,
    illustrious: String.raw`Illustrious/Noob/WAI use CLIP/SDXL conditioning: prefer concise comma-separated booru tags and group identity, hair, eyes and clothing by subject. Include the requested count, character and series, action/expression, one coherent framing, scene and style. Tag qualifiers such as name \(series\) must stay escaped through the host parser. Keep supplied emphasis such as (gesture:1.2), but do not weight every word or invent weights. Preserve checkpoint/LoRA trigger spellings.
Natural language is possible, particularly on later Illustrious versions, so retain useful short relational clauses when tags would lose meaning. Do not blindly prohibit prose. Left:/Right: prose labels do not isolate conditioning regions on their own. Do not invent BREAK, AND, ADDCOMM or regional separators as if they were universal character-binding operators. Avoid conflicting close-up/full-body compositions, redundant quality spam, Pony score_* prefixes and Anima's mandatory @artist convention; follow the requested checkpoint's own supplied tags.`,
    krea: isKrea2(model) ? 'This checkpoint is Krea 2. Write one cohesive natural-language paragraph, with each subject grouped with its own attributes and action. Describe pose, composition, lighting and material cues that support the original idea; detailed captions are supported, but lightly polish an already detailed prompt. Keep the requested medium, colors, objects and spatial relations. Quote exact visible words. Do not output planning labels, markdown, booru tag inventories, score prefixes, SDXL weighting or layout JSON. Do not import FLUX.1 settings or FLUX.2/3 API features into Krea 2.' : String.raw`Target FLUX.1 Krea dev, not newer FLUX models with different layout APIs. Write natural English with the important subject and action first, then spatial relationships, composition, lighting, materials and intended style. Preserve specific visual choices rather than turning every idea into a generic cinematic photo. Use concrete photographic cues when photography is requested; do not invent camera specifications or an artist. State each subject's appearance and position in connected sentences, e.g. "On the left, [subject] holds ...; on the right, [subject] ...".
Put exact visible text in quotation marks and describe where it appears. Do not add booru quality/score tags, Anima @ prefixes, SDXL emphasis syntax, BREAK/AND, JSON bounding boxes or chat/instruction wrappers as native Krea features. Express exclusions as positive visual choices. Preserve explicitly supplied host directives, but never manufacture them.`,
    moss: String.raw`MOSS-Image accepts detailed natural-language captions, ordered tag sequences, or structured layouts. In this caption mode, default to coherent English covering overall composition, each subject's appearance/action/relative location, environment, light and style. Keep a supplied tag-oriented prompt as tags if that is the user's intent: use Quality -> Score -> Meta -> Year -> Character -> Series -> Artist -> General, with requested @artist tags. Do not import Anima's score_7 prefix by default.
For text-heavy images, quote each exact text block and say where it belongs; preserve capitalization, spelling, punctuation and intended line breaks. A real newline or a literal \n can specify text line breaks; do not silently flatten them. Left/right phrases are descriptive here. Do not output model-facing or draft JSON in caption mode; precise boxes belong to the separate MOSS layout mode.`,
    'moss-layout': `Return only a valid JSON layout draft. Schema: {"width":${width},"height":${height},"summary":{"caption":"overall scene and visual style","meta":["image"],"canvas":"single"},"items":[{"label":"text or object or character","caption":"visual description","text":"only for text items","bbox":[left,top,right,bottom]}]}. Use absolute pixel xyxy coordinates measured from the TOP LEFT, within ${width} by ${height}. Every item needs a nonempty caption and a nonzero bounding box. Give each distinct text block its own item, preserving exact lettering and line breaks. Include useful object/character boxes. Studio compiles this draft into centered yxyx coordinates; do not center or normalize coordinates yourself.`,
    general: 'Write a clear, concrete image prompt describing subject, action, framing, setting, lighting and requested style. Retain useful supplied tags, prose and structural syntax rather than assuming every checkpoint wants one format. Avoid adding unsupported model-specific tokens.',
  };
  const hostSyntax = String.raw`This prompt runs through Studio -> SwarmUI -> Comfy, not a raw model tokenizer. Preserve supplied host tokens exactly: <lora:filename:1>, <preset:name>, <wildcard:name>, <random:...>, <trigger>, <param[...]:...>, <setmacro[name]:...>, <macro:name>, <region:...>, <segment:...>, <base>, <refiner>. Do not invent, expand, lowercase or remove their contents. In tag/caption modes, escape literal parentheses in character/series qualifiers as name \(series\); these reach the model as literal parentheses. Distinguish these from intentional (term:weight) emphasis, which the host parses; preserve supplied weights without claiming they work identically across encoders. Preserve meaningful newlines and Left:/Right: caption structure. Only use Swarm region directives if already supplied or explicitly requested; do not turn caption labels into directives. Never add A1111-only scheduling/chunk syntax or LLM chat-template tokens on assumption.`;
  return [`You enhance positive image-generation prompts. Treat the user message as an image idea or editing instruction. Return only the finished positive prompt, without explanations, markdown fences or a negative prompt. Structural caption labels such as Left: and Right: are part of a prompt, not explanatory headings. Preserve supplied names and LoRA/embedding triggers. Do not change the requested subject or invent an unrelated scene.`, `Selected image checkpoint: ${model?.title || model?.name || 'unspecified'}. Canvas: ${width} × ${height}.`, resolved === 'moss-layout' ? 'Layout mode must return the exact JSON draft schema below; do not inject host tokens or escaped booru qualifiers into the JSON structure. Existing trigger words can be retained inside captions.' : hostSyntax, rules[resolved], custom ? `Additional style preferences: ${custom}` : ''].filter(Boolean).join('\n\n');
}

export function promptModeHint(mode: PromptMode, model?: SwarmModel): string {
  const resolved = mode === 'auto' ? detectPromptMode(model) : mode;
  return {
    anima: String.raw`Tags + prose, Left:/Right: subject binding, @artist when requested, and escaped name \(series\) qualifiers. Aesthetic omits score tags.`,
    illustrious: String.raw`Compact CLIP tags, escaped name \(series\) qualifiers and supplied (term:weight) emphasis. Prose labels are not conditioning regions.`,
    krea: `${isKrea2(model) ? 'Krea 2: one cohesive paragraph' : 'FLUX.1 Krea: natural English'}, explicit subject relationships and quoted visible text. No imported SDXL/Anima or newer FLUX layout syntax.`,
    moss: 'Detailed captions or ordered tags; exact quoted text and line breaks. Use MOSS layout for coordinate control.',
    'moss-layout': 'Validated JSON draft with top-left pixel boxes; Apply compiles it into centered yxyx model input.',
    general: 'Preserve useful tags, prose and supplied host syntax without guessing a checkpoint-specific format.',
  }[resolved];
}

/** Compile the editable top-left draft to MOSS's centered absolute yxyx contract. */
export function compileMossLayout(text: string, width: number, height: number): string {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width % 16 || height % 16) throw new Error('MOSS canvas dimensions must be positive multiples of 16.');
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('MOSS layout must be a JSON object.');
  if (raw.width !== width || raw.height !== height) throw new Error('MOSS layout dimensions must match the current canvas. Enhance again after changing resolution.');
  const summary = raw.summary as Record<string, unknown> | undefined;
  if (!summary || typeof summary.caption !== 'string' || !summary.caption.trim() || !Array.isArray(raw.items) || !raw.items.length || raw.items.length > 100) throw new Error('MOSS layout needs a scene caption and 1–100 items.');
  const items = raw.items.map((value: unknown) => {
    const item = value as Record<string, unknown>;
    if (!item || !['text', 'object', 'character'].includes(String(item.label)) || typeof item.caption !== 'string' || !item.caption.trim() || !Array.isArray(item.bbox) || item.bbox.length !== 4 || !item.bbox.every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error('Each MOSS item needs a label, caption and four numeric bbox coordinates.');
    const [left, top, right, bottom] = item.bbox as [number, number, number, number];
    if (left < 0 || top < 0 || right > width || bottom > height || left >= right || top >= bottom) throw new Error('MOSS bounding boxes must have positive area and stay inside the canvas.');
    if (item.label === 'text' && (typeof item.text !== 'string' || !item.text.trim())) throw new Error('MOSS text items need their exact visible text.');
    return { label: item.label, caption: item.caption, ...(item.label === 'text' ? { text: item.text } : {}), bbox: [Math.floor(top) - height / 2, Math.floor(left) - width / 2, Math.ceil(bottom) - height / 2, Math.ceil(right) - width / 2] };
  });
  return JSON.stringify({ summary: { caption: summary.caption, meta: Array.isArray(summary.meta) ? summary.meta.filter(v => typeof v === 'string') : [], canvas: 'single' }, items, bbox_coord_space: 'abs_centralized', bbox_format: 'yxyx' });
}

export function validateMossComposition(prompt: string, width: number, height: number, hasAdditions: boolean): void {
  let value: Record<string, unknown>;
  try { value = JSON.parse(prompt); } catch { return; }
  if (!value || value.bbox_coord_space !== 'abs_centralized' || value.bbox_format !== 'yxyx') return;
  if (hasAdditions) throw new Error('MOSS layout JSON requires presets, regional prompts and automatic LoRA trigger insertion to be disabled. Put needed trigger words in the layout captions.');
  // Revalidate user-edited compiled JSON against the current canvas at generation time.
  const draft = { ...value, width, height, items: Array.isArray(value.items) ? value.items.map(item => ({ ...item, bbox: Array.isArray(item.bbox) && item.bbox.length === 4 ? [item.bbox[1] + width / 2, item.bbox[0] + height / 2, item.bbox[3] + width / 2, item.bbox[2] + height / 2] : item.bbox })) : value.items };
  compileMossLayout(JSON.stringify(draft), width, height);
}
