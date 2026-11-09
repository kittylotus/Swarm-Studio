import type { SheetProject, ExpressionTile, NodeSchema } from './pipeline';
import type { ExpressionLora } from './loras';
import type { SwarmModel } from '../swarm/types';

export function isAnimaModel(model: SwarmModel): boolean { return /anima/i.test([model.architecture, model.compat_class, model.name, model.title].join(' ')); }
export function nodeChoices(schema: Record<string, NodeSchema>, node: string, input: string): string[] {
  const value = (schema[node]?.input?.required?.[input] ?? schema[node]?.input?.optional?.[input])?.[0];
  return Array.isArray(value) ? value.map(String) : [];
}
function inventoryName(selected: string, inventory: string[], label: string): string {
  const key = (v: string) => v.replaceAll('\\', '/').replace(/\.(safetensors|ckpt)$/i, '').toLowerCase();
  const exact = inventory.filter(v => key(v) === key(selected));
  if (exact.length === 1) return exact[0]!;
  const leaves = inventory.filter(v => key(v).split('/').pop() === key(selected).split('/').pop());
  if (leaves.length === 1) return leaves[0]!;
  throw new Error(`Choose an available ${label}; the selected file is missing or ambiguous in the live Comfy inventory.`);
}

/** Anima's separate diffusion/encoder/VAE loaders; never route through SDXL IPAdapter. */
export function animaWorkflow(project: SheetProject, tile: ExpressionTile, schema: Record<string, NodeSchema>, loras?: ExpressionLora[]): Record<string, unknown> {
  if (!project.reference) throw new Error('Add a reference portrait for Anima.');
  if (!isAnimaModel({ name: project.model })) throw new Error('Choose an Anima diffusion model for Anima Ref Adapter.');
  if (project.useLoras && !loras) throw new Error('Disable composer LoRAs before standalone workflow export. The live pipeline can apply them.');
  const graph: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {};
  const add = (id: string, type: string, values: Record<string, unknown>) => {
    const node = schema[type];
    if (!node) throw new Error(`The backend is missing ${type}. Install Anima Ref Adapter and current Comfy support, restart and check loaded nodes.`);
    const declared = { ...node.input?.required, ...node.input?.optional };
    for (const key of Object.keys(values)) if (!declared[key]) throw new Error(`The loaded ${type} node does not support ${key}. Update the node or check its version.`);
    const inputs = { ...values };
    for (const [key, value] of Object.entries(values)) {
      const choices = declared[key]?.[0];
      if (Array.isArray(choices) && !choices.includes(value)) throw new Error(`The selected ${type} ${key} is not available in this backend.`);
    }
    for (const [key, [inputType, options]] of Object.entries(node.input?.required ?? {})) {
      if (key in inputs) continue;
      if (options?.default !== undefined) inputs[key] = options.default;
      else if (Array.isArray(inputType) && inputType.length) inputs[key] = inputType[0];
      else throw new Error(`Unsupported required ${type} input: ${key}. Check loaded nodes.`);
    }
    graph[id] = { class_type: type, inputs };
  };
  const model = inventoryName(project.model, nodeChoices(schema, 'UNETLoader', 'unet_name'), 'Anima diffusion model');
  const clip = inventoryName(project.animaClip, nodeChoices(schema, 'CLIPLoader', 'clip_name'), 'Anima Qwen3 text encoder');
  const vae = inventoryName(project.animaVae, nodeChoices(schema, 'VAELoader', 'vae_name'), 'Anima Qwen Image VAE');
  const adapter = inventoryName(project.animaAdapter, nodeChoices(schema, 'AnimaRefAdapter', 'lora_name'), 'Anima reference adapter weights');
  add('1', 'UNETLoader', { unet_name: model });
  add('2', 'CLIPLoader', { clip_name: clip, type: 'stable_diffusion' });
  add('3', 'VAELoader', { vae_name: vae });
  add('4', 'SwarmLoadImageB64', { image_base64: project.reference.split(',')[1] });
  let modelRef: [string, number] = ['1', 0], clipRef: [string, number] = ['2', 0];
  for (const [index, lora] of (loras ?? []).filter(l => l.enabled).entries()) {
    const id = `lora-${index}`;
    add(id, 'LoraLoader', { model: modelRef, clip: clipRef, lora_name: inventoryName(lora.name, nodeChoices(schema, 'LoraLoader', 'lora_name'), 'composer LoRA'), strength_model: lora.weight, strength_clip: lora.weight });
    modelRef = [id, 0]; clipRef = [id, 1];
  }
  const optional = schema.AnimaRefAdapter?.input?.optional ?? {};
  add('5', 'AnimaRefAdapter', { model: modelRef, vae: ['3', 0], image: ['4', 0], lora_name: adapter, ref_guidance: project.animaGuidance, correction: 'apg', ...(optional.strength ? { strength: project.animaStrength } : {}), ...(optional.ref_end ? { ref_end: project.animaEnd } : {}), ...(optional.ref_megapixels ? { ref_megapixels: 1 } : {}) });
  const triggers = (loras ?? []).filter(l => l.enabled && l.useTrigger).map(l => l.triggerPhrase.replaceAll(';', ',').trim()).filter(Boolean);
  const prompt = [...triggers, project.subject, tile.prompt].filter(Boolean).join(', ');
  add('6', 'CLIPTextEncode', { clip: clipRef, text: prompt });
  add('7', 'CLIPTextEncode', { clip: clipRef, text: project.negative });
  add('8', 'EmptyLatentImage', { width: project.width, height: project.height, batch_size: 1 });
  add('9', 'KSampler', { model: ['5', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['8', 0], seed: (project.seed + tile.seedOffset) % 2147483647, steps: project.steps, cfg: project.cfg, sampler_name: project.sampler, scheduler: project.scheduler, denoise: 1 });
  add('10', 'VAEDecode', { samples: ['9', 0], vae: ['3', 0] });
  add('11', 'SwarmSaveImageWS', { images: ['10', 0] });
  return graph;
}
