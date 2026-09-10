import { runtime } from "../runtime";
import type {
  SwarmApiErrorShape,
  SwarmGenerationEvent,
  SwarmGenerationImage,
  SwarmGenerationRequest,
  SwarmGenerationResponse,
  SwarmImageList,
  SwarmImageListItem,
  SwarmModel,
  SwarmModelDescription,
  SwarmModelHash,
  SwarmModelList,
  SwarmParamDefinition,
  SwarmParamList,
  SwarmPreset,
  SwarmSession,
  SwarmServerSetting,
  SwarmServerSettingsResponse,
  SwarmBackendInfo,
  SwarmBackendListResponse,
  SwarmUserData,
} from "./types";

export function normalizeBaseUrl(value: unknown): string {
  const trimmed = String(value ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return "http://127.0.0.1:7801";
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withScheme.replace(/\/(?:Text2Image|API)$/i, "").replace(/\/+$/, "");
}

function apiError(payload: SwarmApiErrorShape): Error | null {
  if (payload.error) return new Error(payload.error);
  if (payload.error_id) return new Error(`Swarm API error: ${payload.error_id}`);
  return null;
}

function metadataText(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    try { return JSON.stringify(raw); } catch { return String(raw); }
  }
  return String(raw);
}

export function normalizeGenerationImage(raw: unknown, index = 0): SwarmGenerationImage | null {
  if (typeof raw === "string" && raw) return { image: raw, batch_index: String(index) };
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const image = typeof value.image === "string" ? value.image : typeof value.src === "string" ? value.src : "";
  if (!image) return null;
  const rawSeed = value.seed ?? value.wildcard_seed ?? value.wildcardseed;
  const seed = Number(rawSeed);
  return {
    image,
    batch_index: value.batch_index == null ? String(index) : String(value.batch_index),
    metadata: metadataText(value.metadata),
    seed: Number.isFinite(seed) && seed >= 0 ? seed : undefined,
  };
}

export class SwarmClient {
  private sessionId = "";
  readonly baseUrl: string;
  readonly authToken: string;

  constructor(baseUrl: unknown, authToken: unknown = "") {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.authToken = String(authToken ?? "").trim();
  }

  imageUrl(path: unknown): string {
    const safePath = String(path ?? "");
    if (!safePath) return "";
    if (/^(data:|blob:)/i.test(safePath)) return safePath;
    if (runtime.kind === "browser" && typeof window !== "undefined" && /^\/?__swarm\//i.test(safePath)) {
      return `${window.location.origin}/${safePath.replace(/^\/+/, "")}`;
    }
    const direct = /^(https?:)/i.test(safePath) ? safePath : `${this.baseUrl}/${safePath.replace(/^\/+/, "")}`;
    if (runtime.kind === "browser" && typeof window !== "undefined") {
      try {
        const parsed = new URL(direct, window.location.origin);
        // The PWA talks to Swarm through Studio itself. Do not key this off :1420: a Tailscale
        // Serve / HTTPS wrapper can expose the exact same Studio host on 443 or an empty port.
        if (parsed.origin === window.location.origin && parsed.pathname.startsWith("/__swarm/")) return parsed.href;
        return `${window.location.origin}/__swarm${parsed.pathname}${parsed.search}`;
      } catch { /* return direct URL */ }
    }
    return direct;
  }

  async connect(): Promise<SwarmSession> {
    const session = await runtime.postJson<SwarmSession>(`${this.baseUrl}/API/GetNewSession`, {}, this.authToken);
    const error = apiError(session);
    if (error) throw error;
    if (!session.session_id) throw new Error("SwarmUI did not return a session_id.");
    this.sessionId = session.session_id;
    return session;
  }

  private async ensureSession(): Promise<string> {
    if (!this.sessionId) await this.connect();
    return this.sessionId;
  }

  private async call<T extends SwarmApiErrorShape>(route: string, body: Record<string, unknown>, retry = true): Promise<T> {
    const sessionId = await this.ensureSession();
    const payload = await runtime.postJson<T>(`${this.baseUrl}/API/${route}`, {
      ...body,
      session_id: sessionId,
    }, this.authToken);
    if (payload.error_id === "invalid_session_id" && retry) {
      this.sessionId = "";
      await this.connect();
      return this.call<T>(route, body, false);
    }
    const error = apiError(payload);
    if (error) throw error;
    return payload;
  }

