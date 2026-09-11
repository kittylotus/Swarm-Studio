export type StudioView = "create" | "library" | "identities" | "models" | "civitai" | "logs" | "settings";

export interface ConnectionSettings {
  mode: "local" | "remote";
  baseUrl: string;
  autoStart: boolean;
  launchMode: "managed" | "system";
  launchCommand: string;
  launchArgs: string[];
  workingDirectory: string;
  allowedOrigins: string[];
  activeOrigin: string;
  authToken: string;
}

export interface StudioTheme {
  accent: string;
  accentAlt: string;
  background: string;
  panel: string;
  text: string;
  muted: string;
  outline: string;
  radius: number;
  controlRadius: number;
  borderStrength: number;
  surfaceOpacity: number;
}

export interface ThemeProfile {
  id: string;
  name: string;
  theme: StudioTheme;
  createdAt: number;
  updatedAt: number;
}

export interface LoraStackItem {
  id: string;
  name: string;
  title: string;
  weight: number;
  enabled: boolean;
  useTrigger: boolean;
  sourceUrl: string;
}

export interface LoraStackProfile {
  id: string;
  name: string;
  items: LoraStackItem[];
  source: "studio" | "lumiswarm-import";
  createdAt: number;
  updatedAt: number;
}

export interface GenerationDraft {
  prompt: string;
  negativePrompt: string;
  model: string;
  width: number;
  height: number;
  ratio: string;
  ratioReversed: boolean;
  lockRatio: boolean;
  steps: number;
  cfgScale: number;
  seed: number;
  variationSeedEnabled: boolean;
  variationSeed: number;
  variationSeedStrength: number;
  sampler: string;
  scheduler: string;
  images: number;
  loras: LoraStackItem[];
  activePresets: string[];
  initImage: string;
  initImageName: string;
  initImageEnabled: boolean;
  initImageCreativity: number;
  extraParams: Record<string, unknown>;
  advancedEnabledGroups: string[];
}

export interface FolderRecord {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

export interface OutputRecord {
  id: string;
  url: string;
  /** Fetch/display path returned by Swarm or projected from session routing, e.g. `View/<user>/...` or `Output/...`. */
  swarmPath: string;
  /** Exact path relative to the active user's Swarm output root, used by ListImages/history mutations. */
  swarmSourcePath?: string;
  folderId: string;
  prompt: string;
  sentPrompt: string;
  negativePrompt: string;
  model: string;
  width: number;
  height: number;
  seed: number;
  starred: boolean;
  createdAt: number;
  metadata: string;
  request: Record<string, unknown>;
  loras: LoraStackItem[];
  presets: string[];
  /** Measured request/preparation time before sampler progress, in milliseconds. */
  prepTimeMs?: number;
  /** Measured sampler/generation time, in milliseconds. */
  generationTimeMs?: number;
  /** Total observed generation trip, in milliseconds. */
  totalTimeMs?: number;
}

export interface IdentityRecord {
  id: string;
  name: string;
  folderId: string;
  positivePrompt: string;
  negativePrompt: string;
  model: string;
  notes: string;
  loraStack: LoraStackItem[];
  avatarUrl: string;
  createdAt: number;
  updatedAt: number;
}

export interface StudioUiState {
  lastView: StudioView;
  libraryFolder: string;
  selectedOutputId: string;
  initOpen: boolean;
  advancedOpen: boolean;
  mobileCreatePane: "generation" | "output" | "tune";
  identityEditorOpen: boolean;
  settingsPane: "connection" | "backend" | "appearance";
}

export interface PersistedStudioState {
  connection: ConnectionSettings;
  draft: GenerationDraft;
  folders: FolderRecord[];
  outputs: OutputRecord[];
  identities: IdentityRecord[];
  loraProfiles: LoraStackProfile[];
  ui: StudioUiState;
  theme: StudioTheme;
  themeProfiles: ThemeProfile[];
}

export interface ToastMessage {
  kind: "info" | "success" | "error";
  text: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: "info" | "warn" | "error";
  source: "studio" | "swarm" | "api";
  message: string;
}
