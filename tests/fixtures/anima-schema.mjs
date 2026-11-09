export const node = (required, optional) => ({ input: { required: Object.fromEntries(Object.entries(required).map(([key, value]) => [key, Array.isArray(value) ? [value] : [value, { default: value === 'FLOAT' ? 1 : undefined }]])), optional: Object.fromEntries((optional || []).map(key => [key, ['FLOAT', { default: 1 }]])) } });
export const schema = {
  UNETLoader: node({ unet_name: ['diffusion/anima-base.safetensors'], weight_dtype: ['default'] }),
  CLIPLoader: node({ clip_name: ['qwen_3_06b_base.safetensors'], type: ['stable_diffusion'], device: ['default'] }),
  VAELoader: node({ vae_name: ['qwen_image_vae.safetensors'] }),
  SwarmLoadImageB64: node({ image_base64: 'STRING' }), SwarmSaveImageWS: node({ images: 'IMAGE' }),
  AnimaRefAdapter: node({ model: 'MODEL', vae: 'VAE', image: 'IMAGE', lora_name: ['anima_ref_adapter_v2_r64.safetensors'], ref_guidance: 'FLOAT', correction: ['apg', 'rescale', 'none'] }, ['strength', 'ref_end', 'ref_megapixels']),
  CLIPTextEncode: node({ clip: 'CLIP', text: 'STRING' }), EmptyLatentImage: node({ width: 'INT', height: 'INT', batch_size: 'INT' }),
  KSampler: node({ model: 'MODEL', positive: 'CONDITIONING', negative: 'CONDITIONING', latent_image: 'LATENT', seed: 'INT', steps: 'INT', cfg: 'FLOAT', sampler_name: ['euler'], scheduler: ['normal'], denoise: 'FLOAT' }),
  VAEDecode: node({ samples: 'LATENT', vae: 'VAE' }), LoraLoader: node({ model: 'MODEL', clip: 'CLIP', lora_name: ['styles/detail.safetensors'], strength_model: 'FLOAT', strength_clip: 'FLOAT' }),
};
