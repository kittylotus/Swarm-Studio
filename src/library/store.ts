import { createId } from "../id";
import { emptyRegionalPromptDraft, normalizeRegionalPromptDraft } from "../regions";
import type {
  ConnectionSettings,
  FolderRecord,
  GenerationDraft,
  IdentityRecord,
  LoraStackItem,
  LoraStackProfile,
  OutputRecord,
  PersistedStudioState,
  StudioTheme,
  ThemeProfile,
  StudioUiState,
  StudioView,
} from "../types";

const STORAGE_KEY = "swarm-studio-state-v8";
const DRAFT_STORAGE_KEY = "swarm-studio-draft-v1";
export const PERSISTED_OUTPUT_CACHE_LIMIT = 220;
const LEGACY_STORAGE_KEYS = ["swarm-studio-state-v7", "swarm-studio-state-v6", "swarm-studio-state-v5", "swarm-studio-state-v4", "swarm-studio-state-v3", "swarm-studio-state-v2", "swarm-studio-state-v1"];
const UNFILED_ID = "folder-unfiled";
const FAVORITES_ID = "folder-favorites";

const defaultConnection: ConnectionSettings = {
  mode: "local",
  baseUrl: "http://127.0.0.1:7801",
  autoStart: false,
  launchMode: "managed",
  launchCommand: "",
  launchArgs: [],
  workingDirectory: "",
  allowedOrigins: [],
  activeOrigin: "",
  authToken: "",
};

const defaultDraft: GenerationDraft = {
  prompt: "",
  negativePrompt: "",
  model: "",
  width: 1024,
  height: 1024,
  ratio: "1:1",
  ratioReversed: false,
  lockRatio: false,
  steps: 20,
  cfgScale: 7,
  seed: -1,
  variationSeedEnabled: false,
  variationSeed: -1,
  variationSeedStrength: 0.1,
  sampler: "",
  scheduler: "",
  images: 1,
  loras: [],
  activePresets: [],
  regionalPrompt: emptyRegionalPromptDraft(),
  initImage: "",
  initImageName: "",
  initImageEnabled: false,
  initImageCreativity: 0.6,
  extraParams: {},
  advancedEnabledGroups: [],
};

const defaultFolders: FolderRecord[] = [
  { id: UNFILED_ID, name: "Unfiled", parentId: null, createdAt: 0 },
  { id: FAVORITES_ID, name: "Favorites", parentId: null, createdAt: 1 },
];

const defaultUi: StudioUiState = {
  lastView: "create",
  libraryFolder: "all",
  selectedOutputId: "",
  initOpen: false,
  advancedOpen: false,
  mobileCreatePane: "output",
  identityEditorOpen: false,
  settingsPane: "connection",
};

const defaultTheme: StudioTheme = {
  accent: "#c3a5ff",
  accentAlt: "#ffb5df",
  background: "#100d15",
  panel: "#1b1622",
  text: "#f4eef8",
  muted: "#aaa0b4",
  outline: "#e8dfff",
  radius: 14,
  controlRadius: 10,
  borderStrength: 0.14,
  surfaceOpacity: 0.92,
};

function cloneLoraStack(items: LoraStackItem[] | undefined): LoraStackItem[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || typeof item.name !== "string") return [];
    return [{
      id: typeof item.id === "string" && item.id ? item.id : createId(),
      name: item.name,
      title: typeof item.title === "string" ? item.title : item.name,
      weight: Number.isFinite(Number(item.weight)) ? Number(item.weight) : 1,
      enabled: item.enabled !== false,
      useTrigger: item.useTrigger === true,
      sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : "",
    }];
  });
}

function cloneDefaults(): PersistedStudioState {
  return {
    connection: structuredClone(defaultConnection),
    draft: structuredClone(defaultDraft),
    folders: structuredClone(defaultFolders),
    outputs: [],
    identities: [],
    loraProfiles: [],
    ui: structuredClone(defaultUi),
    theme: structuredClone(defaultTheme),
    themeProfiles: [],
  };
}

