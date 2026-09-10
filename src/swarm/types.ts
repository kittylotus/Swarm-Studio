export interface SwarmSession {
  session_id: string;
  user_id?: string;
  output_append_user?: boolean;
  version?: string;
  server_id?: string;
  permissions?: string[];
  error?: string;
  error_id?: string;
}

export interface SwarmApiErrorShape {
  error?: string;
  error_id?: string;
}

export interface SwarmModel {
  name: string;
  title?: string;
  author?: string;
  description?: string;
  preview_image?: string;
  architecture?: string;
  class?: string;
  compat_class?: string;
  standard_width?: number;
  standard_height?: number;
  trigger_phrase?: string;
  usage_hint?: string;
  license?: string;
  date?: string;
  prediction_type?: string;
  tags?: string[];
  lora_default_weight?: string | number;
  lora_default_confinement?: string | number;
  local?: boolean;
}

export interface SwarmModelDescription extends SwarmApiErrorShape {
  model?: SwarmModel;
}

export interface SwarmModelList extends SwarmApiErrorShape {
  folders?: string[];
  files?: SwarmModel[];
}

export interface SwarmModelHash extends SwarmApiErrorShape {
  hash?: string;
}

export interface SwarmParamDefinition {
  name?: string;
  id?: string;
  type?: string;
  default?: unknown;
  values?: Array<string | { name?: string; value?: string; title?: string }>;
  examples?: string[];
  group?: string | null;
  description?: string;
  subtype?: string | null;
  toggleable?: boolean;
  visible?: boolean;
  advanced?: boolean;
  feature_flag?: string | null;
  priority?: number;
  min?: number;
  max?: number;
  view_max?: number;
  step?: number;
  view_type?: string;
  extra_hidden?: boolean;
}

export interface SwarmParamGroup {
  name?: string;
  id?: string;
  toggles?: boolean;
  open?: boolean;
  priority?: number;
  description?: string;
  advanced?: boolean;
  can_shrink?: boolean;
  parent?: string | null;
}

export type SwarmParamModelEntry = string | [string, string | null] | [string];

export interface SwarmParamList extends SwarmApiErrorShape {
  list?: SwarmParamDefinition[];
  groups?: SwarmParamGroup[];
  models?: Record<string, SwarmParamModelEntry[]>;
  wildcards?: string[];
  param_edits?: Record<string, unknown> | null;
}

export interface SwarmPreset {
  author?: string;
  title: string;
  description?: string;
  param_map: Record<string, unknown>;
  preview_image?: string;
}

export interface SwarmUserData extends SwarmApiErrorShape {
  user_name?: string;
  presets?: SwarmPreset[];
  permissions?: string[];
  starred_models?: Record<string, string[]>;
}

export interface SwarmGenerationRequest {
  prompt: string;
  negativeprompt: string;
  model: string;
  width: number;
  height: number;
  steps: number;
  cfgscale: number;
  seed: number;
  sampler?: string;
  scheduler?: string;
  images: number;
  loras?: string[] | string;
  loraweights?: string[] | string;
  initimage?: string;
  initimagecreativity?: number;
  donotsave?: boolean;
  [key: string]: unknown;
}

export interface SwarmGenerationResponse extends SwarmApiErrorShape {
  images?: Array<string | SwarmGenerationImage>;
  metadata?: string[];
}

export interface SwarmGenerationImage {
  image: string;
  batch_index?: string;
  metadata?: string;
  seed?: number;
}

export interface SwarmGenerationProgress {
  batch_index?: string;
  overall_percent?: number;
  current_percent?: number;
  preview?: string;
}

export interface SwarmGenerationEvent extends SwarmApiErrorShape {
  gen_progress?: SwarmGenerationProgress;
  image?: SwarmGenerationImage | string;
  metadata?: unknown;
  seed?: unknown;
  wildcard_seed?: unknown;
  wildcardseed?: unknown;
  discard_indices?: number[];
  status?: Record<string, unknown>;
  backend_status?: {
    status?: string;
    class?: string;
    message?: string;
    any_loading?: boolean;
  };
  raw_swarm_data?: {
    params_used?: string[];
  };
}

export interface SwarmImageListItem {
  src: string;
  metadata?: string;
}

export interface SwarmImageList extends SwarmApiErrorShape {
  folders?: string[];
  files?: SwarmImageListItem[];
}

export interface SwarmServerSetting {
  type?: string;
  name?: string;
  value?: unknown;
  description?: string;
  values?: unknown[] | null;
  value_names?: unknown[] | null;
}

export interface SwarmServerSettingsResponse extends SwarmApiErrorShape {
  settings?: Record<string, SwarmServerSetting>;
}

export interface SwarmBackendInfo {
  id: number;
  type: string;
  status: string;
  settings: Record<string, unknown>;
  enabled: boolean;
  title: string;
  current_model?: string;
}

export type SwarmBackendListResponse = SwarmApiErrorShape & Record<string, SwarmBackendInfo | unknown>;
