import { expressionPrompt, type SheetProject, type ExpressionTile, type NodeSchema } from './pipeline.ts';
import type { ExpressionLora } from './loras';
import type { SwarmModel } from '../swarm/types';

export function isAnimaModel(model: SwarmModel): boolean { return /anima/i.test([model.architecture, model.compat_class, model.name, model.title].join(' ')); }
export const ANIMA_INSTALL_GUIDE = 'https://github.com/ArcAnima/ComfyUI-Anima-Ref-Adapter/blob/main/docs/guide.en.md';

export function nodeChoices(schema: Record<string, NodeSchema>, node: string, input: string): string[] {
  const [value, config] = schema[node]?.input?.required?.[input] ?? schema[node]?.input?.optional?.[input] ?? [];
  const choices = Array.isArray(value) ? value : config?.options;
  return Array.isArray(choices) ? choices.filter((item): item is string => typeof item === 'string') : [];
}
function inventoryKey(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/\.(safetensors|ckpt|pt|pth)$/i, '').toLowerCase();
}

function inventoryName(selected: string, inventory: string[], label: string): string {
  const exact = inventory.filter(v => inventoryKey(v) === inventoryKey(selected));
  if (exact.length === 1) return exact[0]!;
  const leaves = inventory.filter(v => inventoryKey(v).split('/').pop() === inventoryKey(selected).split('/').pop());
  if (leaves.length === 1) return leaves[0]!;
  throw new Error(`${label} “${selected}” is ${leaves.length ? 'ambiguous' : 'missing'} in ComfyUI. ${leaves.length ? 'Choose its folder-qualified entry.' : 'Check the model files and refresh setup.'}`);
}

export function resolveAnimaSetup(project: SheetProject, schema: Record<string, NodeSchema>) {
  if (!project.model) throw new Error('Choose an Anima model.');
  if (!schema.AnimaRefAdapter) throw new Error('Anima Ref Adapter is missing from ComfyUI. Install its custom node and restart the backend.');
  if (!schema.SwarmLoadImageB64 || !schema.SwarmSaveImageWS) throw new Error('The Swarm image input or output node is missing from ComfyUI.');
  const selected = inventoryKey(project.model);
  const inventories = [
    { loader: 'UNETLoader', input: 'unet_name', folder: 'diffusion_models' },
    { loader: 'CheckpointLoaderSimple', input: 'ckpt_name', folder: 'checkpoints' },
  ] as const;
  const folder = inventories.find(item => selected.startsWith(item.folder + '/'));
  const path = folder ? selected.slice(folder.folder.length + 1) : selected;
  const candidates = inventories
    .filter(item => (!folder || folder === item) && (!project.animaEmbedded || item.loader === 'CheckpointLoaderSimple'))
    .flatMap(item => nodeChoices(schema, item.loader, item.input).map(name => ({ ...item, name, key: inventoryKey(name) })));
  const exact = candidates.filter(item => item.key === path || item.key === selected);
  const matches = exact.length ? exact : candidates.filter(item => item.key.split('/').pop() === path.split('/').pop());
  // A single exact filename exposed by both loaders can use the dedicated diffusion loader.
  const match = matches.length === 1 || (exact.length === 2 && exact[0]!.key === exact[1]!.key && exact[0]!.loader !== exact[1]!.loader)
    ? matches[0] : undefined;
  if (!match) {
    const scope = project.animaEmbedded ? 'the checkpoint inventory' : 'the checkpoint and diffusion model inventories';
    throw new Error(`Anima model “${project.model}” is ${matches.length ? 'ambiguous' : 'missing'} in ${scope}. ${matches.length ? 'Choose a folder-qualified model.' : 'Refresh the connected backend and check its model paths.'}`);
  }
  return {
    ...match,
    clip: project.animaEmbedded ? '' : inventoryName(project.animaClip, nodeChoices(schema, 'CLIPLoader', 'clip_name'), 'Text encoder'),
    vae: project.animaEmbedded ? '' : inventoryName(project.animaVae, nodeChoices(schema, 'VAELoader', 'vae_name'), 'VAE'),
    adapter: inventoryName(project.animaAdapter, nodeChoices(schema, 'AnimaRefAdapter', 'lora_name'), 'Anima adapter weights'),
  };
}