  async listModels(subtype = "Stable-Diffusion", depth = 20): Promise<SwarmModel[]> {
    const payload = await this.call<SwarmModelList>("ListModels", {
      path: "",
      depth,
      subtype,
      sortBy: "Name",
      allowRemote: true,
      sortReverse: false,
      dataImages: false,
    });
    return payload.files ?? [];
  }

  async renameModel(oldName: string, newName: string, subtype = "Stable-Diffusion"): Promise<void> {
    await this.call<SwarmApiErrorShape>("RenameModel", { oldName, newName, subtype });
  }

  async deleteModel(modelName: string, subtype = "Stable-Diffusion"): Promise<void> {
    await this.call<SwarmApiErrorShape>("DeleteModel", { modelName, subtype });
  }

  async getModelHash(modelName: string, subtype = "Stable-Diffusion"): Promise<string> {
    const payload = await this.call<SwarmModelHash>("GetModelHash", { modelName, subtype });
    const hash = String(payload.hash ?? "").trim();
    if (!hash) throw new Error(`SwarmUI did not return a hash for ${modelName}.`);
    return hash;
  }

  async describeModel(modelName: string, subtype = "Stable-Diffusion"): Promise<SwarmModel> {
    const payload = await this.call<SwarmModelDescription>("DescribeModel", { modelName, subtype });
    if (!payload.model) throw new Error(`SwarmUI did not describe model ${modelName}.`);
    return payload.model;
  }

  async forwardMetadataRequest(url: string): Promise<Record<string, unknown>> {
    return this.call<SwarmApiErrorShape & Record<string, unknown>>("ForwardMetadataRequest", { url });
  }

  async editModelMetadata(model: SwarmModel, subtype = "LoRA", overrides: Partial<SwarmModel> = {}): Promise<void> {
    const merged = { ...model, ...overrides };
    await this.call<SwarmApiErrorShape>("EditModelMetadata", {
      model: merged.name,
      title: merged.title ?? "",
      author: merged.author ?? "",
      type: merged.architecture ?? "",
      description: merged.description ?? "",
      standard_width: Number(merged.standard_width ?? 0),
      standard_height: Number(merged.standard_height ?? 0),
      usage_hint: merged.usage_hint ?? "",
      date: merged.date ?? "",
      license: merged.license ?? "",
      trigger_phrase: merged.trigger_phrase ?? "",
      prediction_type: merged.prediction_type ?? "",
      tags: (merged.tags ?? []).join(", "),
      preview_image: overrides.preview_image ?? null,
      preview_image_metadata: null,
      is_negative_embedding: false,
      lora_default_weight: String(merged.lora_default_weight ?? ""),
      lora_default_confinement: String(merged.lora_default_confinement ?? ""),
      subtype,
    });
  }

  async parameterData(refresh = true, strong = false): Promise<SwarmParamList> {
    if (refresh) {
      try {
        return await this.call<SwarmParamList>("TriggerRefresh", { strong });
      } catch {
        // Older or permission-limited servers can still expose ListT2IParams.
      }
    }
    return this.call<SwarmParamList>("ListT2IParams", {});
  }

  async refreshInventory(): Promise<SwarmParamList> {
    return this.parameterData(true, true);
  }

  async listParameters(): Promise<SwarmParamDefinition[]> {
    return (await this.parameterData()).list ?? [];
  }

  async userData(): Promise<SwarmUserData> {
    return this.call<SwarmUserData>("GetMyUserData", {});
  }

  async listPresets(): Promise<SwarmPreset[]> {
    return (await this.userData()).presets ?? [];
  }