function validView(value: unknown): StudioView {
  return ["create", "library", "identities", "models", "civitai", "logs", "settings"].includes(String(value))
    ? value as StudioView
    : "create";
}

function safeParse(value: string | null): PersistedStudioState {
  if (!value) return cloneDefaults();
  try {
    const parsed = JSON.parse(value) as Partial<PersistedStudioState>;
    const draft = parsed.draft ?? {} as GenerationDraft;
    return {
      connection: {
        ...defaultConnection,
        ...(parsed.connection ?? {}),
        launchMode: parsed.connection?.launchMode === "system" ? "system" : "managed",
        allowedOrigins: Array.isArray(parsed.connection?.allowedOrigins) ? parsed.connection.allowedOrigins.map(String).filter(Boolean) : [],
        activeOrigin: typeof parsed.connection?.activeOrigin === "string" ? parsed.connection.activeOrigin : "",
        authToken: typeof parsed.connection?.authToken === "string" ? parsed.connection.authToken : "",
      },
      draft: {
        ...defaultDraft,
        ...draft,
        loras: cloneLoraStack(draft.loras),
        activePresets: Array.isArray(draft.activePresets) ? draft.activePresets.map(String) : typeof (draft as GenerationDraft & { activePreset?: string }).activePreset === "string" && (draft as GenerationDraft & { activePreset?: string }).activePreset ? [(draft as GenerationDraft & { activePreset?: string }).activePreset!] : [],
        regionalPrompt: normalizeRegionalPromptDraft(draft.regionalPrompt),
        variationSeedEnabled: draft.variationSeedEnabled === true,
        variationSeed: Number.isFinite(Number(draft.variationSeed)) ? Number(draft.variationSeed) : -1,
        variationSeedStrength: Number.isFinite(Number(draft.variationSeedStrength)) ? Number(draft.variationSeedStrength) : 0.1,
        initImage: typeof draft.initImage === "string" ? draft.initImage : "",
        initImageName: typeof draft.initImageName === "string" ? draft.initImageName : "",
        initImageEnabled: draft.initImageEnabled === true,
        initImageCreativity: Number.isFinite(Number(draft.initImageCreativity)) ? Number(draft.initImageCreativity) : 0.6,
        extraParams: draft.extraParams && typeof draft.extraParams === "object" ? draft.extraParams : {},
        advancedEnabledGroups: Array.isArray(draft.advancedEnabledGroups) ? draft.advancedEnabledGroups.map(String).filter(Boolean) : [],
      },
      folders: Array.isArray(parsed.folders) && parsed.folders.length ? parsed.folders : structuredClone(defaultFolders),
      outputs: Array.isArray(parsed.outputs) ? parsed.outputs.map((output) => ({
        ...output,
        prompt: typeof output.prompt === "string" ? output.prompt : "",
        sentPrompt: typeof output.sentPrompt === "string" ? output.sentPrompt : (typeof output.prompt === "string" ? output.prompt : ""),
        negativePrompt: typeof output.negativePrompt === "string" ? output.negativePrompt : "",
        model: typeof output.model === "string" ? output.model : "",
        metadata: typeof output.metadata === "string" ? output.metadata : "",
        request: output.request && typeof output.request === "object" ? output.request : {},
        loras: cloneLoraStack(output.loras),
        presets: Array.isArray(output.presets) ? output.presets.map(String) : [],
        prepTimeMs: Number.isFinite(Number(output.prepTimeMs)) ? Number(output.prepTimeMs) : undefined,
        generationTimeMs: Number.isFinite(Number(output.generationTimeMs)) ? Number(output.generationTimeMs) : undefined,
        totalTimeMs: Number.isFinite(Number(output.totalTimeMs)) ? Number(output.totalTimeMs) : undefined,
      })) : [],
      identities: Array.isArray(parsed.identities) ? parsed.identities.map((identity) => ({
        ...identity,
        avatarUrl: typeof identity.avatarUrl === "string" ? identity.avatarUrl : "",
        loraStack: cloneLoraStack(identity.loraStack),
      })) : [],
      loraProfiles: Array.isArray(parsed.loraProfiles) ? parsed.loraProfiles.map((profile) => ({
        ...profile,
        items: cloneLoraStack(profile.items),
      })) : [],
      ui: {
        ...defaultUi,
        ...(parsed.ui ?? {}),
        lastView: validView(parsed.ui?.lastView),
        mobileCreatePane: ["generation", "output", "tune"].includes(String(parsed.ui?.mobileCreatePane))
          ? parsed.ui?.mobileCreatePane as StudioUiState["mobileCreatePane"]
          : "output",
        identityEditorOpen: parsed.ui?.identityEditorOpen === true,
        settingsPane: String(parsed.ui?.settingsPane) === "remote"
          ? "connection"
          : ["connection", "backend", "appearance"].includes(String(parsed.ui?.settingsPane))
            ? parsed.ui?.settingsPane as StudioUiState["settingsPane"]
            : "connection",
      },
      theme: {
        ...defaultTheme,
        ...(parsed.theme ?? {}),
        radius: Number.isFinite(Number(parsed.theme?.radius)) ? Number(parsed.theme?.radius) : defaultTheme.radius,
        controlRadius: Number.isFinite(Number(parsed.theme?.controlRadius)) ? Number(parsed.theme?.controlRadius) : defaultTheme.controlRadius,
        borderStrength: Number.isFinite(Number(parsed.theme?.borderStrength)) ? Number(parsed.theme?.borderStrength) : defaultTheme.borderStrength,
        surfaceOpacity: Number.isFinite(Number(parsed.theme?.surfaceOpacity)) ? Number(parsed.theme?.surfaceOpacity) : defaultTheme.surfaceOpacity,
      },
      themeProfiles: Array.isArray(parsed.themeProfiles) ? parsed.themeProfiles.flatMap((profile) => {
        if (!profile || typeof profile.name !== "string") return [];
        const raw = profile as ThemeProfile;
        return [{
          id: typeof raw.id === "string" && raw.id ? raw.id : createId(),
          name: raw.name,
          theme: { ...defaultTheme, ...(raw.theme ?? {}) },
          createdAt: Number(raw.createdAt) || Date.now(),
          updatedAt: Number(raw.updatedAt) || Date.now(),
        }];
      }) : [],
    };
  } catch {
    return cloneDefaults();
  }
}