export function animaWorkflow(project: SheetProject, tile: ExpressionTile, schema: Record<string, NodeSchema>, loras?: ExpressionLora[], model?: SwarmModel): Record<string, unknown> {
  if (!project.reference) throw new Error('Add a reference portrait for Anima.');
  if (!isAnimaModel(model ?? { name: project.model })) throw new Error('Choose an Anima model for Anima Ref Adapter.');
  if (project.useLoras && !loras) throw new Error('Disable composer LoRAs before standalone workflow export. The live pipeline can apply them.');
  const graph: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {};
  const add = (id: string, type: string, values: Record<string, unknown>) => {
    const node = schema[type];
    if (!node) throw new Error(`The backend is missing ${type}. Install Anima Ref Adapter and current Comfy support, restart and check loaded nodes.`);
    const declared = { ...node.input?.required, ...node.input?.optional };
    for (const key of Object.keys(values)) if (!declared[key]) throw new Error(`The loaded ${type} node does not support ${key}. Update the node or check its version.`);
    const inputs = { ...values };
    for (const [key, value] of Object.entries(values)) {
      const choices = nodeChoices(schema, type, key);
      if (choices.length && !choices.includes(String(value))) throw new Error(`The selected ${type} ${key} is not available in this backend.`);
    }
    for (const [key, [, options]] of Object.entries(node.input?.required ?? {})) {
      if (key in inputs) continue;
      const firstChoice = nodeChoices(schema, type, key)[0];
      if (options?.default !== undefined) inputs[key] = options.default;
      else if (firstChoice !== undefined) inputs[key] = firstChoice;
      else throw new Error(`Unsupported required ${type} input: ${key}. Check loaded nodes.`);
    }
    graph[id] = { class_type: type, inputs };
  };
  const setup = resolveAnimaSetup(project, schema);
  add('1', setup.loader, { [setup.input]: setup.name });
  if (!project.animaEmbedded) {
    add('2', 'CLIPLoader', { clip_name: setup.clip, type: 'stable_diffusion' });
    add('3', 'VAELoader', { vae_name: setup.vae });
  }
  add('4', 'SwarmLoadImageB64', { image_base64: project.reference.split(',')[1] });
  let modelRef: [string, number] = ['1', 0], clipRef: [string, number] = project.animaEmbedded ? ['1', 1] : ['2', 0];
  const vaeRef = project.animaEmbedded ? ['1', 2] : ['3', 0];
  for (const [index, lora] of (loras ?? []).filter(l => l.enabled).entries()) {
    const id = `lora-${index}`;
    add(id, 'LoraLoader', { model: modelRef, clip: clipRef, lora_name: inventoryName(lora.name, nodeChoices(schema, 'LoraLoader', 'lora_name'), 'composer LoRA'), strength_model: lora.weight, strength_clip: lora.weight });
    modelRef = [id, 0]; clipRef = [id, 1];
  }
  const optional = schema.AnimaRefAdapter?.input?.optional ?? {};
  add('5', 'AnimaRefAdapter', { model: modelRef, vae: vaeRef, image: ['4', 0], lora_name: setup.adapter, ref_guidance: project.animaGuidance, correction: 'apg', ...(optional.strength ? { strength: project.animaStrength } : {}), ...(optional.ref_end ? { ref_end: project.animaEnd } : {}), ...(optional.ref_megapixels ? { ref_megapixels: 1 } : {}) });
  const triggers = (loras ?? []).filter(l => l.enabled && l.useTrigger).map(l => l.triggerPhrase.replaceAll(';', ',').trim()).filter(Boolean);
  const prompt = [...triggers, expressionPrompt(project, tile, model)].filter(Boolean).join(', ');
  add('6', 'CLIPTextEncode', { clip: clipRef, text: prompt });
  add('7', 'CLIPTextEncode', { clip: clipRef, text: project.negative });
  add('8', 'EmptyLatentImage', { width: project.width, height: project.height, batch_size: 1 });
  add('9', 'KSampler', { model: ['5', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['8', 0], seed: (project.seed + tile.seedOffset) % 2147483647, steps: project.steps, cfg: project.cfg, sampler_name: project.sampler, scheduler: project.scheduler, denoise: 1 });
  add('10', 'VAEDecode', { samples: ['9', 0], vae: vaeRef });
  add('11', 'SwarmSaveImageWS', { images: ['10', 0] });
  return graph;
}