  async savePreset(input: {
    title: string;
    description: string;
    paramMap: Record<string, unknown>;
    previewImage?: string | null;
    editing?: string | null;
  }): Promise<void> {
    // AddNewPreset's JObject `raw` parameter receives the entire API request body.
    // Swarm then reads raw["param_map"] directly, so `param_map` must live at the
    // request root rather than under a literal `raw` property.
    const payload = await this.call<SwarmApiErrorShape & { success?: boolean; preset_fail?: string }>("AddNewPreset", {
      title: input.title,
      description: input.description,
      param_map: input.paramMap,
      preview_image: input.previewImage ?? null,
      preview_image_metadata: null,
      is_edit: Boolean(input.editing),
      editing: input.editing ?? null,
      is_starred: false,
    });
    if (payload.preset_fail) throw new Error(payload.preset_fail);
    if (payload.success === false) throw new Error("SwarmUI did not save the preset.");
  }

  async deletePreset(title: string): Promise<void> {
    await this.call<SwarmApiErrorShape>("DeletePreset", { preset: title });
  }

  async deleteImage(path: string): Promise<void> {
    await this.call<SwarmApiErrorShape>("DeleteImage", { path });
  }

  async toggleImageStarred(path: string): Promise<boolean> {
    const payload = await this.call<SwarmApiErrorShape & { new_state?: boolean }>("ToggleImageStarred", { path });
    return payload.new_state === true;
  }

  async listImageDirectory(path = "", depth = 20): Promise<SwarmImageList> {
    const payload = await this.call<SwarmImageList>("ListImages", {
      path,
      depth,
      sortBy: "Date",
      sortReverse: true,
    });
    return {
      ...payload,
      folders: (payload.folders ?? []).map(String),
      files: (payload.files ?? []).map((file) => ({
        ...file,
        src: String(file.src ?? ""),
        metadata: metadataText(file.metadata),
      })),
    };
  }

  async listImages(path = "", depth = 20): Promise<SwarmImageListItem[]> {
    return (await this.listImageDirectory(path, depth)).files ?? [];
  }

  async generate(request: SwarmGenerationRequest): Promise<SwarmGenerationResponse> {
    return this.call<SwarmGenerationResponse>("GenerateText2Image", request as Record<string, unknown>);
  }

  async addImageToHistory(image: string, rawInput: Record<string, unknown>): Promise<SwarmGenerationResponse> {
    // Swarm's AddImageToHistory route consumes the same root T2I parameter map as generation.
    // Keep the params at the root beside `image`; `call()` adds the session id for us.
    return this.call<SwarmGenerationResponse>("AddImageToHistory", { image, ...rawInput });
  }

  async generateStream(
    request: SwarmGenerationRequest,
    onEvent: (event: SwarmGenerationEvent) => void,
  ): Promise<SwarmGenerationImage[]> {
    const run = async (retry: boolean): Promise<SwarmGenerationImage[]> => {
      const sessionId = await this.ensureSession();
      const images: SwarmGenerationImage[] = [];
      let sessionInvalid = false;
      let streamError: Error | null = null;
      try {
        await runtime.streamJson(`${this.baseUrl}/API/GenerateText2ImageWS`, {
          ...request,
          session_id: sessionId,
        }, Math.max(1, Number(request.images) || 1), (raw) => {
          const event = raw as SwarmGenerationEvent;
          if (event.error_id === "invalid_session_id") sessionInvalid = true;
          const error = apiError(event);
          if (error) streamError = error;
          const image = normalizeGenerationImage(event.image, images.length);
          if (image && !images.some((item) => item.image === image.image && item.batch_index === image.batch_index)) {
            images.push(image);
          }
          onEvent(event);
        }, this.authToken);
      } catch (error) {
        if (!images.length) throw error;
      }

      if (sessionInvalid && retry) {
        this.sessionId = "";
        await this.connect();
        return run(false);
      }
      if (streamError) throw streamError;
      return images;
    };

    return run(true);
  }

  async downloadModel(input: { url: string; type: string; name: string; metadata?: string }, onEvent: (event: Record<string, unknown>) => void): Promise<void> {
    const sessionId = await this.ensureSession();
    let error: Error | null = null;
    await runtime.streamJson(`${this.baseUrl}/API/DoModelDownloadWS`, {
      session_id: sessionId,
      url: input.url,
      type: input.type,
      name: input.name,
      metadata: input.metadata ?? "",
    }, 0, (raw) => {
      const event = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      if (event.error) error = new Error(String(event.error));
      onEvent(event);
    }, this.authToken);
    if (error) throw error;
  }