function scrubResolvedRandomSeedContamination(state: PersistedStudioState): void {
  // v0.16 Reuse All materialized metadata-backed advanced params wholesale. Swarm metadata
  // may contain the *resolved* Wildcard Seed used for <random:...>/<wildcard:...>. Persisting
  // that value freezes future prompt randomization even when the main image seed changes.
  // Only scrub during migration from pre-v8 state; users can still explicitly set Wildcard Seed
  // again through Advanced controls afterwards.
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state.draft.extraParams ?? {})) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (normalized === "wildcardseed" || normalized === "swarmversion") continue;
    clean[key] = value;
  }
  state.draft.extraParams = clean;
}

function stripBulkyValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return undefined;
  if (typeof value === "string") {
    if (/^(data:|blob:)/i.test(value)) return "[embedded data omitted]";
    if (value.length > 180_000) return `${value.slice(0, 4096)}…[${value.length - 4096} chars omitted]`;
    return value;
  }
  if (Array.isArray(value)) return value.slice(0, 512).map((item) => stripBulkyValue(item, depth + 1));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const clean = stripBulkyValue(item, depth + 1);
      if (clean !== undefined) output[key] = clean;
    }
    return output;
  }
  return value;
}

function persistableDraft(draftState: GenerationDraft): GenerationDraft {
  const draft = structuredClone(draftState);
  // Local init files are large data URLs. Keep them alive for the current session, but never put
  // megabytes of pixels into localStorage. Swarm-backed outputs can always be reselected as init.
  if (/^(data:|blob:)/i.test(draft.initImage)) {
    draft.initImage = "";
    draft.initImageName = "";
    draft.initImageEnabled = false;
  }
  draft.extraParams = stripBulkyValue(draft.extraParams) as Record<string, unknown>;
  return draft;
}

function persistableState(state: PersistedStudioState, outputLimit = PERSISTED_OUTPUT_CACHE_LIMIT): PersistedStudioState {
  const draft = persistableDraft(state.draft);

  const outputs = state.outputs.slice(0, outputLimit).map((output) => ({
    ...output,
    url: /^(data:|blob:)/i.test(output.url) && output.swarmPath ? "" : output.url,
    metadata: output.metadata.length > 220_000 ? `${output.metadata.slice(0, 220_000)}…[metadata trimmed]` : output.metadata,
    request: stripBulkyValue(output.request) as Record<string, unknown>,
  }));

  return {
    ...state,
    draft,
    outputs,
  };
}

export class StudioStore {
  state: PersistedStudioState;
  private persistenceWarning = "";

  constructor() {
    const current = localStorage.getItem(STORAGE_KEY);
    let legacy: string | null = null;
    if (!current) {
      for (const key of LEGACY_STORAGE_KEYS) {
        const value = localStorage.getItem(key);
        if (value) { legacy = value; break; }
      }
    }
    this.state = safeParse(current ?? legacy);
    const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (savedDraft) {
      try {
        // Reuse the normal draft migration/normalization path so this lightweight hot-state
        // snapshot remains forwards compatible with the main Studio state.
        this.state.draft = safeParse(JSON.stringify({ draft: JSON.parse(savedDraft) })).draft;
      } catch {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    }
    if (!current && legacy) {
      scrubResolvedRandomSeedContamination(this.state);
      // Free the old quota before writing the compact snapshot. A nearly-full legacy key can
      // otherwise prevent its own migration because localStorage quota is per-origin.
      for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key);
    }
    this.save();
  }