  async interrupt(): Promise<void> {
    await this.call<SwarmApiErrorShape>("InterruptAll", { other_sessions: false });
  }

  async listServerSettings(): Promise<Record<string, SwarmServerSetting>> {
    const payload = await this.call<SwarmServerSettingsResponse>("ListServerSettings", {});
    return payload.settings ?? {};
  }

  async changeServerSettings(rawData: Record<string, unknown>): Promise<void> {
    await this.call<SwarmApiErrorShape>("ChangeServerSettings", { rawData });
  }

  async listBackends(): Promise<SwarmBackendInfo[]> {
    const payload = await this.call<SwarmBackendListResponse>("ListBackends", { nonreal: false, full_data: true });
    return Object.values(payload).filter((value): value is SwarmBackendInfo => {
      if (!value || typeof value !== "object") return false;
      const backend = value as Partial<SwarmBackendInfo>;
      return Number.isFinite(Number(backend.id)) && typeof backend.type === "string";
    }).map((backend) => ({
      ...backend,
      id: Number(backend.id),
      settings: backend.settings && typeof backend.settings === "object" ? backend.settings : {},
      enabled: backend.enabled !== false,
      status: String(backend.status ?? "unknown"),
      title: String(backend.title ?? `Backend ${backend.id}`),
      type: String(backend.type ?? ""),
    }));
  }

  async restartBackends(backend: number | "all" = "all"): Promise<number> {
    const payload = await this.call<SwarmApiErrorShape & { count?: number }>("RestartBackends", { backend: String(backend) });
    return Number(payload.count ?? 0);
  }

  async toggleBackend(backendId: number, enabled: boolean): Promise<void> {
    await this.call<SwarmApiErrorShape>("ToggleBackend", { backend_id: backendId, enabled });
  }

  async freeBackendMemory(backend: number | "all" = "all", systemRam = true): Promise<number> {
    const payload = await this.call<SwarmApiErrorShape & { count?: number }>("FreeBackendMemory", { backend: String(backend), system_ram: systemRam });
    return Number(payload.count ?? 0);
  }

  async editBackend(backend: SwarmBackendInfo, settingsPatch: Record<string, unknown>): Promise<SwarmBackendInfo> {
    // Swarm's browser client sends `settings` as a top-level API field. The generic API binder
    // collects dynamic top-level fields into the JObject `raw_inp` parameter internally; sending
    // wrapping the payload explicitly in `raw_inp` nests it one level too deep and yields
    // `EditBackend: Missing settings.`. Refresh first so policy edits preserve unrelated settings.
    const current = (await this.listBackends()).find((candidate) => candidate.id === backend.id) ?? backend;
    const settings = { ...(current.settings ?? {}) };
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
    for (const [key, value] of Object.entries(settingsPatch)) {
      const wanted = normalize(key);
      const existing = Object.keys(settings).find((name) => normalize(name) === wanted);
      settings[existing ?? key] = value;
    }
    return this.call<SwarmBackendInfo & SwarmApiErrorShape>("EditBackend", {
      backend_id: current.id,
      title: current.title,
      settings,
    });
  }
}

function valueLabel(value: string | { name?: string; value?: string; title?: string }): string {
  if (typeof value === "string") return value;
  return String(value.value ?? value.name ?? value.title ?? "");
}

export function getParamValues(params: SwarmParamDefinition[], ...names: string[]): string[] {
  const wanted = names.map((name) => name.toLowerCase().replace(/\s+/g, ""));
  const match = params.find((param) => {
    const candidates = [param.name, param.id]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase().replace(/\s+/g, ""));
    return candidates.some((candidate) => wanted.includes(candidate));
  });
  return Array.isArray(match?.values) ? match.values.map(valueLabel).filter(Boolean) : [];
}

export function findParam(params: SwarmParamDefinition[], ...names: string[]): SwarmParamDefinition | undefined {
  const wanted = names.map((name) => name.toLowerCase().replace(/[^a-z0-9]+/g, ""));
  return params.find((param) => [param.id, param.name]
    .filter((value): value is string => Boolean(value))
    .some((value) => wanted.includes(value.toLowerCase().replace(/[^a-z0-9]+/g, ""))));
}