  save(): void {
    this.persistenceWarning = "";
    const attempts = [PERSISTED_OUTPUT_CACHE_LIMIT, 100, 35];
    for (const limit of attempts) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableState(this.state, limit)));
        this.saveDraft();
        if (limit !== attempts[0]) this.persistenceWarning = `Studio storage was compacted to the latest ${limit} local outputs. Swarm files were not deleted.`;
        return;
      } catch (error) {
        const quota = error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
        if (!quota && !(error instanceof Error && /quota/i.test(error.message))) {
          console.warn("Swarm Studio could not persist state", error);
          this.persistenceWarning = "Studio could not persist the latest local state.";
          return;
        }
      }
    }
    // Last-resort snapshot keeps settings/draft/folders/profiles, while Swarm remains the source of
    // truth for image history. Critically, quota errors never escape an input handler and freeze UI.
    try {
      const minimal = persistableState(this.state, 0);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
      this.persistenceWarning = "Browser storage was full, so Studio stopped caching output history locally. Use Library → Sync Swarm history to rebuild it.";
    } catch (error) {
      console.warn("Swarm Studio localStorage is full; continuing with in-memory state only", error);
      this.persistenceWarning = "Browser storage is full. Studio is continuing in-memory; changes may not survive a reload.";
    }
  }

  consumePersistenceWarning(): string {
    const message = this.persistenceWarning;
    this.persistenceWarning = "";
    return message;
  }

  updateConnection(patch: Partial<ConnectionSettings>): void {
    this.state.connection = { ...this.state.connection, ...patch };
    this.save();
  }

  saveDraft(): void {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(persistableDraft(this.state.draft)));
    } catch (error) {
      console.warn("Swarm Studio could not persist the generation draft", error);
    }
  }

  updateDraft(patch: Partial<GenerationDraft>, persist = true): void {
    this.state.draft = {
      ...this.state.draft,
      ...patch,
      loras: patch.loras ? cloneLoraStack(patch.loras) : this.state.draft.loras,
    };
    if (persist) this.saveDraft();
  }

  updateUi(patch: Partial<StudioUiState>): void {
    this.state.ui = { ...this.state.ui, ...patch };
    this.save();
  }

  updateTheme(patch: Partial<StudioTheme>): void {
    this.state.theme = { ...this.state.theme, ...patch };
    this.save();
  }

  saveThemeProfile(name: string): ThemeProfile {
    const now = Date.now();
    const existing = this.state.themeProfiles.find((profile) => profile.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) {
      existing.theme = structuredClone(this.state.theme);
      existing.updatedAt = now;
      this.save();
      return existing;
    }
    const profile: ThemeProfile = { id: createId(), name: name.trim() || "Theme", theme: structuredClone(this.state.theme), createdAt: now, updatedAt: now };
    this.state.themeProfiles.push(profile);
    this.save();
    return profile;
  }

  deleteThemeProfile(id: string): void {
    this.state.themeProfiles = this.state.themeProfiles.filter((profile) => profile.id !== id);
    this.save();
  }

  createFolder(name: string, parentId: string | null = null): FolderRecord {
    const folder: FolderRecord = {
      id: createId(),
      name: name.trim() || "New folder",
      parentId,
      createdAt: Date.now(),
    };
    this.state.folders.push(folder);
    this.save();
    return folder;
  }

  removeFolder(id: string): void {
    if ([UNFILED_ID, FAVORITES_ID].includes(id)) return;
    this.state.outputs = this.state.outputs.map((output) =>
      output.folderId === id ? { ...output, folderId: UNFILED_ID } : output,
    );
    this.state.identities = this.state.identities.map((identity) =>
      identity.folderId === id ? { ...identity, folderId: UNFILED_ID } : identity,
    );
    this.state.folders = this.state.folders.filter((folder) => folder.id !== id);
    this.save();
  }

  addOutput(output: Omit<OutputRecord, "id" | "createdAt" | "folderId" | "starred">): OutputRecord {
    const record: OutputRecord = {
      ...output,
      id: createId(),
      createdAt: Date.now(),
      folderId: UNFILED_ID,
      starred: false,
    };
    this.state.outputs.unshift(record);
    this.save();
    return record;
  }

  updateOutput(id: string, patch: Partial<OutputRecord>): void {
    this.state.outputs = this.state.outputs.map((output) => output.id === id ? { ...output, ...patch } : output);
    this.save();
  }

  deleteOutput(id: string): void {
    this.state.outputs = this.state.outputs.filter((output) => output.id !== id);
    this.save();
  }

  saveIdentity(input: Omit<IdentityRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }): IdentityRecord {
    const now = Date.now();
    const current = input.id ? this.state.identities.find((item) => item.id === input.id) : undefined;
    const identity: IdentityRecord = {
      id: current?.id ?? createId(),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      name: input.name.trim() || "Untitled identity",
      folderId: input.folderId || UNFILED_ID,
      positivePrompt: input.positivePrompt,
      negativePrompt: input.negativePrompt,
      model: input.model,
      notes: input.notes,
      avatarUrl: input.avatarUrl ?? current?.avatarUrl ?? "",
      loraStack: cloneLoraStack(input.loraStack),
    };
    this.state.identities = current
      ? this.state.identities.map((item) => item.id === identity.id ? identity : item)
      : [identity, ...this.state.identities];
    this.save();
    return identity;
  }

  deleteIdentity(id: string): void {
    this.state.identities = this.state.identities.filter((identity) => identity.id !== id);
    this.save();
  }

  saveLoraProfile(name: string, items: LoraStackItem[], source: LoraStackProfile["source"]): LoraStackProfile {
    const now = Date.now();
    const profile: LoraStackProfile = {
      id: createId(),
      name: name.trim() || "LoRA stack",
      items: cloneLoraStack(items),
      source,
      createdAt: now,
      updatedAt: now,
    };
    this.state.loraProfiles.unshift(profile);
    this.save();
    return profile;
  }

  deleteLoraProfile(id: string): void {
    this.state.loraProfiles = this.state.loraProfiles.filter((profile) => profile.id !== id);
    this.save();
  }
}

export const folderIds = {
  unfiled: UNFILED_ID,
  favorites: FAVORITES_ID,
};
