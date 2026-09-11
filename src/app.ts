import { createId } from "./id";
import { builtInThemes, isLightTheme, themeFontOptions, themeFontStack } from "./theme";
import { StudioStore, folderIds, PERSISTED_OUTPUT_CACHE_LIMIT } from "./library/store";
import { normalizeLibraryFolderSelection, shouldAutoSyncLibraryHistory } from "./library/session";
import { loraCompatibility, modelFamily, serverModelKey } from "./lora/compat";
import { importLumiSwarmStack } from "./lora/import";
import { loraRequestValue, resolveLoraModelName } from "./lora/request";
import {
  REGION_LAYOUT_PRESETS,
  applyRegionLayoutPreset,
  applyRegionPresetSpacing,
  cloneRegionalPromptDraft,
  compileRegionalPrompt,
  emptyRegionalPromptDraft,
  hasRegionalPromptContent,
  moveRegionGeometry,
  regionOverlapAreas,
  resizeRegionGeometry,
  type RegionResizeHandle,
} from "./regions";
import { CIVITAI_FALLBACK_ORIGIN, CIVITAI_ORIGIN, isCivitaiHost, routeCivitaiUrl } from "./civitai/urls";
import { runtime, type RuntimeProcessStatus, type RuntimeRepoStatus, type StudioUpdateStatus } from "./runtime";
import { formatLaunchArgs, hasCliFlag, mergeComfyRuntimeFlags, parseLaunchArgs, readCliFlagValue } from "./runtime/args";
import { findParam, normalizeBaseUrl, normalizeGenerationImage, SwarmClient, getParamValues } from "./swarm/client";
import { normalizeGenerationRequest, normalizeParamKey } from "./swarm/request";
import { swarmImageMutationPath, swarmImageViewPath } from "./swarm/history";
import type {
  SwarmGenerationEvent,
  SwarmGenerationImage,
  SwarmGenerationRequest,
  SwarmBackendInfo,
  SwarmImageListItem,
  SwarmModel,
  SwarmParamDefinition,
  SwarmParamGroup,
  SwarmParamList,
  SwarmPreset,
  SwarmSession,
  SwarmServerSetting,
  SwarmUserData,
} from "./swarm/types";
import type {
  GenerationDraft,
  IdentityRecord,
  LogEntry,
  LoraStackItem,
  OutputRecord,
  RegionLayoutPreset,
  RegionalPromptDraft,
  StudioTheme,
  StudioUiState,
  StudioView,
  ToastMessage,
} from "./types";

const escapeHtml = (value: unknown): string => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const sleep = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const asNumber = (value: string, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const ratioChoices = ["1:1", "2:3", "3:4", "4:5", "9:16"];
const seedToggleSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10a5 5 0 0 1 5 5v1"/><path d="m16 10 3 3 3-3"/><path d="M20 17H10a5 5 0 0 1-5-5v-1"/><path d="m8 14-3-3-3 3"/></svg>`;
const syntaxSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4 4 12l4 8"/><path d="m16 4 4 8-4 8"/><path d="m14 3-4 18"/></svg>`;
const regionsSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`;
const clearPromptSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 21-4-4L15.5 4.5a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L7 21Z"/><path d="m11 9 5 5"/><path d="M7 21h13"/></svg>`;
const tabCreateSvg = `<svg class="tab-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3-1.4 4.2a2 2 0 0 1-1.3 1.3L5 10l4.3 1.5a2 2 0 0 1 1.3 1.3L12 17l1.4-4.2a2 2 0 0 1 1.3-1.3L19 10l-4.3-1.5a2 2 0 0 1-1.3-1.3Z"/><path d="M5 3v3M3.5 4.5h3M19 17v4M17 19h4"/></svg>`;
const tabLibrarySvg = `<svg class="tab-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
const tabIdentitiesSvg = `<svg class="tab-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`;
const tabModelsSvg = `<svg class="tab-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5-8 4.5-8-4.5Z"/><path d="m4 12 8 4.5 8-4.5"/><path d="m4 16.5 8 4.5 8-4.5"/></svg>`;
const tabLogsSvg = `<svg class="tab-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="m7 9 2 2-2 2"/><path d="M12 14h5"/></svg>`;
const tabSettingsSvg = `<svg class="tab-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="16" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>`;
const tabVisualsSvg = `<svg class="tab-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-4-4L5 20"/></svg>`;
const tabGenerationSvg = `<svg class="tab-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5L8 21l-5-5Z"/><path d="m13 6 5 5"/><path d="M6 3v3M4.5 4.5h3M20 16v4M18 18h4"/></svg>`;
const tabOutputSvg = `<svg class="tab-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 15 5-5 4 4 3-3 6 6"/></svg>`;
const tabTuneSvg = `<svg class="tab-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M4 12h4M12 12h8"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/><circle cx="10" cy="12" r="2"/></svg>`;
const tabSearchSvg = `<svg class="tab-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>`;
const tabConnectionSvg = `<svg class="tab-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.6a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/></svg>`;
const tabBackendSvg = `<svg class="tab-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.01M8 17h.01"/></svg>`;
const tabAppearanceSvg = `<svg class="tab-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const tabJumpSvg = `<svg class="tab-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>`;
const reuseSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>`;
const initImageSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/><path d="M18 2v6M15 5h6"/></svg>`;
const folderSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>`;
const heartSvg = `<svg class="action-svg heart-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>`;
const plusSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`;
const saveSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21h14"/><path d="M19 21V7.8a1 1 0 0 0-.3-.7l-2.8-2.8a1 1 0 0 0-.7-.3H7a2 2 0 0 0-2 2v15"/><path d="M9 21v-6h6v6"/><path d="M9 4v5h5"/></svg>`;
const importSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`;
const exportSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/></svg>`;
const settingsRowsSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h9"/><path d="M17 6h3"/><circle cx="15" cy="6" r="2"/><path d="M4 12h3"/><path d="M11 12h9"/><circle cx="9" cy="12" r="2"/><path d="M4 18h11"/><path d="M19 18h1"/><circle cx="17" cy="18" r="2"/></svg>`;
const applyPresetSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 10-5 5 5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>`;
const trashSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m7 7 1 13h8l1-13"/></svg>`;
const gripSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>`;
const eyeSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const eyeOffSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.7A3 3 0 0 0 12 15a3 3 0 0 0 2.3-5.3"/><path d="M9.9 5.1A10.7 10.7 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.2 4"/><path d="M6.4 6.5C4.1 8 2.5 12 2.5 12a17 17 0 0 0 6.2 5.4"/></svg>`;
const linkedSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>`;
const unlinkedSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 15 5 19"/><path d="M15 9 19 5"/><path d="M7.5 7.5a5 5 0 0 1 7.1 0l1.4 1.4"/><path d="m15.1 15.1-1.4 1.4a5 5 0 0 1-7.1 0"/></svg>`;
const swapSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5"/><path d="m4 20 17-17"/><path d="M8 21H3v-5"/></svg>`;
const batchSelectSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7.5 12 3 3 6-7"/></svg>`;
const folderTreeSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/></svg>`;
const externalLinkSvg = `<svg class="external-link-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"/><path d="M10 14 20 4"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/></svg>`;
const inpaintBrushSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 4.5 5 5"/><path d="M12 7 4.8 14.2c-.8.8-1.3 1.9-1.3 3V20h2.8c1.1 0 2.2-.5 3-1.3L16.5 11"/><path d="M6 18c1.2 0 2 .8 2 2"/></svg>`;
const inpaintEraseSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 21-4-4L15.5 4.5a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L7 21Z"/><path d="m11 9 5 5"/><path d="M7 21h13"/></svg>`;
const inpaintRectSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M8 5v14M16 5v14" opacity=".45"/></svg>`;
const inpaintLassoSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8c0-3-3-5-7-5S5 5 5 8s3 5 7 5c3.5 0 6.5-1.5 7-4"/><path d="M12 13c0 4-1 7-4 7-2 0-3-1-3-2.5S6.2 15 8 15c2.5 0 4 2 4 4"/></svg>`;
const inpaintPanSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V6a2 2 0 0 1 4 0v4-6a2 2 0 0 1 4 0v6-4a2 2 0 0 1 4 0v7c0 5-3 8-8 8h-1c-2.5 0-4.5-1.3-6-3.2L2.8 15a2 2 0 0 1 3-2.6L8 14"/></svg>`;
const inpaintUndoSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 8-5 4 5 4"/><path d="M5 12h8a6 6 0 0 1 6 6"/></svg>`;
const inpaintRedoSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 8 5 4-5 4"/><path d="M19 12h-8a6 6 0 0 0-6 6"/></svg>`;
const inpaintInvertSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z"/></svg>`;
const inpaintClearSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m7 7 1 13h8l1-13"/></svg>`;
const inpaintImportSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`;
const inpaintExportSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/></svg>`;
const inpaintSettingsSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h2"/><path d="M10 17h10"/><circle cx="8" cy="17" r="2"/><path d="M4 12h4"/><path d="M12 12h8"/><circle cx="10" cy="12" r="2"/></svg>`;
const inpaintHelpSvg = `<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-1 .7-1.5 1.1-1.5 2"/><path d="M12 17h.01"/></svg>`;
function prettyName(path: unknown): string {
  const safe = String(path ?? "");
  const leaf = safe.split(/[\\/]/).pop() ?? safe;
  return leaf.replace(/\.(safetensors|ckpt|pt)$/i, "").replaceAll("_", " ");
}

function cloneStack(items: LoraStackItem[]): LoraStackItem[] {
  return items.map((item) => ({ ...item, id: createId() }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round64(value: number): number {
  return clamp(Math.max(64, Math.round(value / 64) * 64), 64, 4096);
}



interface NativeImageCacheEntry {
  url: string;
  bytes: number;
}

interface MemoryDiagnosticsSnapshot {
  sampledAt: number;
  jsHeapUsed: number | null;
  jsHeapTotal: number | null;
  jsHeapLimit: number | null;
  nativeCacheEntries: number;
  nativeCacheBytes: number;
  nativePending: number;
  trackedBlobUrls: number;
  trackedBlobBytes: number;
  mountedImages: number;
  mountedNativeImages: number;
  loadedNativeImages: number;
  lazyLoadedNativeImages: number;
  libraryOutputs: number;
  logEntries: number;
}

interface PreparedLoraDownload {
  url: string;
  name: string;
  metadata: string;
  sourceUrl: string;
  title: string;
  versionTitle: string;
  author: string;
  description: string;
  baseModel: string;
  modelType: string;
  family: string;
  architecture: string;
  triggerWords: string[];
  tags: string[];
  previewUrl: string;
  previewDataUrl: string;
  date: string;
  usageHint: string;
}

interface CivitaiFile {
  id?: number;
  name?: string;
  sizeKB?: number;
  primary?: boolean;
  downloadUrl?: string;
  metadata?: Record<string, unknown>;
  hashes?: Record<string, string>;
  pickleScanResult?: string;
  virusScanResult?: string;
}

interface CivitaiImage {
  url?: string;
  width?: number;
  height?: number;
  nsfw?: boolean | string;
  nsfwLevel?: number | string;
  type?: string;
  meta?: Record<string, unknown> | null;
}

interface CivitaiVersion {
  id: number;
  name?: string;
  description?: string;
  baseModel?: string;
  createdAt?: string;
  trainedWords?: string[];
  downloadUrl?: string;
  files?: CivitaiFile[];
  images?: CivitaiImage[];
  stats?: Record<string, number>;
}

interface CivitaiModelItem {
  id: number;
  name: string;
  description?: string;
  type?: string;
  nsfw?: boolean;
  tags?: string[];
  creator?: { username?: string; image?: string };
  stats?: Record<string, number>;
  modelVersions?: CivitaiVersion[];
}

interface CivitaiSearchResponse {
  items?: CivitaiModelItem[];
  metadata?: {
    totalItems?: number | string;
    currentPage?: number | string;
    pageSize?: number | string;
    totalPages?: number | string;
    nextPage?: string;
    prevPage?: string;
    nextCursor?: string | number;
    prevCursor?: string | number;
  };
}

interface CivitaiInstallQueueItem {
  versionId: number;
  modelId: number;
  title: string;
  status: "queued" | "installing" | "done" | "error";
  progress: number;
  message: string;
}

function normalizeCivitaiTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") return String((item as Record<string, unknown>).name ?? "");
    return "";
  }).map((item) => item.trim()).filter(Boolean);
}

function familyFromCivitaiBaseModel(value: unknown): string {
  const raw = String(value ?? "").toLowerCase();
  if (/anima/.test(raw)) return "anima";
  if (/krea/.test(raw)) return "krea";
  if (/flux/.test(raw)) return "flux";
  if (/illustrious|noobai|noob ai|illust/.test(raw)) return "illustrious";
  if (/pony/.test(raw)) return "pony";
  if (/sdxl|stable.?diffusion.?xl/.test(raw)) return "sdxl";
  if (/sd\s*3|stable.?diffusion.?3/.test(raw)) return "sd3";
  if (/sd\s*2|stable.?diffusion.?2/.test(raw)) return "sd2";
  if (/sd\s*1|stable.?diffusion.?1|1\.5/.test(raw)) return "sd1";
  return "";
}

function stripMarkup(value: unknown): string {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compactNumber(value: unknown): string {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(number);
}

function formatFileSize(sizeKb: unknown): string {
  const kb = Number(sizeKb ?? 0);
  if (!Number.isFinite(kb) || kb <= 0) return "";
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(1)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(kb >= 10240 ? 0 : 1)} MB`;
  return `${Math.round(kb)} KB`;
}


function displayTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

interface InpaintPoint {
  x: number;
  y: number;
}

interface InpaintStroke {
  mode: "paint" | "erase";
  size: number;
  points: InpaintPoint[];
  shape?: "stroke" | "rect" | "lasso";
}

interface PendingGenerationApproval {
  id: string;
  objectUrl: string;
  blob: Blob;
  metadata: string;
  seed: number;
  request: SwarmGenerationRequest;
  draft: GenerationDraft;
  prepTimeMs?: number;
  generationTimeMs?: number;
  totalTimeMs?: number;
}

export class StudioApp {

  private readonly root: HTMLElement;
  private readonly store = new StudioStore();
  private client: SwarmClient;
  private view: StudioView;
  private connected = false;
  private connecting = false;
  private generating = false;
  private session: SwarmSession | null = null;
  private userData: SwarmUserData | null = null;
  private models: SwarmModel[] = [];
  private loras: SwarmModel[] = [];
  private params: SwarmParamDefinition[] = [];
  private paramGroups: SwarmParamGroup[] = [];
  private presets: SwarmPreset[] = [];
  private wildcards: string[] = [];
  private libraryFolder: string;
  private librarySearch = "";
  private libraryDateFrom = "";
  private libraryDateTo = "";
  private libraryModelFilter = "";
  private libraryStarFilter: "all" | "starred" | "unstarred" = "all";
  private libraryFiltersOpen = false;
  private libraryFiltersDocked = false;
  private libraryBrowseScrollTop = 0;
  private libraryMoveOpen = false;
  private librarySelectMode = false;
  private librarySelected = new Set<string>();
  private libraryLastSelectedId = "";
  private libraryRenderLimit = 240;
  private libraryBatchBusy = false;
  private libraryAutoSyncStarted = false;
  private toast: ToastMessage | null = null;
  private toastTimer = 0;
  private draftSaveTimer = 0;
  private logs: LogEntry[] = [];
  private processStatus: RuntimeProcessStatus = { owned: false, running: false, pid: null };
  private processStatusRefreshTimer = 0;
  private backendControlLoaded = false;
  private backendControlLoading = false;
  private backendControlBusy = "";
  private backendControlError = "";
  private studioUpdateStatus: StudioUpdateStatus | null = null;
  private studioUpdateChecking = false;
  private studioUpdateApplying = false;
  private studioUpdatePopupOpen = false;
  private studioUpdateDismissed = false;
  private parameterHydrationEpoch = 0;
  private backendList: SwarmBackendInfo[] = [];
  private swarmRepoStatus: RuntimeRepoStatus | null = null;
  private comfyRepoStatus: RuntimeRepoStatus | null = null;
  private swarmRepoError = "";
  private comfyRepoError = "";
  private nativeImageCache = new Map<string, NativeImageCacheEntry>();
  private nativeImagePending = new Map<string, Promise<NativeImageCacheEntry>>();
  private nativeImageObserver: IntersectionObserver | null = null;
  private readonly nativeImageCacheLimit = 48;
  private memoryDiagnostics: MemoryDiagnosticsSnapshot | null = null;
  private memoryDiagnosticsTimer = 0;
  private memoryPeakJsHeapBytes = 0;
  private memoryPeakTrackedBlobBytes = 0;
  private generationPreview = "";
  private generationPercent = 0;
  private generationMessage = "";
  private generationFinalUrl = "";
  private generationResolvedSeed: number | null = null;
  private generationResolvedMetadata = "";
  private generationFinalPath = "";
  private generationStep = 0;
  private generationStartedAt = 0;
  private generationSamplingStartedAt = 0;
  private generationFinishedAt = 0;
  private generationReviewModeActive = false;
  private pendingGenerationApprovals: PendingGenerationApproval[] = [];
  private pendingGenerationApprovalIndex = 0;
  private pendingGenerationSaveBusy = false;
  private generationMiniEnabled = true;
  private generationMiniX: number | null = null;
  private generationMiniY: number | null = null;
  private resetMobileScrollAfterRender = false;
  private syntaxMenuOpen = false;
  private lastNonSettingsView: StudioView = "create";
  private loraSearch = "";
  private loraMobileGrid = false;
  private loraGridSize: "comfortable" | "compact" = "comfortable";
  private loraShowNonMatching = false;
  private loraFolderPath = "";
  private loraFolderTreeOpen = false;
  private loraBatchMode = false;
  private loraBatchSelected = new Set<string>();
  private loraOrphanMode = false;
  private loraMoveModalOpen = false;
  private loraMoveDestination = "";
  private loraMoveBusy = false;
  private loraDeleteModalOpen = false;
  private loraDeleteBusy = false;
  private loraDownloadOpen = false;
  private loraDownloadProgress = 0;
  private loraDownloadMessage = "";
  private loraDownloadUrl = "";
  private loraDownloadName = "";
  private loraDownloadResolved: PreparedLoraDownload | null = null;
  private loraDownloadResolving = false;
  private loraDownloadResolveTimer = 0;
  private presetReorderModalOpen = false;
  private loraReorderModalOpen = false;
  private stackReorderDrag: { kind: "preset" | "lora"; from: number; } | null = null;
  private serverSettings: Record<string, SwarmServerSetting> = {};
  private serverSettingsError = "";
  private connectionError = "";
  private presetEditorOpen = false;
  private presetEditorTitle = "";
  private presetEditorDescription = "";
  private presetEditorEditing = "";
  private regionEditorOpen = false;
  private regionEditorSelectedIndex = 0;
  private mobileEnterDirection: -1 | 0 | 1 = 0;
  private mobileSwipeBusy = false;
  private quickNavOpen = false;
  private quickNavTarget: "create" | "visuals" | "library" | "settings" | null = null;
  private civitaiQuery = "";
  private civitaiSort = "Most Downloaded";
  private civitaiPeriod = "AllTime";
  private civitaiCompatibleOnly = true;
  private civitaiIncludeNsfw = false;
  private civitaiMobileFiltersOpen = false;
  private civitaiPage = 1;
  private civitaiResults: CivitaiModelItem[] = [];
  private civitaiTotal = 0;
  private civitaiTotalPages = 1;
  private civitaiUpstreamPage = 1;
  private civitaiUpstreamTotalPages = 1;
  private civitaiNextUrl = "";
  private civitaiServerFilteredBaseModel = "";
  private civitaiExhausted = false;
  private civitaiScanned = 0;
  private civitaiPreviewProbed = new Set<number>();
  private civitaiLoading = false;
  private civitaiError = "";
  private civitaiLoadedOnce = false;
  private civitaiDetail: CivitaiModelItem | null = null;
  private civitaiDetailVersionId = 0;
  private civitaiDetailLoading = false;
  private civitaiInstalling = false;
  private civitaiInstallQueue: CivitaiInstallQueueItem[] = [];
  private civitaiInstallProcessing = false;
  private civitaiBlockedAuthors = new Set<string>();
  private modelMetadataEditor: SwarmModel | null = null;
  private modelMetadataPreviewDataUrl = "";
  private modelMetadataCivitaiUrl = "";
  private modelMetadataCivitaiLoading = false;
  private modelMetadataLoading = false;
  private modelMetadataViewer: SwarmModel | null = null;
  private modelMetadataViewerLoading = false;
  private identityEditingId = "";
  private checkpointsOpen = true;
  private librarySyncing = false;
  private librarySyncDone = 0;
  private librarySyncTotal = 0;
  private librarySyncPhase = "";
  private droppedInspectorOutput: OutputRecord | null = null;
  private externalImageDragActive = false;
  private externalImageDragDepth = 0;
  private inpaintOpen = false;
  private inpaintSourceId = "";
  private inpaintSourceUrl = "";
  private inpaintSourceDataUrl = "";
  private inpaintSourceName = "";
  private inpaintSourceOutputContext: Partial<GenerationDraft> | null = null;
  private inpaintPrompt = "";
  private inpaintNegativePrompt = "";
  private inpaintCreativity = 0.5;
  private inpaintEngine: "simple" | "differential" | "encode" = "simple";
  private inpaintBrushSize = 36;
  private inpaintTool: "paint" | "erase" | "rect" | "lasso" | "pan" = "paint";
  private inpaintShowMask = true;
  private inpaintMaskOpacity = 0.38;
  private inpaintInvert = false;
  private inpaintFeather = 0;
  private inpaintExpand = 0;
  private inpaintZoom = 1;
  private inpaintPanX = 0;
  private inpaintPanY = 0;
  private inpaintCursorX: number | null = null;
  private inpaintCursorY: number | null = null;
  private inpaintStrokes: InpaintStroke[] = [];
  private inpaintRedo: InpaintStroke[] = [];
  private inpaintPreviewStroke: InpaintStroke | null = null;
  private inpaintImageElement: HTMLImageElement | null = null;
  private inpaintMaskCanvas: HTMLCanvasElement | null = null;
  private inpaintProcessedMaskCanvas: HTMLCanvasElement | null = null;
  private inpaintMaskDirty = true;
  private inpaintProcessedMaskDirty = true;
  private inpaintImportedMaskDataUrl = "";
  private inpaintImportedMaskElement: HTMLImageElement | null = null;
  private inpaintResizeObserver: ResizeObserver | null = null;
  private inpaintMaskShapeTimer = 0;
  private inpaintAwaitingResult = false;
  private inpaintSettingsOpen = false;
  private inpaintHelpOpen = false;
  private inpaintResultReviewOpen = false;
  private inpaintPendingResultRecord: OutputRecord | null = null;
  private inpaintConfigWidth = 1024;
  private inpaintConfigHeight = 1024;
  private inpaintConfigSteps = 20;
  private inpaintConfigCfg = 7;
  private inpaintConfigSeed = -1;
  private inpaintConfigSampler = "";
  private inpaintConfigScheduler = "";


  constructor(root: HTMLElement) {
    this.root = root;
    this.client = new SwarmClient(this.effectiveSwarmBaseUrl(), this.store.state.connection.authToken);
    this.view = this.store.state.ui.lastView;
    this.lastNonSettingsView = this.view === "settings" ? "create" : this.view;
    const savedLibraryFolder = this.store.state.ui.libraryFolder;
    this.libraryFolder = normalizeLibraryFolderSelection(savedLibraryFolder, this.store.state.folders);
    if (this.libraryFolder !== savedLibraryFolder) {
      // A deleted/legacy folder id used to survive in UI state and filter every cached output out
      // while the header still reported that images existed. Recover to All outputs instead of
      // opening Library as an unexplained empty room.
      this.store.updateUi({ libraryFolder: this.libraryFolder });
    }
    try {
      this.loraMobileGrid = (localStorage.getItem("swarm-studio-lora-view") ?? localStorage.getItem("swarm-studio-lora-mobile-view")) === "grid";
      this.loraShowNonMatching = localStorage.getItem("swarm-studio-lora-show-nonmatching") === "true";
      this.loraGridSize = localStorage.getItem("swarm-studio-lora-grid-size") === "compact" ? "compact" : "comfortable";
      this.generationMiniEnabled = localStorage.getItem("swarm-studio-generation-mini") !== "false";
      this.checkpointsOpen = localStorage.getItem("swarm-studio-checkpoints-open") !== "false";
      this.libraryFiltersDocked = localStorage.getItem("swarm-studio-library-browse-docked") === "true";
      const miniX = Number(localStorage.getItem("swarm-studio-generation-mini-x"));
      const miniY = Number(localStorage.getItem("swarm-studio-generation-mini-y"));
      this.generationMiniX = Number.isFinite(miniX) && miniX >= 0 ? miniX : null;
      this.generationMiniY = Number.isFinite(miniY) && miniY >= 0 ? miniY : null;
      const blockedAuthors = JSON.parse(localStorage.getItem("swarm-studio-civitai-blocked-authors") || "[]");
      if (Array.isArray(blockedAuthors)) this.civitaiBlockedAuthors = new Set(blockedAuthors.map((value) => String(value).trim().toLowerCase()).filter(Boolean));
    } catch {
      this.loraMobileGrid = false;
      this.loraShowNonMatching = false;
      this.loraGridSize = "comfortable";
    }
    this.bindExternalImageDropTarget();
  }

  private setExternalImageDragActive(active: boolean): void {
    this.externalImageDragActive = active;
    const overlay = this.root.querySelector<HTMLElement>("[data-external-image-drop]");
    if (!overlay) return;
    overlay.hidden = !active;
    overlay.classList.toggle("is-active", active);
  }

  private bindExternalImageDropTarget(): void {
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    window.addEventListener("dragenter", (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      this.externalImageDragDepth += 1;
      this.setExternalImageDragActive(true);
    });
    window.addEventListener("dragover", (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      this.setExternalImageDragActive(true);
    });
    window.addEventListener("dragleave", (event) => {
      if (!hasFiles(event) && this.externalImageDragDepth <= 0) return;
      this.externalImageDragDepth = Math.max(0, this.externalImageDragDepth - 1);
      if (!this.externalImageDragDepth) this.setExternalImageDragActive(false);
    });
    window.addEventListener("drop", (event) => {
      event.preventDefault();
      this.externalImageDragDepth = 0;
      this.setExternalImageDragActive(false);
      const file = Array.from(event.dataTransfer?.files ?? []).find((item) => item.type.startsWith("image/") || /\.(png|jpe?g)$/i.test(item.name));
      if (file) void this.inspectDroppedImage(file);
    });
  }

  private effectiveSwarmBaseUrl(settings = this.store.state.connection): string {
    const configured = normalizeBaseUrl(settings.baseUrl);
    // Native Studio is the local Swarm host. Remote access belongs to the browser/PWA relay.
    // Keeping this unconditional prevents stale persisted Tailscale/LAN hosts from bypassing
    // local process probing, auto-start, and image routing in the desktop app.
    if (runtime.kind !== "tauri") return configured;
    try {
      const parsed = new URL(configured);
      parsed.protocol = "http:";
      parsed.hostname = "127.0.0.1";
      return parsed.href.replace(/\/$/, "");
    } catch {
      return "http://127.0.0.1:7801";
    }
  }

  private outputById(id: string): OutputRecord | null {
    if (this.droppedInspectorOutput?.id === id) return this.droppedInspectorOutput;
    return this.store.state.outputs.find((item) => item.id === id) ?? null;
  }

  private outputImageUrl(output: OutputRecord): string {
    const source = output.swarmSourcePath || output.swarmPath || output.url;
    if (!source) return "";
    if (/^(data:|blob:)/i.test(source)) return source;
    return this.client.imageUrl(this.normalizeSwarmPath(source));
  }

  private swarmImageAttributes(url: unknown): string {
    const source = String(url ?? "").trim();
    if (!source) return `src=""`;
    if (runtime.kind !== "tauri" || /^(data:|blob:)/i.test(source)) {
      return `src="${escapeHtml(source)}"`;
    }
    // The native API transport is Rust/reqwest, while <img> requests are owned by the WebView.
    // Some Windows/WebView2 setups cannot reach the local Swarm listener even though reqwest can.
    // Keep Swarm images off the WebView network path and lazily bridge them through Tauri instead.
    return `src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-native-swarm-src="${escapeHtml(source)}"`;
  }

  private dataUrlToObjectUrl(dataUrl: string): NativeImageCacheEntry {
    const splitAt = dataUrl.indexOf(",");
    if (splitAt < 0) throw new Error("Native image bridge returned an invalid data URL.");
    const header = dataUrl.slice(0, splitAt);
    const body = dataUrl.slice(splitAt + 1);
    const mime = /^data:([^;,]+)/i.exec(header)?.[1] || "application/octet-stream";
    const bytes = header.includes(";base64")
      ? Uint8Array.from(atob(body), (char) => char.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(body));
    const blob = new Blob([bytes], { type: mime });
    return { url: URL.createObjectURL(blob), bytes: blob.size };
  }

  private touchNativeImageCache(source: string, entry: NativeImageCacheEntry): void {
    this.nativeImageCache.delete(source);
    this.nativeImageCache.set(source, entry);
  }

  private trimNativeImageCache(): void {
    if (this.nativeImageCache.size <= this.nativeImageCacheLimit) return;
    const activeSources = new Set(
      [...this.root.querySelectorAll<HTMLImageElement>('img[data-native-swarm-src][data-native-swarm-loaded="true"]')]
        .map((image) => image.dataset.nativeSwarmSrc ?? "")
        .filter(Boolean),
    );
    for (const [source, objectUrl] of this.nativeImageCache) {
      if (this.nativeImageCache.size <= this.nativeImageCacheLimit) break;
      if (activeSources.has(source)) continue;
      this.nativeImageCache.delete(source);
      URL.revokeObjectURL(objectUrl.url);
    }
  }

  private clearNativeImageCache(): void {
    for (const entry of this.nativeImageCache.values()) URL.revokeObjectURL(entry.url);
    this.nativeImageCache.clear();
  }

  private async loadNativeSwarmImage(image: HTMLImageElement): Promise<void> {
    const source = image.dataset.nativeSwarmSrc ?? "";
    if (!source || image.dataset.nativeSwarmLoaded === "true") return;
    const cached = this.nativeImageCache.get(source);
    if (cached) {
      this.touchNativeImageCache(source, cached);
      if (image.isConnected && image.dataset.nativeSwarmSrc === source) {
        image.src = cached.url;
        image.dataset.nativeSwarmLoaded = "true";
      }
      return;
    }
    let pending = this.nativeImagePending.get(source);
    if (!pending) {
      pending = runtime.fetchDataUrl(source, this.store.state.connection.authToken)
        .then((dataUrl) => {
          const entry = this.dataUrlToObjectUrl(dataUrl);
          this.touchNativeImageCache(source, entry);
          this.trimNativeImageCache();
          return entry;
        })
        .finally(() => this.nativeImagePending.delete(source));
      this.nativeImagePending.set(source, pending);
    }
    try {
      const entry = await pending;
      if (image.isConnected && image.dataset.nativeSwarmSrc === source) {
        image.src = entry.url;
        image.dataset.nativeSwarmLoaded = "true";
      }
    } catch (error) {
      image.classList.add("is-native-image-error");
      if (image.dataset.nativeSwarmLogged !== "true") {
        image.dataset.nativeSwarmLogged = "true";
        this.addLog(`Could not bridge Swarm image ${source}: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
      }
    }
  }

  private hydrateNativeSwarmImages(): void {
    if (runtime.kind !== "tauri") return;
    if (!this.nativeImageObserver && "IntersectionObserver" in window) {
      this.nativeImageObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const image = entry.target as HTMLImageElement;
          if (entry.isIntersecting) {
            void this.loadNativeSwarmImage(image);
            continue;
          }
          if (image.loading === "lazy" && image.dataset.nativeSwarmLoaded === "true") {
            image.src = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
            image.dataset.nativeSwarmLoaded = "false";
            this.trimNativeImageCache();
          }
        }
      }, { rootMargin: "600px 0px" });
    }
    this.root.querySelectorAll<HTMLImageElement>("img[data-native-swarm-src]").forEach((image) => {
      if (image.dataset.nativeSwarmBound === "true") return;
      image.dataset.nativeSwarmBound = "true";
      if (image.loading !== "lazy" || !this.nativeImageObserver) {
        void this.loadNativeSwarmImage(image);
      } else {
        this.nativeImageObserver.observe(image);
      }
    });
  }


  private formatMemoryBytes(bytes: number | null): string {
    if (bytes == null || !Number.isFinite(bytes)) return "—";
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  }

  private sampleMemoryDiagnostics(updateView = true): void {
    const perf = performance as Performance & { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number } };
    const heap = perf.memory;
    const cacheBytes = [...this.nativeImageCache.values()].reduce((sum, entry) => sum + entry.bytes, 0);
    const approvalBlobBytes = this.pendingGenerationApprovals.reduce((sum, item) => sum + item.blob.size, 0);
    const approvalBlobUrls = this.pendingGenerationApprovals.filter((item) => item.objectUrl.startsWith("blob:")).length;
    const nativeImages = [...this.root.querySelectorAll<HTMLImageElement>("img[data-native-swarm-src]")];
    const jsHeapUsed = Number.isFinite(heap?.usedJSHeapSize) ? Number(heap?.usedJSHeapSize) : null;
    const trackedBlobBytes = cacheBytes + approvalBlobBytes;
    this.memoryPeakJsHeapBytes = Math.max(this.memoryPeakJsHeapBytes, jsHeapUsed ?? 0);
    this.memoryPeakTrackedBlobBytes = Math.max(this.memoryPeakTrackedBlobBytes, trackedBlobBytes);
    this.memoryDiagnostics = {
      sampledAt: Date.now(),
      jsHeapUsed,
      jsHeapTotal: Number.isFinite(heap?.totalJSHeapSize) ? Number(heap?.totalJSHeapSize) : null,
      jsHeapLimit: Number.isFinite(heap?.jsHeapSizeLimit) ? Number(heap?.jsHeapSizeLimit) : null,
      nativeCacheEntries: this.nativeImageCache.size,
      nativeCacheBytes: cacheBytes,
      nativePending: this.nativeImagePending.size,
      trackedBlobUrls: this.nativeImageCache.size + approvalBlobUrls,
      trackedBlobBytes,
      mountedImages: this.root.querySelectorAll("img").length,
      mountedNativeImages: nativeImages.length,
      loadedNativeImages: nativeImages.filter((image) => image.dataset.nativeSwarmLoaded === "true").length,
      lazyLoadedNativeImages: nativeImages.filter((image) => image.loading === "lazy" && image.dataset.nativeSwarmLoaded === "true").length,
      libraryOutputs: this.store.state.outputs.length,
      logEntries: this.logs.length,
    };
    if (updateView && this.view === "logs") this.renderMemoryDiagnostics();
  }

  private memoryDiagnosticsMarkup(): string {
    const item = this.memoryDiagnostics;
    if (!item) return `<div class="memory-diagnostics-empty">Waiting for the first memory sample…</div>`;
    const sampled = new Date(item.sampledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const heapTitle = item.jsHeapUsed == null ? "This WebView does not expose performance.memory." : "Chromium renderer JavaScript heap only; Task Manager RSS also includes native/WebView/GPU memory.";
    return `
      <div class="memory-diagnostics-head"><div><span class="panel-kicker">MEMORY DEBUG</span><b>Studio-owned memory signals</b></div><button class="ghost-button" data-action="reset-memory-peaks">Reset peaks</button></div>
      <div class="memory-diagnostics-grid">
        <div title="${escapeHtml(heapTitle)}"><span>JS heap used</span><b>${this.formatMemoryBytes(item.jsHeapUsed)}</b><small>peak ${this.formatMemoryBytes(this.memoryPeakJsHeapBytes || null)}</small></div>
        <div><span>JS heap committed</span><b>${this.formatMemoryBytes(item.jsHeapTotal)}</b><small>limit ${this.formatMemoryBytes(item.jsHeapLimit)}</small></div>
        <div><span>Native image cache</span><b>${item.nativeCacheEntries} / ${this.nativeImageCacheLimit}</b><small>${this.formatMemoryBytes(item.nativeCacheBytes)}</small></div>
        <div><span>Image bridge pending</span><b>${item.nativePending}</b><small>in-flight fetches</small></div>
        <div><span>Tracked blob URLs</span><b>${item.trackedBlobUrls}</b><small>${this.formatMemoryBytes(item.trackedBlobBytes)} · peak ${this.formatMemoryBytes(this.memoryPeakTrackedBlobBytes || null)}</small></div>
        <div><span>Mounted images</span><b>${item.mountedImages}</b><small>${item.loadedNativeImages}/${item.mountedNativeImages} native loaded · ${item.lazyLoadedNativeImages} lazy</small></div>
        <div><span>Library outputs</span><b>${item.libraryOutputs}</b><small>indexed records</small></div>
        <div><span>Log entries</span><b>${item.logEntries}</b><small>cap 1,200</small></div>
      </div>
      <div class="memory-diagnostics-foot"><span>Sampled ${escapeHtml(sampled)} · every 5 s</span><span>Task Manager process RSS is not exposed to page JavaScript.</span></div>
    `;
  }

  private renderMemoryDiagnostics(): void {
    const host = this.root.querySelector<HTMLElement>("#memory-diagnostics");
    if (host) host.innerHTML = this.memoryDiagnosticsMarkup();
  }

  private startMemoryDiagnostics(): void {
    if (this.memoryDiagnosticsTimer) window.clearInterval(this.memoryDiagnosticsTimer);
    this.sampleMemoryDiagnostics(false);
    this.memoryDiagnosticsTimer = window.setInterval(() => this.sampleMemoryDiagnostics(true), 5000);
  }

  mount(): void {
    if (runtime.kind === "tauri") {
      const localUrl = this.effectiveSwarmBaseUrl(this.store.state.connection);
      if (this.store.state.connection.mode !== "local" || normalizeBaseUrl(this.store.state.connection.baseUrl) !== localUrl) {
        this.store.updateConnection({ mode: "local", baseUrl: localUrl });
      }
    }
    this.applyTheme();
    this.startMemoryDiagnostics();
    runtime.subscribeLogs((event) => {
      this.addLog(event.message, event.level, "swarm");
      this.scheduleProcessStatusRefresh();
    });
    this.addLog(`Swarm Studio ${runtime.kind === "tauri" ? "desktop" : "PWA"} started.`, "info", "studio");
    this.render();
    const persistenceWarning = this.store.consumePersistenceWarning();
    if (persistenceWarning) {
      this.addLog(persistenceWarning, "warn", "studio");
      this.notify(persistenceWarning, "info");
    }
    void this.refreshProcessStatus(false);
    if (runtime.kind === "tauri") {
      window.setTimeout(() => void this.checkStudioUpdate(false), 2600);
    }
    if (this.store.state.connection.autoStart && runtime.kind === "tauri") {
      void this.connect(true);
    } else {
      void this.connect(false, true);
    }
  }


  private applyTheme(): void {
    const theme = this.store.state.theme;
    const root = document.documentElement;
    const style = root.style;
    style.setProperty("--purple", theme.accent);
    style.setProperty("--pink", theme.accentAlt);
    style.setProperty("--bg", theme.background);
    style.setProperty("--panel-base", theme.panel);
    style.setProperty("--surface-alt", theme.surfaceAlt);
    style.setProperty("--text", theme.text);
    style.setProperty("--muted", theme.muted);
    style.setProperty("--outline", theme.outline);
    style.setProperty("--success", theme.success);
    style.setProperty("--warning", theme.warning);
    style.setProperty("--danger", theme.danger);
    style.setProperty("--danger-surface", theme.dangerSurface);
    style.setProperty("--font-title", themeFontStack(theme.titleFont));
    style.setProperty("--font-subtitle", themeFontStack(theme.subtitleFont));
    style.setProperty("--theme-radius", `${clamp(theme.radius, 0, 32)}px`);
    style.setProperty("--control-radius", `${clamp(theme.controlRadius, 0, 24)}px`);
    style.setProperty("--border-strength", `${clamp(theme.borderStrength, 0, 0.5) * 100}%`);
    style.setProperty("--border-strength-strong", `${clamp(theme.borderStrength * 1.8, 0, 0.85) * 100}%`);
    style.setProperty("--surface-opacity", `${clamp(theme.surfaceOpacity, 0.45, 1) * 100}%`);
    root.style.colorScheme = isLightTheme(theme.background) ? "light" : "dark";
  }

  private serverSettingKey(...needles: string[]): string | undefined {
    const normalized = needles.map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "")).filter(Boolean);
    const entries = Object.keys(this.serverSettings).map((key) => ({
      key,
      compact: key.toLowerCase().replace(/[^a-z0-9]+/g, ""),
    }));
    for (const needle of normalized) {
      const exact = entries.find((entry) => entry.compact === needle);
      if (exact) return exact.key;
    }
    for (const needle of normalized) {
      const suffix = entries.find((entry) => entry.compact.endsWith(needle));
      if (suffix) return suffix.key;
    }
    return undefined;
  }

  private corsOriginFromServerSettings(): string {
    const key = this.serverSettingKey("networkaccesscontrolalloworigin", "accesscontrolalloworigin");
    const raw = key ? this.serverSettings[key]?.value : undefined;
    return String(raw ?? "").trim();
  }

  private addLog(message: string, level: LogEntry["level"] = "info", source: LogEntry["source"] = "studio"): void {
    const entry: LogEntry = {
      id: createId(),
      timestamp: Date.now(),
      level,
      source,
      message,
    };
    this.logs.push(entry);
    if (this.logs.length > 1200) this.logs.splice(0, this.logs.length - 1200);
    if (level === "error") console.error(`[${source}] ${message}`);
    else if (level === "warn") console.warn(`[${source}] ${message}`);
    else if (source !== "swarm") console.info(`[${source}] ${message}`);
    if (this.view === "logs") this.renderLogList();
  }

  private notify(text: string, kind: ToastMessage["kind"] = "info"): void {
    this.toast = { text, kind };
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast = null;
      this.renderToast();
    }, 4200);
    this.renderToast();
  }

  private renderToast(): void {
    const host = this.root.querySelector<HTMLElement>("#toast-host");
    if (!host) return;
    host.innerHTML = this.toast
      ? `<div class="toast toast--${this.toast.kind}">${escapeHtml(this.toast.text)}</div>`
      : "";
  }

  private studioUpdateTargetLabel(status = this.studioUpdateStatus): string {
    if (!status) return "latest";
    return status.latestVersion ? `v${status.latestVersion}` : status.latestCommit || "latest";
  }

  private studioUpdateHasPendingWork(): boolean {
    return this.generating || this.inpaintAwaitingResult || this.pendingGenerationApprovals.length > 0 || Boolean(this.inpaintPendingResultRecord);
  }

  private renderStudioUpdatePopup(): string {
    const status = this.studioUpdateStatus;
    if (!this.studioUpdatePopupOpen || !status?.available || runtime.kind !== "tauri") return "";
    const target = this.studioUpdateTargetLabel(status);
    const highlights = status.highlights.slice(0, 3);
    const pendingWork = this.studioUpdateHasPendingWork();
    return `
      <aside class="studio-update-popup" role="status" aria-live="polite">
        <header><span class="studio-update-glyph">↑</span><div><span class="panel-kicker">SWARM STUDIO UPDATE</span><h3>${escapeHtml(target)} is ready</h3></div></header>
        <p>${escapeHtml(status.message)}</p>
        ${highlights.length ? `<ul>${highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        <div class="studio-update-meta"><span>${escapeHtml(status.currentVersion ? `v${status.currentVersion}` : status.currentCommit)}</span><b>→</b><span>${escapeHtml(target)}</span></div>
        <div class="form-actions">
          <button type="button" class="ghost-button" data-action="dismiss-studio-update" ${this.studioUpdateApplying ? "disabled" : ""}>Later</button>
          <button type="button" class="primary-button" data-action="apply-studio-update" ${status.canApply && !this.studioUpdateApplying && !pendingWork ? "" : "disabled"}>${this.studioUpdateApplying ? "Updating…" : pendingWork ? "Finish current work" : status.canApply ? "Update & restart" : "Update blocked"}</button>
        </div>
      </aside>`;
  }

  private renderStudioUpdateSettingsCard(): string {
    if (runtime.kind !== "tauri") return "";
    const status = this.studioUpdateStatus;
    const pendingWork = this.studioUpdateHasPendingWork();
    const state = this.studioUpdateChecking ? "checking" : status?.available ? (status.canApply ? "available" : "blocked") : status?.supported === false ? "unavailable" : status ? "current" : "unknown";
    const label = this.studioUpdateChecking
      ? "Checking origin…"
      : status?.message || "Studio can check its own Git checkout and fast-forward it without opening a terminal.";
    const version = status ? `v${escapeHtml(status.currentVersion)}` : "Current build";
    return `
      <section class="studio-update-settings-card">
        <div class="studio-update-settings-copy"><span class="panel-kicker">STUDIO SOURCE</span><div><h3>${version}</h3><span class="backend-state studio-update-state studio-update-state--${state}">${state}</span></div><p>${escapeHtml(label)}</p>${status?.supported && status.repoPath ? `<small>${escapeHtml(status.repoPath)}</small>` : ""}</div>
        <div class="backend-button-row">
          <button type="button" class="ghost-button" data-action="check-studio-update" ${this.studioUpdateChecking || this.studioUpdateApplying ? "disabled" : ""}>${this.studioUpdateChecking ? "Checking…" : "Check for updates"}</button>
          <button type="button" class="primary-button" data-action="apply-studio-update" ${status?.canApply && !this.studioUpdateApplying && !pendingWork ? "" : "disabled"}>${this.studioUpdateApplying ? "Updating…" : pendingWork && status?.available ? "Finish current work" : status?.available ? "Update & restart" : "Up to date"}</button>
        </div>
      </section>`;
  }

  private renderStudioUpdateHost(): void {
    const host = this.root.querySelector<HTMLElement>("#studio-update-host");
    if (!host) return;
    host.innerHTML = this.renderStudioUpdatePopup();
    this.bindStudioUpdateEvents(host);
  }

  private async checkStudioUpdate(userInitiated = false): Promise<void> {
    if (runtime.kind !== "tauri" || this.studioUpdateChecking || this.studioUpdateApplying) return;
    this.studioUpdateChecking = true;
    if (userInitiated && this.view === "settings") this.render();
    try {
      const status = await runtime.checkStudioUpdate();
      this.studioUpdateStatus = status;
      if (status.available && !this.studioUpdateDismissed) this.studioUpdatePopupOpen = true;
      if (userInitiated) {
        if (status.available && status.canApply) this.notify(`${this.studioUpdateTargetLabel(status)} is ready to install.`, "success");
        else this.notify(status.message, status.available ? "info" : "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog(`Studio update check failed: ${message}`, userInitiated ? "warn" : "info", "studio");
      if (userInitiated) this.notify(message, "error");
    } finally {
      this.studioUpdateChecking = false;
      if (userInitiated && this.view === "settings") this.render();
      else this.renderStudioUpdateHost();
    }
  }

  private async applyStudioUpdate(): Promise<void> {
    const status = this.studioUpdateStatus;
    if (this.studioUpdateHasPendingWork()) {
      this.notify("Finish, save, or discard the current generation/review before updating Studio.", "info");
      return;
    }
    if (!status?.canApply || this.studioUpdateApplying) {
      if (status?.message) this.notify(status.message, "info");
      return;
    }
    this.studioUpdateApplying = true;
    this.renderStudioUpdateHost();
    if (this.view === "settings") this.render();
    try {
      const processStatus = await runtime.processStatus().catch(() => this.processStatus);
      if (processStatus.owned && processStatus.running) {
        this.addLog("Stopping Studio-owned Swarm before self-update so the launcher/log pipes restart cleanly.", "info", "studio");
        await runtime.stopLocalSwarm();
        this.connected = false;
        this.session = null;
      }
      const message = await runtime.applyStudioUpdate();
      this.notify(message, "success");
      this.addLog(message, "info", "studio");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.studioUpdateApplying = false;
      this.addLog(`Studio update failed: ${message}`, "error", "studio");
      this.notify(message, "error");
      if (this.view === "settings") this.render();
      else this.renderStudioUpdateHost();
    }
  }

  private bindStudioUpdateEvents(scope: ParentNode = this.root): void {
    scope.querySelectorAll<HTMLElement>("[data-action='check-studio-update']").forEach((button) => button.addEventListener("click", () => void this.checkStudioUpdate(true)));
    scope.querySelectorAll<HTMLElement>("[data-action='apply-studio-update']").forEach((button) => button.addEventListener("click", () => void this.applyStudioUpdate()));
    scope.querySelectorAll<HTMLElement>("[data-action='dismiss-studio-update']").forEach((button) => button.addEventListener("click", () => {
      this.studioUpdatePopupOpen = false;
      this.studioUpdateDismissed = true;
      this.renderStudioUpdateHost();
    }));
  }

  private async refreshProcessStatus(rerender = true): Promise<void> {
    try {
      this.processStatus = await runtime.processStatus();
      if (rerender && (this.view === "settings" || this.view === "logs")) this.render();
    } catch (error) {
      this.addLog(error instanceof Error ? error.message : String(error), "warn", "studio");
    }
  }

  private scheduleProcessStatusRefresh(): void {
    if (this.processStatusRefreshTimer) return;
    this.processStatusRefreshTimer = window.setTimeout(() => {
      this.processStatusRefreshTimer = 0;
      void this.refreshProcessStatus(false);
    }, 900);
  }

  private normalizedBackendSettingKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  private backendSetting(backend: SwarmBackendInfo | undefined, key: string): unknown {
    if (!backend) return undefined;
    const wanted = this.normalizedBackendSettingKey(key);
    const match = Object.entries(backend.settings ?? {}).find(([name]) => this.normalizedBackendSettingKey(name) === wanted);
    return match?.[1];
  }

  private comfySelfStartBackend(): SwarmBackendInfo | undefined {
    return this.backendList.find((backend) => {
      const type = backend.type.toLowerCase();
      return (type.includes("comfy") && type.includes("self")) || this.backendSetting(backend, "StartScript") != null;
    });
  }

  private comfyRepoPathHint(): string | undefined {
    const value = String(this.backendSetting(this.comfySelfStartBackend(), "StartScript") ?? "").trim();
    return value || undefined;
  }

  private async refreshBackendControl(rerender = true, fetchRefs = false): Promise<void> {
    if (!this.connected || this.backendControlLoading) return;
    this.backendControlLoading = true;
    this.backendControlError = "";
    if (rerender && this.view === "settings" && this.store.state.ui.settingsPane === "backend") this.render();
    try {
      this.backendList = await this.client.listBackends();
      this.backendControlLoaded = true;
      this.swarmRepoError = "";
      this.comfyRepoError = "";
      if (runtime.kind === "tauri") {
        const repoMethod = fetchRefs ? runtime.fetchRepoVersions.bind(runtime) : runtime.repoStatus.bind(runtime);
        const swarmHint = this.store.state.connection.workingDirectory || undefined;
        const comfyHint = this.comfyRepoPathHint();
        const [swarmRepo, comfyRepo] = await Promise.allSettled([
          repoMethod("swarm", swarmHint),
          repoMethod("comfy", comfyHint),
        ]);
        if (swarmRepo.status === "fulfilled") this.swarmRepoStatus = swarmRepo.value;
        else { this.swarmRepoStatus = null; this.swarmRepoError = swarmRepo.reason instanceof Error ? swarmRepo.reason.message : String(swarmRepo.reason); }
        if (comfyRepo.status === "fulfilled") this.comfyRepoStatus = comfyRepo.value;
        else { this.comfyRepoStatus = null; this.comfyRepoError = comfyRepo.reason instanceof Error ? comfyRepo.reason.message : String(comfyRepo.reason); }
      }
    } catch (error) {
      this.backendControlLoaded = true;
      this.backendControlError = error instanceof Error ? error.message : String(error);
      this.addLog(`Backend control refresh failed: ${this.backendControlError}`, "warn", "api");
    } finally {
      this.backendControlLoading = false;
      if (rerender && this.view === "settings" && this.store.state.ui.settingsPane === "backend") this.render();
    }
  }

  private async runBackendControlAction(label: string, work: () => Promise<void>): Promise<void> {
    if (this.backendControlBusy) return;
    this.backendControlBusy = label;
    if (this.view === "settings" && this.store.state.ui.settingsPane === "backend") this.render();
    try {
      await work();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog(`${label}: ${message}`, "error", "studio");
      this.notify(message, "error");
    } finally {
      this.backendControlBusy = "";
      if (this.connected) await this.refreshBackendControl(false).catch(() => undefined);
      await this.refreshProcessStatus(false);
      if (this.view === "settings" && this.store.state.ui.settingsPane === "backend") this.render();
    }
  }

  private async restartOwnedSwarm(): Promise<void> {
    await this.runBackendControlAction("Restart Swarm", async () => {
      if (runtime.kind !== "tauri") throw new Error("Swarm process restart is only available in desktop Studio.");
      if (!this.processStatus.owned || !this.processStatus.running) throw new Error("Studio does not own the running Swarm process. Stop/restart that external launcher directly.");
      await runtime.stopLocalSwarm();
      this.connected = false;
      this.session = null;
      await this.connect(true, true);
      if (!this.connected) throw new Error("Swarm did not reconnect after restart. Check Logs.");
      this.notify("Swarm restarted and reconnected.", "success");
    });
  }

  private async mutateBackendRepo(kind: "swarm" | "comfy", mode: "pin" | "latest", target = ""): Promise<void> {
    const label = `${mode === "latest" ? "Update" : "Pin"} ${kind === "swarm" ? "Swarm" : "Comfy"}`;
    await this.runBackendControlAction(label, async () => {
      if (runtime.kind !== "tauri") throw new Error("Source version changes require desktop Studio on the backend host.");
      if (mode === "pin" && !target.trim()) throw new Error("Enter a tag, commit hash, or remote branch first.");

      if (kind === "swarm") {
        this.processStatus = await runtime.processStatus();
        if (this.processStatus.running && !this.processStatus.owned) throw new Error("Swarm is running outside Studio. Stop that external process before changing its checkout.");
        const swarmHint = this.store.state.connection.workingDirectory || undefined;
        const current = await runtime.repoStatus("swarm", swarmHint);
        if (current.dirty) throw new Error(`Refusing to change versions because ${current.path} has tracked local changes. Commit or stash them first.`);
        const wasRunning = this.processStatus.owned && this.processStatus.running;
        if (wasRunning) {
          await runtime.stopLocalSwarm();
          this.connected = false;
          this.session = null;
        }
        try {
          this.swarmRepoStatus = mode === "latest"
            ? await runtime.updateRepoLatest("swarm", swarmHint)
            : await runtime.switchRepoVersion("swarm", swarmHint, target.trim());
        } catch (error) {
          if (wasRunning) await this.connect(true, true).catch(() => undefined);
          throw error;
        }
        if (wasRunning) {
          await this.connect(true, true);
          if (!this.connected) throw new Error("Swarm source changed, but the restarted server did not reconnect. Check Logs.");
        }
        if (mode === "pin") {
          this.notify(`Swarm pinned to ${this.swarmRepoStatus.describe || this.swarmRepoStatus.commit}. Launch auto-pull was disabled so the pin survives restart.`, "success");
        } else {
          this.notify(`Swarm is now on ${this.swarmRepoStatus.describe || this.swarmRepoStatus.commit}.`, "success");
        }
        return;
      }

      const backend = this.comfySelfStartBackend();
      if (!backend) throw new Error("No self-starting ComfyUI backend is registered in Swarm.");
      const comfyHint = this.comfyRepoPathHint();
      const current = await runtime.repoStatus("comfy", comfyHint);
      if (current.dirty) throw new Error(`Refusing to change versions because ${current.path} has tracked local changes. Commit or stash them first.`);
      const wasEnabled = backend.enabled;
      const needsPinPolicy = mode === "pin" && String(this.backendSetting(backend, "AutoUpdate") ?? "false") !== "false";
      if (wasEnabled) await this.client.toggleBackend(backend.id, false);
      try {
        // Change AutoUpdate while the backend is disabled. Swarm's EditBackend re-initializes after
        // editing, but a disabled backend remains disabled, so this cannot relaunch/update Comfy
        // before the requested checkout has been pinned.
        if (needsPinPolicy) {
          const disabledBackend = (await this.client.listBackends()).find((candidate) => candidate.id === backend.id) ?? { ...backend, enabled: false };
          await this.client.editBackend(disabledBackend, { AutoUpdate: "false" });
        }
        this.comfyRepoStatus = mode === "latest"
          ? await runtime.updateRepoLatest("comfy", comfyHint)
          : await runtime.switchRepoVersion("comfy", comfyHint, target.trim());
      } finally {
        if (wasEnabled) await this.client.toggleBackend(backend.id, true).catch((error) => {
          this.addLog(`Could not re-enable Comfy backend ${backend.id}: ${error instanceof Error ? error.message : String(error)}`, "error", "api");
        });
      }
      if (mode === "pin" && needsPinPolicy) {
        this.notify(`Comfy pinned to ${this.comfyRepoStatus.describe || this.comfyRepoStatus.commit}. AutoUpdate was disabled so the pin survives backend restart.`, "success");
      } else {
        this.notify(`Comfy is now on ${this.comfyRepoStatus.describe || this.comfyRepoStatus.commit}.`, "success");
      }
    });
  }

  private async setSwarmLaunchAutoPull(enabled: boolean): Promise<void> {
    await this.runBackendControlAction(enabled ? "Enable Swarm auto-pull" : "Disable Swarm auto-pull", async () => {
      if (runtime.kind !== "tauri") throw new Error("Swarm launch policy controls require desktop Studio on the backend host.");
      const hint = this.store.state.connection.workingDirectory || undefined;
      this.swarmRepoStatus = await runtime.setSwarmLaunchAutoPull(hint, enabled);
      this.notify(enabled ? "Swarm will pull latest on each launch." : "Swarm launch auto-pull disabled.", "success");
    });
  }

  private async toggleComfyBackend(): Promise<void> {
    const backend = this.comfySelfStartBackend();
    await this.runBackendControlAction(backend?.enabled ? "Stop Comfy" : "Start Comfy", async () => {
      if (!backend) throw new Error("No self-starting ComfyUI backend is registered in Swarm.");
      await this.client.toggleBackend(backend.id, !backend.enabled);
      this.notify(backend.enabled ? "Comfy stopped. AutoRestart cannot resurrect a disabled backend." : "Comfy queued to start.", "success");
    });
  }

  private async restartComfyBackend(): Promise<void> {
    await this.runBackendControlAction("Restart Comfy", async () => {
      const backend = this.comfySelfStartBackend();
      if (!backend) throw new Error("No self-starting ComfyUI backend is registered in Swarm.");
      if (!backend.enabled) throw new Error("Comfy is disabled. Start it first instead of restarting it.");
      const count = await this.client.restartBackends(backend.id);
      if (!count) throw new Error("Swarm did not restart a backend. It may still be initializing or disabled.");
      this.notify("Comfy restart requested.", "success");
    });
  }

  private async freeComfyMemory(): Promise<void> {
    await this.runBackendControlAction("Free Comfy memory", async () => {
      const backend = this.comfySelfStartBackend();
      if (!backend) throw new Error("No self-starting ComfyUI backend is registered in Swarm.");
      const count = await this.client.freeBackendMemory(backend.id, true);
      this.notify(count ? "Comfy memory cleanup requested." : "No running Comfy backend accepted the memory cleanup request.", count ? "success" : "info");
    });
  }

  private comfyManagedExtraArgs(rawExtraArgs: string, options: { cudaDevice: string; disableDynamicVram: boolean; disablePinnedMemory: boolean; disableAsyncOffload: boolean }): string {
    return mergeComfyRuntimeFlags(rawExtraArgs, options);
  }

  private applyComfyRuntimePreset(preset: string): void {
    const form = this.root.querySelector<HTMLFormElement>("#comfy-backend-policy-form");
    if (!form) return;
    const cudaInput = form.elements.namedItem("comfyCudaDevice") as HTMLInputElement | null;
    const dynamicInput = form.elements.namedItem("comfyDisableDynamicVram") as HTMLInputElement | null;
    const pinnedInput = form.elements.namedItem("comfyDisablePinnedMemory") as HTMLInputElement | null;
    const asyncInput = form.elements.namedItem("comfyDisableAsyncOffload") as HTMLInputElement | null;
    if (!cudaInput || !dynamicInput || !pinnedInput || !asyncInput) return;
    if (preset === "known-good") {
      cudaInput.value = "0";
      dynamicInput.checked = false;
      pinnedInput.checked = false;
      asyncInput.checked = false;
      this.notify("Known-good runtime preset loaded. Save the form to re-initialize Comfy.", "info");
      return;
    }
    if (preset === "diagnostic") {
      cudaInput.value = "0";
      dynamicInput.checked = true;
      pinnedInput.checked = false;
      asyncInput.checked = false;
      this.notify("Crash-test preset loaded. Save the form to re-initialize Comfy.", "info");
      return;
    }
    cudaInput.value = "";
    dynamicInput.checked = false;
    pinnedInput.checked = false;
    asyncInput.checked = false;
    this.notify("Managed runtime flags cleared from the form. Save to apply.", "info");
  }

  private async saveComfyBackendPolicy(form: HTMLFormElement): Promise<void> {
    const backend = this.comfySelfStartBackend();
    await this.runBackendControlAction("Save Comfy policy", async () => {
      if (!backend) throw new Error("No self-starting ComfyUI backend is registered in Swarm.");
      const data = new FormData(form);
      const extraArgs = this.comfyManagedExtraArgs(String(data.get("comfyExtraArgs") ?? ""), {
        cudaDevice: String(data.get("comfyCudaDevice") ?? ""),
        disableDynamicVram: data.get("comfyDisableDynamicVram") === "on",
        disablePinnedMemory: data.get("comfyDisablePinnedMemory") === "on",
        disableAsyncOffload: data.get("comfyDisableAsyncOffload") === "on",
      });
      await this.client.editBackend(backend, {
        ExtraArgs: extraArgs,
        AutoUpdate: String(data.get("comfyAutoUpdate") ?? "false"),
        AutoRestart: data.get("comfyAutoRestart") === "on",
      });
      this.notify("Comfy policy saved and backend re-initialized.", "success");
    });
  }

  private validateBrowserRemote(_baseUrl: string): void {
    // Browser/PWA traffic is same-origin through Studio's /__swarm relay. Do not apply mixed-
    // content validation to the configured Swarm URL: on phones that URL is merely the host
    // machine's relay target and may be loopback or plain HTTP behind an HTTPS/Tailscale front.
    if (runtime.kind !== "browser") return;
  }

  private async connect(launchFirst = false, quiet = false): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;
    this.libraryAutoSyncStarted = false;
    this.parameterHydrationEpoch += 1;
    this.connectionError = "";
    this.backendControlLoaded = false;
    this.backendControlError = "";
    this.renderHeaderStatus();
    const settings = this.store.state.connection;
    const baseUrl = this.effectiveSwarmBaseUrl(settings);
    this.addLog(`Connecting to ${baseUrl} through ${runtime.kind === "tauri" ? "native HTTP" : "browser fetch"}.`, "info", "api");
    try {
      this.validateBrowserRemote(baseUrl);
      this.client = new SwarmClient(baseUrl, settings.authToken);
      let lastError: unknown = null;
      let launchedForAutoStart = false;

      // Auto-start should feel like auto-start, not "wait for a dead API request and maybe launch later".
      // In native local mode, do a short reachability probe first. If Swarm is absent, launch the
      // configured command immediately, then poll the real session endpoint until it is ready.
      if (launchFirst && runtime.kind === "tauri") {
        const reachable = await runtime.probe(baseUrl, settings.authToken).catch(() => false);
        if (!reachable) {
          this.addLog(`Local runtime: ${baseUrl} is not reachable; launching Swarm now.`, "info", "swarm");
          const started = await runtime.startLocalSwarm(settings);
          launchedForAutoStart = true;
          this.addLog(started, "info", "swarm");
          await this.refreshProcessStatus(false);
        } else {
          this.addLog(`Local runtime: Swarm is already reachable at ${baseUrl}; no launcher needed.`, "info", "swarm");
        }
      }

      if (!launchedForAutoStart) {
        try {
          this.session = await this.client.connect();
        } catch (error) {
          lastError = error;
          this.addLog(`Initial connection failed: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
        }
      }

      if (launchedForAutoStart || (lastError && launchFirst)) {
        if (!launchedForAutoStart) {
          const started = await runtime.startLocalSwarm(settings);
          this.addLog(started, "info", "swarm");
          await this.refreshProcessStatus(false);
        }
        lastError = new Error("Waiting for SwarmUI to become ready.");
        for (let attempt = 0; attempt < 90; attempt += 1) {
          try {
            this.session = await this.client.connect();
            lastError = null;
            this.addLog(`Local runtime: Swarm accepted a session after ${attempt + 1} readiness check${attempt === 0 ? "" : "s"}.`, "info", "swarm");
            break;
          } catch (error) {
            lastError = error;
            if (attempt < 89) await sleep(1000);
          }
        }
      }
      if (lastError) throw lastError;
      this.connected = true;
      // Refresh Swarm's model/parameter inventory before listing models. Running ListModels in
      // parallel with TriggerRefresh left other Studio/PWA clients stale after a download.
      const parameterData = await this.client.refreshInventory();
      const [models, loras, userData] = await Promise.all([
        this.client.listModels("Stable-Diffusion"),
        this.client.listModels("LoRA"),
        this.client.userData().catch((error) => {
          this.addLog(`Could not load Swarm user data: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
          return { presets: [] } as SwarmUserData;
        }),
      ]);
      const presets = userData.presets ?? [];
      this.userData = userData;
      this.models = models;
      this.loras = loras;
      this.params = [];
      this.paramGroups = [];
      this.wildcards = [];
      this.applyParameterData(parameterData);
      this.presets = presets;
      try {
        this.serverSettings = await this.client.listServerSettings();
        this.serverSettingsError = "";
        const serverOrigin = this.corsOriginFromServerSettings();
        if (serverOrigin) {
          const savedOrigins = serverOrigin === "*"
            ? this.store.state.connection.allowedOrigins
            : [...new Set([...this.store.state.connection.allowedOrigins, serverOrigin])];
          this.store.updateConnection({ allowedOrigins: savedOrigins, activeOrigin: serverOrigin });
        }
      } catch (error) {
        this.serverSettings = {};
        this.serverSettingsError = error instanceof Error ? error.message : String(error);
        this.addLog(`ListServerSettings failed: ${this.serverSettingsError}`, "warn", "api");
      }

      const draft = this.store.state.draft;
      const samplerValues = getParamValues(this.params, "Sampler", "sampler");
      const schedulerValues = getParamValues(this.params, "Scheduler", "scheduler");
      this.store.updateDraft({
        model: draft.model || models[0]?.name || "",
        sampler: draft.sampler || String(findParam(this.params, "Sampler")?.default ?? samplerValues[0] ?? ""),
        scheduler: draft.scheduler || String(findParam(this.params, "Scheduler")?.default ?? schedulerValues[0] ?? ""),
      });
      this.addLog(`Connected as ${this.session?.user_id || userData.user_name || "local"}. Loaded ${models.length} checkpoints, ${loras.length} LoRAs, ${presets.length} presets, ${this.wildcards.length} wildcards, and ${this.params.length} parameters.`, "info", "api");
      if (!quiet) this.notify(`Connected to SwarmUI${this.session?.version ? ` ${this.session.version}` : ""}.`, "success");
      this.render();
      this.schedulePostConnectParameterHydration();
    } catch (error) {
      this.connected = false;
      this.session = null;
      this.userData = null;
      const message = error instanceof Error ? error.message : String(error);
      this.connectionError = message;
      this.addLog(message, "error", "api");
      if (!quiet) this.notify(message, "error");
      this.render();
    } finally {
      this.connecting = false;
      this.renderHeaderStatus();
    }
  }

  private render(): void {
    // Models and CivitAI both use .content as the desktop scroll owner, then become document-scrolled
    // at narrower breakpoints. Preserve both candidates across every stateful rerender so dynamic
    // chrome (especially the CivitAI install queue appearing/disappearing) cannot move the viewport.
    const preserveVisualScroll = (this.view === "models" || this.view === "civitai" || this.view === "library" || this.view === "settings") && !this.resetMobileScrollAfterRender;
    const previousVisualContentScrollTop = preserveVisualScroll
      ? (this.root.querySelector<HTMLElement>(".content")?.scrollTop ?? 0)
      : null;
    const previousVisualWindowScrollY = preserveVisualScroll ? window.scrollY : null;
    this.applyTheme();
    this.nativeImageObserver?.disconnect();
    const compactHeader = this.view === "create" ? "" : `
      <header class="section-header">
        <div><p class="eyebrow">${this.viewLabel()}</p><h1>${this.viewTitle()}</h1></div>
      </header>`;
    this.root.innerHTML = `
      <div class="app-shell">
        <header class="utility-bar">
          <button class="brand brand--compact" data-nav="create" aria-label="Open Create">
            <img src="/studio-mark.svg" alt="" />
            <span><b>Swarm</b><small>STUDIO</small></span>
          </button>
          <nav class="utility-nav utility-nav--desktop" aria-label="Studio sections">
            ${this.navButton("create", "Create", tabCreateSvg)}
            ${this.navButton("library", "Library", tabLibrarySvg)}
            ${this.navButton("identities", "Identities", tabIdentitiesSvg)}
            ${this.navButton("models", "Models", tabModelsSvg)}
            ${this.navButton("logs", "Logs", tabLogsSvg)}
          </nav>
          <nav class="utility-nav utility-nav--mobile" aria-label="Studio areas">
            ${this.mobileSectionButton("create", "Create", tabCreateSvg)}
            ${this.mobileSectionButton("visuals", "Visuals", tabVisualsSvg)}
            ${this.mobileSectionButton("library", "Library", tabLibrarySvg)}
            ${this.mobileSectionButton("settings", "Settings", tabSettingsSvg)}
          </nav>
          <div class="utility-spacer"></div>
          <div class="utility-readout" title="Current checkpoint">${escapeHtml(prettyName(this.store.state.draft.model) || "No checkpoint")}</div>
          <div class="utility-readout utility-readout--small">${this.store.state.outputs.length} images</div>
          <button class="status-chip" id="connection-status" data-action="connect"></button>
          <button class="icon-button settings-desktop-button ${this.view === "settings" ? "is-active" : ""}" data-nav="settings" aria-label="Settings" title="Settings">${tabSettingsSvg}</button>
          <button class="icon-button mobile-nav" data-action="mobile-menu" aria-label="Open navigation">☰</button>
        </header>
        <main class="main-area ${this.libraryBrowseDockActive() ? "has-library-browse-dock" : ""}">
          ${compactHeader}
          <section class="content ${this.view === "create" ? "content--create" : ""} ${this.view === "civitai" ? "content--civitai" : ""}" id="view-host">${this.renderView()}</section>
        </main>
      </div>
      <div id="toast-host" class="toast-host"></div>
      <div id="studio-update-host">${this.renderStudioUpdatePopup()}</div>
      <div id="clue-tooltip" class="clue-tooltip" role="tooltip" hidden></div>
      <div class="external-image-drop-overlay" data-external-image-drop hidden><div><span>⇩</span><b>Drop a Swarm image to inspect</b><small>PNG parameters and JPEG UserComment metadata are read locally.</small></div></div>
      <nav class="mobile-tabbar mobile-tabbar--context" aria-label="Mobile context navigation">
        ${this.mobileContextTabsMarkup()}
      </nav>
      ${this.renderQuickNavOverlay()}
      ${this.renderInspector()}
      ${this.renderLoraDownloadModal()}
      ${this.renderCivitaiDetailModal()}
      ${this.renderCivitaiMobileFiltersModal()}
      ${this.renderModelMetadataEditor()}
      ${this.renderModelMetadataViewer()}
      ${this.renderLoraMoveModal()}
      ${this.renderLoraDeleteModal()}
      ${this.renderStackReorderModal("preset")}
      ${this.renderStackReorderModal("lora")}
      ${this.renderPresetEditorModal()}
      ${this.renderRegionPresetEditorModal()}
      ${this.renderLibraryFiltersModal()}
      ${this.renderLibraryMoveModal()}
      ${this.renderLibrarySelectionRail()}
      ${this.renderLoraBatchRail()}
      ${this.renderGenerationMini()}
      ${this.renderInpaintEditor()}
    `;
    if (this.mobileEnterDirection) {
      const host = this.root.querySelector<HTMLElement>("#view-host");
      host?.classList.add(this.mobileEnterDirection > 0 ? "mobile-enter-from-right" : "mobile-enter-from-left");
      this.mobileEnterDirection = 0;
      window.setTimeout(() => {
        host?.classList.remove("mobile-enter-from-right", "mobile-enter-from-left");
        this.mobileSwipeBusy = false;
      }, 230);
    }
    if (this.resetMobileScrollAfterRender && window.matchMedia("(max-width: 760px)").matches) {
      this.resetMobileScrollAfterRender = false;
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    } else if (previousVisualContentScrollTop != null || previousVisualWindowScrollY != null) {
      window.requestAnimationFrame(() => {
        const content = this.root.querySelector<HTMLElement>(".content");
        if (content && previousVisualContentScrollTop != null) content.scrollTop = previousVisualContentScrollTop;
        if (previousVisualWindowScrollY != null) window.scrollTo({ top: previousVisualWindowScrollY, left: 0, behavior: "auto" });
      });
    }
    this.bindGlobalEvents();
    this.bindViewEvents();
    this.renderHeaderStatus();
    this.renderToast();
    this.hydrateNativeSwarmImages();
    if (this.view === "settings" && this.store.state.ui.settingsPane === "backend" && this.connected && !this.backendControlLoaded && !this.backendControlLoading) {
      void this.refreshBackendControl(true);
    }
    if (this.libraryFiltersOpen && this.libraryBrowseScrollTop > 0) {
      window.requestAnimationFrame(() => {
        const browseScroll = this.root.querySelector<HTMLElement>(".library-browse-scroll");
        if (browseScroll) browseScroll.scrollTop = this.libraryBrowseScrollTop;
      });
    }
    // LocalStorage intentionally keeps only a compact recent-output cache. On the first Library
    // visit of a connected session, quietly rehydrate the authoritative Swarm history when the
    // in-memory index is still at/below that cache ceiling. Large libraries therefore come back
    // automatically after restart instead of looking mysteriously truncated until Sync is clicked.
    if (shouldAutoSyncLibraryHistory({
      view: this.view,
      connected: this.connected,
      syncing: this.librarySyncing,
      autoSyncStarted: this.libraryAutoSyncStarted,
      outputCount: this.store.state.outputs.length,
      persistedCacheLimit: PERSISTED_OUTPUT_CACHE_LIMIT,
    })) {
      this.libraryAutoSyncStarted = true;
      window.setTimeout(() => void this.syncSwarmHistory(), 0);
    }
  }

  private mobileSection(): "create" | "visuals" | "library" | "settings" {
    if (this.view === "create") return "create";
    if (this.view === "identities" || this.view === "models" || this.view === "civitai") return "visuals";
    if (this.view === "library") return "library";
    return "settings";
  }

  private mobileSectionButton(section: "create" | "visuals" | "library" | "settings", label: string, icon: string): string {
    return `<button class="nav-button ${this.mobileSection() === section ? "is-active" : ""}" data-mobile-section="${section}" title="${label}"><span>${icon}</span><em>${label}</em></button>`;
  }

  private mobileContextTabsMarkup(): string {
    const section = this.mobileSection();
    let tabs = "";
    let count = 1;
    if (section === "create") {
      const pane = this.store.state.ui.mobileCreatePane;
      count = 3;
      tabs = `<button class="${pane === "generation" ? "is-active" : ""}" data-mobile-pane="generation"><span>${tabGenerationSvg}</span>Generation</button>
        <button class="${pane === "output" ? "is-active" : ""}" data-mobile-pane="output"><span>${tabOutputSvg}</span>Output</button>
        <button class="${pane === "tune" ? "is-active" : ""}" data-mobile-pane="tune"><span>${tabTuneSvg}</span>Tune</button>`;
    } else if (section === "visuals") {
      count = 3;
      tabs = `<button class="${this.view === "identities" ? "is-active" : ""}" data-nav="identities"><span>${tabIdentitiesSvg}</span>Identities</button>
        <button class="${this.view === "models" ? "is-active" : ""}" data-nav="models"><span>${tabModelsSvg}</span>Models</button>
        <button class="${this.view === "civitai" ? "is-active" : ""}" data-nav="civitai"><span>${tabSearchSvg}</span>CivitAI</button>`;
    } else if (section === "library") {
      tabs = `<button class="is-active" data-nav="library"><span>${tabLibrarySvg}</span>Library</button>`;
    } else {
      count = 4;
      const settingsPane = this.store.state.ui.settingsPane;
      tabs = `<button class="${this.view === "logs" ? "is-active" : ""}" data-mobile-settings="logs"><span>${tabLogsSvg}</span>Logs</button>
        <button class="${this.view === "settings" && settingsPane === "connection" ? "is-active" : ""}" data-mobile-settings="connection"><span>${tabConnectionSvg}</span>Connection</button>
        <button class="${this.view === "settings" && settingsPane === "backend" ? "is-active" : ""}" data-mobile-settings="backend"><span>${tabBackendSvg}</span>Backends</button>
        <button class="${this.view === "settings" && settingsPane === "appearance" ? "is-active" : ""}" data-mobile-settings="appearance"><span>${tabAppearanceSvg}</span>Appearance</button>`;
    }
    return `<div class="mobile-context-tabs mobile-context-tabs--${count}">${tabs}</div>
      <button class="mobile-quicknav-trigger" type="button" data-action="quick-nav" aria-label="Quick navigation" aria-expanded="${this.quickNavOpen ? "true" : "false"}"><span>${tabJumpSvg}</span><em>Jump</em></button>`;
  }

  private renderQuickNavOverlay(): string {
    const current = this.mobileSection();
    const items: Array<{ id: "create" | "visuals" | "library" | "settings"; label: string; icon: string; hint: string }> = [
      { id: "create", label: "Create", icon: tabCreateSvg, hint: "Generation · Output · Tune" },
      { id: "visuals", label: "Visuals", icon: tabVisualsSvg, hint: "Identities · Models · CivitAI" },
      { id: "library", label: "Library", icon: tabLibrarySvg, hint: "Outputs and folders" },
      { id: "settings", label: "Settings", icon: tabSettingsSvg, hint: "Logs · Connection · Backends · Appearance" },
    ];
    return `<div class="quicknav-overlay ${this.quickNavOpen ? "is-open" : ""}" data-quicknav-overlay ${this.quickNavOpen ? "" : "hidden"}>
      <div class="quicknav-copy"><b>Quick navigation</b><span>Slide to a destination and release</span></div>
      <div class="quicknav-fan" role="menu" aria-label="Jump to Studio area">
        ${items.map((item, index) => `<button type="button" role="menuitem" class="quicknav-option ${current === item.id ? "is-current" : ""} ${this.quickNavTarget === item.id ? "is-target" : ""}" data-quicknav-target="${item.id}" style="--quicknav-index:${index}"><span>${item.icon}</span><div><b>${item.label}</b><small>${item.hint}</small></div></button>`).join("")}
      </div>
    </div>`;
  }

  private openMobileSection(section: "create" | "visuals" | "library" | "settings"): void {
    this.quickNavOpen = false;
    this.quickNavTarget = null;
    if (section === "create") {
      this.view = "create";
      this.store.updateUi({ mobileCreatePane: "output" });
    } else if (section === "visuals") {
      this.view = "models";
    } else if (section === "library") {
      this.view = "library";
    } else {
      this.view = "settings";
    }
    if (this.view !== "settings") this.lastNonSettingsView = this.view;
    this.store.updateUi({ lastView: this.view, selectedOutputId: "" });
    this.resetMobileScrollAfterRender = true;
    this.render();
  }

  private setQuickNavTarget(target: "create" | "visuals" | "library" | "settings" | null): void {
    this.quickNavTarget = target;
    this.root.querySelectorAll<HTMLElement>("[data-quicknav-target]").forEach((button) => {
      button.classList.toggle("is-target", button.dataset.quicknavTarget === target);
    });
  }

  private cycleMobileContext(direction: -1 | 1): void {
    const section = this.mobileSection();
    if (section === "create") {
      const currentPane = this.store.state.ui.mobileCreatePane;
      // Tune is the terminal Create pane. On some mobile browsers the leftward
      // gesture arriving from the tune rail is reported as the forward gesture,
      // which used to wrap Tune -> Generation. Treat either outward gesture from
      // Tune as a request to step back to Output; this keeps the only ambiguous
      // terminal transition deterministic without changing the working gestures
      // on Generation and Output.
      if (currentPane === "tune") {
        this.store.updateUi({ mobileCreatePane: "output" });
        this.resetMobileScrollAfterRender = true;
        this.render();
        return;
      }
      const options: StudioUiState["mobileCreatePane"][] = ["generation", "output", "tune"];
      const current = Math.max(0, options.indexOf(currentPane));
      const next = options[(current + direction + options.length) % options.length]!;
      this.store.updateUi({ mobileCreatePane: next });
      this.resetMobileScrollAfterRender = true;
      this.render();
      return;
    }
    if (section === "visuals") {
      const options: StudioView[] = ["identities", "models", "civitai"];
      const current = Math.max(0, options.indexOf(this.view));
      this.view = options[(current + direction + options.length) % options.length]!;
      this.lastNonSettingsView = this.view;
      this.store.updateUi({ lastView: this.view, selectedOutputId: "" });
      this.resetMobileScrollAfterRender = true;
      this.render();
      if (this.view === "civitai" && !this.civitaiLoadedOnce) void this.searchCivitai(true);
      return;
    }
    if (section === "settings") {
      const options = ["logs", "connection", "backend", "appearance"] as const;
      const currentKey = this.view === "logs" ? "logs" : this.store.state.ui.settingsPane;
      const current = Math.max(0, options.indexOf(currentKey));
      const next = options[(current + direction + options.length) % options.length]!;
      if (next === "logs") {
        this.view = "logs";
        this.store.updateUi({ lastView: "logs", selectedOutputId: "" });
      } else {
        this.view = "settings";
        this.store.updateUi({ lastView: "settings", settingsPane: next, selectedOutputId: "" });
      }
      this.resetMobileScrollAfterRender = true;
      this.render();
    }
  }

  private navButton(view: StudioView, label: string, icon: string): string {
    return `<button class="nav-button ${this.view === view ? "is-active" : ""}" data-nav="${view}" title="${label}"><span>${icon}</span><em>${label}</em></button>`;
  }

  private viewLabel(): string {
    return ({
      create: "Prompt workspace",
      library: "Your Swarm assets",
      identities: "Reusable visual profiles",
      models: "Server inventory",
      civitai: "Discover LoRAs",
      logs: "Runtime and generation output",
      settings: "Connection and process control",
    } satisfies Record<StudioView, string>)[this.view];
  }

  private viewTitle(): string {
    return ({
      create: "Create",
      library: "Library",
      identities: "Identity library",
      models: "Models and LoRAs",
      civitai: "CivitAI",
      logs: "Runtime logs",
      settings: "Studio settings",
    } satisfies Record<StudioView, string>)[this.view];
  }

  private renderLoraDownloadModal(): string {
    if (!this.loraDownloadOpen) return "";
    const resolved = this.loraDownloadResolved;
    const preview = resolved ? `
      <article class="download-resolved-card">
        <div class="download-resolved-media">
          ${resolved.previewUrl ? `<img src="${escapeHtml(resolved.previewUrl)}" alt="${escapeHtml(resolved.title || resolved.name)} preview" />` : `<div class="download-preview-placeholder">◇</div>`}
        </div>
        <div class="download-resolved-copy">
          <div class="download-resolved-tags">
            <span>${escapeHtml(resolved.modelType || "LoRA")}</span>
            ${resolved.baseModel ? `<span>${escapeHtml(resolved.baseModel)}</span>` : ""}
            ${resolved.family ? `<span>${escapeHtml(resolved.family)}</span>` : ""}
          </div>
          <h3>${escapeHtml(resolved.title || resolved.name)}</h3>
          <p class="download-version">${escapeHtml([resolved.versionTitle, resolved.author].filter(Boolean).join(" · "))}</p>
          ${resolved.description ? `<p class="download-description">${escapeHtml(resolved.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 520)}</p>` : ""}
          ${resolved.triggerWords.length ? `<p class="download-trigger"><b>Trigger${resolved.triggerWords.length === 1 ? "" : "s"}:</b> ${escapeHtml(resolved.triggerWords.join(", "))}</p>` : ""}
          <p class="download-family-note"><b>Swarm classification:</b> ${escapeHtml(resolved.family ? `${resolved.family}${resolved.architecture ? ` · ${resolved.architecture}` : ""}` : "let Swarm detect from the file")}</p>
        </div>
      </article>` : this.loraDownloadResolving
        ? `<div class="download-resolving"><span></span> Resolving Civitai metadata…</div>`
        : `<div class="download-resolve-hint">Paste a Civitai URL to preview its model type, base model, trigger phrase, and cover before downloading.</div>`;
    return `
      <div class="download-backdrop" data-action="close-lora-download">
        <section class="download-modal" role="dialog" aria-modal="true" aria-label="Download LoRA" data-download-panel>
          <header><div><span class="panel-kicker">LORA LIBRARY</span><h2>Download to Swarm.</h2></div><button class="icon-button" data-action="close-lora-download">×</button></header>
          <form id="lora-download-form">
            <label class="field"><span>Civitai or Hugging Face URL</span><input name="url" id="lora-download-url" value="${escapeHtml(this.loraDownloadUrl)}" placeholder="https://civitai.red/models/... or https://huggingface.co/.../resolve/..." autocomplete="off" /></label>
            ${preview}
            <label class="field"><span>Filename override <small>optional</small></span><input name="name" id="lora-download-name" value="${escapeHtml(this.loraDownloadName)}" placeholder="Swarm chooses a useful name when blank" autocomplete="off" /></label>
            <p class="helper-copy">Civitai base-model metadata is translated into Swarm's live LoRA architecture when possible. Studio also verifies the indexed model after download and corrects its metadata if Swarm exposes model editing.</p>
            <div class="download-progress"><div style="width:${Math.round(clamp(this.loraDownloadProgress, 0, 1) * 100)}%"></div></div>
            <p class="download-status">${escapeHtml(this.loraDownloadMessage || "Ready.")}</p>
            <div class="form-actions"><button type="button" class="ghost-button" data-action="close-lora-download">Close</button><button type="submit" class="primary-button" ${this.connected && !this.loraDownloadResolving ? "" : "disabled"}>Download</button></div>
          </form>
        </section>
      </div>`;
  }

  private presetByTitle(title: string): SwarmPreset | undefined {
    return this.presets.find((preset) => preset.title === title);
  }

  private presetSaveCandidates(): Array<{ key: string; label: string; value: unknown; preview: string; checked: boolean; group: string }> {
    const draft = this.store.state.draft;
    const editing = this.presetEditorEditing ? this.presetByTitle(this.presetEditorEditing) : undefined;
    const existing = editing?.param_map ?? {};
    const has = (...keys: string[]) => keys.some((key) => Object.keys(existing).some((current) => current.toLowerCase().replace(/[^a-z0-9]+/g, "") === key));
    const preview = (value: unknown) => {
      if (Array.isArray(value)) return value.join(", ");
      if (value && typeof value === "object") return JSON.stringify(value);
      return String(value ?? "");
    };
    const candidates: Array<{ key: string; label: string; value: unknown; preview: string; checked: boolean; group: string }> = [
      { key: "prompt", label: "Prompt", value: draft.prompt ? `{value}${draft.prompt.trim() ? `, ${draft.prompt}` : ""}` : "{value}", preview: draft.prompt || "Keep current prompt with {value}", checked: has("prompt"), group: "Prompt" },
      { key: "negativeprompt", label: "Negative prompt", value: draft.negativePrompt ? `{value}${draft.negativePrompt.trim() ? `, ${draft.negativePrompt}` : ""}` : "{value}", preview: draft.negativePrompt || "Keep current negative prompt with {value}", checked: has("negativeprompt"), group: "Prompt" },
      { key: "model", label: "Model", value: draft.model, preview: prettyName(draft.model), checked: editing ? has("model") : true, group: "Core" },
      { key: "width", label: "Width", value: draft.width, preview: String(draft.width), checked: editing ? has("width") : true, group: "Core" },
      { key: "height", label: "Height", value: draft.height, preview: String(draft.height), checked: editing ? has("height") : true, group: "Core" },
      { key: "steps", label: "Steps", value: draft.steps, preview: String(draft.steps), checked: editing ? has("steps") : true, group: "Core" },
      { key: "cfgscale", label: "CFG Scale", value: draft.cfgScale, preview: String(draft.cfgScale), checked: editing ? has("cfgscale") : true, group: "Core" },
      { key: "seed", label: "Seed", value: draft.seed, preview: String(draft.seed), checked: has("seed"), group: "Core" },
      { key: "variationseed", label: "Variation seed", value: draft.variationSeed, preview: draft.variationSeedEnabled ? String(draft.variationSeed) : "Disabled", checked: editing ? has("variationseed") : draft.variationSeedEnabled, group: "Variation" },
      { key: "variationseedstrength", label: "Variation strength", value: draft.variationSeedStrength, preview: draft.variationSeedStrength.toFixed(2), checked: editing ? has("variationseedstrength") : draft.variationSeedEnabled, group: "Variation" },
      { key: "sampler", label: "Sampler", value: draft.sampler, preview: draft.sampler || "Swarm default", checked: editing ? has("sampler") : true, group: "Core" },
      { key: "scheduler", label: "Scheduler", value: draft.scheduler, preview: draft.scheduler || "Swarm default", checked: editing ? has("scheduler") : true, group: "Core" },
      { key: "__loras__", label: "LoRA stack", value: draft.loras, preview: draft.loras.filter((item) => item.enabled).map((item) => `${prettyName(item.title || item.name)} ${item.weight}`).join(" · ") || "No enabled LoRAs", checked: editing ? has("loras", "loraweights") : draft.loras.some((item) => item.enabled), group: "LoRAs" },
    ];
    for (const [key, value] of Object.entries(this.activeExtraParams(draft))) {
      const param = this.params.find((item) => String(item.id ?? item.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "") === key.toLowerCase().replace(/[^a-z0-9]+/g, ""));
      candidates.push({
        key,
        label: param?.name || key,
        value,
        preview: preview(value),
        checked: editing ? has(key.toLowerCase().replace(/[^a-z0-9]+/g, "")) : true,
        group: param?.group ? String(param.group) : "Advanced",
      });
    }
    return candidates;
  }

  private renderPresetEditorModal(): string {
    if (!this.presetEditorOpen) return "";
    const candidates = this.presetSaveCandidates();
    const grouped = new Map<string, typeof candidates>();
    for (const item of candidates) {
      const bucket = grouped.get(item.group) ?? [];
      bucket.push(item);
      grouped.set(item.group, bucket);
    }
    return `<div class="preset-editor-backdrop" data-action="close-preset-editor">
      <section class="preset-editor-modal" role="dialog" aria-modal="true" aria-label="${this.presetEditorEditing ? "Edit" : "Create"} Swarm preset" data-preset-editor-panel>
        <header><div><span class="panel-kicker">SWARM PRESET</span><h2>${this.presetEditorEditing ? "Edit preset" : "Choose what to save"}</h2></div><button class="icon-button" data-action="close-preset-editor">×</button></header>
        <form id="preset-editor-form">
          <div class="preset-editor-name-row">
            <label class="field"><span>Name</span><input name="title" value="${escapeHtml(this.presetEditorTitle)}" placeholder="Preset name" required /></label>
            <label class="field"><span>Description</span><input name="description" value="${escapeHtml(this.presetEditorDescription)}" placeholder="Optional description" /></label>
          </div>
          <p class="helper-copy">Checked values are written to SwarmUI. Prompt fields compose with <code>{value}</code> so this preset can stay stackable. Seed starts unchecked on new presets.</p>
          <div class="preset-editor-groups">${[...grouped.entries()].map(([group, items]) => `<section class="preset-editor-group"><h3>${escapeHtml(group)}</h3><div class="preset-editor-grid">${items.map((item) => `<label class="preset-save-option"><input type="checkbox" name="preset-param" value="${escapeHtml(item.key)}" ${item.checked ? "checked" : ""}/><span><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.preview)}</small></span></label>`).join("")}</div></section>`).join("")}</div>
          <div class="form-actions"><button type="button" class="ghost-button" data-action="close-preset-editor">Cancel</button>${this.presetEditorEditing ? `<button type="button" class="danger-soft" data-action="delete-preset" data-preset-title="${escapeHtml(this.presetEditorEditing)}">Delete</button>` : ""}<button type="submit" class="primary-button">${this.presetEditorEditing ? "Save changes" : "Save preset"}</button></div>
        </form>
      </section>
    </div>`;
  }

  private renderRegionPresetEditorModal(): string {
    if (!this.regionEditorOpen) return "";
    const draft = this.store.state.draft;
    const regional = draft.regionalPrompt;
    const layout = REGION_LAYOUT_PRESETS.find((item) => item.id === regional.layout);
    const syntax = this.promptWithTriggers(draft);
    const spacingPercent = Math.round(regional.spacing * 100);
    const spacingLabel = spacingPercent < 0 ? `Overlap ${Math.abs(spacingPercent)}%` : spacingPercent > 0 ? `Gap ${spacingPercent}%` : "Touching";
    const overlaps = regionOverlapAreas(regional.regions);
    const preview = regional.regions.length
      ? `<div class="region-preview-stage" data-region-stage style="aspect-ratio:${Math.max(1, draft.width)} / ${Math.max(1, draft.height)}">${regional.regions.map((region, index) => `<div class="region-preview-box ${region.enabled ? "" : "is-disabled"} ${index === this.regionEditorSelectedIndex ? "is-selected" : ""}" data-region-preview="${index}" data-region-drag="${index}" tabindex="0" role="group" aria-label="${escapeHtml(region.name || `Region ${index + 1}`)} region" style="left:${region.x * 100}%;top:${region.y * 100}%;width:${region.width * 100}%;height:${region.height * 100}%"><span>${escapeHtml(region.name || `Region ${index + 1}`)}</span>${["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((handle) => `<i class="region-resize-handle region-resize-${handle}" data-region-resize="${index}:${handle}" aria-hidden="true"></i>`).join("")}</div>`).join("")}${overlaps.map((overlap) => `<i class="region-preview-overlap" data-region-overlap style="left:${overlap.x * 100}%;top:${overlap.y * 100}%;width:${overlap.width * 100}%;height:${overlap.height * 100}%" aria-hidden="true"></i>`).join("")}</div>`
      : `<div class="region-preview-empty"><b>Choose a layout preset.</b><span>Studio will translate the regions into Swarm syntax at generation time.</span></div>`;
    const geometryBadge = regional.regions.length ? `${regional.customGeometry ? "Custom · " : ""}${regional.regions.length} region${regional.regions.length === 1 ? "" : "s"}` : "No layout";
    return `<div class="region-editor-backdrop" data-action="close-region-editor">
      <section class="region-editor-modal" role="dialog" aria-modal="true" aria-label="Regional prompting" data-region-editor-panel>
        <header><div><span class="panel-kicker">REGIONAL PROMPTING</span><h2>Region editor</h2></div><button class="icon-button" data-action="close-region-editor" aria-label="Close regional prompting">×</button></header>
        <div class="region-editor-body">
          <section class="region-layout-panel">
            <div class="region-editor-heading"><div><b>Layout presets</b><small>${layout ? escapeHtml(layout.description) : "Choose a preset, then drag or resize any region."}</small></div><span data-region-geometry-mode>${escapeHtml(geometryBadge)}</span></div>
            <div class="region-layout-presets">${REGION_LAYOUT_PRESETS.map((preset) => `<button type="button" class="region-layout-preset ${regional.layout === preset.id ? "is-active" : ""} ${regional.layout === preset.id && regional.customGeometry ? "is-custom" : ""}" data-region-layout="${preset.id}"><span class="region-layout-mini">${preset.regions.map((region) => `<i style="left:${region.x * 100}%;top:${region.y * 100}%;width:${region.width * 100}%;height:${region.height * 100}%"></i>`).join("")}</span><b>${escapeHtml(preset.label)}</b><small>${escapeHtml(preset.shortLabel)}</small></button>`).join("")}</div>
            <div class="region-spacing-control ${regional.layout ? "" : "is-disabled"}">
              <div><b>Region spacing</b><small>Overlap for shared action · gap for stronger separation. Changing this reapplies the preset geometry.</small></div>
              <label><span class="region-spacing-end">Overlap</span><input type="range" min="-20" max="20" step="1" value="${spacingPercent}" data-region-spacing aria-label="Region spacing percent" ${regional.layout ? "" : "disabled"}/><span class="region-spacing-end">Gap</span><output data-region-spacing-output>${escapeHtml(spacingLabel)}</output></label>
            </div>
            <div class="region-preview-shell">${preview}</div>
            <div class="region-preview-legend"><span><i class="legend-region"></i> Region</span><span><i class="legend-overlap"></i> Overlap</span><span><i class="legend-unclaimed"></i> Unclaimed</span></div>
          </section>
          <section class="region-prompt-panel">
            <div class="region-editor-heading"><div><b>Regional prompts</b><small>The global positive stays in the main composer. These prompts only apply inside their regions.</small></div></div>
            ${regional.regions.length ? `<div class="region-prompt-list">${regional.regions.map((region, index) => `<article class="region-prompt-card ${region.enabled ? "" : "is-disabled"} ${index === this.regionEditorSelectedIndex ? "is-selected" : ""}" data-region-card="${index}">
              <div class="region-card-head"><label class="region-enabled"><input type="checkbox" data-region-enabled="${index}" ${region.enabled ? "checked" : ""}/><span>Use</span></label><input class="region-name-input" data-region-name="${index}" value="${escapeHtml(region.name)}" aria-label="Region ${index + 1} name" /><label class="region-strength"><span>Strength</span><input type="number" min="0" step="0.05" value="${region.strength}" data-region-strength="${index}" /></label></div>
              <textarea rows="3" data-region-prompt="${index}" placeholder="What belongs in ${escapeHtml(region.name.toLowerCase() || `region ${index + 1}`)}?">${escapeHtml(region.prompt)}</textarea>
            </article>`).join("")}</div>` : `<div class="region-prompt-empty">Choose a layout preset to create regional prompt slots.</div>`}
            <article class="region-background-card ${regional.backgroundEnabled ? "is-enabled" : ""}">
              <div class="region-card-head"><label class="region-enabled"><input type="checkbox" data-region-background-enabled ${regional.backgroundEnabled ? "checked" : ""}/><span>Background</span></label><small>Only areas not claimed by an explicit region.</small></div>
              <textarea rows="3" data-region-background-prompt placeholder="Background-only prompt…" ${regional.backgroundEnabled ? "" : "disabled"}>${escapeHtml(regional.backgroundPrompt)}</textarea>
            </article>
            <details class="region-syntax-preview region-syntax-preview--prompts"><summary>Swarm syntax preview</summary><pre data-region-syntax-preview>${escapeHtml(syntax || "Choose a layout and add a regional prompt to preview syntax.")}</pre></details>
          </section>
        </div>
        <div class="form-actions region-editor-actions"><button type="button" class="danger-soft" data-action="clear-regions" ${regional.regions.length || regional.backgroundPrompt ? "" : "disabled"}>Clear regions</button><button type="button" class="primary-button" data-action="close-region-editor">Done</button></div>
      </section>
    </div>`;
  }

  private renderInspector(): string {
    const id = this.store.state.ui.selectedOutputId;
    if (!id) return "";
    const output = this.outputById(id);
    if (!output) return "";
    const metadata = output.metadata || "No metadata was returned by Swarm.";
    const params = this.metadataParams(output.metadata);
    const resolvedPrompt = String(this.metadataValue(params, "prompt") ?? output.sentPrompt ?? output.prompt ?? "");
    const resolvedNegative = String(this.metadataValue(params, "negativeprompt", "negative prompt") ?? output.negativePrompt ?? "");
    const resolvedSeed = asNumber(String(this.metadataValue(params, "seed") ?? output.seed), output.seed);
    const variationSeed = this.metadataValue(params, "variationseed", "variation seed");
    const variationStrength = this.metadataValue(params, "variationseedstrength", "variation seed strength");
    const timing = this.outputTiming(output);
    const loras = output.loras.filter((item) => item.enabled).map((item) => `${prettyName(item.title || item.name)} · ${item.weight}`).join("\n") || "No LoRAs recorded.";
    return `
      <div class="inspector-backdrop" data-action="close-inspector">
        <section class="inspector" role="dialog" aria-modal="true" aria-label="Output inspector" data-inspector-panel>
          <header><div><span class="panel-kicker">INSPECT</span><h2>${escapeHtml(prettyName(output.model) || "Swarm output")}</h2></div><button class="icon-button" data-action="close-inspector">×</button></header>
          <div class="inspector-grid">
            <div class="inspector-media"><img ${this.swarmImageAttributes(this.outputImageUrl(output))} alt="Swarm output" /></div>
            <div class="inspector-copy">
              <div class="inspector-actions">
                <button class="primary-button" data-reuse-output="${output.id}">Reuse all</button>
                <button class="secondary-button" data-init-output="${output.id}">Use as init</button>
                <button class="secondary-button" data-inpaint-output="${output.id}">Inpaint</button>
                <button class="secondary-button" data-copy-resolved-prompt="${output.id}">Copy prompt</button>
                <button class="secondary-button" data-nav="library">Open library</button>
              </div>
              <div class="metadata-facts metadata-facts--timing">
                <span><b>Total time</b><em>${this.formatDuration(timing.totalTimeMs)}</em></span>
                <span><b>Prepping</b><em>${this.formatDuration(timing.prepTimeMs)}</em></span>
                <span><b>Generating</b><em>${this.formatDuration(timing.generationTimeMs)}</em></span>
                <span><b>Seed</b><em>${Number.isFinite(resolvedSeed) ? resolvedSeed : "—"}</em></span>
                <span><b>Variation seed</b><em>${variationSeed ?? "—"}</em></span>
                <span><b>Variation strength</b><em>${variationStrength ?? "—"}</em></span>
              </div>
              <section><span>Resolved prompt</span><pre>${escapeHtml(resolvedPrompt)}</pre></section>
              <section><span>Resolved negative</span><pre>${escapeHtml(resolvedNegative)}</pre></section>
              <section><span>LoRA stack</span><pre>${escapeHtml(loras)}</pre></section>
              <section><span>Source request</span><pre>${escapeHtml(JSON.stringify(output.request ?? {}, null, 2))}</pre></section>
              <section><span>Swarm metadata</span><pre>${escapeHtml(metadata)}</pre></section>
            </div>
          </div>
        </section>
      </div>`;
  }

  private renderInpaintEditor(): string {
    if (!this.inpaintOpen) return "";
    const loaded = Boolean(this.inpaintImageElement?.complete && this.inpaintImageElement.naturalWidth > 0);
    const hasMask = this.inpaintHasMask();
    const toolHints: Record<typeof this.inpaintTool, string> = {
      paint: "One finger paints · two fingers pan and zoom",
      erase: "Erase mask strokes · two fingers pan and zoom",
      rect: "Drag a rectangle over the edit area",
      lasso: "Trace a freeform region and release to close it",
      pan: "Drag to move · wheel or pinch to zoom",
    };
    const modelName = prettyName(this.inpaintSourceOutputContext?.model || this.store.state.draft.model) || "Source checkpoint";
    const stackCount = (this.inpaintSourceOutputContext?.loras ?? this.store.state.draft.loras).filter((item) => item.enabled).length;
    return `<div class="download-backdrop inpaint-backdrop" data-action="close-inpaint">
      <section class="inpaint-editor" role="dialog" aria-modal="true" aria-label="Inpaint editor" data-inpaint-panel tabindex="-1">
        <header class="inpaint-header"><div class="inpaint-heading-copy"><span class="panel-kicker">INPAINT</span><b class="inpaint-mobile-title">Edit image</b><h2>${escapeHtml(this.inpaintSourceName || "Swarm output")}</h2><small>Paint a mask here; Swarm only handles inference.</small></div><div class="inpaint-header-actions"><button class="inpaint-round-action" data-action="open-inpaint-help" title="Inpaint help" aria-label="Inpaint help">${inpaintHelpSvg}</button><button class="inpaint-round-action" data-action="open-inpaint-settings" title="Generation settings" aria-label="Generation settings">${inpaintSettingsSvg}</button><button class="ghost-button inpaint-reset-view" data-action="reset-inpaint-view">Reset view</button><button class="primary-button" data-action="generate-inpaint" ${this.generating || !loaded || !hasMask ? "disabled" : ""}>${this.generating && this.inpaintAwaitingResult ? "Generating…" : "Generate edit"}<b>✦</b></button><button class="icon-button" data-action="close-inpaint">×</button></div></header>
        <div class="inpaint-layout" data-no-swipe>
          <section class="inpaint-stage-shell panel">
            <div class="inpaint-stage-toolbar">
              <div class="inpaint-tools" role="toolbar" aria-label="Mask tools">
                <button class="inpaint-tool-button ${this.inpaintTool === "paint" ? "is-active" : ""}" data-inpaint-tool="paint" title="Brush (B)" aria-label="Brush">${inpaintBrushSvg}</button>
                <button class="inpaint-tool-button ${this.inpaintTool === "erase" ? "is-active" : ""}" data-inpaint-tool="erase" title="Erase (E)" aria-label="Erase">${inpaintEraseSvg}</button>
                <button class="inpaint-tool-button ${this.inpaintTool === "rect" ? "is-active" : ""}" data-inpaint-tool="rect" title="Rectangle (R)" aria-label="Rectangle selection">${inpaintRectSvg}</button>
                <button class="inpaint-tool-button ${this.inpaintTool === "lasso" ? "is-active" : ""}" data-inpaint-tool="lasso" title="Lasso (L)" aria-label="Lasso selection">${inpaintLassoSvg}</button>
                <button class="inpaint-tool-button ${this.inpaintTool === "pan" ? "is-active" : ""}" data-inpaint-tool="pan" title="Pan (H)" aria-label="Pan">${inpaintPanSvg}</button>
              </div>
            </div>
            <div class="inpaint-canvas-shell ${this.inpaintTool === "pan" ? "is-pan" : ""}">
              <canvas id="inpaint-canvas"></canvas>
              ${loaded ? "" : `<div class="inpaint-canvas-loading"><span></span><b>Loading source image…</b><small>Studio routes the source through its image bridge before canvas decode.</small></div>`}
              <div class="inpaint-generation-preview ${this.inpaintAwaitingResult ? "is-active" : ""}" data-inpaint-generation-preview>
                <img data-inpaint-generation-image alt="Live inpaint preview" />
                <div class="inpaint-generation-status"><b data-inpaint-generation-label>${escapeHtml(this.generationMessage || "Preparing edit")}</b><span><i data-inpaint-generation-meter style="width:${Math.round(this.generationPercent * 100)}%"></i></span><small data-inpaint-generation-step>${this.generationStep ? `Step ${this.generationStep} / ${Math.max(1, this.inpaintConfigSteps)}` : "Waiting for sampler"}</small></div>
              </div>
            </div>
            <div class="inpaint-stage-footer"><span>${escapeHtml(toolHints[this.inpaintTool])}</span><b>${this.inpaintShowMask ? "Mask visible" : "Mask hidden"} · zoom ${this.inpaintZoom.toFixed(2)}×</b></div>
            <div class="inpaint-post-actions" role="toolbar" aria-label="Mask actions">
              <button class="inpaint-action-icon" data-action="inpaint-undo" ${this.inpaintStrokes.length ? "" : "disabled"} title="Undo" aria-label="Undo">${inpaintUndoSvg}</button>
              <button class="inpaint-action-icon" data-action="inpaint-redo" ${this.inpaintRedo.length ? "" : "disabled"} title="Redo" aria-label="Redo">${inpaintRedoSvg}</button>
              <button class="inpaint-action-icon ${this.inpaintInvert ? "is-active" : ""}" data-action="inpaint-invert" title="${this.inpaintInvert ? "Remove inversion" : "Invert mask"}" aria-label="${this.inpaintInvert ? "Remove inversion" : "Invert mask"}">${inpaintInvertSvg}</button>
              <button class="inpaint-action-icon" data-action="inpaint-clear" ${hasMask ? "" : "disabled"} title="Clear mask" aria-label="Clear mask">${inpaintClearSvg}</button>
              <span class="inpaint-action-spacer"></span>
              <label class="inpaint-action-icon file-button" title="Import mask" aria-label="Import mask">${inpaintImportSvg}<input id="inpaint-mask-file" type="file" accept="image/*" hidden /></label>
              <button class="inpaint-action-icon" data-action="export-inpaint-mask" ${hasMask && loaded ? "" : "disabled"} title="Export mask" aria-label="Export mask">${inpaintExportSvg}</button>
            </div>
          </section>
          <aside class="inpaint-sidebar panel">
            <section class="inpaint-control-group"><div class="section-minihead"><b>Mask</b><span data-inpaint-mask-count>${this.inpaintImportedMaskDataUrl ? "Imported + drawn" : `${this.inpaintStrokes.length} action${this.inpaintStrokes.length === 1 ? "" : "s"}`}</span></div>
              <div class="field-grid field-grid--2 compact-fields">
                <label class="range-field"><span>Brush size <b id="inpaint-brush-size-value">${Math.round(this.inpaintBrushSize)} px</b></span><input id="inpaint-brush-size" type="range" min="4" max="256" step="1" value="${this.inpaintBrushSize}" /></label>
                <label class="range-field"><span>Mask opacity <b id="inpaint-mask-opacity-value">${Math.round(this.inpaintMaskOpacity * 100)}%</b></span><input id="inpaint-mask-opacity" type="range" min="0.08" max="0.8" step="0.01" value="${this.inpaintMaskOpacity}" /></label>
                <label class="range-field"><span>Feather <b id="inpaint-feather-value">${Math.round(this.inpaintFeather)} px</b></span><input id="inpaint-feather" type="range" min="0" max="64" step="1" value="${this.inpaintFeather}" /></label>
                <label class="range-field"><span>Grow / shrink <b id="inpaint-expand-value">${this.inpaintExpand > 0 ? "+" : ""}${Math.round(this.inpaintExpand)} px</b></span><input id="inpaint-expand" type="range" min="-64" max="64" step="1" value="${this.inpaintExpand}" /></label>
              </div>
              <div class="inpaint-toggle-row"><label class="tiny-toggle"><input id="inpaint-show-mask" type="checkbox" ${this.inpaintShowMask ? "checked" : ""}/><span>Show mask overlay</span></label><button class="ghost-button" data-action="reset-inpaint-mask-shaping" ${(this.inpaintFeather || this.inpaintExpand) ? "" : "disabled"}>Reset shaping</button></div>
            </section>
            <section class="inpaint-control-group inpaint-prompt-group"><div class="section-minihead"><b>Prompt</b><button class="ghost-button compact-generation-settings" data-action="open-inpaint-settings">${inpaintSettingsSvg}<span>${this.inpaintConfigWidth}×${this.inpaintConfigHeight} · ${this.inpaintConfigSteps} steps</span></button></div>
              <div class="metadata-facts inpaint-facts"><span><b>Checkpoint</b><em>${escapeHtml(modelName)}</em></span><span><b>LoRAs</b><em>${stackCount}</em></span><span><b>Creativity</b><em>${this.inpaintCreativity.toFixed(2)}</em></span></div>
              <label class="field"><span>Inpaint prompt</span><textarea id="inpaint-prompt" rows="8" placeholder="Describe only what should change…">${escapeHtml(this.inpaintPrompt)}</textarea></label>
              <label class="field"><span>Negative prompt</span><textarea id="inpaint-negative" rows="5" placeholder="Things to avoid in the masked area…">${escapeHtml(this.inpaintNegativePrompt)}</textarea></label>
            </section>
            <div class="form-actions inpaint-form-actions"><button class="ghost-button" data-action="use-inpaint-result-as-init" ${this.store.state.outputs[0] ? "" : "disabled"}>Use latest as init</button><button class="ghost-button" data-action="close-inpaint">Close</button><button class="primary-button" data-action="generate-inpaint" ${this.generating || !loaded || !hasMask ? "disabled" : ""}>${this.generating && this.inpaintAwaitingResult ? "Generating…" : "Generate edit"}</button></div>
          </aside>
        </div>
        ${this.renderInpaintResultReview()}
        ${this.renderInpaintSettingsModal()}
        ${this.renderInpaintHelpModal()}
      </section>
    </div>`;
  }

  private renderInpaintResultReview(): string {
    if (!this.inpaintResultReviewOpen || !this.inpaintPendingResultRecord) return "";
    const previewUrl = this.outputImageUrl(this.inpaintPendingResultRecord);
    return `<div class="inpaint-result-review" role="status" aria-live="polite"><div class="inpaint-result-review-copy"><span class="panel-kicker">COMPLETE</span><b>Apply this edit?</b><small>Reject keeps the current base image and current mask so you can try again. Accept switches the editor to the new result and clears the old mask.</small></div><div class="inpaint-result-review-preview"><img ${this.swarmImageAttributes(previewUrl)} alt="Latest inpaint result preview" loading="eager" /></div><div class="inpaint-result-review-actions"><button class="ghost-button" data-action="dismiss-inpaint-result" title="Keep the current base image">× Keep current</button><button class="primary-button" data-action="apply-inpaint-result" title="Use this edit as the new base">✓ Use edit</button></div></div>`;
  }

  private renderInpaintSettingsModal(): string {
    if (!this.inpaintSettingsOpen) return "";
    const samplers = [...new Set([this.inpaintConfigSampler, ...getParamValues(this.params, "Sampler", "sampler")].filter(Boolean))];
    const schedulers = [...new Set([this.inpaintConfigScheduler, ...getParamValues(this.params, "Scheduler", "scheduler")].filter(Boolean))];
    const modelName = prettyName(this.inpaintSourceOutputContext?.model || this.store.state.draft.model) || "Source checkpoint";
    const stackCount = (this.inpaintSourceOutputContext?.loras ?? this.store.state.draft.loras).filter((item) => item.enabled).length;
    return `<div class="inpaint-submodal-backdrop" data-action="close-inpaint-settings"><section class="inpaint-submodal inpaint-settings-modal" data-inpaint-settings-panel role="dialog" aria-modal="true" aria-label="Inpaint generation settings">
      <header><div><span class="panel-kicker">INPAINT</span><h3>Generation settings</h3><small>The source checkpoint and stack stay attached to this edit session.</small></div><button class="icon-button" data-action="close-inpaint-settings">×</button></header>
      <div class="inpaint-settings-scroll">
        <div class="metadata-facts inpaint-settings-source"><span><b>Checkpoint</b><em>${escapeHtml(modelName)}</em></span><span><b>LoRAs</b><em>${stackCount}</em></span><span><b>Mask engine</b><em>${escapeHtml(this.inpaintEngine)}</em></span></div>
        <section class="inpaint-settings-section"><div class="section-minihead"><b>Output</b><span>Independent from Create</span></div><div class="field-grid field-grid--2 compact-fields">
          ${this.numberField("inpaint-config-width", "Width", this.inpaintConfigWidth, 64, 8192, 8)}
          ${this.numberField("inpaint-config-height", "Height", this.inpaintConfigHeight, 64, 8192, 8)}
        </div></section>
        <section class="inpaint-settings-section"><div class="section-minihead"><b>Sampling</b><span>Source defaults</span></div><div class="field-grid field-grid--3 compact-fields">
          ${this.numberField("inpaint-config-steps", "Steps", this.inpaintConfigSteps, 1, 200, 1)}
          ${this.numberField("inpaint-config-cfg", "CFG", this.inpaintConfigCfg, 0, 30, 0.1)}
          ${this.numberField("inpaint-config-seed", "Seed", this.inpaintConfigSeed, -1, 2147483647, 1)}
        </div><div class="field-grid field-grid--2 compact-fields">
          ${this.selectField("inpaint-config-sampler", "Sampler", this.inpaintConfigSampler, samplers)}
          ${this.selectField("inpaint-config-scheduler", "Scheduler", this.inpaintConfigScheduler, schedulers)}
        </div></section>
        <section class="inpaint-settings-section"><div class="section-minihead"><b>Inpaint</b><span>Mask inference</span></div>
          <label class="range-field"><span>Creativity <b id="inpaint-settings-creativity-value">${this.inpaintCreativity.toFixed(2)}</b></span><input id="inpaint-settings-creativity" type="range" min="0" max="1" step="0.01" value="${this.inpaintCreativity}" /></label>
          <label class="field"><span>Mask engine</span><select id="inpaint-settings-engine"><option value="simple" ${this.inpaintEngine === "simple" ? "selected" : ""}>Simple latent · recommended</option><option value="differential" ${this.inpaintEngine === "differential" ? "selected" : ""}>Differential diffusion</option><option value="encode" ${this.inpaintEngine === "encode" ? "selected" : ""}>Inpainting VAE encode</option></select></label>
        </section>
      </div>
      <footer><button class="ghost-button" data-action="reset-inpaint-generation-settings">Reset to source</button><button class="primary-button" data-action="close-inpaint-settings">Done</button></footer>
    </section></div>`;
  }

  private renderInpaintHelpModal(): string {
    if (!this.inpaintHelpOpen) return "";
    return `<div class="inpaint-submodal-backdrop" data-action="close-inpaint-help"><section class="inpaint-submodal inpaint-help-modal" data-inpaint-help-panel role="dialog" aria-modal="true" aria-label="Inpaint help">
      <header><div><span class="panel-kicker">INPAINT</span><h3>Quick help</h3></div><button class="icon-button" data-action="close-inpaint-help">×</button></header>
      <div class="inpaint-help-grid"><section><b>Desktop</b><p>Ctrl/Cmd+Z undo · Shift+Ctrl/Cmd+Z redo · B brush · E erase · R rectangle · L lasso · H pan · [ and ] resize brush.</p></section><section><b>Mobile</b><p>One finger uses the active tool on the image. Two fingers always pan and zoom. Scroll the editor from any non-canvas surface.</p></section><section><b>Iteration</b><p>After a successful edit, Studio loads the newest result back into the editor and clears the old mask so you can keep refining.</p></section><section><b>Generation</b><p>The checkpoint, LoRAs, sampler defaults, and advanced values come from the source output. Open Generation settings to override size, steps, CFG, seed, sampler, scheduler, creativity, or mask engine for this edit session.</p></section></div>
      <footer><button class="primary-button" data-action="close-inpaint-help">Got it</button></footer>
    </section></div>`;
  }

  private renderHeaderStatus(): void {
    const status = this.root.querySelector<HTMLButtonElement>("#connection-status");
    if (!status) return;
    status.className = `status-chip ${this.connected ? "is-online" : this.connecting ? "is-busy" : "is-offline"}`;
    status.innerHTML = `<span></span>${this.connecting ? "Connecting" : this.connected ? "Swarm online" : "Connect"}`;
  }

  private renderView(): string {
    switch (this.view) {
      case "create": return this.renderCreate();
      case "library": return this.renderLibrary();
      case "identities": return this.renderIdentities();
      case "models": return this.renderModels();
      case "civitai": return this.renderCivitai();
      case "logs": return this.renderLogs();
      case "settings": return this.renderSettings();
    }
  }

  private applyParameterData(data: SwarmParamList): void {
    this.params = data.list ?? this.params;
    this.paramGroups = data.groups ?? this.paramGroups;
    this.wildcards = data.wildcards ?? this.wildcards;
  }

  private paramValueAdvertised(value: string, ...names: string[]): boolean {
    if (!value) return true;
    const wanted = normalizeParamKey(value);
    return getParamValues(this.params, ...names).some((candidate) => normalizeParamKey(candidate) === wanted);
  }

  private generationDynamicValuesAdvertised(draft: GenerationDraft): boolean {
    return this.paramValueAdvertised(draft.sampler, "Sampler", "sampler")
      && this.paramValueAdvertised(draft.scheduler, "Scheduler", "scheduler");
  }

  private schedulePostConnectParameterHydration(): void {
    const epoch = ++this.parameterHydrationEpoch;
    const client = this.client;
    void (async () => {
      // Swarm can accept a session before a self-starting Comfy backend has finished publishing
      // extension samplers/schedulers. Wait only during this bounded startup window, then refresh
      // ListT2IParams once the backend reports ready. This is not a permanent connection poll.
      for (let attempt = 0; attempt < 16; attempt += 1) {
        await sleep(attempt === 0 ? 500 : 750);
        if (!this.connected || epoch !== this.parameterHydrationEpoch || client !== this.client) return;
        try {
          const backends = await client.listBackends();
          const enabled = backends.filter((backend) => backend.enabled);
          if (!enabled.length) return;
          const ready = enabled.some((backend) => ["running", "idle"].includes(String(backend.status ?? "").toLowerCase()));
          if (!ready) continue;
          const beforeSampler = getParamValues(this.params, "Sampler", "sampler").join("\u0000");
          const beforeScheduler = getParamValues(this.params, "Scheduler", "scheduler").join("\u0000");
          this.applyParameterData(await client.parameterData(false));
          if (!this.connected || epoch !== this.parameterHydrationEpoch || client !== this.client) return;
          const afterSampler = getParamValues(this.params, "Sampler", "sampler").join("\u0000");
          const afterScheduler = getParamValues(this.params, "Scheduler", "scheduler").join("\u0000");
          if (beforeSampler !== afterSampler || beforeScheduler !== afterScheduler) {
            this.addLog("Backend capability schema hydrated after Comfy became ready.", "info", "api");
          }
          return;
        } catch {
          // Backend-list permissions can be restricted. Fall through to the generation-time
          // one-shot catch-up rather than reviving the old permanent reachability loop.
          if (attempt >= 3) return;
        }
      }
    })();
  }

  private async ensureGenerationParameterHydration(draft: GenerationDraft): Promise<void> {
    if (this.generationDynamicValuesAdvertised(draft)) return;
    const missing = [
      draft.sampler && !this.paramValueAdvertised(draft.sampler, "Sampler", "sampler") ? `Sampler ${draft.sampler}` : "",
      draft.scheduler && !this.paramValueAdvertised(draft.scheduler, "Scheduler", "scheduler") ? `Scheduler ${draft.scheduler}` : "",
    ].filter(Boolean);
    if (!missing.length) return;

    this.addLog(`Waiting for backend capability registration: ${missing.join(", ")}.`, "info", "api");
    const client = this.client;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (attempt) await sleep(600);
      if (!this.connected || client !== this.client) return;
      try {
        this.applyParameterData(await client.parameterData(false));
      } catch (error) {
        if (attempt === 9) this.addLog(`Backend capability refresh failed: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
        continue;
      }
      if (this.generationDynamicValuesAdvertised(draft)) {
        this.addLog(`Backend capabilities registered: ${missing.join(", ")}.`, "info", "api");
        return;
      }
    }
    // Extension-owned values are intentionally still sent unchanged. This refresh is a startup
    // catch-up, not a validator that gets to erase values Studio cannot prove are invalid.
    this.addLog(`Backend capability metadata still does not advertise ${missing.join(", ")}; sending the selected value unchanged.`, "warn", "api");
  }

  private currentCheckpoint(): SwarmModel | undefined {
    const selected = this.store.state.draft.model;
    return this.models.find((model) => model.name === selected);
  }

  private resolveLora(item: LoraStackItem): SwarmModel | undefined {
    const resolvedName = resolveLoraModelName(item.name, this.loras.map((lora) => lora.name));
    return resolvedName ? this.loras.find((lora) => lora.name === resolvedName) : undefined;
  }

  private loraParamValue(item: LoraStackItem): string | undefined {
    // Preserve the exact live ListModels name (folder path + extension). This is the same wire
    // shape Studio used before the 0.63.x LoRA regressions; Swarm itself owns filename cleaning.
    return loraRequestValue(item.name, this.loras.map((lora) => lora.name));
  }

  private generationLoraSelection(draft: GenerationDraft): { values: string[]; weights: string[]; missing: LoraStackItem[] } {
    const values: string[] = [];
    const weights: string[] = [];
    const missing: LoraStackItem[] = [];
    for (const item of draft.loras.filter((entry) => entry.enabled)) {
      const value = this.loraParamValue(item);
      if (!value) {
        missing.push(item);
        continue;
      }
      values.push(value);
      weights.push(String(item.weight));
    }
    return { values, weights, missing };
  }

  private compatibleLoras(): SwarmModel[] {
    const checkpoint = this.currentCheckpoint();
    if (!checkpoint) return [];
    return this.loras.filter((lora) => loraCompatibility(lora, checkpoint) === "compatible");
  }

  private orphanedLoras(): SwarmModel[] {
    if (!this.models.length) return [...this.loras];
    return this.loras.filter((lora) => !this.models.some((checkpoint) => loraCompatibility(lora, checkpoint) === "compatible"));
  }

  private renderLoraBatchRail(): string {
    if (this.view !== "models" || !this.loraBatchMode || this.loraMoveModalOpen || this.loraDeleteModalOpen) return "";
    const selectedCount = this.loraBatchSelected.size;
    const search = this.loraSearch.trim().toLowerCase();
    const source = this.loraOrphanMode ? this.orphanedLoras() : (this.loraShowNonMatching ? this.loras : this.compatibleLoras());
    const visibleCount = source
      .filter((model) => this.loraInCurrentFolder(model))
      .filter((model) => !search || [model.name, model.title, model.author, model.description, model.trigger_phrase, ...(model.tags ?? [])].filter(Boolean).join(" ").toLowerCase().includes(search))
      .length;
    return `<div class="lora-batch-bar lora-batch-rail lora-batch-rail--root"><div class="lora-batch-rail-summary"><span><b>${selectedCount}</b> selected</span><button class="ghost-button lora-batch-done" data-action="finish-lora-batch">Done</button></div><div><button class="ghost-button" data-action="select-visible-loras" ${visibleCount ? "" : "disabled"}>Select visible</button><button class="ghost-button" data-action="clear-lora-selection" ${selectedCount ? "" : "disabled"}>Clear</button><button class="danger-soft" data-action="open-lora-delete" ${selectedCount ? "" : "disabled"}>Delete</button><button class="primary-button" data-action="open-lora-move" ${selectedCount ? "" : "disabled"}>Move to folder</button></div></div>`;
  }

  private renderCreate(): string {
    const draft = this.store.state.draft;
    const samplers = [...new Set([draft.sampler, ...getParamValues(this.params, "Sampler", "sampler")].filter(Boolean))];
    const schedulers = [...new Set([draft.scheduler, ...getParamValues(this.params, "Scheduler", "scheduler")].filter(Boolean))];
    const available = this.compatibleLoras().filter((lora) => !draft.loras.some((item) => serverModelKey(item.name) === serverModelKey(lora.name)));
    const latest = this.store.state.outputs[0];
    const checkpoint = this.currentCheckpoint();
    const checkpointClass = checkpoint?.compat_class || checkpoint?.architecture || checkpoint?.class || "Compatibility metadata unavailable";
    const advancedParamCount = this.advancedParams().filter((item) => !this.isReviewBeforeSaveParamDefinition(item)).length;
    const reviewPending = this.pendingGenerationApprovals.length > 0;
    return `
      <div class="studio-workspace mobile-pane-${this.store.state.ui.mobileCreatePane}">
        <aside class="panel control-rail">
          <div class="rail-heading"><div><span class="panel-kicker">GENERATION</span><h2>Controls</h2></div></div>

          <section class="rail-section">
            <div class="section-minihead"><b>Preset stack</b><span>${draft.activePresets.length} selected</span></div>
            <div class="preset-picker preset-picker--streamlined"><select id="preset-select">${this.presetOptions("")}</select><button class="icon-button" data-action="new-preset" title="Save current settings as a new preset" aria-label="Save current settings as a new preset">${saveSvg}</button></div>
            ${this.presetStackMarkup()}
            <div class="preset-stack-tools"><button class="ghost-button" data-action="open-preset-reorder" ${draft.activePresets.length > 1 ? "" : "disabled"}>Reorder</button><button class="ghost-button" data-action="new-preset">Save current</button></div>
          </section>

          <section class="rail-section">
            <div class="field-grid field-grid--3 compact-fields">
              ${this.numberField("steps", "Steps", draft.steps, 1, 200, 1)}
              ${this.numberField("cfg", "CFG", draft.cfgScale, 0, 30, 0.1)}
              <label class="field seed-field"><span class="seed-field-label"><span>Seed</span><button type="button" class="icon-button seed-inline-toggle" data-action="toggle-seed" title="Toggle random / last generated seed" aria-label="Toggle random or last generated seed">${seedToggleSvg}</button></span><input id="seed" type="number" value="${draft.seed}" min="-1" max="2147483647" step="1" /></label>
            </div>
            <div class="field-grid field-grid--2 compact-fields">
              ${this.selectField("sampler", "Sampler", draft.sampler, samplers)}
              ${this.selectField("scheduler", "Scheduler", draft.scheduler, schedulers)}
            </div>
          </section>

          <details class="drawer-panel variation-panel" ${draft.variationSeedEnabled ? "open" : ""}>
            <summary><span><b>Variation seed</b><small>${draft.variationSeedEnabled ? `Seed ${draft.variationSeed} · strength ${draft.variationSeedStrength.toFixed(2)}` : "Seed-guided iteration"}</small></span><label class="tiny-toggle" data-stop-toggle><input id="variation-seed-enabled" type="checkbox" ${draft.variationSeedEnabled ? "checked" : ""}/><span>Use</span></label></summary>
            <div class="drawer-content variation-seed-content">
              <div class="variation-seed-row">
                ${this.numberField("variation-seed", "Variation seed", draft.variationSeed, -1, 2147483647, 1)}
                <div class="variation-seed-actions"><button class="icon-button" data-action="reuse-variation-seed" title="Use latest output seed" aria-label="Use latest output seed">↶</button><button class="icon-button" data-action="randomize-variation-seed" title="Randomize variation seed" aria-label="Randomize variation seed">⟳</button></div>
              </div>
              <label class="range-field"><span>Variation strength <b id="variation-strength-value">${draft.variationSeedStrength.toFixed(2)}</b></span><input id="variation-strength" type="range" min="0" max="1" step="0.01" value="${draft.variationSeedStrength}" /></label>
            </div>
          </details>

          <details class="drawer-panel init-panel" ${this.store.state.ui.initOpen ? "open" : ""}>
            <summary><span><b>Init image</b><small>${draft.initImage ? escapeHtml(draft.initImageName || "Image loaded") : "Text-to-image"}</small></span><label class="tiny-toggle" data-stop-toggle><input id="init-enabled" type="checkbox" ${draft.initImageEnabled ? "checked" : ""} ${draft.initImage ? "" : "disabled"}/><span>Use</span></label></summary>
            <div class="drawer-content">
              <div class="init-card ${draft.initImage ? "has-image" : ""}">
                ${draft.initImage ? `<img src="${escapeHtml(draft.initImage)}" alt="Init image" />` : `<div class="init-empty">No init image selected</div>`}
                <div class="init-actions">
                  <button class="ghost-button" data-action="use-current-init" ${latest ? "" : "disabled"}>Use current</button>
                  <label class="ghost-button file-button">Choose file<input id="init-file" type="file" accept="image/*" hidden /></label>
                  <button class="ghost-button" data-action="clear-init" ${draft.initImage ? "" : "disabled"}>Clear</button>
                </div>
              </div>
              <label class="range-field"><span>Creativity <b id="init-creativity-value">${draft.initImageCreativity.toFixed(2)}</b></span><input id="init-creativity" type="range" min="0" max="1" step="0.01" value="${draft.initImageCreativity}" /></label>
            </div>
          </details>

          ${this.reviewBeforeSaveControlMarkup()}

          <details class="drawer-panel advanced-panel" ${this.store.state.ui.advancedOpen ? "open" : ""}>
            <summary><span><b>Advanced Swarm controls</b><small>Live parameters from this server</small></span><em>${advancedParamCount}</em></summary>
            <div class="drawer-content advanced-fields">${this.advancedGroupsMarkup()}</div>
          </details>
        </aside>

        <section class="panel canvas-workspace">
          <header class="canvas-toolbar">
            <div><span class="panel-kicker">CURRENT OUTPUT</span><b>${this.generating ? escapeHtml(this.generationMessage || "Generating") : latest ? escapeHtml(prettyName(latest.model) || "Swarm output") : "Ready"}</b></div>
            <div>
              <button class="ghost-button" data-inspect-output="${latest?.id ?? ""}" ${latest ? "" : "disabled"}>Inspect</button>
              <button class="ghost-button" data-reuse-output="${latest?.id ?? ""}" ${latest ? "" : "disabled"}>Reuse</button>
              <button class="ghost-button" data-init-output="${latest?.id ?? ""}" ${latest ? "" : "disabled"}>Use as init</button>
              <button class="ghost-button" data-inpaint-output="${latest?.id ?? ""}" ${latest ? "" : "disabled"}>Inpaint</button>
              <button class="ghost-button" data-nav="library">Library</button>
            </div>
          </header>
          <div class="output-stage" id="output-stage">${this.outputStageMarkup()}</div>
          <div class="prompt-dock">
            <div id="generation-review-strip-host">${this.generationApprovalStripMarkup()}</div>
            <div class="prompt-tabs"><span>Prompt</span><button class="ghost-button region-toggle ${hasRegionalPromptContent(draft.regionalPrompt) ? "is-active" : ""}" data-action="open-region-editor" title="Regional prompting">${regionsSvg}<em>Regions${draft.regionalPrompt.regions.length ? ` · ${draft.regionalPrompt.regions.length}` : ""}</em></button><button class="ghost-button syntax-toggle" data-action="toggle-syntax" title="Prompt syntax">${syntaxSvg}<em>Syntax</em></button><button class="ghost-button prompt-clear" data-action="clear-draft" title="Clear prompt">${clearPromptSvg}<em>Clear</em></button></div>
            ${this.syntaxMenuMarkup()}
            <label class="field prompt-positive"><textarea id="prompt" placeholder="Describe the image…">${escapeHtml(draft.prompt)}</textarea></label>
            <label class="field prompt-negative"><span>Negative</span><textarea id="negative-prompt" rows="2" placeholder="Things to avoid…">${escapeHtml(draft.negativePrompt)}</textarea></label>
            <div class="prompt-footer">
              <span>${this.connected ? `${this.models.length} checkpoints · ${this.loras.length} LoRAs · ${this.presets.length} presets` : "Connect to load Swarm metadata"}</span>
              <div><button class="danger-soft" data-action="interrupt" ${this.generating ? "" : "disabled"}>Interrupt</button><button class="primary-button ${reviewPending ? "is-review-locked" : ""}" data-action="generate" ${this.generating || reviewPending ? "disabled" : ""} title="${reviewPending ? "Use Save, Regen, or Discard in the review strip before starting another generation." : ""}">${this.generating ? "Generating…" : reviewPending ? "Review pending" : "Generate image"}<b>✦</b></button></div>
            </div>
          </div>
        </section>

        ${this.modelStackComposerMarkup(true, "tune-rail")}
      </div>`;
  }

  private modelStackComposerMarkup(includeResolution: boolean, className: string): string {
    const draft = this.store.state.draft;
    const checkpoint = this.currentCheckpoint();
    const checkpointFamily = modelFamily(checkpoint) || String(checkpoint?.architecture || checkpoint?.class || "model").trim();
    const available = this.compatibleLoras().filter((lora) => !draft.loras.some((item) => serverModelKey(item.name) === serverModelKey(lora.name)));
    return `
      <aside class="panel ${className} shared-composer">
        <div class="rail-heading"><div><span class="panel-kicker">COMPOSER</span><h2>Model & stack</h2></div></div>
        <label class="field checkpoint-field"><span class="checkpoint-field-label"><span>Checkpoint</span>${checkpointFamily ? `<em>${escapeHtml(checkpointFamily)}</em>` : ""}</span><select id="model">${this.modelOptions(draft.model)}</select></label>

        ${includeResolution ? this.resolutionSectionMarkup() : ""}

        <section class="rail-section lora-section">
          <div class="section-minihead stack-section-head"><span><b>LoRA stack</b><small>${draft.loras.filter((item) => item.enabled).length} enabled · ${draft.loras.length} stacked</small></span><div class="section-icon-actions"><label class="icon-button file-button" title="Import LoRA stack" aria-label="Import LoRA stack">${importSvg}<input id="lora-import" type="file" accept="application/json,.json" hidden /></label><button class="icon-button" data-action="export-lora-stack" title="Export LoRA stack" aria-label="Export LoRA stack" ${draft.loras.length ? "" : "disabled"}>${exportSvg}</button><button class="icon-button" data-action="save-lora-profile" title="Save current LoRA stack" aria-label="Save current LoRA stack" ${draft.loras.length ? "" : "disabled"}>${saveSvg}</button></div></div>
          <label class="stack-profile-picker"><span>Stack</span><select id="lora-profile-select"><option value="">Current stack · choose a saved stack…</option>${this.store.state.loraProfiles.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>`).join("")}</select></label>
          ${draft.loras.length ? `<div class="lora-stack">${draft.loras.map((item, index) => this.loraStackRow(item, index)).join("")}</div>` : `<div class="stack-empty">No LoRAs in this stack yet.</div>`}
          <details class="lora-add-card"><summary>${plusSvg}<span><b>Add LoRA</b><small>${available.length ? "Choose a matching LoRA" : "No matching LoRAs available"}</small></span></summary><div class="lora-picker"><select id="lora-add-select" ${available.length ? "" : "disabled"}><option value="">${available.length ? "Choose a matching LoRA…" : "No matching LoRAs"}</option>${available.map((lora) => this.loraOption(lora)).join("")}</select><button class="secondary-button" data-action="add-lora" ${available.length ? "" : "disabled"}>Add</button></div></details>
          <div class="stack-tools stack-tools--footer"><button class="ghost-button" data-action="open-lora-reorder" ${draft.loras.length > 1 ? "" : "disabled"}>Reorder</button><button class="ghost-button" data-action="clear-loras" ${draft.loras.length ? "" : "disabled"}>Clear</button></div>
        </section>
      </aside>`;
  }

  private presetStackMarkup(): string {
    const active = this.store.state.draft.activePresets;
    if (!active.length) return `<div class="stack-empty stack-empty--compact">No presets selected.</div>`;
    return `<div class="preset-stack">${active.map((title, index) => {
      const preset = this.presets.find((item) => item.title === title);
      const description = preset?.description ? ` title="${escapeHtml(preset.description)}"` : "";
      return `<div class="preset-chip" data-preset-index="${index}" data-preset-title="${escapeHtml(title)}"${description}>
        <span class="preset-chip-title">&lt;preset:${escapeHtml(title)}&gt;</span>
        <div class="preset-chip-actions">
          <button class="icon-button preset-icon-action" data-preset-apply="${index}" title="Apply preset to prompt &amp; controls" aria-label="Apply preset to prompt and controls">${applyPresetSvg}</button>
          <button class="icon-button preset-icon-action" data-preset-edit="${index}" title="Edit preset" aria-label="Edit preset">${settingsRowsSvg}</button>
          <button class="icon-button preset-icon-action" data-preset-remove="${index}" title="Remove preset from stack" aria-label="Remove preset from stack">${trashSvg}</button>
        </div>
      </div>`;
    }).join("")}</div>`;
  }

  private resolutionSectionMarkup(): string {
    const draft = this.store.state.draft;
    const sliderMax = clamp(Math.max(draft.width, draft.height), 256, 2048);
    return `<section class="rail-section resolution-section">
      <div class="resolution-card">
        <div class="section-minihead"><span><b>Resolution</b><small>${draft.width} × ${draft.height}</small></span><button class="link-dimensions ${draft.lockRatio ? "is-active" : ""}" data-action="toggle-ratio-lock" title="${draft.lockRatio ? "Linked: keep the current aspect ratio" : "Unlocked: width and height move independently"}" aria-label="${draft.lockRatio ? "Linked: keep the current aspect ratio" : "Unlocked: width and height move independently"}">${draft.lockRatio ? linkedSvg : unlinkedSvg}</button></div>
        <div class="dimension-link-row">
          ${this.numberField("width", "Width", draft.width, 64, 4096, 64)}
          ${this.numberField("height", "Height", draft.height, 64, 4096, 64)}
        </div>
        ${draft.lockRatio
          ? `<label class="range-field"><span>Size <b id="resolution-value">${Math.max(draft.width, draft.height)}px</b></span><input id="resolution-scale" type="range" min="256" max="2048" step="64" value="${sliderMax}" /></label>`
          : `<div class="resolution-split-sliders"><label class="range-field"><span>Width <b id="resolution-width-value">${draft.width}px</b></span><input id="resolution-width" type="range" min="256" max="2048" step="64" value="${clamp(draft.width, 256, 2048)}" /></label><label class="range-field"><span>Height <b id="resolution-height-value">${draft.height}px</b></span><input id="resolution-height" type="range" min="256" max="2048" step="64" value="${clamp(draft.height, 256, 2048)}" /></label></div>`}
        <div class="ratio-controls"><div class="ratio-row">${ratioChoices.map((ratio) => `<button class="${draft.ratio === ratio ? "is-active" : ""}" data-ratio="${ratio}">${ratio}</button>`).join("")}</div><button class="icon-button ratio-reverse ${draft.ratioReversed ? "is-active" : ""}" data-action="reverse-ratio" title="Reverse ratio" aria-label="Reverse ratio" ${draft.ratio === "1:1" ? "disabled" : ""}>${swapSvg}</button></div>
      </div>
    </section>`;
  }

  private syntaxMenuMarkup(): string {
    const basics = [
      ["Random", "<random:red | blue | purple>"], ["Wildcard", "<wildcard:name>"], ["Preset", "<preset:name>"],
      ["Triggers", "<trigger>"], ["LoRA", "<lora:filename:1>"], ["Parameter", "<param[cfgscale]:4>"],
      ["Macro", "<setmacro[name]:value>\n<macro:name>"], ["Segment", "<segment:face,0.6,0.5>"],
      ["Region", "<region:0,0,0.5,1>"], ["Base", "<base>"], ["Refiner", "<refiner>"],
    ];
    const wildcardItems = this.wildcards.slice(0, 12).map((name) => [`Wildcard: ${name}`, `<wildcard:${name}>`]);
    return `<div class="syntax-menu ${this.syntaxMenuOpen ? "is-open" : ""}"><header><span>Prompt syntax</span><button class="icon-button" data-action="close-syntax" aria-label="Close syntax menu">×</button></header>${[...basics, ...wildcardItems].map(([label, syntax]) => `<button data-syntax="${escapeHtml(syntax)}"><b>${escapeHtml(label)}</b><code>${escapeHtml(syntax)}</code></button>`).join("")}</div>`;
  }

  private advancedParams(): SwarmParamDefinition[] {
    const excluded = new Set(["prompt", "negativeprompt", "model", "width", "height", "steps", "cfgscale", "seed", "variationseed", "variationseedstrength", "sampler", "scheduler", "images", "loras", "loraweights", "initimage", "initimagecreativity"]);
    return this.params
      .filter((param) => {
        const id = String(param.id ?? param.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
        if (!id || excluded.has(id) || param.extra_hidden || param.visible === false) return false;
        return param.advanced === true || /vae|unet|clip|refiner|upscale|sampling|backend|precision|dtype|freeu|teacache/.test(id);
      })
      .sort((a, b) => {
        const idA = String(a.id ?? a.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
        const idB = String(b.id ?? b.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
        const refinerBoost = (id: string) => id === "refinermodel" ? -10000 : id.includes("refiner") ? -5000 : 0;
        return (refinerBoost(idA) + Number(a.priority ?? 0)) - (refinerBoost(idB) + Number(b.priority ?? 0));
      });
  }

  private paramGroupFor(param: SwarmParamDefinition): SwarmParamGroup | undefined {
    const groupKey = String(param.group ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!groupKey) return undefined;
    return this.paramGroups.find((group) => [group.id, group.name]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "") === groupKey));
  }

  private advancedGroupKey(group: SwarmParamGroup | undefined, fallback = "Other"): string {
    return String(group?.id ?? group?.name ?? fallback).toLowerCase().replace(/[^a-z0-9]+/g, "") || "other";
  }

  private advancedGroupRequiresToggle(group: SwarmParamGroup | undefined): boolean {
    if (!group?.toggles) return false;
    const compact = String(group.name ?? group.id ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    return !/initimage/.test(compact);
  }

  private activeExtraParams(draft: GenerationDraft): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    const enabledGroups = new Set(draft.advancedEnabledGroups);
    for (const [key, value] of Object.entries(draft.extraParams)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const param = this.params.find((item) => [item.id, item.name].filter(Boolean).some((name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, "") === normalized));
      // Historical output metadata can contain retired/internal Swarm fields. Do not
      // replay anything the currently connected server does not advertise.
      if (!param) continue;
      const group = this.paramGroupFor(param);
      if (this.advancedGroupRequiresToggle(group) && !enabledGroups.has(this.advancedGroupKey(group, String(param?.group ?? "Other")))) continue;
      output[key] = value;
    }
    for (const group of this.paramGroups.filter((item) => this.advancedGroupRequiresToggle(item))) {
      const groupKey = this.advancedGroupKey(group);
      if (!enabledGroups.has(groupKey)) continue;
      for (const param of this.advancedParams().filter((item) => this.paramGroupFor(item) === group)) {
        const key = String(param.id ?? param.name ?? "");
        if (!key || Object.keys(output).some((existing) => existing.toLowerCase().replace(/[^a-z0-9]+/g, "") === key.toLowerCase().replace(/[^a-z0-9]+/g, ""))) continue;
        const value = param.default;
        if (value !== undefined && value !== null && value !== "") output[key] = value;
      }
    }
    return output;
  }

  private normalizeParamKey(value: unknown): string {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  private isReviewBeforeSaveParamDefinition(param: SwarmParamDefinition | undefined): boolean {
    if (!param) return false;
    return [param.id, param.name].filter(Boolean).some((value) => this.normalizeParamKey(value) === "donotsave");
  }

  private reviewBeforeSaveParamDefinition(): SwarmParamDefinition | undefined {
    return this.params.find((item) => this.isReviewBeforeSaveParamDefinition(item));
  }

  private reviewBeforeSaveEnabled(): boolean {
    const param = this.reviewBeforeSaveParamDefinition();
    const key = String(param?.id ?? param?.name ?? "DoNotSave");
    const current = this.store.state.draft.extraParams[key] ?? this.store.state.draft.extraParams[this.normalizeParamKey(key)];
    return this.truthyGenerationFlag(current);
  }

  private reviewBeforeSaveControlMarkup(): string {
    const param = this.reviewBeforeSaveParamDefinition();
    if (!param) return "";
    const title = escapeHtml(param.description || "Generate ephemerally, then decide whether to discard the render or write it into Swarm history.");
    const clue = `<span class="clue-tip review-before-save-clue" tabindex="0" role="note" data-clue="${title}" aria-label="${title}">?</span>`;
    return `<section class="rail-section review-before-save-section"><div class="section-minihead"><b>Output handling</b><span>Studio workflow</span>${clue}</div><label class="check-row compact-check review-before-save-row"><input id="review-before-save" type="checkbox" ${this.reviewBeforeSaveEnabled() ? "checked" : ""}/><span><b>Review before saving</b><small>Keep renders temporary until you manually approve them.</small></span></label></section>`;
  }

  private advancedGroupsMarkup(): string {
    const params = this.advancedParams().filter((item) => !this.isReviewBeforeSaveParamDefinition(item));
    if (!params.length) return `<p class="helper-copy">No advanced parameters were exposed by this server.</p>`;
    const grouped = new Map<string, { group?: SwarmParamGroup; params: SwarmParamDefinition[] }>();
    for (const param of params) {
      const group = this.paramGroupFor(param);
      const key = String(group?.id ?? group?.name ?? param.group ?? "Other");
      const bucket = grouped.get(key) ?? { group, params: [] };
      bucket.params.push(param);
      grouped.set(key, bucket);
    }
    const entries = [...grouped.entries()].sort(([, a], [, b]) => Number(a.group?.priority ?? 9999) - Number(b.group?.priority ?? 9999));
    return entries.map(([key, bucket]) => {
      const groupTitle = bucket.group?.name || key || "Other";
      const groupKey = this.advancedGroupKey(bucket.group, key);
      const compact = groupTitle.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const refiner = /refiner|refine/.test(compact) || bucket.params.some((param) => /refiner/.test(String(param.id ?? param.name ?? "").toLowerCase()));
      const toggleable = this.advancedGroupRequiresToggle(bucket.group);
      const enabled = !toggleable || this.store.state.draft.advancedEnabledGroups.includes(groupKey);
      const description = bucket.group?.description || (refiner ? "Optional refiner / upscale stage. Enable this group, then choose the model and controls you want." : toggleable ? "Optional feature group. Enable it before its parameters are sent to Swarm." : "Only controls changed in Studio are sent; untouched values stay at Swarm defaults.");
      const toggle = toggleable ? `<label class="advanced-group-switch" data-stop-toggle title="Enable ${escapeHtml(groupTitle)}"><input type="checkbox" data-advanced-group-toggle="${escapeHtml(groupKey)}" ${enabled ? "checked" : ""}/><span></span></label>` : "";
      const clue = `<span class="clue-tip" tabindex="0" role="note" data-stop-toggle data-clue="${escapeHtml(description)}" aria-label="${escapeHtml(description)}">?</span>`;
      return `<details class="advanced-param-group ${enabled ? "is-enabled" : "is-disabled"}" ${refiner ? "open" : ""} data-advanced-group="${escapeHtml(groupKey)}">
        <summary>${clue}<span class="advanced-group-title"><b>${escapeHtml(groupTitle)}</b></span>${toggle}<em>${bucket.params.length}</em></summary>
        <div class="advanced-group-fields">${bucket.params.map((param) => this.advancedParamMarkup(param, !enabled)).join("")}</div>
      </details>`;
    }).join("");
  }

  private advancedParamMarkup(param: SwarmParamDefinition, disabled = false): string {
    const key = String(param.id ?? param.name ?? "");
    const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const stored = this.store.state.draft.extraParams[key] ?? this.store.state.draft.extraParams[normalized];
    const value = stored ?? param.default ?? "";
    let values = Array.isArray(param.values) ? param.values.map((item) => typeof item === "string" ? item : String(item.value ?? item.name ?? item.title ?? "")).filter(Boolean) : [];
    if (normalized === "refinermodel" && !values.length) values = this.models.map((model) => model.name).filter(Boolean);
    const reviewBeforeSave = normalized === "donotsave";
    const label = escapeHtml(reviewBeforeSave ? "Review before saving" : (param.name || param.id || key));
    const title = escapeHtml(reviewBeforeSave
      ? "Generate ephemerally. Studio holds the result for approval and only writes it to Swarm history when you explicitly save it."
      : (param.description || ""));
    const active = stored !== undefined;
    const activeMark = active ? `<i class="param-live-dot" title="Studio will send this value"></i>` : "";
    const disabledAttr = disabled ? "disabled" : "";
    if (values.length) return `<label class="field advanced-param ${active ? "is-overridden" : ""}" title="${title}"><span>${activeMark}${label}</span><select data-extra-param="${escapeHtml(key)}" ${disabledAttr}><option value="">Swarm default</option>${[...new Set([String(value), ...values].filter(Boolean))].map((item) => `<option value="${escapeHtml(item)}" ${String(value) === item && active ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>`;
    if (/bool|boolean/i.test(String(param.type))) return `<label class="check-row compact-check advanced-param ${active ? "is-overridden" : ""}" title="${title}"><input type="checkbox" data-extra-param="${escapeHtml(key)}" ${value === true || value === "true" ? "checked" : ""} ${disabledAttr}/><span>${activeMark}<b>${label}</b></span></label>`;
    if (/int|decimal|double|float|number/i.test(String(param.type))) return `<label class="field advanced-param ${active ? "is-overridden" : ""}" title="${title}"><span>${activeMark}${label}</span><input type="number" data-extra-param="${escapeHtml(key)}" value="${escapeHtml(value)}" ${param.min != null ? `min="${param.min}"` : ""} ${param.max != null ? `max="${param.max}"` : ""} step="${param.step ?? 0.01}" ${disabledAttr}/></label>`;
    return `<label class="field advanced-param ${active ? "is-overridden" : ""}" title="${title}"><span>${activeMark}${label}</span><input data-extra-param="${escapeHtml(key)}" value="${active ? escapeHtml(value) : ""}" placeholder="${escapeHtml(String(param.default ?? "Swarm default"))}" ${disabledAttr}/></label>`;
  }

  private generationApprovalStripMarkup(): string {
    const pending = this.pendingGenerationApprovals[this.pendingGenerationApprovalIndex] ?? null;
    if (!pending || this.generating) return "";
    const pager = this.pendingGenerationApprovals.length > 1
      ? `<div class="generation-review-pager"><button class="icon-button" data-action="previous-generation-approval" ${this.pendingGenerationApprovalIndex <= 0 ? "disabled" : ""} title="Previous unsaved result">‹</button><span>${this.pendingGenerationApprovalIndex + 1}/${this.pendingGenerationApprovals.length}</span><button class="icon-button" data-action="next-generation-approval" ${this.pendingGenerationApprovalIndex >= this.pendingGenerationApprovals.length - 1 ? "disabled" : ""} title="Next unsaved result">›</button></div>`
      : "";
    return `<div class="generation-review-strip" data-generation-approval><span class="generation-review-status"><i></i>Unsaved</span>${pager}<div class="generation-review-actions"><button class="ghost-button" data-action="discard-generation-approval" ${this.pendingGenerationSaveBusy ? "disabled" : ""}>Discard</button><button class="ghost-button" data-action="regenerate-generation-approval" ${this.pendingGenerationSaveBusy ? "disabled" : ""}>Regen</button><button class="primary-button" data-action="save-generation-approval" ${this.pendingGenerationSaveBusy ? "disabled" : ""}>${this.pendingGenerationSaveBusy ? "Saving…" : "Save"}</button></div></div>`;
  }

  private outputStageMarkup(): string {
    const latest = this.store.state.outputs[0];
    const latestImage = latest ? this.outputImageUrl(latest) : "";
    const pending = this.pendingGenerationApprovals[this.pendingGenerationApprovalIndex] ?? null;
    const pendingImage = pending?.objectUrl ?? "";
    const image = this.generating
      ? (this.generationFinalUrl || this.generationPreview || pendingImage || latestImage)
      : (pendingImage || latestImage || this.generationFinalUrl || "");
    const hasImage = Boolean(image);
    const previewing = Boolean(this.generating && !this.generationFinalUrl && this.generationPreview);
    const genSteps = Math.max(1, this.store.state.draft.steps || 1);
    const genStep = clamp(this.generationStep, 0, genSteps);
    const stepPercent = genStep / genSteps;
    const caption = this.generating
      ? `<div class="output-caption"><span>${genStep ? `Step ${genStep} / ${genSteps}` : escapeHtml(this.generationMessage || "Starting…")}</span></div>`
      : pending
        ? `<div class="output-caption"><span>Unsaved result</span><span>${pending.draft.width}×${pending.draft.height}</span><span>seed ${pending.seed}</span></div>`
        : latest
          ? `<div class="output-caption"><span>${escapeHtml(prettyName(latest.model) || "Swarm output")}</span><span>${latest.width}×${latest.height}</span><span>seed ${latest.seed}</span></div>`
          : "";
    return `
      <div class="output-stage-inner ${hasImage ? "has-image" : ""} ${previewing ? "has-preview" : hasImage ? "has-final" : ""}">
        ${hasImage
          ? `<img class="${previewing ? "is-preview" : "is-final"}" ${this.swarmImageAttributes(image)} alt="${this.generating ? "Live generation preview" : "Latest Swarm output"}" />${caption}`
          : this.connectionError
            ? `<div class="connection-empty"><span>⌁</span><b>Studio loaded; Swarm did not.</b><small>${escapeHtml(this.connectionError)}</small><button class="secondary-button" data-action="connect">Reconnect</button></div>`
            : `<div class="empty-orb"><span>✦</span><b>${this.generating ? "Swarm is warming up…" : "Your render appears here."}</b><small>${this.generating ? escapeHtml(this.generationMessage || "Waiting for a preview") : "Choose a checkpoint and generate."}</small></div>`}
        ${this.generating ? `<div class="generation-progress"><i style="width:${stepPercent * 100}%"></i></div>` : ""}
      </div>`;
  }

  private renderGenerationStage(): void {
    const stage = this.root.querySelector<HTMLElement>("#output-stage");
    if (stage) stage.innerHTML = this.outputStageMarkup();
    const reviewHost = this.root.querySelector<HTMLElement>("#generation-review-strip-host");
    if (reviewHost) {
      reviewHost.innerHTML = this.generationApprovalStripMarkup();
      this.bindGenerationApprovalActions(reviewHost);
    }
    const mini = this.root.querySelector<HTMLElement>("[data-generation-mini]");
    if (mini) {
      const steps = Math.max(1, this.inpaintAwaitingResult ? this.inpaintConfigSteps : (this.store.state.draft.steps || 1));
      const step = clamp(this.generationStep, 0, steps);
      const small = mini.querySelector<HTMLElement>(".generation-mini-head small");
      if (small) small.textContent = step ? `Step ${step} / ${steps}` : (this.generationMessage || "Starting…");
      const fill = mini.querySelector<HTMLElement>(".generation-mini-progress i");
      if (fill) fill.style.width = `${(step / steps) * 100}%`;
      const preview = mini.querySelector<HTMLElement>(".generation-mini-preview");
      const image = this.generationPreview || this.generationFinalUrl;
      if (preview && image) preview.innerHTML = `<img ${this.swarmImageAttributes(image)} alt="Current generation preview" />`;
    }
    this.hydrateNativeSwarmImages();
  }

  private refreshGenerationChrome(): void {
    // Generation events must never rebuild Create's prompt DOM. Replacing the textarea while a
    // mobile keyboard is open drops focus/IME state, and even desktop typing can visibly flicker.
    this.renderGenerationStage();
    const generate = this.root.querySelector<HTMLButtonElement>("[data-action='generate']");
    if (generate) {
      const reviewPending = this.pendingGenerationApprovals.length > 0;
      generate.disabled = this.generating || reviewPending;
      generate.classList.toggle("is-review-locked", reviewPending);
      generate.innerHTML = `${this.generating ? "Generating…" : reviewPending ? "Review pending" : "Generate image"}<b>✦</b>`;
      generate.title = reviewPending ? "Use Save, Regen, or Discard in the review strip before starting another generation." : "";
    }
    const interrupt = this.root.querySelector<HTMLButtonElement>("[data-action='interrupt']");
    if (interrupt) interrupt.disabled = !this.generating;

    const latest = this.store.state.outputs[0];
    const outputTitle = this.root.querySelector<HTMLElement>(".canvas-toolbar > div:first-child b");
    if (outputTitle) outputTitle.textContent = this.generating
      ? (this.generationMessage || "Generating")
      : latest ? (prettyName(latest.model) || "Swarm output") : "Ready";

    const inspect = this.root.querySelector<HTMLButtonElement>(".canvas-toolbar [data-inspect-output]");
    const reuse = this.root.querySelector<HTMLButtonElement>(".canvas-toolbar [data-reuse-output]");
    const init = this.root.querySelector<HTMLButtonElement>(".canvas-toolbar [data-init-output]");
    for (const [button, key] of [[inspect, "inspectOutput"], [reuse, "reuseOutput"], [init, "initOutput"]] as const) {
      if (!button) continue;
      button.disabled = !latest;
      if (latest) button.dataset[key] = latest.id;
    }
    const imageCount = this.root.querySelector<HTMLElement>(".utility-readout--small");
    if (imageCount) imageCount.textContent = `${this.store.state.outputs.length} images`;
  }

  private truthyGenerationFlag(value: unknown): boolean {
    if (value === true || value === 1) return true;
    const normalized = String(value ?? "").trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
  }

  private requestUsesReviewBeforeSave(request: SwarmGenerationRequest): boolean {
    return Object.entries(request).some(([key, value]) => key.toLowerCase().replace(/[^a-z0-9]+/g, "") === "donotsave" && this.truthyGenerationFlag(value));
  }

  private sanitizedApprovalRequest(request: SwarmGenerationRequest): SwarmGenerationRequest {
    return Object.fromEntries(Object.entries(request).filter(([key]) => key.toLowerCase().replace(/[^a-z0-9]+/g, "") !== "donotsave")) as unknown as SwarmGenerationRequest;
  }

  private cloneDraftForApproval(draft: GenerationDraft): GenerationDraft {
    return {
      ...draft,
      loras: cloneStack(draft.loras),
      activePresets: [...draft.activePresets],
      regionalPrompt: cloneRegionalPromptDraft(draft.regionalPrompt),
      advancedEnabledGroups: [...draft.advancedEnabledGroups],
      extraParams: { ...draft.extraParams },
    };
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
    if (!match) throw new Error("Swarm returned an ephemeral image in an unsupported format.");
    const mime = match[1] || "application/octet-stream";
    const encoded = match[3] || "";
    if (match[2]) {
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(encoded)], { type: mime });
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Could not encode the temporary result for saving."));
      reader.readAsDataURL(blob);
    });
  }

  private releaseGenerationApproval(item: PendingGenerationApproval): void {
    if (item.objectUrl.startsWith("blob:")) URL.revokeObjectURL(item.objectUrl);
  }

  private clearGenerationApprovals(): void {
    for (const item of this.pendingGenerationApprovals) this.releaseGenerationApproval(item);
    this.pendingGenerationApprovals = [];
    this.pendingGenerationApprovalIndex = 0;
    this.pendingGenerationSaveBusy = false;
  }

  private async queueGenerationApproval(result: SwarmGenerationImage, request: SwarmGenerationRequest, draft: GenerationDraft, responseMetadata = ""): Promise<void> {
    const raw = String(result.image ?? "");
    if (!raw.startsWith("data:image/")) throw new Error("Swarm's Do Not Save result did not return an in-memory image payload.");
    const blob = this.dataUrlToBlob(raw);
    const objectUrl = URL.createObjectURL(blob);
    const metadata = result.metadata || responseMetadata || this.generationResolvedMetadata || "";
    const eventSeed = this.generationResolvedSeed != null ? this.generationResolvedSeed : undefined;
    const seed = this.resolvedSeedFor({ ...result, seed: result.seed ?? eventSeed }, metadata, draft.seed);
    const timing = this.currentGenerationTiming();
    this.pendingGenerationApprovals.push({
      id: createId(),
      objectUrl,
      blob,
      metadata,
      seed,
      request: this.sanitizedApprovalRequest(request),
      draft: this.cloneDraftForApproval(draft),
      ...timing,
    });
  }

  private bindGenerationApprovalActions(root: ParentNode = this.root): void {
    root.querySelector<HTMLElement>("[data-action='previous-generation-approval']")?.addEventListener("click", () => {
      this.pendingGenerationApprovalIndex = Math.max(0, this.pendingGenerationApprovalIndex - 1);
      this.renderGenerationStage();
    });
    root.querySelector<HTMLElement>("[data-action='next-generation-approval']")?.addEventListener("click", () => {
      this.pendingGenerationApprovalIndex = Math.min(this.pendingGenerationApprovals.length - 1, this.pendingGenerationApprovalIndex + 1);
      this.renderGenerationStage();
    });
    root.querySelector<HTMLElement>("[data-action='discard-generation-approval']")?.addEventListener("click", () => {
      this.discardCurrentGenerationApproval(true);
    });
    root.querySelector<HTMLElement>("[data-action='regenerate-generation-approval']")?.addEventListener("click", () => void this.regenerateGenerationApproval());
    root.querySelector<HTMLElement>("[data-action='save-generation-approval']")?.addEventListener("click", () => void this.saveGenerationApproval());
  }

  private discardCurrentGenerationApproval(notify = true): PendingGenerationApproval | null {
    const item = this.pendingGenerationApprovals[this.pendingGenerationApprovalIndex];
    if (!item) return null;
    this.releaseGenerationApproval(item);
    this.pendingGenerationApprovals.splice(this.pendingGenerationApprovalIndex, 1);
    this.pendingGenerationApprovalIndex = Math.min(this.pendingGenerationApprovalIndex, Math.max(0, this.pendingGenerationApprovals.length - 1));
    if (!this.pendingGenerationApprovals.length) {
      this.generationFinalUrl = "";
      this.generationFinalPath = "";
    }
    if (notify) {
      this.notify("Ephemeral result discarded.", "info");
      this.refreshGenerationChrome();
    }
    return item;
  }

  private async regenerateGenerationApproval(): Promise<void> {
    if (this.pendingGenerationSaveBusy || this.generating) return;
    const discarded = this.discardCurrentGenerationApproval(false);
    if (!discarded) return;
    this.notify("Regenerating with the current Create settings.", "info");
    this.refreshGenerationChrome();
    await this.generate(undefined, { allowPendingApprovals: true, focusNewestApproval: true });
  }

  private async saveGenerationApproval(): Promise<void> {
    if (this.pendingGenerationSaveBusy) return;
    const item = this.pendingGenerationApprovals[this.pendingGenerationApprovalIndex];
    if (!item) return;
    this.pendingGenerationSaveBusy = true;
    this.renderGenerationStage();
    try {
      const image = await this.blobToDataUrl(item.blob);
      const response = await this.client.addImageToHistory(image, { ...item.request, images: 1 } as Record<string, unknown>);
      const saved = (response.images ?? []).flatMap((raw, index) => {
        const normalized = normalizeGenerationImage(raw, index);
        return normalized ? [normalized] : [];
      })[0];
      if (!saved?.image) throw new Error("Swarm saved the image but did not return its history path.");
      const path = String(saved.image);
      const metadata = saved.metadata || response.metadata?.[0] || item.metadata || "";
      const url = this.client.imageUrl(this.normalizeSwarmPath(path));
      const record = this.store.addOutput({
        url,
        swarmPath: path,
        swarmSourcePath: this.swarmMutationPath(path),
        prompt: item.draft.prompt,
        sentPrompt: item.request.prompt,
        negativePrompt: item.draft.negativePrompt,
        model: item.draft.model,
        width: item.draft.width,
        height: item.draft.height,
        seed: item.seed,
        metadata,
        request: this.requestSnapshot(item.request, item.draft),
        loras: cloneStack(item.draft.loras),
        presets: [...item.draft.activePresets],
        prepTimeMs: item.prepTimeMs,
        generationTimeMs: item.generationTimeMs,
        totalTimeMs: item.totalTimeMs,
      });
      this.releaseGenerationApproval(item);
      this.pendingGenerationApprovals.splice(this.pendingGenerationApprovalIndex, 1);
      this.pendingGenerationApprovalIndex = Math.min(this.pendingGenerationApprovalIndex, Math.max(0, this.pendingGenerationApprovals.length - 1));
      this.generationFinalUrl = this.pendingGenerationApprovals[this.pendingGenerationApprovalIndex]?.objectUrl || url;
      this.generationFinalPath = this.pendingGenerationApprovals.length ? "" : path;
      this.addLog(`Approved ephemeral render saved to Swarm history: ${path}`, "info", "api");
      this.notify("Approved render saved to Swarm history.", "success");
      if (item.draft.seed === -1 && record.seed < 0) void this.resolveStoredOutputSeed(record, 6).catch(() => undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog(`Could not save approved ephemeral render: ${message}`, "error", "api");
      this.notify(message, "error");
    } finally {
      this.pendingGenerationSaveBusy = false;
      this.refreshGenerationChrome();
    }
  }

  private numberField(id: string, label: string, value: number, min: number, max: number, step: number): string {
    return `<label class="field"><span>${label}</span><input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" /></label>`;
  }

  private selectField(id: string, label: string, value: string, options: string[]): string {
    const normalized = [...new Set([value, ...options].filter(Boolean))];
    if (!normalized.length) normalized.push("");
    return `<label class="field"><span>${label}</span><select id="${id}">${normalized.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option || "Swarm default")}</option>`).join("")}</select></label>`;
  }

  private modelOptions(selected: string): string {
    if (!this.models.length) return `<option value="${escapeHtml(selected)}">${escapeHtml(selected || "Connect to load models")}</option>`;
    return this.models.map((model) => `<option value="${escapeHtml(model.name)}" ${model.name === selected ? "selected" : ""}>${escapeHtml(model.title || prettyName(model.name))}</option>`).join("");
  }

  private presetOptions(selected: string): string {
    const active = new Set(this.store.state.draft.activePresets);
    const available = this.presets.filter((preset) => !active.has(preset.title));
    return `<option value="">${available.length ? "Choose a preset…" : "No more presets"}</option>${available.map((preset) => `<option value="${escapeHtml(preset.title)}" ${preset.title === selected ? "selected" : ""}>${escapeHtml(preset.title)}</option>`).join("")}`;
  }

  private loraOption(lora: SwarmModel): string {
    return `<option value="${escapeHtml(lora.name)}">${escapeHtml(lora.title || prettyName(lora.name))}</option>`;
  }

  private loraStackRow(item: LoraStackItem, _index: number): string {
    const model = this.resolveLora(item);
    const missing = !model && this.connected;
    const preview = model?.preview_image ? this.client.imageUrl(model.preview_image) : "";
    const meta = [model?.author, modelFamily(model)].filter(Boolean).join(" · ") || "Matching LoRA";
    return `
      <div class="lora-stack-row ${item.enabled ? "" : "is-disabled"}" data-lora-row="${escapeHtml(item.id)}">
        <button class="lora-thumb lora-metadata-open" type="button" data-view-model-metadata="${escapeHtml(model?.name || item.name)}" title="View LoRA metadata" aria-label="View metadata for ${escapeHtml(item.title || prettyName(item.name))}">${preview ? `<img ${this.swarmImageAttributes(preview)} alt="" loading="lazy" />` : `<span>◇</span>`}</button>
        <div class="lora-stack-copy"><b>${escapeHtml(item.title || prettyName(item.name))}</b><small>${missing ? "Missing on server" : escapeHtml(meta)}</small></div>
        <label class="trigger-toggle" title="Append this LoRA's Swarm trigger phrase"><input type="checkbox" data-lora-trigger="${escapeHtml(item.id)}" ${item.useTrigger ? "checked" : ""}/><span>Trigger</span></label>
        <label class="weight-field"><span>Weight</span><input type="number" data-lora-weight="${escapeHtml(item.id)}" value="${item.weight}" min="-4" max="4" step="0.05" /></label>
        <div class="stack-row-actions"><button class="icon-button" data-lora-toggle="${escapeHtml(item.id)}" title="${item.enabled ? "Disable this LoRA" : "Enable this LoRA"}" aria-label="${item.enabled ? "Disable this LoRA" : "Enable this LoRA"}">${item.enabled ? eyeSvg : eyeOffSvg}</button><button class="icon-button" data-lora-remove="${escapeHtml(item.id)}" title="Remove this LoRA from the stack" aria-label="Remove this LoRA from the stack">${trashSvg}</button></div>
      </div>`;
  }

  private renderGenerationMini(): string {
    // Create already owns the full live generation stage. The floating monitor is only a
    // companion for continuing to watch a render after navigating elsewhere in Studio.
    if (!this.generating || !this.generationMiniEnabled || this.view === "create") return "";
    const image = this.generationPreview || this.generationFinalUrl;
    const steps = Math.max(1, this.store.state.draft.steps || 1);
    const step = clamp(this.generationStep, 0, steps);
    const percent = step / steps;
    const pos = this.generationMiniX != null && this.generationMiniY != null
      ? `style="left:${Math.round(this.generationMiniX)}px;top:${Math.round(this.generationMiniY)}px;right:auto;bottom:auto"`
      : "";
    return `<aside class="generation-mini" data-generation-mini ${pos}>
      <div class="generation-mini-head" data-generation-mini-drag><span><b>Generating</b><small>${step ? `Step ${step} / ${steps}` : escapeHtml(this.generationMessage || "Starting…")}</small></span><button class="icon-button" data-action="hide-generation-mini" title="Hide generation monitor">×</button></div>
      <div class="generation-mini-preview">${image ? `<img ${this.swarmImageAttributes(image)} alt="Current generation preview" />` : `<div><span>✦</span><small>Waiting for preview…</small></div>`}</div>
      <div class="generation-mini-progress"><i style="width:${percent * 100}%"></i></div>
    </aside>`;
  }

  private libraryDateKey(timestamp: number): string {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private libraryOutputDateKey(output: OutputRecord): string {
    const source = String(output.swarmSourcePath || output.swarmPath || "");
    const match = source.match(/(?:^|\/)(\d{4}-\d{2}-\d{2})(?:\/|$)/);
    return match?.[1] || this.libraryDateKey(output.createdAt);
  }

  private libraryDatePresetRange(preset: string): [string, string] {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const key = (offset: number) => {
      const date = new Date(today);
      date.setDate(date.getDate() + offset);
      return this.libraryDateKey(date.getTime());
    };
    if (preset === "today") return [key(0), key(0)];
    if (preset === "yesterday") return [key(-1), key(-1)];
    if (preset === "7") return [key(-6), key(0)];
    if (preset === "30") return [key(-29), key(0)];
    if (preset === "90") return [key(-89), key(0)];
    return ["", ""];
  }

  private librarySwarmDateFolders(): Array<{ date: string; count: number }> {
    const counts = new Map<string, number>();
    for (const output of this.store.state.outputs) {
      const source = String(output.swarmSourcePath || output.swarmPath || "");
      const match = source.match(/(?:^|\/)(\d{4}-\d{2}-\d{2})(?:\/|$)/);
      if (!match?.[1]) continue;
      counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, count]) => ({ date, count }));
  }

  private libraryBrowseDockActive(): boolean {
    return this.view === "library"
      && this.libraryFiltersOpen
      && this.libraryFiltersDocked
      && !this.store.state.ui.selectedOutputId
      && window.matchMedia("(min-width: 761px)").matches;
  }

  private libraryFilterSummary(): string {
    const bits: string[] = [];
    const folder = this.libraryFolder === "all" ? null : this.store.state.folders.find((item) => item.id === this.libraryFolder);
    if (folder) bits.push(folder.name);
    if (this.libraryDateFrom || this.libraryDateTo) {
      if (this.libraryDateFrom && this.libraryDateFrom === this.libraryDateTo) bits.push(this.libraryDateFrom);
      else bits.push(`${this.libraryDateFrom || "…"} → ${this.libraryDateTo || "…"}`);
    }
    if (this.libraryModelFilter) bits.push(prettyName(this.libraryModelFilter));
    if (this.libraryStarFilter === "starred") bits.push("Favorites");
    if (this.libraryStarFilter === "unstarred") bits.push("Not starred");
    if (this.librarySearch.trim()) bits.push(`“${this.librarySearch.trim()}”`);
    return bits.join(" · ") || "All outputs";
  }

  private renderLibraryFiltersModal(): string {
    if (this.view !== "library" || !this.libraryFiltersOpen || this.store.state.ui.selectedOutputId) return "";
    const docked = this.libraryBrowseDockActive();
    const folderCounts = new Map<string, number>();
    for (const output of this.store.state.outputs) folderCounts.set(output.folderId, (folderCounts.get(output.folderId) ?? 0) + 1);
    folderCounts.set(folderIds.favorites, this.store.state.outputs.filter((output) => output.starred).length);
    const modelCounts = new Map<string, number>();
    for (const output of this.store.state.outputs) if (output.model) modelCounts.set(output.model, (modelCounts.get(output.model) ?? 0) + 1);
    const models = [...modelCounts.entries()].sort((a, b) => b[1] - a[1] || prettyName(a[0]).localeCompare(prettyName(b[0])));
    const dates = this.librarySwarmDateFolders();
    const presets = [
      ["all", "All time"],
      ["today", "Today"],
      ["yesterday", "Yesterday"],
      ["7", "7 days"],
      ["30", "30 days"],
      ["90", "90 days"],
    ] as const;
    const presetButtons = presets.map(([value, label]) => {
      const [from, to] = this.libraryDatePresetRange(value);
      const active = this.libraryDateFrom === from && this.libraryDateTo === to;
      return `<button type="button" class="filter-chip ${active ? "is-active" : ""}" data-library-date-preset="${value}">${label}</button>`;
    }).join("");
    return `<div class="download-backdrop library-browse-backdrop ${docked ? "is-docked" : ""}" data-action="close-library-filters">
      <section class="download-modal library-filter-modal library-browse-modal" role="dialog" aria-modal="${docked ? "false" : "true"}" data-library-filter-dialog>
        <header><div><span class="panel-kicker">LIBRARY</span><h2>Browse outputs</h2><small>${escapeHtml(this.libraryFilterSummary())}</small></div><div class="library-browse-header-actions"><button class="icon-button library-dock-toggle ${docked ? "is-active" : ""}" data-action="toggle-library-dock" title="${docked ? "Undock Browse" : "Dock Browse to the right"}" aria-label="${docked ? "Undock Browse" : "Dock Browse to the right"}">⇥</button><button class="icon-button" data-action="close-library-filters">×</button></div></header>
        <div class="library-browse-scroll">
          <label class="library-search library-search--modal"><span>⌕</span><input id="library-search-modal" value="${escapeHtml(this.librarySearch)}" placeholder="Search prompts, models, paths…" autocomplete="off" /></label>

          <section class="library-filter-section">
            <div class="section-minihead"><b>When</b><span>Quick range or exact dates</span></div>
            <div class="library-filter-chips">${presetButtons}</div>
            <div class="library-date-range"><label class="field"><span>From</span><input id="library-date-from" type="date" value="${escapeHtml(this.libraryDateFrom)}" /></label><label class="field"><span>To</span><input id="library-date-to" type="date" value="${escapeHtml(this.libraryDateTo)}" /></label></div>
          </section>

          <section class="library-filter-section">
            <div class="section-minihead"><b>Filter</b><span>Metadata-backed</span></div>
            <div class="field-grid field-grid--2">
              <label class="field"><span>Checkpoint</span><select id="library-model-filter"><option value="">Any checkpoint</option>${models.map(([model, count]) => `<option value="${escapeHtml(model)}" ${model === this.libraryModelFilter ? "selected" : ""}>${escapeHtml(prettyName(model))} · ${count}</option>`).join("")}</select></label>
              <label class="field"><span>Starred</span><select id="library-star-filter"><option value="all" ${this.libraryStarFilter === "all" ? "selected" : ""}>Any state</option><option value="starred" ${this.libraryStarFilter === "starred" ? "selected" : ""}>Favorites only</option><option value="unstarred" ${this.libraryStarFilter === "unstarred" ? "selected" : ""}>Not starred</option></select></label>
            </div>
          </section>

          <section class="library-filter-section">
            <div class="section-minihead"><b>Studio folders</b><button type="button" class="ghost-button" data-action="new-folder">＋ New</button></div>
            <div class="library-folder-tiles">
              <button type="button" class="library-folder-tile ${this.libraryFolder === "all" ? "is-active" : ""}" data-library-modal-folder="all"><span>✦</span><b>All outputs</b><small>${this.store.state.outputs.length}</small></button>
              ${this.store.state.folders.map((folder) => `<button type="button" class="library-folder-tile ${this.libraryFolder === folder.id ? "is-active" : ""}" data-library-modal-folder="${folder.id}"><span>${folder.id === folderIds.favorites ? "★" : "▱"}</span><b>${escapeHtml(folder.name)}</b><small>${folder.id === folderIds.favorites ? folderCounts.get(folderIds.favorites) ?? 0 : folderCounts.get(folder.id) ?? 0}</small></button>`).join("")}
            </div>
          </section>

          ${dates.length ? `<section class="library-filter-section"><div class="section-minihead"><b>Swarm date folders</b><span>${dates.length} dates indexed</span></div><div class="library-date-folders">${dates.map(({ date, count }) => `<button type="button" class="date-folder-chip ${this.libraryDateFrom === date && this.libraryDateTo === date ? "is-active" : ""}" data-library-date-folder="${date}"><b>${escapeHtml(date)}</b><small>${count}</small></button>`).join("")}</div></section>` : ""}

        </div>
        <div class="form-actions library-browse-actions"><button class="ghost-button" data-action="clear-library-filters">Clear filters</button><button class="primary-button" data-action="apply-library-filters">Apply</button></div>
      </section>
    </div>`;
  }

  private renderLibraryMoveModal(): string {
    if (!this.libraryMoveOpen) return "";
    const choices = this.store.state.folders.filter((folder) => folder.id !== folderIds.favorites);
    return `<div class="download-backdrop" data-action="close-library-move"><section class="download-modal library-move-modal" role="dialog" aria-modal="true" data-library-move-dialog><header><div><span class="panel-kicker">BATCH MOVE</span><h2>Move ${this.librarySelected.size} selected</h2></div><button class="icon-button" data-action="close-library-move">×</button></header><label class="field"><span>Studio folder</span><select id="library-batch-folder">${choices.map((folder) => `<option value="${folder.id}">${escapeHtml(folder.name)}</option>`).join("")}</select></label><div class="form-actions"><button class="ghost-button" data-action="close-library-move">Cancel</button><button class="primary-button" data-action="apply-library-move">Move outputs</button></div></section></div>`;
  }

  private libraryVisibleOutputs(): OutputRecord[] {
    const query = this.librarySearch.trim().toLowerCase();
    return this.store.state.outputs.filter((output) => {
      if (this.libraryFolder !== "all" && this.libraryFolder === folderIds.favorites && !output.starred) return false;
      if (this.libraryFolder !== "all" && this.libraryFolder !== folderIds.favorites && output.folderId !== this.libraryFolder) return false;
      const dateKey = this.libraryOutputDateKey(output);
      if (this.libraryDateFrom && (!dateKey || dateKey < this.libraryDateFrom)) return false;
      if (this.libraryDateTo && (!dateKey || dateKey > this.libraryDateTo)) return false;
      if (this.libraryModelFilter && output.model !== this.libraryModelFilter) return false;
      if (this.libraryStarFilter === "starred" && !output.starred) return false;
      if (this.libraryStarFilter === "unstarred" && output.starred) return false;
      if (query && ![output.prompt, output.sentPrompt, output.model, output.swarmPath, output.swarmSourcePath, output.negativePrompt].join(" ").toLowerCase().includes(query)) return false;
      return true;
    });
  }

  private renderLibrarySelectionRail(): string {
    if (this.view !== "library" || !this.librarySelectMode || this.librarySyncing) return "";
    const selectedCount = this.librarySelected.size;
    const outputs = this.libraryVisibleOutputs().slice(0, this.libraryRenderLimit);
    return `<div class="library-selection-rail ${this.libraryBatchBusy ? "is-busy" : ""}"><span><b>${selectedCount}</b> selected${this.libraryBatchBusy ? `<small>Working…</small>` : ""}</span><div class="library-selection-actions"><button class="ghost-button" data-action="select-mounted-outputs" ${outputs.length && !this.libraryBatchBusy ? "" : "disabled"}>Select shown</button><button class="ghost-button" data-action="favorite-selected-outputs" ${selectedCount && !this.libraryBatchBusy ? "" : "disabled"}>★ Favorite</button><button class="ghost-button" data-action="unfavorite-selected-outputs" ${selectedCount && !this.libraryBatchBusy ? "" : "disabled"}>☆ Unfavorite</button><button class="ghost-button" data-action="open-library-move" ${selectedCount && !this.libraryBatchBusy ? "" : "disabled"}>Move</button><button class="danger-soft" data-action="delete-selected-outputs" ${selectedCount && !this.libraryBatchBusy ? "" : "disabled"}>Delete</button><button class="ghost-button" data-action="clear-output-selection" ${selectedCount && !this.libraryBatchBusy ? "" : "disabled"}>Clear</button><button class="secondary-button" data-action="finish-library-selection" ${this.libraryBatchBusy ? "disabled" : ""}>Done</button></div></div>`;
  }

  private renderLibrary(): string {
    const syncLabel = this.librarySyncing
      ? (this.librarySyncTotal > 0 ? `${this.librarySyncPhase || "Syncing"} ${this.librarySyncDone}/${this.librarySyncTotal}` : this.librarySyncPhase || "Reading Swarm history…")
      : "Sync Swarm history";
    if (this.librarySyncing) {
      const progress = this.librarySyncTotal > 0 ? clamp(this.librarySyncDone / Math.max(1, this.librarySyncTotal), 0, 1) : 0;
      return `<section class="library-sync-screen"><div class="library-sync-card"><span class="panel-kicker">SWARM HISTORY</span><h2>Indexing the archive</h2><p>The Library grid is temporarily unmounted so WebView can spend its memory on reconciliation instead of rendering thousands of cards.</p><div class="library-sync-meter"><i data-library-sync-progress style="width:${progress * 100}%"></i></div><b data-library-sync-phase>${escapeHtml(syncLabel)}</b><small>You can leave this page; Studio will finish the sync without mounting the Library grid.</small></div></section>`;
    }

    const allOutputs = this.libraryVisibleOutputs();
    const outputs = allOutputs.slice(0, this.libraryRenderLimit);
    const selectedCount = this.librarySelected.size;
    const remaining = Math.max(0, allOutputs.length - outputs.length);
    const syncDisabled = !this.connected;
    return `<div class="library-layout library-layout--single"><section class="library-main ${this.librarySelectMode ? "is-selecting" : ""}">
      <div class="library-toolbar library-toolbar--simple">
        <div class="library-toolbar-count"><b>${allOutputs.length}</b> matching output${allOutputs.length === 1 ? "" : "s"}<small>${outputs.length < allOutputs.length ? ` · ${outputs.length} mounted` : ""}${selectedCount ? ` · ${selectedCount} selected` : ""}</small></div>
        <div class="library-toolbar-actions"><button class="secondary-button" data-action="open-library-filters">⌕ Browse</button><button class="icon-button library-select-toggle ${this.librarySelectMode ? "is-active" : ""}" data-action="toggle-library-selection" title="${this.librarySelectMode ? "Exit batch selection" : "Batch select outputs"}" aria-label="${this.librarySelectMode ? "Exit batch selection" : "Batch select outputs"}">${batchSelectSvg}<small>${this.librarySelectMode ? selectedCount : "Select"}</small></button><button class="secondary-button" data-action="sync-swarm-history" ${syncDisabled ? "disabled" : ""}>${escapeHtml(syncLabel)}</button><button class="primary-button" data-nav="create">Generate</button></div>
      </div>
      <div class="library-filter-readout"><span>${escapeHtml(this.libraryFilterSummary())}</span>${this.librarySelectMode ? `<b>Selection active · Shift-click for ranges</b>` : ""}</div>
      ${outputs.length ? `<div class="image-grid ${this.librarySelectMode ? "is-selecting" : ""}">${outputs.map((output) => this.outputCard(output.id)).join("")}</div>${remaining ? `<div class="library-load-more"><button class="secondary-button" data-action="load-more-library">Load ${Math.min(240, remaining)} more</button><small>${remaining} still indexed, not mounted</small></div><div class="library-scroll-runway" aria-hidden="true"></div>` : ""}` : `<div class="panel empty-state"><span>▦</span><h2>No outputs match.</h2><p>Open Browse to change folders, dates, checkpoint, or search.</p><div><button class="secondary-button" data-action="open-library-filters">Browse</button><button class="secondary-button" data-action="sync-swarm-history" ${syncDisabled ? "disabled" : ""}>${escapeHtml(syncLabel)}</button></div></div>`}
    </section></div>`;
  }

  private outputCard(id: string): string {
    const output = this.store.state.outputs.find((item) => item.id === id);
    if (!output) return "";
    return `
      <article class="image-card ${this.librarySelected.has(output.id) ? "is-selected" : ""}" data-output-card="${output.id}">
        ${this.librarySelectMode ? `<button class="output-select-check" data-select-output="${output.id}" aria-label="${this.librarySelected.has(output.id) ? "Deselect" : "Select"} output">${this.librarySelected.has(output.id) ? "✓" : ""}</button>` : ""}
        <div class="image-card-media-wrap"><button class="image-card-media" ${this.librarySelectMode ? `data-select-output="${output.id}"` : `data-inspect-output="${output.id}"`}><img ${this.swarmImageAttributes(this.outputImageUrl(output))} alt="${escapeHtml(output.prompt || "Swarm output")}" loading="lazy" /></button>${this.librarySelectMode ? "" : `<button class="star-button ${output.starred ? "is-starred" : ""}" data-star="${output.id}" title="${output.starred ? "Remove from Swarm Starred" : "Add to Swarm Starred"}" aria-label="${output.starred ? "Remove from Swarm Starred" : "Add to Swarm Starred"}">${heartSvg}</button>`}</div>
        <div class="image-card-body">
          <b>${escapeHtml(prettyName(output.model) || "Swarm output")}</b>
          <p>${escapeHtml(output.prompt || output.sentPrompt || "No prompt recorded")}</p>
          <div class="card-meta"><span>${output.width || "?"}×${output.height || "?"}</span><span>seed ${output.seed ?? "?"}</span><span>${output.loras?.length ?? 0} LoRAs</span></div>
          ${this.librarySelectMode ? `<div class="card-actions image-card-actions image-card-actions--placeholder" aria-hidden="true"><div class="image-card-action-buttons"><button class="icon-button image-card-action" disabled>${reuseSvg}</button><button class="icon-button image-card-action" disabled>${initImageSvg}</button><button class="icon-button image-card-action" disabled>${inpaintBrushSvg}</button><button class="icon-button image-card-action danger-icon" disabled>${trashSvg}</button></div><label class="image-card-folder-select">${folderSvg}<select disabled tabindex="-1">${this.store.state.folders.filter((folder) => folder.id !== folderIds.favorites).map((folder) => `<option ${folder.id === output.folderId ? "selected" : ""}>${escapeHtml(folder.name)}</option>`).join("")}</select></label></div>` : `<div class="card-actions image-card-actions"><div class="image-card-action-buttons"><button class="icon-button image-card-action" data-reuse-output="${output.id}" title="Reuse settings" aria-label="Reuse settings">${reuseSvg}</button><button class="icon-button image-card-action" data-init-output="${output.id}" title="Use as init image" aria-label="Use as init image">${initImageSvg}</button><button class="icon-button image-card-action" data-inpaint-output="${output.id}" title="Inpaint" aria-label="Inpaint">${inpaintBrushSvg}</button><button class="icon-button image-card-action danger-icon" data-delete-output="${output.id}" title="Delete from Swarm history" aria-label="Delete from Swarm history">${trashSvg}</button></div><label class="image-card-folder-select" title="Move output to folder">${folderSvg}<select data-move-output="${output.id}" aria-label="Move output to folder">${this.store.state.folders.filter((folder) => folder.id !== folderIds.favorites).map((folder) => `<option value="${folder.id}" ${folder.id === output.folderId ? "selected" : ""}>${escapeHtml(folder.name)}</option>`).join("")}</select></label></div>`}
        </div>
      </article>`;
  }

  private renderIdentities(): string {
    const draft = this.store.state.draft;
    const editing = this.store.state.identities.find((item) => item.id === this.identityEditingId);
    const source = editing ?? ({ name: "", folderId: folderIds.unfiled, positivePrompt: "", negativePrompt: "", model: "", notes: "", loraStack: [] as LoraStackItem[], avatarUrl: "" } as IdentityRecord);
    return `
      <div class="identity-toolbar"><div><span class="panel-kicker">LIBRARY</span><b>${this.store.state.identities.length} identities</b></div><button class="primary-button" data-action="new-identity">＋ New identity</button></div>
      <div class="identity-layout ${this.store.state.ui.identityEditorOpen ? "editor-open" : ""}">
        <section class="panel identity-editor">
          <div class="panel-heading"><div><span class="panel-kicker">PROFILE</span><h2>${editing ? `Edit ${escapeHtml(editing.name)}` : "New identity"}</h2></div><button class="icon-button identity-editor-close" data-action="close-identity-editor">×</button></div>
          <form id="identity-form">
            <input type="hidden" name="id" value="${escapeHtml(editing?.id || "")}" />
            <input type="hidden" name="avatarUrl" value="${escapeHtml(source.avatarUrl || "")}" />
            <div class="identity-editor-avatar">${source.avatarUrl ? `<img src="${escapeHtml(source.avatarUrl)}" alt="" />` : `<span>${escapeHtml((source.name || "?").slice(0, 1).toUpperCase())}</span>`}<div><button type="button" class="secondary-button" data-action="choose-identity-picture">Choose picture</button>${source.avatarUrl ? `<button type="button" class="ghost-button" data-action="clear-identity-picture">Remove</button>` : ""}</div><input id="identity-picture-input" type="file" accept="image/*" hidden /></div>
            <div class="field-grid field-grid--2">
              <label class="field"><span>Name</span><input name="name" required value="${escapeHtml(source.name)}" placeholder="Hugo, Lycaon, Scenery…" /></label>
              <label class="field"><span>Folder</span><select name="folderId">${this.identityFolderOptions(source.folderId)}</select></label>
            </div>
            <label class="field"><span>Base positive</span><textarea name="positivePrompt" rows="5" placeholder="Reusable subject and style tags…">${escapeHtml(source.positivePrompt)}</textarea></label>
            <label class="field"><span>Base negative</span><textarea name="negativePrompt" rows="3" placeholder="Identity-specific exclusions…">${escapeHtml(source.negativePrompt)}</textarea></label>
            <label class="field"><span>Default checkpoint</span><select name="model"><option value="">Follow current</option>${this.modelOptions(source.model)}</select></label>
            <label class="check-row"><input type="checkbox" name="bindLoras" ${editing ? (source.loraStack.length ? "checked" : "") : (draft.loras.length ? "checked" : "")}/><span><b>Bind LoRA stack</b><small>${editing ? source.loraStack.length : draft.loras.length} LoRA${(editing ? source.loraStack.length : draft.loras.length) === 1 ? "" : "s"} currently attached.</small></span></label>
            <label class="field"><span>Notes</span><textarea name="notes" rows="3" placeholder="Reference notes, clothing rules, trigger reminders…">${escapeHtml(source.notes)}</textarea></label>
            <button class="primary-button" type="submit">${editing ? "Save changes" : "Save identity"} <b>♡</b></button>
          </form>
        </section>
        <section class="identity-list">
          ${this.store.state.identities.length ? this.store.state.identities.map((identity) => this.identityCard(identity)).join("") : `<div class="panel empty-state"><span>♡</span><h2>No identities yet.</h2><p>Save reusable prompts, a checkpoint, notes, and an identity-bound LoRA stack.</p></div>`}
        </section>
      </div>`;
  }

  private identityFolderOptions(selected = folderIds.unfiled): string {
    return this.store.state.folders
      .filter((folder) => folder.id !== folderIds.favorites)
      .map((folder) => `<option value="${folder.id}" ${folder.id === selected ? "selected" : ""}>${escapeHtml(folder.name)}</option>`)
      .join("");
  }

  private identityCard(identity: IdentityRecord): string {
    const folder = this.store.state.folders.find((item) => item.id === identity.folderId)?.name ?? "Unfiled";
    return `
      <article class="panel identity-card">
        <div class="identity-avatar">${identity.avatarUrl ? `<img src="${escapeHtml(identity.avatarUrl)}" alt="" />` : escapeHtml(identity.name.slice(0, 1).toUpperCase())}</div>
        <div class="identity-card-copy"><span class="tiny-tag">${escapeHtml(folder)}</span><h3>${escapeHtml(identity.name)}</h3><p>${escapeHtml(identity.positivePrompt || "No base prompt yet.")}</p><div class="card-meta"><span>${escapeHtml(identity.model ? prettyName(identity.model) : "Current checkpoint")}</span><span>${identity.loraStack.length} LoRA${identity.loraStack.length === 1 ? "" : "s"}</span></div></div>
        <div class="identity-card-actions"><button class="secondary-button" data-apply-identity="${identity.id}">Use in Create</button><details class="identity-menu"><summary class="icon-button" title="Identity actions">…</summary><div><button data-edit-identity="${identity.id}">Edit</button><button data-picture-identity="${identity.id}">Picture</button><button class="danger-soft" data-delete-identity="${identity.id}">Delete</button></div></details><input type="file" accept="image/*" hidden data-identity-picture-input="${identity.id}" /></div>
      </article>`;
  }

  private normalizeLoraPath(value: string): string {
    return String(value ?? "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
  }

  private loraFolderOf(modelName: string): string {
    const normalized = this.normalizeLoraPath(modelName);
    const parts = normalized.split("/");
    parts.pop();
    return parts.join("/");
  }

  private loraLeafName(modelName: string): string {
    const normalized = this.normalizeLoraPath(modelName);
    return normalized.split("/").pop() ?? normalized;
  }

  private loraFolderPaths(): string[] {
    const folders = new Set<string>();
    for (const model of this.loras) {
      const folder = this.loraFolderOf(model.name);
      if (!folder) continue;
      const parts = folder.split("/");
      for (let i = 1; i <= parts.length; i += 1) folders.add(parts.slice(0, i).join("/"));
    }
    return [...folders].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }

  private loraInCurrentFolder(model: SwarmModel): boolean {
    const current = this.normalizeLoraPath(this.loraFolderPath);
    return this.loraFolderOf(model.name) === current;
  }

  private loraFolderTreeMarkup(): string {
    const folders = this.loraFolderPaths();
    const countIn = (folder: string) => this.loras.filter((model) => this.loraFolderOf(model.name) === folder).length;
    const rows = folders.map((folder) => {
      const depth = folder.split("/").length - 1;
      const leaf = folder.split("/").pop() ?? folder;
      return `<button class="lora-tree-row ${this.loraFolderPath === folder ? "is-active" : ""}" style="--tree-depth:${depth}" data-lora-folder="${escapeHtml(folder)}"><span class="lora-tree-branch">⌞</span><span>${escapeHtml(leaf)}</span><small>${countIn(folder)}</small></button>`;
    }).join("");
    return `<div class="lora-folder-popover ${this.loraFolderTreeOpen ? "is-open" : ""}">
      <div class="lora-folder-popover-head"><div><span class="panel-kicker">SWARM FOLDERS</span><b>${escapeHtml(this.loraFolderPath || "LoRA root")}</b></div><button class="icon-button" data-action="close-lora-tree" aria-label="Close folder navigator">×</button></div>
      <div class="lora-folder-tree"><button class="lora-tree-row ${!this.loraFolderPath ? "is-active" : ""}" data-lora-folder=""><span class="lora-tree-root">⌂</span><span>LoRA root</span><small>${countIn("")}</small></button>${rows || `<div class="lora-tree-empty">No subfolders indexed yet.</div>`}</div>
    </div>`;
  }

  private renderLoraMoveModal(): string {
    if (!this.loraMoveModalOpen) return "";
    const selected = [...this.loraBatchSelected];
    const folders = this.loraFolderPaths();
    const options = ["", ...folders].map((folder) => `<option value="${escapeHtml(folder)}" ${folder === this.loraMoveDestination ? "selected" : ""}>${escapeHtml(folder || "LoRA root")}</option>`).join("");
    return `<div class="download-backdrop lora-organize-backdrop" data-action="close-lora-move">
      <section class="download-modal lora-move-modal" role="dialog" aria-modal="true" aria-labelledby="lora-move-title" data-lora-move-dialog>
        <header><div><span class="panel-kicker">ORGANIZE LORAS</span><h2 id="lora-move-title">Move ${selected.length} selected</h2></div><button class="icon-button" data-action="close-lora-move" aria-label="Close">×</button></header>
        <form id="lora-move-form">
          <label class="field"><span>Existing folder</span><select id="lora-move-folder-select">${options}</select></label>
          <label class="field"><span>Or type a folder path</span><div class="lora-folder-create-row"><input id="lora-move-folder-input" value="${escapeHtml(this.loraMoveDestination)}" placeholder="characters/zelda" autocomplete="off" /><button type="button" class="secondary-button" data-action="stage-lora-folder">Create folder</button></div><small>Relative to Swarm's LoRA model root. Nested folders are materialized when the selected files move there.</small></label>
          <div class="lora-move-preview"><span>Moving</span><b>${selected.length} LoRA${selected.length === 1 ? "" : "s"}</b><small>${selected.slice(0, 4).map((name) => escapeHtml(prettyName(name))).join(" · ")}${selected.length > 4 ? ` · +${selected.length - 4} more` : ""}</small></div>
          <div class="form-actions"><button type="button" class="ghost-button" data-action="close-lora-move">Cancel</button><button type="submit" class="primary-button" ${this.loraMoveBusy || !selected.length ? "disabled" : ""}>${this.loraMoveBusy ? "Moving…" : "Move files"}</button></div>
        </form>
      </section>
    </div>`;
  }

  private renderLoraDeleteModal(): string {
    if (!this.loraDeleteModalOpen) return "";
    const selected = [...this.loraBatchSelected];
    return `<div class="download-backdrop lora-organize-backdrop" data-action="close-lora-delete">
      <section class="download-modal lora-delete-modal" role="dialog" aria-modal="true" aria-labelledby="lora-delete-title" data-lora-delete-dialog>
        <header><div><span class="panel-kicker">DELETE LORAS</span><h2 id="lora-delete-title">Delete ${selected.length} selected?</h2></div><button class="icon-button" data-action="close-lora-delete" aria-label="Close">×</button></header>
        <div class="lora-delete-body">
          <p>This permanently removes the selected model files from Swarm storage. This cannot be undone from Studio.</p>
          <div class="lora-move-preview lora-delete-preview"><span>Deleting</span><b>${selected.length} LoRA${selected.length === 1 ? "" : "s"}</b><small>${selected.slice(0, 5).map((name) => escapeHtml(prettyName(name))).join(" · ")}${selected.length > 5 ? ` · +${selected.length - 5} more` : ""}</small></div>
        </div>
        <div class="form-actions"><button type="button" class="ghost-button" data-action="close-lora-delete">Cancel</button><button type="button" class="danger-soft lora-delete-confirm" data-action="confirm-lora-delete" ${this.loraDeleteBusy || !selected.length ? "disabled" : ""}>${this.loraDeleteBusy ? "Deleting…" : "Delete files"}</button></div>
      </section>
    </div>`;
  }

  private renderStackReorderModal(kind: "preset" | "lora"): string {
    const isPreset = kind === "preset";
    const open = isPreset ? this.presetReorderModalOpen : this.loraReorderModalOpen;
    if (!open) return "";
    const presetItems = this.store.state.draft.activePresets.map((title, index) => ({
      id: String(index),
      title,
      subtitle: this.presets.find((item) => item.title === title)?.description || "Preset token will be sent in this order during generation.",
      meta: "preset",
    }));
    const loraItems = this.store.state.draft.loras.map((item) => ({
      id: item.id,
      title: item.title || prettyName(item.name),
      subtitle: item.name,
      meta: `${item.enabled ? "enabled" : "disabled"} · weight ${item.weight.toFixed(2)}${item.useTrigger ? " · trigger" : ""}`,
    }));
    const items = isPreset ? presetItems : loraItems;
    const title = isPreset ? "Reorder preset stack" : "Reorder LoRA stack";
    const kicker = isPreset ? "PRESETS" : "LORAS";
    const closeAction = isPreset ? "close-preset-reorder" : "close-lora-reorder";
    return `<div class="download-backdrop stack-reorder-backdrop" data-action="${closeAction}">
      <section class="download-modal stack-reorder-modal" role="dialog" aria-modal="true" aria-labelledby="stack-reorder-title-${kind}" data-stack-reorder-dialog>
        <header><div><span class="panel-kicker">${kicker}</span><h2 id="stack-reorder-title-${kind}">${title}</h2></div><button class="icon-button" data-action="${closeAction}" aria-label="Close">×</button></header>
        <p class="helper-copy">Drag the rows into whatever order sparks joy. The stack updates the moment you drop.</p>
        <div class="stack-reorder-list" data-stack-reorder-list="${kind}">${items.map((item, index) => `<div class="stack-reorder-item" draggable="true" data-stack-item="${kind}" data-stack-index="${index}" data-stack-id="${escapeHtml(item.id)}"><span class="stack-grip stack-grip--large">${gripSvg}</span><div class="stack-reorder-copy"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.subtitle)}</small></div><em>${escapeHtml(item.meta)}</em></div>`).join("") || `<div class="stack-empty stack-empty--compact">Nothing to reorder.</div>`}</div>
        <div class="form-actions"><button type="button" class="ghost-button" data-action="${closeAction}">Done</button></div>
      </section>
    </div>`;
  }

  private renderModels(): string {
    const checkpoint = this.currentCheckpoint();
    const matching = this.compatibleLoras();
    const orphaned = this.orphanedLoras();
    const sourceLoras = this.loraOrphanMode ? orphaned : (this.loraShowNonMatching ? this.loras : matching);
    const browsedLoras = sourceLoras.filter((model) => this.loraInCurrentFolder(model));
    const search = this.loraSearch.trim().toLowerCase();
    const matchesSearch = (model: SwarmModel) => !search || [model.name, model.title, model.author, model.description, model.trigger_phrase, ...(model.tags ?? [])].filter(Boolean).join(" ").toLowerCase().includes(search);
    const visibleCount = browsedLoras.filter(matchesSearch).length;
    const selectedCount = this.loraBatchSelected.size;
    const folderLabel = this.loraFolderPath || "LoRA root";
    return `
      <div class="models-composer-layout">
        <div class="models-layout ${this.loraBatchMode ? "is-lora-selecting" : ""}">
          <section class="panel inventory-summary">
            <div><span>CHECKPOINTS</span><b>${this.models.length}</b></div>
            <div><span>SERVER LORAS</span><b>${this.loras.length}</b></div>
            <div><span>MATCHING</span><b>${matching.length}</b></div>
            <div><span>ORPHANED</span><b>${orphaned.length}</b></div>
            <div class="inventory-checkpoint"><span>${this.loraOrphanMode ? "LORA VIEW" : "CURRENT CHECKPOINT"}</span><b>${this.loraOrphanMode ? "Orphaned LoRAs" : escapeHtml(checkpoint?.title || prettyName(this.store.state.draft.model) || "None")}</b></div>
            <button class="secondary-button" data-action="refresh-models">Refresh</button>
          </section>
          <section class="checkpoint-section ${this.checkpointsOpen ? "is-open" : ""}">
            <button class="section-heading checkpoint-collapse" data-action="toggle-checkpoints" aria-expanded="${this.checkpointsOpen}"><div><span class="panel-kicker">MODELS · ${this.models.length}</span><h2>Checkpoints</h2></div><span>${this.checkpointsOpen ? "⌃" : "⌄"}</span></button>
            ${this.checkpointsOpen ? ((this.models.length || this.loras.length) ? `<div class="model-grid"><article class="model-card orphan-model-card ${this.loraOrphanMode ? "is-active" : ""}"><div class="model-preview orphan-model-preview"><span>∅</span></div><div class="model-card-copy"><span class="tiny-tag">LIBRARY VIEW</span><h3>Orphaned LoRAs</h3><p>${orphaned.length} LoRA${orphaned.length === 1 ? "" : "s"} match none of the installed checkpoints.</p></div><button class="ghost-button" data-action="show-orphaned-loras">${this.loraOrphanMode ? "Viewing" : "Browse"}</button></article>${this.models.map((model) => this.modelCard(model, false)).join("")}</div>` : this.inventoryEmpty("Connect to browse checkpoints directly from SwarmUI.")) : ""}
          </section>
          <section class="lora-library-section">
            <div class="section-heading lora-library-heading"><div><span class="panel-kicker">${this.loraOrphanMode ? "ORPHANED LORAS" : this.loraShowNonMatching ? "SERVER LORAS" : "MATCHING LORAS"} · ${escapeHtml(folderLabel)}</span><h2>${this.loraOrphanMode ? "No installed checkpoint match" : escapeHtml(checkpoint?.title || prettyName(this.store.state.draft.model) || "Select a checkpoint")}</h2></div></div>
            <div class="lora-library-toolbar panel">
              <div class="lora-library-search-row">
                <label class="library-search"><span>⌕</span><input id="lora-library-search" value="${escapeHtml(this.loraSearch)}" placeholder="Search this folder…" autocomplete="off" /></label>
                ${this.loraOrphanMode ? `<button class="lora-match-toggle lora-orphan-pill" data-action="exit-orphaned-loras" title="Return to the current checkpoint"><span>∅ Orphaned only</span></button>` : `<label class="lora-match-toggle" title="Show every indexed LoRA, including incompatible or incorrectly classified models"><input id="lora-show-nonmatching" type="checkbox" ${this.loraShowNonMatching ? "checked" : ""} /><span>Show non-matching</span></label>`}
                <div class="lora-library-view-tools">
                  <button class="icon-button mobile-lora-view-toggle" data-action="toggle-lora-view" title="${this.loraMobileGrid ? "Switch to list view" : "Switch to grid view"}" aria-label="${this.loraMobileGrid ? "Switch to list view" : "Switch to grid view"}">${this.loraMobileGrid ? "☷" : "▦"}<small>${this.loraMobileGrid ? "List" : "Grid"}</small></button>
                </div>
              </div>
              <div class="lora-library-actions">
                <button class="secondary-button lora-organizer-action" data-action="toggle-lora-tree" title="Browse Swarm LoRA folders">${folderTreeSvg}<span>Folders</span></button>
                <button class="secondary-button lora-organizer-action ${this.loraBatchMode ? "is-active" : ""}" data-action="toggle-lora-batch" title="${this.loraBatchMode ? "Finish organizing LoRAs" : "Select and move LoRAs into folders"}">${batchSelectSvg}<span>${this.loraBatchMode ? "Done" : "Organize"}</span>${this.loraBatchMode ? `<b>${selectedCount}</b>` : ""}</button>
                <button class="secondary-button" data-nav="civitai">⌕ Search CivitAI</button>
                <button class="primary-button" data-action="open-lora-download" ${this.connected ? "" : "disabled"}>↓ URL download</button>
              </div>
            </div>
            <div class="lora-library-browser">
              ${this.loraFolderTreeMarkup()}
              ${browsedLoras.length ? `<div class="model-grid ${this.loraMobileGrid ? "lora-view-grid" : "lora-view-list"} ${this.loraMobileGrid && this.loraGridSize === "compact" ? "lora-grid-compact" : ""} ${this.loraBatchMode ? "is-batch-mode" : ""}" id="lora-library-grid">${browsedLoras.map((model) => this.modelCard(model, true, !matchesSearch(model))).join("")}</div><div id="lora-search-empty" class="panel compact-empty" ${visibleCount ? "hidden" : ""}>No ${this.loraOrphanMode ? "orphaned" : this.loraShowNonMatching ? "server" : "matching"} LoRAs match that search in ${escapeHtml(folderLabel)}.</div>` : this.inventoryEmpty(`No ${this.loraOrphanMode ? "orphaned" : this.loraShowNonMatching ? "server" : "matching"} LoRAs in ${folderLabel}.`)}
            </div>
          </section>
        </div>
        ${this.modelStackComposerMarkup(false, "composer-sidebar")}
      </div>
    `;
  }

  private civitaiCurrentFamily(): string {
    return modelFamily(this.currentCheckpoint()) || "";
  }

  private civitaiBaseModelFilterForFamily(family = this.civitaiCurrentFamily()): string {
    // CivitAI's live model endpoint accepts baseModels directly. Use exact, conservative mappings
    // where Studio can name the upstream family confidently; otherwise retain local compatibility
    // filtering and cursor-scan the upstream result set.
    const mappings: Record<string, string> = {
      anima: "Anima",
      krea: "Flux.1 Krea",
      illustrious: "Illustrious",
      pony: "Pony",
      sdxl: "SDXL 1.0",
      sd3: "SD 3",
      sd2: "SD 2.1",
      sd1: "SD 1.5",
    };
    return mappings[family] ?? "";
  }

  private civitaiInitialRequestUrl(): string {
    const query = new URLSearchParams({
      limit: "100",
      types: "LORA",
      sort: this.civitaiSort,
      period: this.civitaiPeriod,
      primaryFileOnly: "true",
      nsfw: this.civitaiIncludeNsfw ? "true" : "false",
    });
    if (this.civitaiQuery.trim()) query.set("query", this.civitaiQuery.trim());
    const upstreamBaseModel = this.civitaiCompatibleOnly ? this.civitaiBaseModelFilterForFamily() : "";
    if (upstreamBaseModel) query.set("baseModels", upstreamBaseModel);
    this.civitaiServerFilteredBaseModel = upstreamBaseModel;
    // Deliberately no `page=1`: CivitAI switches query searches to cursor pagination and rejects
    // requests that combine `query` with `page`. Subsequent requests follow metadata.nextPage.
    return `${CIVITAI_ORIGIN}/api/v1/models?${query.toString()}`;
  }

  private civitaiNormalizedNextUrl(payload: CivitaiSearchResponse, requestUrl: string): string {
    const cursor = payload.metadata?.nextCursor;
    // Query searches are cursor-only on the live API. Prefer the explicit cursor even if a stale
    // nextPage formatter tries to hand us a page number.
    if (this.civitaiQuery.trim() && cursor != null && String(cursor).trim()) {
      const url = new URL(requestUrl);
      url.searchParams.delete("page");
      url.searchParams.set("cursor", String(cursor));
      return routeCivitaiUrl(url.toString());
    }

    const next = String(payload.metadata?.nextPage ?? "").trim();
    if (next) {
      try {
        const url = new URL(next, requestUrl);
        url.protocol = "https:";
        if (this.civitaiQuery.trim()) url.searchParams.delete("page");
        if (cursor != null && String(cursor).trim() && !url.searchParams.has("cursor")) url.searchParams.set("cursor", String(cursor));
        // Defensively retain Studio's filters if CivitAI omits one from nextPage.
        if (this.civitaiServerFilteredBaseModel && !url.searchParams.has("baseModels")) url.searchParams.set("baseModels", this.civitaiServerFilteredBaseModel);
        if (!url.searchParams.has("types")) url.searchParams.set("types", "LORA");
        if (!url.searchParams.has("nsfw")) url.searchParams.set("nsfw", this.civitaiIncludeNsfw ? "true" : "false");
        return routeCivitaiUrl(url.toString());
      } catch { /* fall through */ }
    }
    if (cursor != null && String(cursor).trim()) {
      const url = new URL(requestUrl);
      url.searchParams.delete("page");
      url.searchParams.set("cursor", String(cursor));
      return routeCivitaiUrl(url.toString());
    }
    return "";
  }

  private civitaiVersions(model: CivitaiModelItem, compatibleOnly = this.civitaiCompatibleOnly): CivitaiVersion[] {
    const versions = Array.isArray(model.modelVersions) ? model.modelVersions : [];
    const family = this.civitaiCurrentFamily();
    if (!compatibleOnly || !family) return versions;
    return versions.filter((version) => familyFromCivitaiBaseModel(version.baseModel) === family);
  }

  private civitaiDefaultVersion(model: CivitaiModelItem): CivitaiVersion | undefined {
    return this.civitaiVersions(model)[0] ?? (this.civitaiCompatibleOnly ? undefined : model.modelVersions?.[0]);
  }

  private civitaiVersionInstalled(version: CivitaiVersion | undefined): boolean {
    if (!version) return false;
    const names = (version.files ?? []).map((file) => serverModelKey(String(file.name ?? ""))).filter(Boolean);
    if (!names.length) return false;
    const installed = new Set(this.loras.map((lora) => serverModelKey(lora.name)));
    return names.some((name) => installed.has(name));
  }


  private civitaiInstallEntry(versionId: number): CivitaiInstallQueueItem | undefined {
    return this.civitaiInstallQueue.find((item) => item.versionId === versionId && (item.status === "queued" || item.status === "installing"));
  }

  private civitaiQueuePosition(versionId: number): number {
    const pending = this.civitaiInstallQueue.filter((item) => item.status === "queued");
    const index = pending.findIndex((item) => item.versionId === versionId);
    return index >= 0 ? index + 1 : 0;
  }

  private renderCivitaiInstallQueue(): string {
    const items = this.civitaiInstallQueue.filter((item) => item.status !== "done").slice(0, 6);
    if (!items.length) return "";
    return `<div class="civitai-install-queue"><span class="panel-kicker">INSTALL QUEUE</span><div>${items.map((item) => {
      const label = item.status === "installing"
        ? `${Math.round(clamp(item.progress, 0, 1) * 100)}%`
        : item.status === "queued"
          ? `Queued ${this.civitaiQueuePosition(item.versionId)}`
          : "Failed";
      return `<div class="civitai-queue-item ${item.status}" data-civitai-queue-version="${item.versionId}"><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.message || label)}</small></div><span>${escapeHtml(label)}</span><i><em style="width:${Math.round(clamp(item.progress, 0, 1) * 100)}%"></em></i></div>`;
    }).join("")}</div></div>`;
  }

  private refreshCivitaiInstallQueueDom(): void {
    const host = this.root.querySelector<HTMLElement>("[data-civitai-install-queue-host]");
    if (!host) return;
    host.innerHTML = this.renderCivitaiInstallQueue();
    for (const item of this.civitaiInstallQueue) this.updateCivitaiQueueDom(item);
  }

  private updateCivitaiQueueDom(item: CivitaiInstallQueueItem): void {
    const row = this.root.querySelector<HTMLElement>(`[data-civitai-queue-version="${item.versionId}"]`);
    if (row) {
      row.className = `civitai-queue-item ${item.status}`;
      const title = row.querySelector<HTMLElement>("b");
      if (title) title.textContent = item.title;
      const fill = row.querySelector<HTMLElement>("i > em");
      if (fill) fill.style.width = `${Math.round(clamp(item.progress, 0, 1) * 100)}%`;
      const message = row.querySelector<HTMLElement>("small");
      if (message) message.textContent = item.message;
      const status = row.querySelector<HTMLElement>(":scope > span");
      if (status) status.textContent = item.status === "installing" ? `${Math.round(clamp(item.progress, 0, 1) * 100)}%` : item.status === "queued" ? `Queued ${this.civitaiQueuePosition(item.versionId)}` : item.status === "error" ? "Failed" : "Done";
    }
    if (this.civitaiDetailVersionId === item.versionId) {
      const detailBar = this.root.querySelector<HTMLElement>("[data-civitai-detail-panel] .download-progress > div");
      if (detailBar) detailBar.style.width = `${Math.round(clamp(item.progress, 0, 1) * 100)}%`;
      const detailStatus = this.root.querySelector<HTMLElement>("[data-civitai-detail-panel] .download-status");
      if (detailStatus) detailStatus.textContent = item.message;
    }
    this.root.querySelectorAll<HTMLButtonElement>(`[data-civitai-install-version="${item.versionId}"]`).forEach((button) => {
      button.disabled = item.status === "queued" || item.status === "installing";
      button.textContent = item.status === "installing" ? `${Math.round(clamp(item.progress, 0, 1) * 100)}%` : item.status === "queued" ? "Queued" : item.status === "error" ? "Retry" : "Installed ✓";
    });
  }

  private civitaiCard(model: CivitaiModelItem): string {
    const version = this.civitaiDefaultVersion(model);
    if (!version) return "";
    const preview = (version.images ?? []).find((image) => image.url && String(image.type ?? "image").toLowerCase() === "image")
      ?? (version.images ?? []).find((image) => image.url);
    const installed = this.civitaiVersionInstalled(version);
    const queueEntry = this.civitaiInstallEntry(version.id);
    const family = familyFromCivitaiBaseModel(version.baseModel);
    const creator = model.creator?.username || "Unknown creator";
    const downloads = compactNumber(model.stats?.downloadCount ?? version.stats?.downloadCount);
    const rating = Number(model.stats?.rating ?? version.stats?.rating ?? 0);
    const description = stripMarkup(model.description).slice(0, 180);
    return `
      <article class="civitai-card panel" data-civitai-model-card="${model.id}">
        <button class="civitai-card-media" data-civitai-detail="${model.id}" aria-label="Open ${escapeHtml(model.name)} details">
          ${preview?.url ? `<img src="${escapeHtml(preview.url)}" alt="" loading="lazy" />` : `<span>◇</span>`}
          <div class="civitai-card-badges"><span>${escapeHtml(version.baseModel || family || "LoRA")}</span>${model.nsfw ? `<span>NSFW</span>` : ""}</div>
        </button>
        <div class="civitai-card-copy">
          <span class="panel-kicker">${escapeHtml(creator)}</span>
          <h3>${escapeHtml(model.name)}</h3>
          <p class="civitai-version-line">${escapeHtml(version.name || "Latest")} ${family ? `· ${escapeHtml(family)}` : ""}</p>
          ${description ? `<p class="civitai-card-description">${escapeHtml(description)}</p>` : ""}
          <div class="civitai-stats"><span>↓ ${downloads}</span>${rating ? `<span>★ ${rating.toFixed(1)}</span>` : ""}<span>${(version.trainedWords ?? []).length} triggers</span></div>
        </div>
        <div class="civitai-card-actions">
          <button class="ghost-button" data-civitai-detail="${model.id}">Details</button>
          ${installed ? `<button class="ghost-button added-button" disabled>Installed ✓</button>` : queueEntry ? `<button class="ghost-button added-button" data-civitai-install-version="${version.id}" disabled>${queueEntry.status === "installing" ? `${Math.round(clamp(queueEntry.progress, 0, 1) * 100)}%` : "Queued"}</button>` : `<button class="primary-button" data-civitai-install-version="${version.id}" ${this.connected ? "" : "disabled"}>Install</button>`}
        </div>
      </article>`;
  }

  private civitaiMatchingResults(): CivitaiModelItem[] {
    const family = this.civitaiCurrentFamily();
    return this.civitaiResults.filter((model) => {
      const creator = String(model.creator?.username || "").trim().toLowerCase();
      if (creator && this.civitaiBlockedAuthors.has(creator)) return false;
      return !this.civitaiCompatibleOnly || !family || this.civitaiVersions(model, true).length > 0;
    });
  }

  private persistCivitaiBlockedAuthors(): void {
    try { localStorage.setItem("swarm-studio-civitai-blocked-authors", JSON.stringify([...this.civitaiBlockedAuthors].sort())); } catch { /* session-only fallback */ }
  }

  private renderCivitai(): string {
    const current = this.currentCheckpoint();
    const family = this.civitaiCurrentFamily();
    const matching = this.civitaiMatchingResults();
    const pageSize = 24;
    const start = (this.civitaiPage - 1) * pageSize;
    const visible = matching.slice(start, start + pageSize);
    const hasNext = matching.length > start + pageSize || !this.civitaiExhausted;
    const rawTotalPages = this.civitaiTotal ? Math.max(1, Math.ceil(this.civitaiTotal / pageSize)) : 1;
    const pageLabel = this.civitaiCompatibleOnly && family
      ? `Page ${this.civitaiPage} · ${matching.length} compatible loaded`
      : `Page ${this.civitaiPage} of ${rawTotalPages}`;
    const scanLabel = this.civitaiScanned
      ? `${this.civitaiScanned}${this.civitaiTotal ? ` / ${this.civitaiTotal}` : ""} CivitAI LoRAs loaded${this.civitaiServerFilteredBaseModel ? ` · prefiltered ${this.civitaiServerFilteredBaseModel}` : this.civitaiCompatibleOnly && family ? ` · ${matching.length} compatible` : ""}`
      : "";
    const permissions = this.userData?.permissions ?? this.session?.permissions ?? [];
    const proxyLabel = permissions.includes("edit_model_metadata") ? "Browsing through Swarm metadata proxy" : "Browsing through Studio metadata relay";
    return `
      <div class="civitai-browser">
        <section class="panel civitai-browser-toolbar">
          <form id="civitai-search-form" class="civitai-search-form">
            <label class="library-search civitai-search"><span>⌕</span><input id="civitai-query" value="${escapeHtml(this.civitaiQuery)}" placeholder="Search CivitAI LoRAs…" autocomplete="off" /></label>
            <button class="primary-button" type="submit">Search</button>
          </form>
          <div class="civitai-filters civitai-filters--desktop">
            <label class="field-inline"><span>Sort</span><select id="civitai-sort"><option ${this.civitaiSort === "Most Downloaded" ? "selected" : ""}>Most Downloaded</option><option ${this.civitaiSort === "Newest" ? "selected" : ""}>Newest</option><option ${this.civitaiSort === "Highest Rated" ? "selected" : ""}>Highest Rated</option></select></label>
            <label class="field-inline"><span>Period</span><select id="civitai-period"><option value="AllTime" ${this.civitaiPeriod === "AllTime" ? "selected" : ""}>All time</option><option value="Year" ${this.civitaiPeriod === "Year" ? "selected" : ""}>Year</option><option value="Month" ${this.civitaiPeriod === "Month" ? "selected" : ""}>Month</option><option value="Week" ${this.civitaiPeriod === "Week" ? "selected" : ""}>Week</option><option value="Day" ${this.civitaiPeriod === "Day" ? "selected" : ""}>Day</option></select></label>
            <label class="civitai-compat-toggle"><input data-civitai-compatible-toggle type="checkbox" ${this.civitaiCompatibleOnly ? "checked" : ""} ${family ? "" : "disabled"}/><span></span><div><b>Compatible only</b><small>${family ? `${this.civitaiBaseModelFilterForFamily(family) ? `CivitAI base model: ${escapeHtml(this.civitaiBaseModelFilterForFamily(family))}` : `Match ${escapeHtml(current?.title || prettyName(current?.name) || family)} locally`} · ${escapeHtml(family)}` : "Select a checkpoint to filter by family"}</small></div></label>
            <label class="civitai-compat-toggle civitai-nsfw-toggle"><input data-civitai-nsfw-toggle type="checkbox" ${this.civitaiIncludeNsfw ? "checked" : ""}/><span></span><div><b>Show +18</b><small>${this.civitaiIncludeNsfw ? "Include mature CivitAI models and previews" : "Safe results only"}</small></div></label>
            <button class="secondary-button" data-action="open-lora-download" ${this.connected ? "" : "disabled"}>↓ URL download</button>
          </div>
          <div class="civitai-mobile-controls">
            <div class="civitai-mobile-action-row">
              <button class="secondary-button civitai-mobile-sort" data-action="open-civitai-mobile-filters"><span>⇅</span><b>Sort</b><small>${escapeHtml(this.civitaiSort)} · ${escapeHtml(this.civitaiPeriod === "AllTime" ? "All time" : this.civitaiPeriod)}</small></button>
              <button class="secondary-button civitai-mobile-url" data-action="open-lora-download" ${this.connected ? "" : "disabled"}><span>↓</span><b>URL</b></button>
            </div>
            <div class="civitai-mobile-toggle-row">
              <label class="civitai-mobile-toggle"><input data-civitai-compatible-toggle type="checkbox" ${this.civitaiCompatibleOnly ? "checked" : ""} ${family ? "" : "disabled"}/><span></span><b>Compatible</b></label>
              <label class="civitai-mobile-toggle"><input data-civitai-nsfw-toggle type="checkbox" ${this.civitaiIncludeNsfw ? "checked" : ""}/><span></span><b>+18</b></label>
            </div>
          </div>
          <div class="civitai-toolbar-pagination">
            <button class="ghost-button" data-civitai-page="${Math.max(1, this.civitaiPage - 1)}" ${this.civitaiPage <= 1 || this.civitaiLoading ? "disabled" : ""}>← Previous</button>
            <span>${escapeHtml(pageLabel)}</span>
            <button class="secondary-button" data-civitai-page="${this.civitaiPage + 1}" ${!hasNext || this.civitaiLoading ? "disabled" : ""}>Next →</button>
          </div>
          <div data-civitai-install-queue-host>${this.renderCivitaiInstallQueue()}</div>
        </section>
        <div class="civitai-browser-meta"><div><span class="panel-kicker">CIVITAI</span><b>${escapeHtml(pageLabel)}</b>${scanLabel ? `<small>${escapeHtml(scanLabel)} · ${escapeHtml(proxyLabel)}</small>` : `<small>${escapeHtml(proxyLabel)}</small>`}</div><div class="civitai-browser-meta-actions">${this.civitaiBlockedAuthors.size ? `<button class="ghost-button" data-action="clear-civitai-blocks">${this.civitaiBlockedAuthors.size} blocked · clear</button>` : ""}<button class="ghost-button" data-nav="models">← Installed library</button></div></div>
        ${this.civitaiLoading ? `<div class="panel civitai-loading"><span></span> Searching CivitAI…</div>` : this.civitaiError ? `<div class="panel compact-empty"><b>CivitAI search failed.</b><p>${escapeHtml(this.civitaiError)}</p><button class="secondary-button" data-action="retry-civitai">Retry</button></div>` : visible.length ? `<div class="civitai-grid">${visible.map((model) => this.civitaiCard(model)).join("")}</div>` : `<div class="panel compact-empty">${this.civitaiLoadedOnce ? (this.civitaiExhausted ? "No more LoRAs match the current filters." : "Studio has not found enough matching LoRAs yet; try Next to continue scanning CivitAI.") : "Search CivitAI to browse and install LoRAs directly into Swarm."}</div>`}
      </div>`;
  }

  private renderCivitaiMobileFiltersModal(): string {
    if (!this.civitaiMobileFiltersOpen) return "";
    return `
      <div class="download-backdrop civitai-mobile-filter-backdrop" data-action="close-civitai-mobile-filters">
        <section class="download-modal civitai-mobile-filter-modal" data-civitai-mobile-filter-panel>
          <header><div><span class="panel-kicker">CIVITAI</span><h2>Sort results</h2></div><button class="icon-button" type="button" data-action="close-civitai-mobile-filters">×</button></header>
          <form id="civitai-mobile-filter-form" class="civitai-mobile-filter-form">
            <label class="field"><span>Sort by</span><select id="civitai-mobile-sort"><option ${this.civitaiSort === "Most Downloaded" ? "selected" : ""}>Most Downloaded</option><option ${this.civitaiSort === "Newest" ? "selected" : ""}>Newest</option><option ${this.civitaiSort === "Highest Rated" ? "selected" : ""}>Highest Rated</option></select></label>
            <label class="field"><span>Time period</span><select id="civitai-mobile-period"><option value="AllTime" ${this.civitaiPeriod === "AllTime" ? "selected" : ""}>All time</option><option value="Year" ${this.civitaiPeriod === "Year" ? "selected" : ""}>Year</option><option value="Month" ${this.civitaiPeriod === "Month" ? "selected" : ""}>Month</option><option value="Week" ${this.civitaiPeriod === "Week" ? "selected" : ""}>Week</option><option value="Day" ${this.civitaiPeriod === "Day" ? "selected" : ""}>Day</option></select></label>
            <footer><button class="ghost-button" type="button" data-action="close-civitai-mobile-filters">Cancel</button><button class="primary-button" type="submit">Save</button></footer>
          </form>
        </section>
      </div>`;
  }

  private renderCivitaiDetailModal(): string {
    if (this.view !== "civitai" || (!this.civitaiDetail && !this.civitaiDetailLoading)) return "";
    if (this.civitaiDetailLoading && !this.civitaiDetail) return `<div class="download-backdrop" data-action="close-civitai-detail"><section class="download-modal civitai-detail-modal" data-civitai-detail-panel><header><div><span class="panel-kicker">CIVITAI</span><h2>Loading model…</h2></div><button class="icon-button" data-action="close-civitai-detail">×</button></header><div class="civitai-detail-loading"><span></span> Loading model metadata…</div></section></div>`;
    const model = this.civitaiDetail!;
    const versions = model.modelVersions ?? [];
    const selected = versions.find((version) => version.id === this.civitaiDetailVersionId) ?? this.civitaiDefaultVersion(model) ?? versions[0];
    if (!selected) return "";
    const preview = (selected.images ?? []).find((image) => image.url && String(image.type ?? "image").toLowerCase() === "image") ?? (selected.images ?? []).find((image) => image.url);
    const family = familyFromCivitaiBaseModel(selected.baseModel);
    const expectedArchitecture = this.loraArchitectureForFamily(family);
    const file = (selected.files ?? []).find((entry) => String(entry.name ?? "").toLowerCase().endsWith(".safetensors")) ?? (selected.files ?? []).find((entry) => entry.primary) ?? selected.files?.[0];
    const installed = this.civitaiVersionInstalled(selected);
    const queueEntry = this.civitaiInstallEntry(selected.id);
    const description = stripMarkup(selected.description || model.description);
    return `
      <div class="download-backdrop" data-action="close-civitai-detail">
        <section class="download-modal civitai-detail-modal" role="dialog" aria-modal="true" aria-label="CivitAI model details" data-civitai-detail-panel>
          <header><div><span class="panel-kicker">CIVITAI LORA</span><h2>${escapeHtml(model.name)}</h2></div><button class="icon-button" data-action="close-civitai-detail">×</button></header>
          <div class="civitai-detail-body">
            <div class="civitai-detail-preview">${preview?.url ? `<img src="${escapeHtml(preview.url)}" alt="${escapeHtml(model.name)} preview" />` : `<span>◇</span>`}</div>
            <div class="civitai-detail-copy">
              <div class="download-resolved-tags"><span>LoRA</span>${selected.baseModel ? `<span>${escapeHtml(selected.baseModel)}</span>` : ""}${family ? `<span>${escapeHtml(family)}</span>` : ""}${model.nsfw ? `<span>NSFW</span>` : ""}</div>
              <div class="civitai-author-row"><p class="download-version">by ${escapeHtml(model.creator?.username || "Unknown creator")}</p>${model.creator?.username ? `<button class="ghost-button civitai-block-author ${this.civitaiBlockedAuthors.has(model.creator.username.trim().toLowerCase()) ? "is-blocked" : ""}" type="button" data-civitai-block-author="${escapeHtml(model.creator.username)}">${this.civitaiBlockedAuthors.has(model.creator.username.trim().toLowerCase()) ? "Unblock" : "Block author"}</button>` : ""}<a class="ghost-button civitai-source-link" href="${CIVITAI_ORIGIN}/models/${model.id}${selected.id ? `?modelVersionId=${selected.id}` : ""}" target="_blank" rel="noopener noreferrer">Open on CivitAI ${externalLinkSvg}</a></div>
              <label class="field"><span>Version</span><select id="civitai-version-select">${versions.map((version) => `<option value="${version.id}" ${version.id === selected.id ? "selected" : ""}>${escapeHtml(version.name || `Version ${version.id}`)}${version.baseModel ? ` · ${escapeHtml(version.baseModel)}` : ""}</option>`).join("")}</select></label>
              <div class="metadata-facts civitai-detail-facts"><p><span>Base model</span><b>${escapeHtml(selected.baseModel || "Unknown")}</b></p><p><span>Swarm family</span><b>${escapeHtml(family || "Auto-detect")}</b></p><p><span>Architecture</span><b>${escapeHtml(expectedArchitecture || "Let Swarm detect")}</b></p><p><span>File</span><b>${escapeHtml(file?.name || "Primary file")}</b></p>${file?.sizeKB ? `<p><span>Size</span><b>${escapeHtml(formatFileSize(file.sizeKB))}</b></p>` : ""}</div>
              ${(selected.trainedWords ?? []).length ? `<section class="civitai-trigger-list"><span>Trigger words</span><div>${selected.trainedWords!.map((word) => `<code>${escapeHtml(word)}</code>`).join("")}</div></section>` : ""}
              ${description ? `<p class="download-description civitai-detail-description">${escapeHtml(description)}</p>` : ""}
              <p class="helper-copy">Install writes the LoRA through Swarm, refreshes its inventory, then verifies and repairs title, author, triggers, architecture, tags, and preview metadata when your account can edit model metadata.</p>
            </div>
          </div>
          <div class="download-progress"><div style="width:${Math.round(clamp(queueEntry?.progress ?? 0, 0, 1) * 100)}%"></div></div>
          <p class="download-status">${escapeHtml(queueEntry ? (queueEntry.message || (queueEntry.status === "installing" ? "Installing…" : "Queued for install.")) : installed ? "This version appears to already be installed in Swarm." : "Ready to install directly into Swarm.")}</p>
          <div class="form-actions"><button class="ghost-button" data-action="close-civitai-detail">Close</button>${installed ? `<button class="secondary-button" data-nav="models">Open installed library</button>` : queueEntry ? `<button class="ghost-button added-button" data-civitai-install-version="${selected.id}" disabled>${queueEntry.status === "installing" ? `${Math.round(clamp(queueEntry.progress, 0, 1) * 100)}%` : "Queued"}</button>` : `<button class="primary-button" data-civitai-install-version="${selected.id}" ${this.connected ? "" : "disabled"}>Install to Swarm</button>`}</div>
        </section>
      </div>`;
  }

  private modelMetadataSerialized(model: SwarmModel): string {
    try { return JSON.stringify(model); } catch { return ""; }
  }

  private modelCivitaiUrl(model: SwarmModel): string {
    const serialized = this.modelMetadataSerialized(model);
    const modelId = serialized.match(/swarmstudio\.civitai_model_id[\\"':=\s]+(\d+)/i)?.[1];
    const versionId = serialized.match(/swarmstudio\.civitai_version_id[\\"':=\s]+(\d+)/i)?.[1];
    if (modelId) return `${CIVITAI_ORIGIN}/models/${modelId}${versionId ? `?modelVersionId=${versionId}` : ""}`;
    const direct = serialized.match(/https?:\/\/(?:www\.)?civitai\.(?:com|red)\/models\/\d+[^\s\"'<>]*/i)?.[0];
    if (direct) return routeCivitaiUrl(direct.replace(/\\u0026/g, "&"));
    const descriptionDirect = `${model.description || ""} ${model.usage_hint || ""}`.match(/https?:\/\/(?:www\.)?civitai\.(?:com|red)\/models\/\d+[^\s\"'<>]*/i)?.[0];
    return descriptionDirect ? routeCivitaiUrl(descriptionDirect) : "";
  }

  private renderModelMetadataViewer(): string {
    if (!this.modelMetadataViewer && !this.modelMetadataViewerLoading) return "";
    if (this.modelMetadataViewerLoading && !this.modelMetadataViewer) return `<div class="download-backdrop" data-action="close-model-metadata-viewer"><section class="download-modal civitai-detail-modal lora-metadata-viewer" data-model-metadata-viewer-panel><header><div><span class="panel-kicker">LORA METADATA</span><h2>Loading model card…</h2></div><button class="icon-button" data-action="close-model-metadata-viewer">×</button></header><div class="civitai-detail-loading"><span></span> Asking Swarm for the full LoRA metadata…</div></section></div>`;
    const model = this.modelMetadataViewer!;
    const preview = model.preview_image ? this.client.imageUrl(model.preview_image) : "";
    const source = this.modelCivitaiUrl(model);
    const description = stripMarkup(model.description || "");
    const usage = stripMarkup(model.usage_hint || "");
    const tags = (model.tags ?? []).filter(Boolean);
    const family = modelFamily(model);
    return `<div class="download-backdrop" data-action="close-model-metadata-viewer">
      <section class="download-modal civitai-detail-modal lora-metadata-viewer" role="dialog" aria-modal="true" aria-label="LoRA metadata" data-model-metadata-viewer-panel>
        <header><div><span class="panel-kicker">INSTALLED LORA</span><h2>${escapeHtml(model.title || prettyName(model.name))}</h2><small>${escapeHtml(model.name)}</small></div><button class="icon-button" data-action="close-model-metadata-viewer">×</button></header>
        <div class="civitai-detail-body">
          <div class="civitai-detail-preview">${preview ? `<img ${this.swarmImageAttributes(preview)} alt="${escapeHtml(model.title || prettyName(model.name))} preview" />` : `<span>◇</span>`}</div>
          <div class="civitai-detail-copy">
            <div class="download-resolved-tags"><span>LoRA</span>${family ? `<span>${escapeHtml(family)}</span>` : ""}${model.architecture ? `<span>${escapeHtml(model.architecture)}</span>` : ""}</div>
            ${model.author ? `<p class="download-version">by ${escapeHtml(model.author)}</p>` : ""}
            <div class="metadata-facts civitai-detail-facts"><p><span>File</span><b>${escapeHtml(model.name)}</b></p><p><span>Family</span><b>${escapeHtml(family || "Unknown")}</b></p><p><span>Architecture</span><b>${escapeHtml(model.architecture || "Unknown")}</b></p><p><span>Default weight</span><b>${escapeHtml(model.lora_default_weight ?? "Swarm default")}</b></p>${model.date ? `<p><span>Date</span><b>${escapeHtml(model.date)}</b></p>` : ""}${model.license ? `<p><span>License</span><b>${escapeHtml(model.license)}</b></p>` : ""}</div>
            ${model.trigger_phrase ? `<section class="civitai-trigger-list"><span>Trigger words</span><div><code>${escapeHtml(model.trigger_phrase)}</code></div></section>` : ""}
            ${tags.length ? `<section class="civitai-trigger-list"><span>Tags</span><div>${tags.map((tag) => `<code>${escapeHtml(tag)}</code>`).join("")}</div></section>` : ""}
            ${description ? `<section class="lora-readable-metadata"><span>Description</span><p>${escapeHtml(description)}</p></section>` : ""}
            ${usage ? `<section class="lora-readable-metadata"><span>Usage</span><p>${escapeHtml(usage)}</p></section>` : ""}
            ${source ? `<a class="primary-button lora-civitai-link" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Open CivitAI post ${externalLinkSvg}</a>` : `<p class="helper-copy">No CivitAI source URL was found in this LoRA's Swarm metadata.</p>`}
          </div>
        </div>
        <div class="form-actions"><button class="ghost-button" type="button" data-action="close-model-metadata-viewer">Close</button><button class="secondary-button" type="button" data-edit-model-metadata="${escapeHtml(model.name)}">Edit metadata</button></div>
      </section>
    </div>`;
  }

  private renderModelMetadataEditor(): string {
    if (!this.modelMetadataEditor && !this.modelMetadataLoading) return "";
    if (this.modelMetadataLoading && !this.modelMetadataEditor) return `<div class="download-backdrop" data-action="close-model-metadata"><section class="download-modal metadata-editor-modal" data-model-metadata-panel><header><div><span class="panel-kicker">LORA METADATA</span><h2>Loading metadata…</h2></div><button class="icon-button" data-action="close-model-metadata">×</button></header><div class="civitai-detail-loading"><span></span> Asking Swarm for the full model card…</div></section></div>`;
    const model = this.modelMetadataEditor!;
    const preview = this.modelMetadataPreviewDataUrl || (model.preview_image ? this.client.imageUrl(model.preview_image) : "");
    const architectures = [...new Set(this.loras.map((item) => item.architecture).filter((value): value is string => Boolean(value)))].sort();
    const civitaiUrl = this.modelMetadataCivitaiUrl || this.modelCivitaiUrl(model);
    return `
      <div class="download-backdrop" data-action="close-model-metadata">
        <section class="download-modal metadata-editor-modal" role="dialog" aria-modal="true" aria-label="Edit LoRA metadata" data-model-metadata-panel>
          <header><div><span class="panel-kicker">LORA METADATA</span><h2>${escapeHtml(model.title || prettyName(model.name))}</h2><small>${escapeHtml(model.name)}</small></div><button class="icon-button" data-action="close-model-metadata">×</button></header>
          <form id="model-metadata-form">
            <div class="metadata-civitai-pull"><label class="field"><span>CivitAI source</span><input id="model-metadata-civitai-url" value="${escapeHtml(civitaiUrl)}" placeholder="URL optional — leave blank to resolve by hash" autocomplete="off" /><small>Studio uses this URL when present. If it is blank or stale, Studio can ask Swarm for the LoRA hash and resolve the matching CivitAI version automatically.</small></label><button type="button" class="secondary-button" data-action="pull-model-civitai-metadata" ${this.modelMetadataCivitaiLoading ? "disabled" : ""}>${this.modelMetadataCivitaiLoading ? "Pulling…" : "Pull from CivitAI"}</button></div>
            <div class="metadata-editor-layout">
              <div class="metadata-editor-preview">${preview ? `<img id="model-metadata-preview" ${this.swarmImageAttributes(preview)} alt="" />` : `<div id="model-metadata-preview" class="download-preview-placeholder">◇</div>`}<label class="secondary-button file-button">Replace preview<input id="model-metadata-preview-file" type="file" accept="image/*" hidden /></label></div>
              <div class="metadata-editor-fields">
                <div class="field-grid"><label class="field"><span>Title</span><input name="title" value="${escapeHtml(model.title || "")}" /></label><label class="field"><span>Author</span><input name="author" value="${escapeHtml(model.author || "")}" /></label></div>
                <label class="field"><span>Architecture</span><input name="architecture" list="known-lora-architectures" value="${escapeHtml(model.architecture || "")}" /><datalist id="known-lora-architectures">${architectures.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("")}</datalist></label>
                <label class="field"><span>Trigger phrase</span><input name="trigger" value="${escapeHtml(model.trigger_phrase || "")}" /></label>
                <label class="field"><span>Tags <small>comma separated</small></span><input name="tags" value="${escapeHtml((model.tags ?? []).join(", "))}" /></label>
                <div class="field-grid"><label class="field"><span>Standard width</span><input name="width" type="number" min="0" step="64" value="${Number(model.standard_width ?? 0)}" /></label><label class="field"><span>Standard height</span><input name="height" type="number" min="0" step="64" value="${Number(model.standard_height ?? 0)}" /></label></div>
                <div class="field-grid"><label class="field"><span>Default LoRA weight</span><input name="defaultWeight" type="number" step="0.05" value="${escapeHtml(model.lora_default_weight ?? "")}" /></label><label class="field"><span>Prediction type</span><input name="predictionType" value="${escapeHtml(model.prediction_type || "")}" /></label></div>
                <label class="field"><span>Description</span><textarea name="description" rows="5">${escapeHtml(model.description || "")}</textarea></label>
                <label class="field"><span>Usage hint</span><textarea name="usageHint" rows="3">${escapeHtml(model.usage_hint || "")}</textarea></label>
              </div>
            </div>
            <div class="form-actions"><button type="button" class="ghost-button" data-action="close-model-metadata">Cancel</button><button type="submit" class="primary-button">Save metadata</button></div>
          </form>
        </section>
      </div>`;
  }

  private inventoryEmpty(text: string): string {
    return `<div class="panel compact-empty">${escapeHtml(text)}</div>`;
  }

  private modelCard(model: SwarmModel, lora: boolean, hidden = false): string {
    const preview = model.preview_image ? this.client.imageUrl(model.preview_image) : "";
    const tag = lora ? (modelFamily(model) || "matching LoRA") : (model.compat_class || model.architecture || modelFamily(model) || "Checkpoint");
    const added = lora && this.store.state.draft.loras.some((item) => serverModelKey(item.name) === serverModelKey(model.name));
    return `
      <article class="model-card ${added ? "is-added" : ""} ${lora && this.loraBatchSelected.has(model.name) ? "is-selected" : ""}" ${hidden ? "hidden" : ""} ${lora ? `data-lora-search="${escapeHtml([model.name, model.title, model.author, model.description, model.trigger_phrase, ...(model.tags ?? [])].filter(Boolean).join(" ").toLowerCase())}" data-lora-model="${escapeHtml(model.name)}"` : ""}>
        ${lora && this.loraBatchMode ? `<button class="lora-batch-check" data-toggle-lora-select="${escapeHtml(model.name)}" aria-label="${this.loraBatchSelected.has(model.name) ? "Deselect" : "Select"} ${escapeHtml(model.title || prettyName(model.name))}">${this.loraBatchSelected.has(model.name) ? "✓" : ""}</button>` : ""}
        ${lora ? `<button class="model-preview lora-metadata-open" type="button" data-view-model-metadata="${escapeHtml(model.name)}" title="View LoRA metadata" aria-label="View metadata for ${escapeHtml(model.title || prettyName(model.name))}">${preview ? `<img ${this.swarmImageAttributes(preview)} alt="" loading="lazy" />` : `<span>◇</span>`}</button>` : `<div class="model-preview">${preview ? `<img ${this.swarmImageAttributes(preview)} alt="" loading="lazy" />` : `<span>✦</span>`}</div>`}
        <div class="model-card-copy"><span class="tiny-tag">${escapeHtml(tag)}</span><h3>${escapeHtml(model.title || prettyName(model.name))}</h3><p>${escapeHtml(model.author || model.description || model.name)}</p></div>
        ${lora ? `<div class="model-card-actions">${added ? `<button class="ghost-button added-button" disabled>Added ✓</button>` : `<button class="ghost-button" data-add-model-lora="${escapeHtml(model.name)}">Add</button>`}<button class="icon-button model-metadata-edit" data-edit-model-metadata="${escapeHtml(model.name)}" title="Edit LoRA metadata" aria-label="Edit LoRA metadata">✎</button></div>` : `<button class="ghost-button" data-use-model="${escapeHtml(model.name)}">Use</button>`}
      </article>
    `;
  }

  private renderLogs(): string {
    this.sampleMemoryDiagnostics(false);
    return `
      <div class="logs-layout">
        <section class="panel log-toolbar">
          <div class="process-readout"><span class="status-dot ${this.processStatus.running ? "is-online" : ""}"></span><div><b>${this.processStatus.running ? `Owned process ${this.processStatus.pid}` : "No owned process"}</b><small>${runtime.kind === "tauri" ? "Child stdout and stderr are mirrored here and to the dev terminal." : "PWA mode records API and generation events only."}</small></div></div>
          <div class="form-actions"><button class="secondary-button" data-action="copy-logs">Copy logs</button><button class="ghost-button" data-action="clear-logs">Clear</button></div>
        </section>
        <section class="panel memory-diagnostics" id="memory-diagnostics">${this.memoryDiagnosticsMarkup()}</section>
        <section class="panel log-console" id="log-console">${this.logListMarkup()}</section>
      </div>
    `;
  }

  private logListMarkup(): string {
    if (!this.logs.length) return `<div class="compact-empty">No logs yet.</div>`;
    return this.logs.map((entry) => `<div class="log-row log-row--${entry.level}"><time>${displayTime(entry.timestamp)}</time><span>${escapeHtml(entry.source)}</span><p>${escapeHtml(entry.message)}</p></div>`).join("");
  }

  private renderLogList(): void {
    const host = this.root.querySelector<HTMLElement>("#log-console");
    if (!host) return;
    host.innerHTML = this.logListMarkup();
    host.scrollTop = host.scrollHeight;
  }

  private backendRepoRefOptions(status: RuntimeRepoStatus | null): string {
    if (!status?.refs.length) return "";
    const seen = new Set<string>();
    return status.refs.filter((item) => {
      if (!item.value || seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    }).map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join("");
  }

  private renderBackendControlRoom(): string {
    const backend = this.comfySelfStartBackend();
    const loading = this.backendControlLoading;
    const busy = Boolean(this.backendControlBusy);
    const disabled = loading || busy ? "disabled" : "";
    const native = runtime.kind === "tauri";
    const startScript = String(this.backendSetting(backend, "StartScript") ?? "");
    const extraArgs = String(this.backendSetting(backend, "ExtraArgs") ?? "");
    const extraArgList = parseLaunchArgs(extraArgs);
    const comfyCudaDevice = readCliFlagValue(extraArgList, "--cuda-device");
    const comfyDisableDynamicVram = hasCliFlag(extraArgList, "--disable-dynamic-vram");
    const comfyDisablePinnedMemory = hasCliFlag(extraArgList, "--disable-pinned-memory");
    const comfyDisableAsyncOffload = hasCliFlag(extraArgList, "--disable-async-offload");
    const autoUpdate = String(this.backendSetting(backend, "AutoUpdate") ?? "false");
    const autoRestartRaw = this.backendSetting(backend, "AutoRestart");
    const autoRestart = autoRestartRaw === true || String(autoRestartRaw ?? "true").toLowerCase() === "true";
    const diagnosticFlagActive = comfyDisableDynamicVram;
    const comfyRuntimePills = [
      comfyCudaDevice ? `CUDA ${escapeHtml(comfyCudaDevice)}` : "CUDA default",
      comfyDisableDynamicVram ? "dynamic VRAM off" : "dynamic VRAM auto",
      comfyDisablePinnedMemory ? "pinned memory off" : "pinned memory auto",
      comfyDisableAsyncOffload ? "async offload off" : "async offload auto",
    ];
    const swarmRef = this.swarmRepoStatus?.describe || this.swarmRepoStatus?.commit || "Not resolved";
    const comfyRef = this.comfyRepoStatus?.describe || this.comfyRepoStatus?.commit || "Not resolved";
    const swarmLaunchAutoPull = this.swarmRepoStatus?.launchAutoPull === true;
    const repoDisabled = native ? disabled : "disabled";
    const backendDisabled = this.connected && backend ? disabled : "disabled";
    return `
      <section class="backend-control-room">
        <div class="section-minihead backend-control-head"><div><b>Backend control room</b><span>Versions, restart policy, and the emergency levers.</span></div><button type="button" class="ghost-button" data-action="refresh-backend-control" ${disabled}>${loading ? "Loading…" : "Refresh"}</button></div>
        ${this.backendControlBusy ? `<div class="backend-control-progress"><span></span><b>${escapeHtml(this.backendControlBusy)}</b><small>Do not close Studio while a checkout is being changed.</small></div>` : ""}
        ${this.backendControlError ? `<div class="api-diagnostic"><b>Backend API unavailable</b><code>${escapeHtml(this.backendControlError)}</code></div>` : ""}
        ${this.renderStudioUpdateSettingsCard()}
        <div class="backend-control-grid">
          <article class="backend-control-card">
            <header><div><span class="panel-kicker">SWARMUI</span><h3>${escapeHtml(this.session?.version ?? "Unknown server version")}</h3></div><span class="backend-state ${this.connected ? "is-running" : ""}">${this.connected ? "online" : "offline"}</span></header>
            <div class="backend-repo-readout"><span>Local checkout</span><b>${escapeHtml(swarmRef)}</b><small>${this.swarmRepoStatus ? `${this.swarmRepoStatus.dirty ? "TRACKED CHANGES · " : ""}${escapeHtml(this.swarmRepoStatus.path)}` : escapeHtml(this.swarmRepoError || (native ? "Repository not resolved yet." : "Version checkout controls require desktop Studio."))}</small></div>
            <label class="field"><span>Pin tag / commit / branch</span><input id="swarm-version-target" list="swarm-version-options" placeholder="v0.9.8.3 or commit hash" ${native ? "" : "disabled"}/><datalist id="swarm-version-options">${this.backendRepoRefOptions(this.swarmRepoStatus)}</datalist></label>
            <div class="backend-button-row"><button type="button" class="ghost-button" data-action="fetch-swarm-versions" ${repoDisabled}>Fetch refs</button><button type="button" class="secondary-button" data-action="pin-swarm-version" ${repoDisabled}>Pin ref</button><button type="button" class="secondary-button" data-action="latest-swarm-version" ${repoDisabled}>Latest</button><button type="button" class="primary-button" data-action="restart-owned-swarm" ${native && this.processStatus.owned && this.processStatus.running ? disabled : "disabled"}>Restart</button></div>
            <label class="check-row backend-policy-toggle"><input id="swarm-launch-autopull" type="checkbox" ${swarmLaunchAutoPull ? "checked" : ""} ${native && this.swarmRepoStatus ? "" : "disabled"}/><span><b>Pull latest on Swarm launch</b><small>Controls Swarm's <code>src/bin/always_pull</code> marker. Pin ref turns this off automatically so the pin cannot be undone at next launch.</small></span></label>
            <p class="helper-copy">Pinning refuses tracked local changes and uses detached HEAD. Latest returns to <code>origin/${escapeHtml(this.swarmRepoStatus?.defaultBranch || "default")}</code> with a fast-forward-only update. Studio only restarts Swarm when it owns that process.</p>
          </article>

          <article class="backend-control-card">
            <header><div><span class="panel-kicker">COMFYUI</span><h3>${escapeHtml(this.comfyRepoStatus?.describe || backend?.title || "Self-start backend")}</h3></div><span class="backend-state ${backend?.enabled ? "is-running" : ""}">${backend ? (backend.enabled ? escapeHtml(backend.status || "enabled") : "disabled") : "not found"}</span></header>
            <div class="backend-repo-readout"><span>Local checkout</span><b>${escapeHtml(comfyRef)}</b><small>${this.comfyRepoStatus ? `${this.comfyRepoStatus.dirty ? "TRACKED CHANGES · " : ""}${escapeHtml(this.comfyRepoStatus.path)}` : escapeHtml(this.comfyRepoError || startScript || "Connect to discover the self-start backend.")}</small></div>
            <label class="field"><span>Pin tag / commit / branch</span><input id="comfy-version-target" list="comfy-version-options" placeholder="v0.34.0 or commit hash" ${native && backend ? "" : "disabled"}/><datalist id="comfy-version-options">${this.backendRepoRefOptions(this.comfyRepoStatus)}</datalist></label>
            <div class="backend-button-row"><button type="button" class="ghost-button" data-action="fetch-comfy-versions" ${native && backend ? disabled : "disabled"}>Fetch refs</button><button type="button" class="secondary-button" data-action="pin-comfy-version" ${native && backend ? disabled : "disabled"}>Pin ref</button><button type="button" class="secondary-button" data-action="latest-comfy-version" ${native && backend ? disabled : "disabled"}>Latest</button><button type="button" class="secondary-button" data-action="restart-comfy-backend" ${backendDisabled}>Restart</button><button type="button" class="${backend?.enabled ? "danger-soft" : "primary-button"}" data-action="toggle-comfy-backend" ${backendDisabled}>${backend?.enabled ? "Stop Comfy" : "Start Comfy"}</button><button type="button" class="ghost-button" data-action="free-comfy-memory" ${backend?.enabled ? backendDisabled : "disabled"}>Free RAM</button></div>
            <div class="backend-runtime-readout"><span>Launch path</span><b>${escapeHtml(startScript || "Not exposed by backend")}</b><small>${backend ? "This comes from the self-start backend's StartScript setting." : "Connect to discover the self-start backend path."}</small></div>
            <div class="backend-runtime-pillrow">${comfyRuntimePills.map((label) => `<span class="backend-runtime-pill">${label}</span>`).join("")}</div>
            ${diagnosticFlagActive ? `<div class="backend-warning"><b>Dynamic VRAM management is disabled</b><span><code>--disable-dynamic-vram</code> is active in ExtraArgs. Keep it enabled only when it improves stability on this system; it can change memory use and performance.</span></div>` : ""}
            <form id="comfy-backend-policy-form" class="backend-policy-form">
              <label class="field"><span>ExtraArgs</span><input name="comfyExtraArgs" value="${escapeHtml(extraArgs)}" placeholder="Optional Comfy CLI arguments" ${backend ? "" : "disabled"}/><small>Studio preserves unrelated CLI args and owns the known toggles below so you do not have to hand-edit them every time.</small></label>
              <section class="backend-managed-flags">
                <div class="section-minihead backend-managed-head"><b>Comfy runtime controls</b><span>Managed launch flags for GPU selection and memory/offload troubleshooting. Restart Comfy after changing them.</span></div>
                <div class="backend-button-row backend-preset-row"><button type="button" class="ghost-button" data-action="apply-comfy-runtime-preset" data-preset="known-good" ${backend ? disabled : "disabled"}>GPU 0 baseline</button><button type="button" class="ghost-button" data-action="apply-comfy-runtime-preset" data-preset="diagnostic" ${backend ? disabled : "disabled"}>VRAM diagnostic</button><button type="button" class="ghost-button" data-action="apply-comfy-runtime-preset" data-preset="clear" ${backend ? disabled : "disabled"}>Reset managed flags</button></div>
                <div class="field-grid field-grid--2">
                  <label class="field"><span>CUDA device override</span><input name="comfyCudaDevice" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(comfyCudaDevice)}" placeholder="blank = backend default" ${backend ? "" : "disabled"}/><small>Selects the CUDA GPU Comfy uses. Leave blank for the backend default; <code>0</code> selects the first CUDA device.</small></label>
                  <div class="backend-flag-stack">
                    <label class="check-row backend-policy-toggle"><input name="comfyDisableDynamicVram" type="checkbox" ${comfyDisableDynamicVram ? "checked" : ""} ${backend ? "" : "disabled"}/><span><b>Disable dynamic VRAM</b><small>Turns off Comfy's dynamic VRAM management. Use it to isolate VRAM-management crashes or allocation issues; memory use and performance can change.</small></span></label>
                    <label class="check-row backend-policy-toggle"><input name="comfyDisablePinnedMemory" type="checkbox" ${comfyDisablePinnedMemory ? "checked" : ""} ${backend ? "" : "disabled"}/><span><b>Disable pinned memory</b><small>Avoids page-locked host memory for CPU↔GPU transfers. Try it for pinned-memory, driver, or host-RAM instability; transfers may be slower.</small></span></label>
                    <label class="check-row backend-policy-toggle"><input name="comfyDisableAsyncOffload" type="checkbox" ${comfyDisableAsyncOffload ? "checked" : ""} ${backend ? "" : "disabled"}/><span><b>Disable async offload</b><small>Forces model offload and transfers to run synchronously. Try it when asynchronous offload is unstable; model swapping may take longer.</small></span></label>
                  </div>
                </div>
              </section>
              <div class="field-grid field-grid--2">
                <label class="field"><span>Auto update</span><select name="comfyAutoUpdate" ${backend ? "" : "disabled"}><option value="false" ${autoUpdate === "false" ? "selected" : ""}>Don't update</option><option value="true" ${autoUpdate === "true" ? "selected" : ""}>Always update</option><option value="aggressive" ${autoUpdate === "aggressive" ? "selected" : ""}>Aggressive update</option></select></label>
                <label class="check-row backend-policy-toggle"><input name="comfyAutoRestart" type="checkbox" ${autoRestart ? "checked" : ""} ${backend ? "" : "disabled"}/><span><b>AutoRestart</b><small>Turn this off when a crashing backend needs to stay dead.</small></span></label>
              </div>
              <div class="form-actions"><button type="submit" class="primary-button" ${backendDisabled}>Save & re-init</button></div>
            </form>
          </article>
        </div>
        <p class="helper-copy backend-control-foot">Source controls change the checked-out Git ref; they do not delete local files or run <code>reset --hard</code>. Comfy Stop disables the Swarm backend, so AutoRestart cannot immediately resurrect a crashing Python child.</p>
      </section>`;
  }

  private renderSettings(): string {
    const settings = this.store.state.connection;
    const pane = this.store.state.ui.settingsPane;
    const systemLaunch = settings.launchMode === "system";
    const permissions = this.userData?.permissions ?? this.session?.permissions ?? [];
    const canReadSettings = permissions.includes("read_server_settings");
    const canEditSettings = permissions.includes("edit_server_settings");
    const discoveredHostKey = this.serverSettingKey("networkhost");
    const discoveredOriginKey = this.serverSettingKey("networkaccesscontrolalloworigin", "accesscontrolalloworigin");
    const hostKey = discoveredHostKey ?? (canEditSettings ? "Network.Host" : undefined);
    const originKey = discoveredOriginKey ?? (canEditSettings ? "Network.AccessControlAllowOrigin" : undefined);
    const hostValue = discoveredHostKey ? String(this.serverSettings[discoveredHostKey]?.value ?? "") : "";
    const detectedUser = this.session?.user_id || this.userData?.user_name || "Not connected";

    const connectionPane = `
      <section class="panel settings-card settings-pane-card">
        <div class="panel-heading"><div><span class="panel-kicker">SWARM</span><h2>Connection</h2></div><span class="runtime-pill">${runtime.kind}</span></div>
        <form id="connection-form">
          <div class="mode-switch">
            <label><input type="radio" name="mode" value="local" ${runtime.kind === "tauri" || settings.mode === "local" ? "checked" : ""} /><span>Local</span></label>
            <label><input type="radio" name="mode" value="remote" ${runtime.kind !== "tauri" && settings.mode === "remote" ? "checked" : ""} ${runtime.kind === "tauri" ? "disabled" : ""}/><span>Remote</span></label>
          </div>
          <label class="field"><span>Swarm API URL</span><input name="baseUrl" value="${escapeHtml(runtime.kind === "tauri" ? this.effectiveSwarmBaseUrl(settings) : settings.baseUrl)}" placeholder="http://127.0.0.1:7801" /></label>
          ${runtime.kind === "tauri" ? `<p class="helper-copy">Desktop Studio always talks to Swarm over loopback. Use the PWA/relay for Tailscale or LAN clients; changing the desktop hostname cannot strand local auto-start anymore.</p>` : ""}
          <label class="field"><span>Swarm auth token</span><input name="authToken" type="password" value="${escapeHtml(settings.authToken)}" placeholder="Optional — User → Swarm Auth Tokens" autocomplete="off" /></label>
          <div class="account-readout">
            <div><span>Detected account</span><b>${escapeHtml(detectedUser)}</b></div>
            <div><span>Permissions</span><b>${this.connected ? `${canReadSettings ? "read ✓" : "read —"} · ${canEditSettings ? "edit ✓" : "edit —"}` : "Connect to inspect"}</b></div>
          </div>
          <p class="helper-copy">Single-user Swarm normally identifies as <code>local</code>; that is a real account name, not an anonymous fallback. Auth tokens are only needed when your Swarm setup requires account authentication.</p>
          <label class="check-row"><input type="checkbox" name="autoStart" ${settings.autoStart ? "checked" : ""} ${runtime.kind !== "tauri" ? "disabled" : ""}/><span><b>Auto-start local Swarm</b><small>Studio tries the API first and only launches when nothing is already listening.</small></span></label>

          <div class="section-minihead settings-subhead"><b>Launch method</b><span>${systemLaunch ? "External Windows shell" : "Managed child process"}</span></div>
          <div class="mode-switch launch-switch">
            <label><input type="radio" name="launchMode" value="managed" ${!systemLaunch ? "checked" : ""} ${runtime.kind !== "tauri" ? "disabled" : ""}/><span>Managed + logs</span></label>
            <label><input type="radio" name="launchMode" value="system" ${systemLaunch ? "checked" : ""} ${runtime.kind !== "tauri" ? "disabled" : ""}/><span>Windows function</span></label>
          </div>
          ${systemLaunch ? `
            <label class="field"><span>PowerShell function or launcher</span><input name="launchCommand" value="${escapeHtml(settings.launchCommand)}" placeholder="Swarmima" /></label>
            <label class="field"><span>Arguments</span><input name="launchArgs" value="${escapeHtml(formatLaunchArgs(settings.launchArgs))}" placeholder="--launch_mode none" /></label>
            <p class="helper-copy">Runs through your normal PowerShell profile in a visible terminal. Arguments use normal one-line shell-style spacing; quotes are preserved.</p>
            <input type="hidden" name="workingDirectory" value="${escapeHtml(settings.workingDirectory)}" />
          ` : `
            <label class="field"><span>Launch command</span><input name="launchCommand" value="${escapeHtml(settings.launchCommand)}" placeholder="C:\SwarmUI\launch-windows.bat or ./launch-linux.sh" /></label>
            <label class="field"><span>Working directory</span><input name="workingDirectory" value="${escapeHtml(settings.workingDirectory)}" placeholder="Optional SwarmUI directory" /></label>
            <label class="field"><span>Arguments</span><input name="launchArgs" value="${escapeHtml(formatLaunchArgs(settings.launchArgs))}" placeholder="--launch_mode none" /></label>
            <p class="helper-copy">Managed mode mirrors stdout/stderr into Logs and can stop the process tree it started.</p>
          `}
          <div class="form-actions settings-actions">
            <button class="primary-button" type="submit">Connect</button>
            <button class="secondary-button" type="button" data-action="start-swarm" ${runtime.kind !== "tauri" ? "disabled" : ""}>${systemLaunch ? "Open Swarm" : "Start local"}</button>
            <button class="danger-soft" type="button" data-action="stop-swarm" ${runtime.kind !== "tauri" || systemLaunch || !this.processStatus.running ? "disabled" : ""}>Stop process tree</button>
          </div>
        </form>
        <div class="runtime-status-grid settings-runtime-grid">
          <p><span>Connection</span><b>${this.connected ? "Online" : "Offline"}</b></p>
          <p><span>Transport</span><b>${runtime.kind === "tauri" ? "Native" : "Studio relay / browser"}</b></p>
          <p><span>Owned process</span><b>${this.processStatus.running ? `PID ${this.processStatus.pid}` : "None"}</b></p>
          <p><span>Server</span><b>${escapeHtml(this.session?.version ?? "Unknown")}</b></p>
        </div>
        <details class="network-advanced settings-remote-advanced" ${originKey ? "" : "open"}>
          <summary>Remote / browser access</summary>
          <div class="allowed-hosts-card">
            <div class="section-minihead"><b>Direct Swarm access</b><span>${originKey ? "Live Swarm setting" : "Saved locally"}</span></div>
            <p class="helper-copy origin-explainer">Phone/PWA clients normally use Studio's same-origin <code>/__swarm</code> relay on <code>:1420</code>, so these controls are only needed for direct browser-to-Swarm access or a nonstandard network setup.</p>
            <div class="origin-chips">${settings.allowedOrigins.map((origin, index) => `<span class="${settings.activeOrigin === origin ? "is-active" : ""}"><button class="origin-select" data-select-origin="${index}" title="Use this origin">${escapeHtml(origin)}</button><button data-remove-origin="${index}" aria-label="Remove origin">×</button></span>`).join("") || `<em>No origins saved yet.</em>`}</div>
            <div class="origin-add"><input id="origin-input" placeholder="http://your-pc:1420"/><button class="secondary-button" data-action="add-origin">Add & use</button></div>
            <label class="check-row compact-check"><input id="allow-any-origin" type="checkbox" ${settings.activeOrigin === "*" ? "checked" : ""}/><span><b>Allow any Studio origin</b><small>Writes <code>*</code> to Swarm's CORS origin setting.</small></span></label>
            <label class="check-row compact-check"><input id="bind-all-hosts" type="checkbox" ${["0.0.0.0", "*"].includes(hostValue) ? "checked" : ""} ${hostKey ? "" : "disabled"}/><span><b>Listen beyond localhost</b><small>Changes Swarm's host binding. A restart and Windows Firewall permission can still be required.</small></span></label>
            <div class="active-origin-readout"><span>Will write</span><code>${escapeHtml(settings.activeOrigin || "(empty / disabled)")}</code></div>
            <div class="form-actions"><button class="ghost-button" data-action="load-server-network" ${this.connected ? "" : "disabled"}>Reload from Swarm</button><button class="primary-button" data-action="save-server-network" ${this.connected && canEditSettings ? "" : "disabled"}>Save to Swarm</button></div>
            ${this.serverSettingsError ? `<div class="api-diagnostic"><b>ListServerSettings failed</b><code>${escapeHtml(this.serverSettingsError)}</code>${canEditSettings ? `<small>Your session still reports <code>edit_server_settings</code>, so Studio can try a direct write using Swarm's documented Network.Host and Network.AccessControlAllowOrigin keys.</small>` : ""}</div>` : discoveredOriginKey ? `<p class="helper-copy">Live server settings loaded successfully.</p>` : `<p class="helper-copy">The session did not expose network setting metadata.</p>`}
          </div>
        </details>
        <div class="log-preview">${this.logs.slice(-8).map((entry) => `<p class="log-preview--${entry.level}"><time>${displayTime(entry.timestamp)}</time><span>${escapeHtml(entry.message)}</span></p>`).join("") || `<p><span>No diagnostics yet.</span></p>`}</div>
      </section>`;

    const backendPane = `
      <section class="panel settings-card settings-pane-card backend-settings-pane">
        ${this.renderBackendControlRoom()}
      </section>`;

    const theme = this.store.state.theme;
    const colorField = (name: keyof StudioTheme, label: string, value: string) => `<label class="theme-color"><input type="color" name="${name}" value="${escapeHtml(value)}"/><span>${escapeHtml(label)}</span><code>${escapeHtml(value)}</code></label>`;
    const fontField = (name: "titleFont" | "subtitleFont", label: string, value: string) => `<label class="theme-font-field field"><span>${escapeHtml(label)}</span><select name="${name}">${themeFontOptions.map((option) => `<option value="${option.id}" ${option.id === value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></label>`;
    const customProfiles = this.store.state.themeProfiles;
    const appearancePane = `
      <section class="panel settings-card settings-pane-card appearance-settings">
        <div class="panel-heading"><div><span class="panel-kicker">APPEARANCE</span><h2>Theme</h2></div><button class="ghost-button" type="button" data-action="reset-theme">Reset</button></div>
        <div class="theme-profile-row">
          ${builtInThemes.map((profile) => `<button class="theme-profile-button" type="button" data-theme-built-in="${profile.id}"><span style="--swatch-a:${profile.theme.accent};--swatch-b:${profile.theme.panel}"></span><b>${escapeHtml(profile.name)}</b></button>`).join("")}
        </div>
        <div class="theme-profile-tools"><select id="theme-profile-select"><option value="">Saved profiles…</option>${customProfiles.map((profile) => `<option value="${profile.id}">${escapeHtml(profile.name)}</option>`).join("")}</select><button class="secondary-button" type="button" data-action="load-theme-profile">Load</button><button class="secondary-button" type="button" data-action="save-theme-profile">Save current</button><button class="danger-soft" type="button" data-action="delete-theme-profile">Delete</button></div>
        <form id="theme-form" class="theme-settings-form">
          <div class="section-minihead theme-form-heading"><b>Core colors</b><span>Chrome + content</span></div>
          <div class="theme-color-grid">
            ${colorField("accent", "Accent", theme.accent)}
            ${colorField("accentAlt", "Accent glow", theme.accentAlt)}
            ${colorField("background", "Background", theme.background)}
            ${colorField("panel", "Panels", theme.panel)}
            ${colorField("text", "Text", theme.text)}
            ${colorField("muted", "Muted text", theme.muted)}
            ${colorField("outline", "Outlines", theme.outline)}
          </div>
          <div class="section-minihead theme-form-heading"><b>Typography</b><span>Headings only · body text stays readable</span></div>
          <div class="theme-font-grid">
            ${fontField("titleFont", "Title font", theme.titleFont)}
            ${fontField("subtitleFont", "Subtitle font", theme.subtitleFont)}
          </div>
          <div class="section-minihead theme-form-heading"><b>Semantic + utility</b><span>Status, warnings, destructive actions, neutral slabs</span></div>
          <div class="theme-color-grid">
            ${colorField("success", "Success / online", theme.success)}
            ${colorField("warning", "Warning", theme.warning)}
            ${colorField("danger", "Danger text + icons", theme.danger)}
            ${colorField("dangerSurface", "Danger surface", theme.dangerSurface)}
            ${colorField("surfaceAlt", "Utility surface", theme.surfaceAlt)}
          </div>
          <label class="range-field"><span>Panel radius <b id="theme-radius-value">${theme.radius}px</b></span><input name="radius" type="range" min="0" max="32" step="1" value="${theme.radius}" /></label>
          <label class="range-field"><span>Button + control radius <b id="theme-control-radius-value">${theme.controlRadius}px</b></span><input name="controlRadius" type="range" min="0" max="24" step="1" value="${theme.controlRadius}" /></label>
          <label class="range-field"><span>Outline strength <b id="theme-border-value">${Math.round(theme.borderStrength * 100)}%</b></span><input name="borderStrength" type="range" min="0" max="0.5" step="0.01" value="${theme.borderStrength}" /></label>
          <label class="range-field"><span>Surface opacity <b id="theme-opacity-value">${Math.round(theme.surfaceOpacity * 100)}%</b></span><input name="surfaceOpacity" type="range" min="0.45" max="1" step="0.01" value="${theme.surfaceOpacity}" /></label>
        </form>
        <div class="section-minihead settings-subhead"><b>Generation</b><span>Floating monitor</span></div><label class="check-row compact-check"><input id="generation-mini-enabled" type="checkbox" ${this.generationMiniEnabled ? "checked" : ""}/><span><b>Show generation mini-monitor</b><small>When you leave Create during a render, show a draggable live preview with sampler-step progress.</small></span></label><div class="section-minihead settings-subhead"><b>LoRA browser</b><span>Grid density</span></div>
        <label class="field"><span>Grid card size</span><select id="lora-grid-size"><option value="comfortable" ${this.loraGridSize === "comfortable" ? "selected" : ""}>Comfortable · 2 columns on mobile</option><option value="compact" ${this.loraGridSize === "compact" ? "selected" : ""}>Compact · 3 columns on mobile</option></select><small>Compact also fits more cards per row on desktop while keeping portrait previews.</small></label>
      </section>`;

    return `
      <div class="settings-shell">
        <aside class="settings-sidebar panel">
          <button class="${pane === "connection" ? "is-active" : ""}" data-settings-pane="connection"><span>${tabConnectionSvg}</span><div><b>Connection</b><small>Account, process, network</small></div></button>
          <button class="${pane === "backend" ? "is-active" : ""}" data-settings-pane="backend"><span>${tabBackendSvg}</span><div><b>Backends</b><small>Versions, policy, recovery</small></div></button>
          <button class="${pane === "appearance" ? "is-active" : ""}" data-settings-pane="appearance"><span>${tabAppearanceSvg}</span><div><b>Appearance</b><small>Theme profiles + shape</small></div></button>
        </aside>
        <div class="settings-pane-host">${pane === "connection" ? connectionPane : pane === "backend" ? backendPane : appearancePane}</div>
      </div>`;
  }

  private hideClueTooltip(): void {
    const tooltip = this.root.querySelector<HTMLElement>("#clue-tooltip");
    if (!tooltip) return;
    tooltip.hidden = true;
    tooltip.textContent = "";
  }

  private showClueTooltip(clue: HTMLElement): void {
    if (window.matchMedia("(max-width: 760px)").matches) return;
    const tooltip = this.root.querySelector<HTMLElement>("#clue-tooltip");
    const text = String(clue.dataset.clue ?? "").trim();
    if (!tooltip || !text) return;
    tooltip.textContent = text;
    tooltip.hidden = false;
    tooltip.style.left = "0px";
    tooltip.style.top = "0px";
    window.requestAnimationFrame(() => {
      if (tooltip.hidden || !tooltip.isConnected || !clue.isConnected) return;
      const clueRect = clue.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const margin = 10;
      let left = clueRect.left;
      let top = clueRect.bottom + 7;
      if (left + tooltipRect.width > window.innerWidth - margin) left = window.innerWidth - tooltipRect.width - margin;
      if (left < margin) left = margin;
      if (top + tooltipRect.height > window.innerHeight - margin) top = clueRect.top - tooltipRect.height - 7;
      if (top < margin) top = margin;
      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(top)}px`;
    });
  }

  private bindGlobalEvents(): void {
    this.bindStudioUpdateEvents();
    this.root.querySelector<HTMLElement>("[data-action='hide-generation-mini']")?.addEventListener("click", () => { this.generationMiniEnabled = false; try { localStorage.setItem("swarm-studio-generation-mini", "false"); } catch {} this.root.querySelector<HTMLElement>("[data-generation-mini]")?.remove(); });
    const mini = this.root.querySelector<HTMLElement>("[data-generation-mini]");
    const drag = this.root.querySelector<HTMLElement>("[data-generation-mini-drag]");
    drag?.addEventListener("pointerdown", (event) => {
      if ((event.target as HTMLElement).closest("button")) return;
      event.preventDefault(); drag.setPointerCapture(event.pointerId);
      const rect = mini?.getBoundingClientRect(); if (!mini || !rect) return;
      const ox = event.clientX - rect.left, oy = event.clientY - rect.top;
      const move = (moveEvent: PointerEvent) => { this.generationMiniX = clamp(moveEvent.clientX - ox, 8, Math.max(8, window.innerWidth - mini.offsetWidth - 8)); this.generationMiniY = clamp(moveEvent.clientY - oy, 8, Math.max(8, window.innerHeight - mini.offsetHeight - 8)); mini.style.left = `${this.generationMiniX}px`; mini.style.top = `${this.generationMiniY}px`; mini.style.right = "auto"; mini.style.bottom = "auto"; };
      const up = () => { drag.removeEventListener("pointermove", move); drag.removeEventListener("pointerup", up); try { localStorage.setItem("swarm-studio-generation-mini-x", String(this.generationMiniX ?? 0)); localStorage.setItem("swarm-studio-generation-mini-y", String(this.generationMiniY ?? 0)); } catch {} };
      drag.addEventListener("pointermove", move); drag.addEventListener("pointerup", up);
    });
    this.root.querySelectorAll<HTMLElement>("[data-nav]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const requested = button.dataset.nav as StudioView | undefined;
        if (!requested) return;
        if (requested === "settings" && this.view === "settings") {
          this.view = this.lastNonSettingsView;
        } else {
          if (this.view !== "settings") this.lastNonSettingsView = this.view;
          this.view = requested;
        }
        if (this.view !== "settings") this.lastNonSettingsView = this.view;
        if (requested === "create" && window.matchMedia("(max-width: 760px)").matches) {
          this.store.updateUi({ mobileCreatePane: "output" });
          this.resetMobileScrollAfterRender = true;
        }
        this.store.updateUi({ lastView: this.view, selectedOutputId: "" });
        const shouldLoadCivitai = this.view === "civitai" && !this.civitaiLoadedOnce;
        this.render();
        if (shouldLoadCivitai) void this.searchCivitai(true);
      });
    });
    this.root.querySelectorAll<HTMLElement>("[data-mobile-section]").forEach((button) => button.addEventListener("click", () => {
      const section = button.dataset.mobileSection;
      if (["create", "visuals", "library", "settings"].includes(String(section))) {
        this.openMobileSection(section as "create" | "visuals" | "library" | "settings");
      }
    }));
    const quickNavTrigger = this.root.querySelector<HTMLElement>("[data-action=\"quick-nav\"]");
    const quickNavOverlay = this.root.querySelector<HTMLElement>("[data-quicknav-overlay]");
    if (quickNavTrigger && quickNavOverlay && window.matchMedia("(max-width: 760px)").matches) {
      let pointerId = -1;
      let startX = 0;
      let startY = 0;
      let dragged = false;
      const openOverlay = () => {
        this.quickNavOpen = true;
        quickNavOverlay.hidden = false;
        quickNavOverlay.classList.add("is-open");
        quickNavTrigger.classList.add("is-open");
        quickNavTrigger.setAttribute("aria-expanded", "true");
      };
      const closeOverlay = () => {
        this.quickNavOpen = false;
        this.setQuickNavTarget(null);
        quickNavOverlay.classList.remove("is-open");
        quickNavOverlay.hidden = true;
        quickNavTrigger.classList.remove("is-open");
        quickNavTrigger.setAttribute("aria-expanded", "false");
      };
      const targetAt = (x: number, y: number): "create" | "visuals" | "library" | "settings" | null => {
        let bestId: "create" | "visuals" | "library" | "settings" | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        this.root.querySelectorAll<HTMLElement>("[data-quicknav-target]").forEach((option) => {
          const rect = option.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const distance = Math.hypot(x - cx, y - cy);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestId = option.dataset.quicknavTarget as "create" | "visuals" | "library" | "settings";
          }
        });
        return bestDistance < 120 ? bestId : null;
      };
      quickNavTrigger.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        dragged = false;
        openOverlay();
        try { quickNavTrigger.setPointerCapture(pointerId); } catch {}
      });
      quickNavTrigger.addEventListener("pointermove", (event) => {
        if (event.pointerId !== pointerId || pointerId < 0) return;
        if (Math.hypot(event.clientX - startX, event.clientY - startY) > 12) dragged = true;
        if (dragged) this.setQuickNavTarget(targetAt(event.clientX, event.clientY));
      });
      quickNavTrigger.addEventListener("pointerup", (event) => {
        if (event.pointerId !== pointerId) return;
        try { quickNavTrigger.releasePointerCapture(pointerId); } catch {}
        pointerId = -1;
        if (dragged && this.quickNavTarget) {
          const target = this.quickNavTarget;
          this.openMobileSection(target);
          return;
        }
        if (dragged) closeOverlay();
        // A normal tap intentionally leaves the switcher open for tap selection.
      });
      quickNavTrigger.addEventListener("pointercancel", () => { pointerId = -1; closeOverlay(); });
      quickNavTrigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if ((event as MouseEvent).detail === 0) {
          if (quickNavOverlay.hidden) openOverlay();
          else closeOverlay();
        }
      });
      quickNavOverlay.addEventListener("click", (event) => {
        const option = (event.target as HTMLElement).closest<HTMLElement>("[data-quicknav-target]");
        if (option) {
          this.openMobileSection(option.dataset.quicknavTarget as "create" | "visuals" | "library" | "settings");
          return;
        }
        if (event.target === quickNavOverlay) closeOverlay();
      });
      this.root.querySelectorAll<HTMLElement>("[data-quicknav-target]").forEach((option) => {
        option.addEventListener("pointerenter", () => this.setQuickNavTarget(option.dataset.quicknavTarget as "create" | "visuals" | "library" | "settings"));
      });
    }
    this.root.querySelectorAll<HTMLElement>("[data-mobile-settings]").forEach((button) => button.addEventListener("click", () => {
      const target = button.dataset.mobileSettings;
      if (target === "logs") {
        this.view = "logs";
        this.store.updateUi({ lastView: "logs", selectedOutputId: "" });
      } else if (["connection", "backend", "appearance"].includes(String(target))) {
        this.view = "settings";
        this.store.updateUi({ lastView: "settings", settingsPane: target as StudioUiState["settingsPane"], selectedOutputId: "" });
      }
      this.resetMobileScrollAfterRender = true;
      this.render();
    }));
    const swipeHost = this.root.querySelector<HTMLElement>("#view-host");
    if (swipeHost && window.matchMedia("(max-width: 760px)").matches) {
      let startX = 0;
      let startY = 0;
      let lastX = 0;
      let lastY = 0;
      let swipeAllowed = false;
      swipeHost.addEventListener("touchstart", (event) => {
        const target = event.target as HTMLElement;
        swipeAllowed = !this.mobileSwipeBusy && !Boolean(target.closest("input,textarea,select,button,.lora-stack,.preset-stack,.log-console,[data-no-swipe]"));
        const touch = event.touches[0];
        if (!touch) return;
        startX = lastX = touch.clientX;
        startY = lastY = touch.clientY;
      }, { passive: true });
      swipeHost.addEventListener("touchmove", (event) => {
        if (!swipeAllowed) return;
        const touch = event.touches[0];
        if (!touch) return;
        lastX = touch.clientX;
        lastY = touch.clientY;
        const dx = lastX - startX;
        const dy = lastY - startY;
        if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.15) event.preventDefault();
      }, { passive: false });
      swipeHost.addEventListener("touchcancel", () => { swipeAllowed = false; }, { passive: true });
      swipeHost.addEventListener("touchend", (event) => {
        if (!swipeAllowed || this.mobileSwipeBusy) return;
        const touch = event.changedTouches[0];
        if (touch) { lastX = touch.clientX; lastY = touch.clientY; }
        const dx = lastX - startX;
        const dy = lastY - startY;
        swipeAllowed = false;
        if (Math.abs(dx) < 52 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        const direction: -1 | 1 = dx < 0 ? 1 : -1;
        this.mobileSwipeBusy = true;
        swipeHost.classList.add(direction > 0 ? "mobile-exit-left" : "mobile-exit-right");
        window.setTimeout(() => {
          this.mobileEnterDirection = direction;
          this.cycleMobileContext(direction);
        }, 105);
      }, { passive: true });
    }
    this.root.querySelectorAll<HTMLElement>("[data-action='connect']").forEach((button) => button.addEventListener("click", () => {
      const settings = this.store.state.connection;
      const ensureLocal = runtime.kind === "tauri" && settings.mode === "local";
      void this.connect(ensureLocal);
    }));
    this.root.querySelectorAll<HTMLElement>("[data-mobile-pane]").forEach((button) => button.addEventListener("click", () => {
      const pane = button.dataset.mobilePane as "generation" | "output" | "tune" | undefined;
      if (!pane) return;
      this.view = "create";
      this.lastNonSettingsView = "create";
      this.store.updateUi({ lastView: "create", mobileCreatePane: pane, selectedOutputId: "" });
      this.resetMobileScrollAfterRender = true;
      this.render();
    }));
    this.root.querySelectorAll<HTMLElement>("[data-action='close-inspector']").forEach((element) => element.addEventListener("click", (event) => {
      if (event.currentTarget !== event.target && (event.target as HTMLElement).closest("[data-inspector-panel]")) return;
      if (this.droppedInspectorOutput?.id === this.store.state.ui.selectedOutputId) this.droppedInspectorOutput = null;
      this.store.updateUi({ selectedOutputId: "" });
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-inspector-panel]")?.addEventListener("click", (event) => event.stopPropagation());
    this.root.querySelectorAll<HTMLElement>("[data-inspect-output]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = button.dataset.inspectOutput;
      if (!id) return;
      this.store.updateUi({ selectedOutputId: id });
      this.render();
      const output = this.outputById(id);
      if (output && this.metadataValue(this.metadataParams(output.metadata), "prompt") == null) {
        void this.ensureOutputMetadata(output).then(() => {
          if (this.store.state.ui.selectedOutputId === id) this.render();
        });
      }
    }));
    this.root.querySelectorAll<HTMLElement>("[data-reuse-output]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.reuseOutput(button.dataset.reuseOutput ?? "");
    }));
    this.root.querySelectorAll<HTMLElement>("[data-init-output]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.useOutputAsInit(button.dataset.initOutput ?? "");
    }));
    this.root.querySelectorAll<HTMLElement>("[data-inpaint-output]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.openInpaintForOutput(button.dataset.inpaintOutput ?? "");
    }));
    this.root.querySelectorAll<HTMLElement>("[data-copy-resolved-prompt]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const output = this.outputById(button.dataset.copyResolvedPrompt ?? "");
      if (!output) return;
      void this.ensureOutputMetadata(output).then(async (params) => {
        const prompt = String(this.metadataValue(params, "prompt") ?? output.sentPrompt ?? output.prompt ?? "");
        if (!prompt) return this.notify("No resolved prompt was recorded for this output.", "info");
        await navigator.clipboard.writeText(prompt);
        this.notify("Resolved prompt copied.", "success");
      }).catch((error) => this.notify(error instanceof Error ? error.message : String(error), "error"));
    }));

    this.root.querySelectorAll<HTMLElement>("[data-action='close-lora-download']").forEach((element) => element.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-download-panel]") && !(event.target as HTMLElement).closest("[data-action='close-lora-download']")) return;
      this.loraDownloadOpen = false;
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-download-panel]")?.addEventListener("click", (event) => event.stopPropagation());
    this.root.querySelector<HTMLFormElement>("#lora-download-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.startLoraDownload(event.currentTarget as HTMLFormElement);
    });
    const downloadUrl = this.root.querySelector<HTMLInputElement>("#lora-download-url");
    const downloadName = this.root.querySelector<HTMLInputElement>("#lora-download-name");
    const scheduleDownloadResolve = () => {
      this.loraDownloadUrl = downloadUrl?.value ?? this.loraDownloadUrl;
      this.loraDownloadName = downloadName?.value ?? this.loraDownloadName;
      window.clearTimeout(this.loraDownloadResolveTimer);
      const url = this.loraDownloadUrl.trim();
      if (!url) {
        this.loraDownloadResolved = null;
        this.loraDownloadResolving = false;
        this.loraDownloadMessage = "Ready.";
        return;
      }
      this.loraDownloadResolveTimer = window.setTimeout(() => void this.resolveLoraDownload(url, this.loraDownloadName), 420);
    };
    downloadUrl?.addEventListener("input", scheduleDownloadResolve);
    downloadName?.addEventListener("input", scheduleDownloadResolve);

    this.root.querySelectorAll<HTMLElement>("[data-action='close-model-metadata-viewer']").forEach((element) => element.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-model-metadata-viewer-panel]") && !(event.target as HTMLElement).closest("[data-action='close-model-metadata-viewer']")) return;
      this.modelMetadataViewer = null;
      this.modelMetadataViewerLoading = false;
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-model-metadata-viewer-panel]")?.addEventListener("click", (event) => event.stopPropagation());
    this.root.querySelectorAll<HTMLElement>("[data-view-model-metadata]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.openModelMetadataViewer(button.dataset.viewModelMetadata ?? "");
    }));
    this.root.querySelector<HTMLElement>("[data-model-metadata-viewer-panel] [data-edit-model-metadata]")?.addEventListener("click", (event) => {
      event.preventDefault();
      const name = (event.currentTarget as HTMLElement).dataset.editModelMetadata ?? "";
      this.modelMetadataViewer = null;
      this.modelMetadataViewerLoading = false;
      void this.openModelMetadataEditor(name);
    });

    this.root.querySelectorAll<HTMLElement>("[data-action='close-model-metadata']").forEach((element) => element.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-model-metadata-panel]") && !(event.target as HTMLElement).closest("[data-action='close-model-metadata']")) return;
      this.modelMetadataEditor = null;
      this.modelMetadataLoading = false;
      this.modelMetadataPreviewDataUrl = "";
      this.modelMetadataCivitaiUrl = "";
      this.modelMetadataCivitaiLoading = false;
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-model-metadata-panel]")?.addEventListener("click", (event) => event.stopPropagation());
    this.root.querySelector<HTMLFormElement>("#model-metadata-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.saveModelMetadata(event.currentTarget as HTMLFormElement);
    });
    this.root.querySelector<HTMLInputElement>("#model-metadata-civitai-url")?.addEventListener("input", (event) => {
      this.modelMetadataCivitaiUrl = (event.currentTarget as HTMLInputElement).value;
    });
    this.root.querySelector<HTMLElement>("[data-action='pull-model-civitai-metadata']")?.addEventListener("click", () => void this.pullModelMetadataFromCivitai());
    this.root.querySelector<HTMLInputElement>("#model-metadata-preview-file")?.addEventListener("change", (event) => {
      const file = (event.currentTarget as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        this.modelMetadataPreviewDataUrl = String(reader.result ?? "");
        const current = this.root.querySelector<HTMLElement>("#model-metadata-preview");
        if (current instanceof HTMLImageElement) current.src = this.modelMetadataPreviewDataUrl;
        else if (current) {
          const image = document.createElement("img");
          image.id = "model-metadata-preview";
          image.src = this.modelMetadataPreviewDataUrl;
          image.alt = "";
          current.replaceWith(image);
        }
      };
      reader.onerror = () => this.notify("Could not read that preview image.", "error");
      reader.readAsDataURL(file);
    });

    this.root.querySelectorAll<HTMLElement>("[data-action='close-preset-editor']").forEach((element) => element.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-preset-editor-panel]") && !(event.target as HTMLElement).closest("[data-action='close-preset-editor']")) return;
      this.presetEditorOpen = false;
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-preset-editor-panel]")?.addEventListener("click", (event) => event.stopPropagation());
    this.root.querySelector<HTMLFormElement>("#preset-editor-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.savePresetFromEditor(event.currentTarget as HTMLFormElement);
    });
    this.root.querySelectorAll<HTMLElement>("[data-action='close-inpaint']").forEach((element) => element.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-inpaint-panel]") && !(event.target as HTMLElement).closest("[data-action='close-inpaint']")) return;
      this.closeInpaintEditor();
    }));
    const inpaintPanel = this.root.querySelector<HTMLElement>("[data-inpaint-panel]");
    inpaintPanel?.addEventListener("click", (event) => event.stopPropagation());
    this.root.querySelector<HTMLElement>("[data-action='open-inpaint-settings']")?.addEventListener("click", () => {
      this.inpaintSettingsOpen = true;
      this.inpaintHelpOpen = false;
      this.render();
    });
    this.root.querySelectorAll<HTMLElement>("[data-action='open-inpaint-settings']").forEach((button, index) => {
      if (index === 0) return;
      button.addEventListener("click", () => {
        this.inpaintSettingsOpen = true;
        this.inpaintHelpOpen = false;
        this.render();
      });
    });
    this.root.querySelector<HTMLElement>("[data-action='open-inpaint-help']")?.addEventListener("click", () => {
      this.inpaintHelpOpen = true;
      this.inpaintSettingsOpen = false;
      this.render();
    });
    this.root.querySelectorAll<HTMLElement>("[data-action='close-inpaint-settings']").forEach((element) => element.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-inpaint-settings-panel]") && !(event.target as HTMLElement).closest("[data-action='close-inpaint-settings']")) return;
      this.inpaintSettingsOpen = false;
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-inpaint-settings-panel]")?.addEventListener("click", (event) => event.stopPropagation());
    this.root.querySelectorAll<HTMLElement>("[data-action='close-inpaint-help']").forEach((element) => element.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-inpaint-help-panel]") && !(event.target as HTMLElement).closest("[data-action='close-inpaint-help']")) return;
      this.inpaintHelpOpen = false;
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-inpaint-help-panel]")?.addEventListener("click", (event) => event.stopPropagation());
    this.root.querySelectorAll<HTMLElement>("[data-inpaint-tool]").forEach((button) => button.addEventListener("click", () => {
      const tool = button.dataset.inpaintTool;
      if (tool === "paint" || tool === "erase" || tool === "rect" || tool === "lasso" || tool === "pan") {
        this.inpaintTool = tool;
        this.render();
      }
    }));
    this.root.querySelector<HTMLElement>("[data-action='inpaint-undo']")?.addEventListener("click", () => {
      const stroke = this.inpaintStrokes.pop();
      if (!stroke) return;
      this.inpaintRedo.push(stroke);
      this.inpaintMaskDirty = true;
      this.inpaintProcessedMaskDirty = true;
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='inpaint-redo']")?.addEventListener("click", () => {
      const stroke = this.inpaintRedo.pop();
      if (!stroke) return;
      this.inpaintStrokes.push(stroke);
      this.inpaintMaskDirty = true;
      this.inpaintProcessedMaskDirty = true;
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='inpaint-clear']")?.addEventListener("click", () => {
      this.inpaintStrokes = [];
      this.inpaintRedo = [];
      this.inpaintPreviewStroke = null;
      this.inpaintImportedMaskDataUrl = "";
      this.inpaintImportedMaskElement = null;
      this.inpaintInvert = false;
      this.inpaintMaskDirty = true;
      this.inpaintProcessedMaskDirty = true;
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='inpaint-invert']")?.addEventListener("click", () => {
      this.inpaintInvert = !this.inpaintInvert;
      this.inpaintProcessedMaskDirty = true;
      this.drawInpaintCanvas();
      this.refreshInpaintActionState();
    });
    this.root.querySelector<HTMLElement>("[data-action='reset-inpaint-view']")?.addEventListener("click", () => {
      this.inpaintZoom = 1;
      this.inpaintPanX = 0;
      this.inpaintPanY = 0;
      this.drawInpaintCanvas();
    });
    this.root.querySelector<HTMLElement>("[data-action='reset-inpaint-mask-shaping']")?.addEventListener("click", () => {
      this.inpaintFeather = 0;
      this.inpaintExpand = 0;
      this.inpaintProcessedMaskDirty = true;
      this.render();
    });
    this.root.querySelector<HTMLInputElement>("#inpaint-brush-size")?.addEventListener("input", (event) => {
      this.inpaintBrushSize = clamp((event.currentTarget as HTMLInputElement).valueAsNumber || this.inpaintBrushSize, 4, 256);
      const value = this.root.querySelector<HTMLElement>("#inpaint-brush-size-value");
      if (value) value.textContent = `${Math.round(this.inpaintBrushSize)} px`;
      this.drawInpaintCanvas();
    });
    this.root.querySelector<HTMLInputElement>("#inpaint-mask-opacity")?.addEventListener("input", (event) => {
      this.inpaintMaskOpacity = clamp((event.currentTarget as HTMLInputElement).valueAsNumber || this.inpaintMaskOpacity, 0.08, 0.8);
      const value = this.root.querySelector<HTMLElement>("#inpaint-mask-opacity-value");
      if (value) value.textContent = `${Math.round(this.inpaintMaskOpacity * 100)}%`;
      this.drawInpaintCanvas();
    });
    this.root.querySelector<HTMLInputElement>("#inpaint-feather")?.addEventListener("input", (event) => {
      this.inpaintFeather = clamp((event.currentTarget as HTMLInputElement).valueAsNumber || 0, 0, 64);
      const value = this.root.querySelector<HTMLElement>("#inpaint-feather-value");
      if (value) value.textContent = `${Math.round(this.inpaintFeather)} px`;
      this.scheduleInpaintMaskShapeRender();
    });
    this.root.querySelector<HTMLInputElement>("#inpaint-feather")?.addEventListener("change", () => this.scheduleInpaintMaskShapeRender(true));
    this.root.querySelector<HTMLInputElement>("#inpaint-expand")?.addEventListener("input", (event) => {
      this.inpaintExpand = clamp((event.currentTarget as HTMLInputElement).valueAsNumber || 0, -64, 64);
      const value = this.root.querySelector<HTMLElement>("#inpaint-expand-value");
      if (value) value.textContent = `${this.inpaintExpand > 0 ? "+" : ""}${Math.round(this.inpaintExpand)} px`;
      this.scheduleInpaintMaskShapeRender();
    });
    this.root.querySelector<HTMLInputElement>("#inpaint-expand")?.addEventListener("change", () => this.scheduleInpaintMaskShapeRender(true));
    this.root.querySelector<HTMLInputElement>("#inpaint-settings-creativity")?.addEventListener("input", (event) => {
      this.inpaintCreativity = clamp((event.currentTarget as HTMLInputElement).valueAsNumber || this.inpaintCreativity, 0, 1);
      const value = this.root.querySelector<HTMLElement>("#inpaint-settings-creativity-value");
      if (value) value.textContent = this.inpaintCreativity.toFixed(2);
    });
    this.root.querySelector<HTMLSelectElement>("#inpaint-settings-engine")?.addEventListener("change", (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      if (value === "simple" || value === "differential" || value === "encode") this.inpaintEngine = value;
    });
    const bindInpaintNumber = (selector: string, apply: (value: number) => void) => {
      this.root.querySelector<HTMLInputElement>(selector)?.addEventListener("input", (event) => apply((event.currentTarget as HTMLInputElement).valueAsNumber));
    };
    bindInpaintNumber("#inpaint-config-width", (value) => { if (Number.isFinite(value)) this.inpaintConfigWidth = Math.round(clamp(value, 64, 8192)); });
    bindInpaintNumber("#inpaint-config-height", (value) => { if (Number.isFinite(value)) this.inpaintConfigHeight = Math.round(clamp(value, 64, 8192)); });
    bindInpaintNumber("#inpaint-config-steps", (value) => { if (Number.isFinite(value)) this.inpaintConfigSteps = Math.round(clamp(value, 1, 200)); });
    bindInpaintNumber("#inpaint-config-cfg", (value) => { if (Number.isFinite(value)) this.inpaintConfigCfg = clamp(value, 0, 30); });
    bindInpaintNumber("#inpaint-config-seed", (value) => { if (Number.isFinite(value)) this.inpaintConfigSeed = Math.round(clamp(value, -1, 2147483647)); });
    this.root.querySelector<HTMLSelectElement>("#inpaint-config-sampler")?.addEventListener("change", (event) => { this.inpaintConfigSampler = (event.currentTarget as HTMLSelectElement).value; });
    this.root.querySelector<HTMLSelectElement>("#inpaint-config-scheduler")?.addEventListener("change", (event) => { this.inpaintConfigScheduler = (event.currentTarget as HTMLSelectElement).value; });
    this.root.querySelector<HTMLElement>("[data-action='reset-inpaint-generation-settings']")?.addEventListener("click", () => {
      this.resetInpaintGenerationConfigFromSource();
      this.inpaintCreativity = clamp(this.store.state.draft.initImageCreativity || 0.5, 0, 1);
      this.inpaintEngine = "simple";
      this.render();
    });
    this.root.querySelector<HTMLTextAreaElement>("#inpaint-prompt")?.addEventListener("input", (event) => {
      this.inpaintPrompt = (event.currentTarget as HTMLTextAreaElement).value;
    });
    this.root.querySelector<HTMLTextAreaElement>("#inpaint-negative")?.addEventListener("input", (event) => {
      this.inpaintNegativePrompt = (event.currentTarget as HTMLTextAreaElement).value;
    });
    this.root.querySelector<HTMLInputElement>("#inpaint-show-mask")?.addEventListener("change", (event) => {
      this.inpaintShowMask = (event.currentTarget as HTMLInputElement).checked;
      this.drawInpaintCanvas();
    });
    this.root.querySelector<HTMLInputElement>("#inpaint-mask-file")?.addEventListener("change", (event) => void this.importInpaintMask(event.currentTarget as HTMLInputElement));
    this.root.querySelector<HTMLElement>("[data-action='export-inpaint-mask']")?.addEventListener("click", () => this.downloadInpaintMask());
    this.root.querySelectorAll<HTMLElement>("[data-action='generate-inpaint']").forEach((button) => button.addEventListener("click", () => void this.generateInpaint()));
    this.root.querySelector<HTMLElement>("[data-action='use-inpaint-result-as-init']")?.addEventListener("click", () => {
      const latest = this.store.state.outputs[0];
      if (latest) void this.useOutputAsInit(latest.id);
    });
    this.root.querySelector<HTMLElement>("[data-action='dismiss-inpaint-result']")?.addEventListener("click", () => {
      this.inpaintResultReviewOpen = false;
      this.inpaintPendingResultRecord = null;
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='apply-inpaint-result']")?.addEventListener("click", () => {
      void this.applyApprovedInpaintResult();
    });
    inpaintPanel?.addEventListener("keydown", (event) => {
      const target = event.target as HTMLElement;
      const editingText = Boolean(target.closest("textarea,input,select"));
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          const stroke = this.inpaintRedo.pop();
          if (stroke) this.inpaintStrokes.push(stroke);
        } else {
          const stroke = this.inpaintStrokes.pop();
          if (stroke) this.inpaintRedo.push(stroke);
        }
        this.inpaintMaskDirty = true;
        this.inpaintProcessedMaskDirty = true;
        this.render();
        return;
      }
      if (editingText) return;
      const key = event.key.toLowerCase();
      const tool = key === "b" ? "paint" : key === "e" ? "erase" : key === "r" ? "rect" : key === "l" ? "lasso" : key === "h" ? "pan" : "";
      if (tool) {
        event.preventDefault();
        this.inpaintTool = tool as typeof this.inpaintTool;
        this.render();
        return;
      }
      if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        this.inpaintBrushSize = clamp(this.inpaintBrushSize + (event.key === "]" ? 6 : -6), 4, 256);
        this.render();
      }
    });
    this.bindInpaintEditor();
    this.bindGenerationApprovalActions(this.root);
    this.root.querySelector<HTMLElement>("[data-action='delete-preset']")?.addEventListener("click", () => void this.deletePresetFromEditor());
  }

  private bindViewEvents(): void {
    if (this.view === "create") this.bindCreateEvents();
    if (this.view === "library") this.bindLibraryEvents();
    if (this.view === "identities") this.bindIdentityEvents();
    if (this.view === "models") this.bindModelEvents();
    if (this.view === "civitai") this.bindCivitaiEvents();
    if (this.view === "logs") this.bindLogEvents();
    if (this.view === "settings") this.bindSettingsEvents();
  }

  private persistDraftFromForm(immediate = false): void {
    // Keep keystrokes purely in-memory. Persisting the general Studio snapshot here used to make
    // held Backspace serialize archive state repeatedly and could visibly stall/flicker Create.
    this.store.updateDraft(this.readDraftFromForm(), false);
    window.clearTimeout(this.draftSaveTimer);
    const flush = () => {
      this.draftSaveTimer = 0;
      this.store.saveDraft();
    };
    if (immediate) flush();
    else this.draftSaveTimer = window.setTimeout(flush, 320);
  }

  private bindCreateEvents(): void {
    this.root.querySelector<HTMLElement>("[data-action='generate']")?.addEventListener("click", () => void this.generate());
    this.root.querySelector<HTMLElement>("[data-action='interrupt']")?.addEventListener("click", () => void this.interrupt());

    ["#prompt", "#negative-prompt", "#steps", "#cfg", "#seed", "#sampler", "#scheduler"].forEach((selector) => {
      const element = this.root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
      element?.addEventListener("input", () => this.persistDraftFromForm(false));
      element?.addEventListener("change", () => this.persistDraftFromForm(true));
    });

    this.root.querySelector<HTMLSelectElement>("#model")?.addEventListener("change", () => {
      this.persistDraftFromForm();
      this.render();
    });

    this.bindPresetStackControls();
    this.bindRegionEditorControls();

    this.root.querySelector<HTMLElement>("[data-action='toggle-syntax']")?.addEventListener("click", () => {
      this.syntaxMenuOpen = !this.syntaxMenuOpen;
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='close-syntax']")?.addEventListener("click", () => {
      this.syntaxMenuOpen = false;
      this.render();
    });
    this.root.querySelectorAll<HTMLElement>("[data-syntax]").forEach((button) => button.addEventListener("click", () => this.insertSyntax(button.dataset.syntax ?? "")));

    this.bindResolutionControls();

    this.root.querySelectorAll<HTMLElement>("[data-action='toggle-seed']").forEach((button) => button.addEventListener("click", () => void this.toggleSeedMode()));
    this.root.querySelector<HTMLElement>("[data-action='clear-draft']")?.addEventListener("click", () => {
      this.store.updateDraft({ prompt: "", negativePrompt: "", regionalPrompt: emptyRegionalPromptDraft() });
      this.render();
    });
    this.root.querySelectorAll<HTMLElement>("[data-ratio]").forEach((button) => {
      button.addEventListener("click", () => {
        const ratio = button.dataset.ratio ?? "1:1";
        this.applyRatioToInputs(ratio, false);
        this.render();
      });
    });
    this.root.querySelector<HTMLElement>("[data-action='reverse-ratio']")?.addEventListener("click", () => {
      const draft = this.store.state.draft;
      if (draft.ratio === "1:1") return;
      this.applyRatioToInputs(draft.ratio, !draft.ratioReversed);
      this.render();
    });

    this.root.querySelector<HTMLInputElement>("#variation-seed-enabled")?.addEventListener("change", (event) => {
      this.store.updateDraft({ variationSeedEnabled: (event.currentTarget as HTMLInputElement).checked });
      this.render();
    });
    this.root.querySelector<HTMLInputElement>("#variation-seed")?.addEventListener("input", (event) => {
      this.store.updateDraft({ variationSeed: (event.currentTarget as HTMLInputElement).valueAsNumber });
    });
    this.root.querySelector<HTMLInputElement>("#variation-strength")?.addEventListener("input", (event) => {
      const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
      this.store.updateDraft({ variationSeedStrength: value });
      const display = this.root.querySelector<HTMLElement>("#variation-strength-value");
      if (display) display.textContent = value.toFixed(2);
    });
    this.root.querySelector<HTMLElement>("[data-action='randomize-variation-seed']")?.addEventListener("click", () => {
      const value = Math.floor(Math.random() * 2147483647);
      this.store.updateDraft({ variationSeed: value, variationSeedEnabled: true });
      this.render();
      this.notify(`Variation seed randomized · ${value}.`, "info");
    });
    this.root.querySelector<HTMLElement>("[data-action='reuse-variation-seed']")?.addEventListener("click", () => void this.reuseLatestAsVariationSeed());

    this.root.querySelector<HTMLInputElement>("#init-enabled")?.addEventListener("change", (event) => {
      this.store.updateDraft({ initImageEnabled: (event.currentTarget as HTMLInputElement).checked });
    });
    this.root.querySelector<HTMLInputElement>("#init-creativity")?.addEventListener("input", (event) => {
      const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
      this.store.updateDraft({ initImageCreativity: value });
      const display = this.root.querySelector<HTMLElement>("#init-creativity-value");
      if (display) display.textContent = value.toFixed(2);
    });
    this.root.querySelector<HTMLInputElement>("#init-file")?.addEventListener("change", (event) => void this.loadInitFile(event.currentTarget as HTMLInputElement));
    this.root.querySelector<HTMLElement>("[data-action='use-current-init']")?.addEventListener("click", () => {
      const latest = this.store.state.outputs[0];
      if (latest) void this.useOutputAsInit(latest.id);
    });
    this.root.querySelector<HTMLElement>("[data-action='clear-init']")?.addEventListener("click", () => {
      this.store.updateDraft({ initImage: "", initImageName: "", initImageEnabled: false });
      this.render();
    });

    this.root.querySelector<HTMLInputElement>("#review-before-save")?.addEventListener("change", (event) => {
      this.persistReviewBeforeSave(event.currentTarget as HTMLInputElement);
    });

    const initDetails = this.root.querySelector<HTMLDetailsElement>(".init-panel");
    initDetails?.addEventListener("toggle", () => this.store.updateUi({ initOpen: initDetails.open }));
    initDetails?.querySelector<HTMLElement>("[data-stop-toggle]")?.addEventListener("click", (event) => event.stopPropagation());
    const details = this.root.querySelector<HTMLDetailsElement>(".advanced-panel");
    details?.addEventListener("toggle", () => this.store.updateUi({ advancedOpen: details.open }));
    this.root.querySelectorAll<HTMLElement>("[data-stop-toggle]").forEach((element) => element.addEventListener("click", (event) => event.stopPropagation()));
    this.root.querySelectorAll<HTMLElement>(".clue-tip[data-clue]").forEach((clue) => {
      clue.addEventListener("mouseenter", () => this.showClueTooltip(clue));
      clue.addEventListener("mouseleave", () => this.hideClueTooltip());
      clue.addEventListener("focus", () => this.showClueTooltip(clue));
      clue.addEventListener("blur", () => this.hideClueTooltip());
      clue.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (window.matchMedia("(max-width: 760px)").matches) this.notify(clue.dataset.clue || "No description available.", "info");
        else this.showClueTooltip(clue);
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-advanced-group-toggle]").forEach((input) => input.addEventListener("change", (event) => {
      event.stopPropagation();
      const key = input.dataset.advancedGroupToggle;
      if (!key) return;
      const current = new Set(this.store.state.draft.advancedEnabledGroups);
      if (input.checked) current.add(key); else current.delete(key);
      this.store.updateDraft({ advancedEnabledGroups: [...current] });
      this.render();
    }));
    this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-extra-param]").forEach((element) => {
      const persist = () => this.persistExtraParam(element);
      element.addEventListener("input", persist);
      element.addEventListener("change", persist);
    });

    this.bindLoraStackControls();
    this.bindStackReorderModalEvents();
  }

  private bindRegionEditorControls(): void {
    this.root.querySelector<HTMLElement>("[data-action='open-region-editor']")?.addEventListener("click", () => {
      this.persistDraftFromForm(true);
      this.regionEditorSelectedIndex = 0;
      this.regionEditorOpen = true;
      this.render();
    });

    if (!this.regionEditorOpen) return;

    const syncSyntaxPreview = () => {
      const preview = this.root.querySelector<HTMLElement>("[data-region-syntax-preview]");
      if (preview) preview.textContent = this.promptWithTriggers(this.store.state.draft) || "Choose a layout and add a regional prompt to preview syntax.";
    };
    const syncOverlapPreview = (regional: RegionalPromptDraft) => {
      const stage = this.root.querySelector<HTMLElement>("[data-region-stage]");
      if (!stage) return;
      stage.querySelectorAll("[data-region-overlap]").forEach((element) => element.remove());
      for (const overlap of regionOverlapAreas(regional.regions)) {
        const area = document.createElement("i");
        area.className = "region-preview-overlap";
        area.dataset.regionOverlap = "";
        area.style.left = `${overlap.x * 100}%`;
        area.style.top = `${overlap.y * 100}%`;
        area.style.width = `${overlap.width * 100}%`;
        area.style.height = `${overlap.height * 100}%`;
        area.setAttribute("aria-hidden", "true");
        stage.append(area);
      }
    };
    const syncGeometryMode = (regional: RegionalPromptDraft) => {
      const badge = this.root.querySelector<HTMLElement>("[data-region-geometry-mode]");
      if (badge) badge.textContent = regional.regions.length ? `${regional.customGeometry ? "Custom · " : ""}${regional.regions.length} region${regional.regions.length === 1 ? "" : "s"}` : "No layout";
      this.root.querySelectorAll<HTMLElement>("[data-region-layout]").forEach((button) => {
        button.classList.toggle("is-custom", Boolean(regional.customGeometry && button.dataset.regionLayout === regional.layout));
      });
    };
    const syncRegionGeometryPreview = (regional: RegionalPromptDraft) => {
      regional.regions.forEach((region, index) => {
        const box = this.root.querySelector<HTMLElement>(`[data-region-preview="${index}"]`);
        if (!box) return;
        box.style.left = `${region.x * 100}%`;
        box.style.top = `${region.y * 100}%`;
        box.style.width = `${region.width * 100}%`;
        box.style.height = `${region.height * 100}%`;
      });
      syncOverlapPreview(regional);
      syncGeometryMode(regional);
    };
    const selectRegion = (index: number) => {
      this.regionEditorSelectedIndex = index;
      this.root.querySelectorAll<HTMLElement>("[data-region-preview]").forEach((box) => box.classList.toggle("is-selected", Number(box.dataset.regionPreview) === index));
      this.root.querySelectorAll<HTMLElement>("[data-region-card]").forEach((card) => card.classList.toggle("is-selected", Number(card.dataset.regionCard) === index));
    };
    const updateRegional = (mutate: (regional: RegionalPromptDraft) => void, persist = false) => {
      const regional = cloneRegionalPromptDraft(this.store.state.draft.regionalPrompt);
      mutate(regional);
      this.store.updateDraft({ regionalPrompt: regional }, false);
      if (persist) this.store.saveDraft();
      syncSyntaxPreview();
      return regional;
    };

    this.root.querySelectorAll<HTMLElement>("[data-action='close-region-editor']").forEach((element) => element.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-region-editor-panel]") && !(event.target as HTMLElement).closest("[data-action='close-region-editor']")) return;
      this.regionEditorOpen = false;
      this.store.saveDraft();
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-region-editor-panel]")?.addEventListener("click", (event) => event.stopPropagation());

    this.root.querySelectorAll<HTMLElement>("[data-region-layout]").forEach((button) => button.addEventListener("click", () => {
      const preset = button.dataset.regionLayout as RegionLayoutPreset;
      const definition = REGION_LAYOUT_PRESETS.find((item) => item.id === preset);
      if (!definition) return;
      const current = this.store.state.draft.regionalPrompt;
      const discarded = current.regions.slice(definition.regions.length).some((region) => Boolean(region.prompt.trim()));
      if (discarded && !window.confirm("This layout has fewer regions. Prompts in the removed regions will be discarded. Continue?")) return;
      this.regionEditorSelectedIndex = 0;
      this.store.updateDraft({ regionalPrompt: applyRegionLayoutPreset(current, preset) });
      this.render();
    }));

    this.root.querySelector<HTMLInputElement>("[data-region-spacing]")?.addEventListener("input", (event) => {
      const input = event.currentTarget as HTMLInputElement;
      const spacing = input.valueAsNumber / 100;
      const regional = applyRegionPresetSpacing(this.store.state.draft.regionalPrompt, spacing);
      this.store.updateDraft({ regionalPrompt: regional }, false);
      const output = this.root.querySelector<HTMLOutputElement>("[data-region-spacing-output]");
      const percent = Math.round(regional.spacing * 100);
      if (output) output.value = percent < 0 ? `Overlap ${Math.abs(percent)}%` : percent > 0 ? `Gap ${percent}%` : "Touching";
      syncRegionGeometryPreview(regional);
      syncSyntaxPreview();
    });
    this.root.querySelector<HTMLInputElement>("[data-region-spacing]")?.addEventListener("change", () => this.store.saveDraft());

    const stage = this.root.querySelector<HTMLElement>("[data-region-stage]");
    let activePointer: {
      id: number;
      index: number;
      handle: RegionResizeHandle | null;
      startX: number;
      startY: number;
      startRegion: RegionalPromptDraft["regions"][number];
      stageRect: DOMRect;
    } | null = null;
    const finishPointer = (event: PointerEvent) => {
      if (!activePointer || event.pointerId !== activePointer.id) return;
      if (stage?.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      activePointer = null;
      this.store.saveDraft();
    };
    stage?.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      const resizeTarget = target.closest<HTMLElement>("[data-region-resize]");
      const dragTarget = target.closest<HTMLElement>("[data-region-drag]");
      if (!resizeTarget && !dragTarget) return;
      const resizeParts = resizeTarget?.dataset.regionResize?.split(":") ?? [];
      const index = Number(resizeTarget ? resizeParts[0] : dragTarget?.dataset.regionDrag);
      const handle = resizeTarget ? resizeParts[1] as RegionResizeHandle : null;
      const region = this.store.state.draft.regionalPrompt.regions[index];
      if (!region || !Number.isFinite(index)) return;
      selectRegion(index);
      event.preventDefault();
      stage.setPointerCapture(event.pointerId);
      activePointer = {
        id: event.pointerId,
        index,
        handle,
        startX: event.clientX,
        startY: event.clientY,
        startRegion: { ...region },
        stageRect: stage.getBoundingClientRect(),
      };
    });
    stage?.addEventListener("pointermove", (event) => {
      if (!activePointer || event.pointerId !== activePointer.id) return;
      event.preventDefault();
      const dx = (event.clientX - activePointer.startX) / Math.max(1, activePointer.stageRect.width);
      const dy = (event.clientY - activePointer.startY) / Math.max(1, activePointer.stageRect.height);
      const nextRegion = activePointer.handle
        ? resizeRegionGeometry(activePointer.startRegion, activePointer.handle, dx, dy)
        : moveRegionGeometry(activePointer.startRegion, dx, dy);
      const regional = updateRegional((next) => {
        next.customGeometry = true;
        next.regions[activePointer!.index] = nextRegion;
      });
      syncRegionGeometryPreview(regional);
    });
    stage?.addEventListener("pointerup", finishPointer);
    stage?.addEventListener("pointercancel", finishPointer);
    stage?.addEventListener("lostpointercapture", () => {
      if (activePointer) {
        activePointer = null;
        this.store.saveDraft();
      }
    });
    this.root.querySelectorAll<HTMLElement>("[data-region-preview]").forEach((box) => box.addEventListener("focus", () => selectRegion(Number(box.dataset.regionPreview))));
    this.root.querySelectorAll<HTMLElement>("[data-region-card]").forEach((card) => card.addEventListener("focusin", () => selectRegion(Number(card.dataset.regionCard))));

    this.root.querySelector<HTMLElement>("[data-action='clear-regions']")?.addEventListener("click", () => {
      this.regionEditorSelectedIndex = 0;
      this.store.updateDraft({ regionalPrompt: emptyRegionalPromptDraft() });
      this.render();
    });

    this.root.querySelectorAll<HTMLInputElement>("[data-region-name]").forEach((input) => input.addEventListener("input", () => {
      const index = Number(input.dataset.regionName);
      updateRegional((regional) => {
        const region = regional.regions[index];
        if (region) region.name = input.value;
      });
      const label = this.root.querySelector<HTMLElement>(`[data-region-preview="${index}"] span`);
      if (label) label.textContent = input.value.trim() || `Region ${index + 1}`;
    }));

    this.root.querySelectorAll<HTMLTextAreaElement>("[data-region-prompt]").forEach((textarea) => textarea.addEventListener("input", () => {
      const index = Number(textarea.dataset.regionPrompt);
      updateRegional((regional) => {
        const region = regional.regions[index];
        if (region) region.prompt = textarea.value;
      });
    }));

    this.root.querySelectorAll<HTMLInputElement>("[data-region-strength]").forEach((input) => {
      const commit = () => {
        const index = Number(input.dataset.regionStrength);
        const value = Number.isFinite(input.valueAsNumber) ? Math.max(0, input.valueAsNumber) : 1;
        updateRegional((regional) => {
          const region = regional.regions[index];
          if (region) region.strength = value;
        });
      };
      input.addEventListener("input", commit);
      input.addEventListener("change", () => {
        commit();
        this.store.saveDraft();
      });
    });

    this.root.querySelectorAll<HTMLInputElement>("[data-region-enabled]").forEach((input) => input.addEventListener("change", () => {
      const index = Number(input.dataset.regionEnabled);
      updateRegional((regional) => {
        const region = regional.regions[index];
        if (region) region.enabled = input.checked;
      }, true);
      this.render();
    }));

    this.root.querySelector<HTMLInputElement>("[data-region-background-enabled]")?.addEventListener("change", (event) => {
      const checked = (event.currentTarget as HTMLInputElement).checked;
      updateRegional((regional) => { regional.backgroundEnabled = checked; }, true);
      this.render();
    });

    this.root.querySelector<HTMLTextAreaElement>("[data-region-background-prompt]")?.addEventListener("input", (event) => {
      const value = (event.currentTarget as HTMLTextAreaElement).value;
      updateRegional((regional) => { regional.backgroundPrompt = value; });
    });
  }

  private bindPresetStackControls(): void {
    this.root.querySelector<HTMLSelectElement>("#preset-select")?.addEventListener("change", (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      if (!select.value) return;
      this.store.updateDraft({ activePresets: [...this.store.state.draft.activePresets, select.value] });
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='new-preset']")?.addEventListener("click", () => this.openPresetEditor());
    this.root.querySelector<HTMLElement>("[data-action='open-preset-reorder']")?.addEventListener("click", () => {
      this.presetReorderModalOpen = true;
      this.render();
    });
    this.root.querySelectorAll<HTMLElement>("[data-preset-apply]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.presetApply);
      void this.applyPresetFromStack(index);
    }));
    this.root.querySelectorAll<HTMLElement>("[data-preset-edit]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.presetEdit);
      const title = this.store.state.draft.activePresets[index];
      if (title) this.openPresetEditor(title);
    }));
    this.root.querySelectorAll<HTMLElement>("[data-preset-remove]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.presetRemove);
      this.store.updateDraft({ activePresets: this.store.state.draft.activePresets.filter((_, itemIndex) => itemIndex !== index) });
      this.render();
    }));
  }

  private bindResolutionControls(): void {
    const widthInput = this.root.querySelector<HTMLInputElement>("#width");
    const heightInput = this.root.querySelector<HTMLInputElement>("#height");
    widthInput?.addEventListener("input", () => this.handleDimensionInput("width"));
    heightInput?.addEventListener("input", () => this.handleDimensionInput("height"));
    widthInput?.addEventListener("change", () => this.handleDimensionInput("width"));
    heightInput?.addEventListener("change", () => this.handleDimensionInput("height"));
    this.root.querySelector<HTMLElement>("[data-action='toggle-ratio-lock']")?.addEventListener("click", () => {
      const next = !this.store.state.draft.lockRatio;
      this.store.updateDraft({ lockRatio: next });
      if (next) this.handleResolutionSlider(Math.max(this.store.state.draft.width, this.store.state.draft.height));
      this.render();
    });
    this.root.querySelector<HTMLInputElement>("#resolution-scale")?.addEventListener("input", (event) => this.handleResolutionSlider((event.currentTarget as HTMLInputElement).valueAsNumber));
    this.root.querySelector<HTMLInputElement>("#resolution-scale")?.addEventListener("change", (event) => {
      this.handleResolutionSlider((event.currentTarget as HTMLInputElement).valueAsNumber);
      this.render();
    });
    this.root.querySelector<HTMLInputElement>("#resolution-width")?.addEventListener("input", (event) => this.handleResolutionAxisSlider("width", (event.currentTarget as HTMLInputElement).valueAsNumber));
    this.root.querySelector<HTMLInputElement>("#resolution-height")?.addEventListener("input", (event) => this.handleResolutionAxisSlider("height", (event.currentTarget as HTMLInputElement).valueAsNumber));
    this.root.querySelector<HTMLInputElement>("#resolution-width")?.addEventListener("change", (event) => {
      this.handleResolutionAxisSlider("width", (event.currentTarget as HTMLInputElement).valueAsNumber);
      this.render();
    });
    this.root.querySelector<HTMLInputElement>("#resolution-height")?.addEventListener("change", (event) => {
      this.handleResolutionAxisSlider("height", (event.currentTarget as HTMLInputElement).valueAsNumber);
      this.render();
    });
    this.root.querySelectorAll<HTMLElement>("[data-ratio]").forEach((button) => {
      button.addEventListener("click", () => {
        const ratio = button.dataset.ratio ?? "1:1";
        this.applyRatioToInputs(ratio, false);
        this.render();
      });
    });
    this.root.querySelector<HTMLElement>("[data-action='reverse-ratio']")?.addEventListener("click", () => {
      const draft = this.store.state.draft;
      if (draft.ratio === "1:1") return;
      this.applyRatioToInputs(draft.ratio, !draft.ratioReversed);
      this.render();
    });
  }

  private bindLoraStackControls(): void {
    this.root.querySelector<HTMLElement>("[data-action='add-lora']")?.addEventListener("click", () => {
      const select = this.root.querySelector<HTMLSelectElement>("#lora-add-select");
      if (select?.value) this.addLoraToStack(select.value);
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-lora-weight]").forEach((input) => input.addEventListener("input", () => {
      this.patchLora(input.dataset.loraWeight ?? "", { weight: asNumber(input.value, 1) });
    }));
    this.root.querySelectorAll<HTMLInputElement>("[data-lora-trigger]").forEach((input) => input.addEventListener("change", () => {
      this.patchLora(input.dataset.loraTrigger ?? "", { useTrigger: input.checked });
    }));
    this.root.querySelectorAll<HTMLElement>("[data-lora-toggle]").forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.loraToggle ?? "";
      const item = this.store.state.draft.loras.find((entry) => entry.id === id);
      if (!item) return;
      this.patchLora(id, { enabled: !item.enabled });
      this.render();
    }));
    this.root.querySelectorAll<HTMLElement>("[data-lora-remove]").forEach((button) => button.addEventListener("click", () => {
      this.store.updateDraft({ loras: this.store.state.draft.loras.filter((item) => item.id !== button.dataset.loraRemove) });
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-action='open-lora-reorder']")?.addEventListener("click", () => {
      this.loraReorderModalOpen = true;
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='clear-loras']")?.addEventListener("click", () => {
      this.store.updateDraft({ loras: [] });
      this.render();
    });
    this.root.querySelector<HTMLInputElement>("#lora-import")?.addEventListener("change", (event) => void this.importLoraFile(event.currentTarget as HTMLInputElement));
    this.root.querySelector<HTMLElement>("[data-action='export-lora-stack']")?.addEventListener("click", () => this.exportLoraStack());
    this.root.querySelector<HTMLElement>("[data-action='save-lora-profile']")?.addEventListener("click", () => {
      const name = window.prompt("Stack name?", "LoRA stack");
      if (!name?.trim()) return;
      this.store.saveLoraProfile(name, this.store.state.draft.loras, "studio");
      this.notify("LoRA stack saved.", "success");
      this.render();
    });
    this.root.querySelector<HTMLSelectElement>("#lora-profile-select")?.addEventListener("change", (event) => {
      const id = (event.currentTarget as HTMLSelectElement).value;
      if (!id) return;
      const profile = this.store.state.loraProfiles.find((item) => item.id === id);
      if (!profile) return;
      this.store.updateDraft({ loras: cloneStack(profile.items) });
      this.notify(`${profile.name} loaded.`, "success");
      this.render();
    });
  }

  private bindStackReorderModalEvents(): void {
    this.root.querySelectorAll<HTMLElement>("[data-action='close-preset-reorder']").forEach((element) => element.addEventListener("click", (event) => {
      const host = event.currentTarget as HTMLElement;
      if (host.classList.contains("stack-reorder-backdrop") && host !== event.target && (event.target as HTMLElement).closest("[data-stack-reorder-dialog]")) return;
      this.presetReorderModalOpen = false;
      this.stackReorderDrag = null;
      this.render();
    }));
    this.root.querySelectorAll<HTMLElement>("[data-action='close-lora-reorder']").forEach((element) => element.addEventListener("click", (event) => {
      const host = event.currentTarget as HTMLElement;
      if (host.classList.contains("stack-reorder-backdrop") && host !== event.target && (event.target as HTMLElement).closest("[data-stack-reorder-dialog]")) return;
      this.loraReorderModalOpen = false;
      this.stackReorderDrag = null;
      this.render();
    }));
    this.root.querySelectorAll<HTMLElement>("[data-stack-item]").forEach((row) => {
      row.addEventListener("dragstart", (event) => {
        const index = Number(row.dataset.stackIndex);
        const kind = row.dataset.stackItem as "preset" | "lora";
        this.stackReorderDrag = Number.isInteger(index) ? { kind, from: index } : null;
        row.classList.add("is-dragging");
        event.dataTransfer?.setData("text/plain", String(index));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("is-dragging");
        this.root.querySelectorAll<HTMLElement>("[data-stack-item]").forEach((item) => item.classList.remove("is-drop-target"));
        this.stackReorderDrag = null;
      });
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (this.stackReorderDrag && row.dataset.stackItem === this.stackReorderDrag.kind) row.classList.add("is-drop-target");
      });
      row.addEventListener("dragleave", () => row.classList.remove("is-drop-target"));
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        row.classList.remove("is-drop-target");
        const target = Number(row.dataset.stackIndex);
        const drag = this.stackReorderDrag;
        if (!drag || !Number.isInteger(target) || row.dataset.stackItem !== drag.kind) return;
        if (drag.kind === "preset") this.reorderPreset(drag.from, target);
        else this.reorderLora(drag.from, target);
      });
    });
  }

  private pngParametersFromDataUrl(dataUrl: string): string {
    if (!/^data:image\/png(?:;[^,]*)?,/i.test(dataUrl)) return "";
    try {
      const comma = dataUrl.indexOf(",");
      if (comma < 0) return "";
      const header = dataUrl.slice(0, comma);
      const body = dataUrl.slice(comma + 1);
      const binary = /;base64/i.test(header) ? atob(body) : decodeURIComponent(body);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      if (bytes.length < 12 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return "";
      const decoder = new TextDecoder("utf-8");
      let offset = 8;
      while (offset + 12 <= bytes.length) {
        const length = ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
        const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
        const start = offset + 8;
        const end = start + length;
        if (end + 4 > bytes.length) break;
        if (type === "tEXt") {
          const data = bytes.slice(start, end);
          const nul = data.indexOf(0);
          if (nul > 0) {
            const keyword = decoder.decode(data.slice(0, nul));
            if (keyword === "parameters") return decoder.decode(data.slice(nul + 1));
          }
        } else if (type === "iTXt") {
          const data = bytes.slice(start, end);
          const firstNul = data.indexOf(0);
          if (firstNul > 0 && decoder.decode(data.slice(0, firstNul)) === "parameters") {
            const compressionFlag = data[firstNul + 1] ?? 0;
            let cursor = firstNul + 3;
            const languageEnd = data.indexOf(0, cursor);
            if (languageEnd < 0) return "";
            cursor = languageEnd + 1;
            const translatedEnd = data.indexOf(0, cursor);
            if (translatedEnd < 0) return "";
            cursor = translatedEnd + 1;
            if (compressionFlag === 0) return decoder.decode(data.slice(cursor));
          }
        }
        offset = end + 4;
      }
    } catch { /* image metadata fallback is best-effort */ }
    return "";
  }

  private jpegUserCommentFromArrayBuffer(buffer: ArrayBuffer): string {
    try {
      const bytes = new Uint8Array(buffer);
      if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return "";
      let offset = 2;
      while (offset + 4 <= bytes.length) {
        if (bytes[offset] !== 0xff) { offset += 1; continue; }
        const marker = bytes[offset + 1]!;
        offset += 2;
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (offset + 2 > bytes.length) break;
        const segmentLength = (bytes[offset]! << 8) | bytes[offset + 1]!;
        if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
        const segmentStart = offset + 2;
        const segmentEnd = offset + segmentLength;
        if (marker === 0xe1 && segmentEnd - segmentStart >= 14) {
          const exif = bytes.slice(segmentStart, segmentEnd);
          if (String.fromCharCode(...exif.slice(0, 6)) === "Exif\u0000\u0000") {
            const tiffStart = 6;
            const little = exif[tiffStart] === 0x49 && exif[tiffStart + 1] === 0x49;
            const big = exif[tiffStart] === 0x4d && exif[tiffStart + 1] === 0x4d;
            if (!little && !big) { offset += segmentLength; continue; }
            const read16 = (at: number) => little
              ? (exif[at]! | (exif[at + 1]! << 8))
              : ((exif[at]! << 8) | exif[at + 1]!);
            const read32 = (at: number) => little
              ? ((exif[at]! | (exif[at + 1]! << 8) | (exif[at + 2]! << 16) | (exif[at + 3]! << 24)) >>> 0)
              : (((exif[at]! << 24) | (exif[at + 1]! << 16) | (exif[at + 2]! << 8) | exif[at + 3]!) >>> 0);
            if (read16(tiffStart + 2) !== 42) { offset += segmentLength; continue; }
            const typeSize = (type: number) => ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 } as Record<number, number>)[type] ?? 1;
            const entryData = (entryAt: number, type: number, count: number): Uint8Array => {
              const size = typeSize(type) * count;
              const dataAt = size <= 4 ? entryAt + 8 : tiffStart + read32(entryAt + 8);
              if (dataAt < 0 || dataAt + size > exif.length) return new Uint8Array();
              return exif.slice(dataAt, dataAt + size);
            };
            const findEntry = (ifdOffset: number, tag: number): { at: number; type: number; count: number } | null => {
              const start = tiffStart + ifdOffset;
              if (start < 0 || start + 2 > exif.length) return null;
              const count = read16(start);
              for (let index = 0; index < count; index += 1) {
                const at = start + 2 + index * 12;
                if (at + 12 > exif.length) break;
                if (read16(at) === tag) return { at, type: read16(at + 2), count: read32(at + 4) };
              }
              return null;
            };
            const ifd0 = read32(tiffStart + 4);
            const exifPointer = findEntry(ifd0, 0x8769);
            if (exifPointer) {
              const pointerData = entryData(exifPointer.at, exifPointer.type, exifPointer.count);
              let exifIfd = 0;
              if (pointerData.length >= 4) {
                exifIfd = little
                  ? ((pointerData[0]! | (pointerData[1]! << 8) | (pointerData[2]! << 16) | (pointerData[3]! << 24)) >>> 0)
                  : (((pointerData[0]! << 24) | (pointerData[1]! << 16) | (pointerData[2]! << 8) | pointerData[3]!) >>> 0);
              }
              const comment = findEntry(exifIfd, 0x9286);
              if (comment) {
                let data = entryData(comment.at, comment.type, comment.count);
                if (data.length) {
                  const asciiPrefix = new TextDecoder("ascii").decode(data.slice(0, 8));
                  if (asciiPrefix.startsWith("ASCII")) data = data.slice(8);
                  else if (asciiPrefix.startsWith("UNICODE")) {
                    data = data.slice(8);
                    try {
                      return new TextDecoder(little ? "utf-16le" : "utf-16be").decode(data).replace(/\u0000+$/g, "").trim();
                    } catch { /* fall through to UTF-8 */ }
                  }
                  return new TextDecoder("utf-8").decode(data).replace(/\u0000+$/g, "").trim();
                }
              }
            }
          }
        }
        if (marker === 0xfe) {
          const comment = new TextDecoder("utf-8").decode(bytes.slice(segmentStart, segmentEnd)).replace(/\u0000+$/g, "").trim();
          if (/sui_image_params|"prompt"|"negativeprompt"/i.test(comment)) return comment;
        }
        offset += segmentLength;
      }
    } catch { /* JPEG metadata is best-effort. */ }
    return "";
  }

  private async imageDimensionsFromDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
      image.onerror = () => resolve({ width: 0, height: 0 });
      image.src = dataUrl;
    });
  }

  private async inspectDroppedImage(file: File): Promise<void> {
    try {
      const dataUrl = await this.blobToDataUrl(file);
      const lower = file.name.toLowerCase();
      let metadata = /^data:image\/png/i.test(dataUrl) || lower.endsWith(".png") ? this.pngParametersFromDataUrl(dataUrl) : "";
      if (!metadata && (/^data:image\/jpe?g/i.test(dataUrl) || /\.jpe?g$/i.test(lower))) {
        metadata = this.jpegUserCommentFromArrayBuffer(await file.arrayBuffer());
      }
      const params = this.metadataParams(metadata);
      const dims = await this.imageDimensionsFromDataUrl(dataUrl);
      const loraNames = Array.isArray(params.loras) ? params.loras.map(String) : [];
      const loraWeights = Array.isArray(params.loraweights) ? params.loraweights.map(Number) : [];
      const loras = loraNames.map((name, index) => {
        const model = this.loras.find((item) => serverModelKey(item.name) === serverModelKey(name));
        return {
          id: createId(),
          name: model?.name ?? name,
          title: model?.title || prettyName(name),
          weight: Number.isFinite(loraWeights[index]) ? loraWeights[index]! : 1,
          enabled: true,
          useTrigger: false,
          sourceUrl: "",
        } satisfies LoraStackItem;
      });
      const timing = this.generationTimingFromMetadata(metadata);
      const record: OutputRecord = {
        id: `drop-${createId()}`,
        url: dataUrl,
        swarmPath: "",
        swarmSourcePath: "",
        folderId: folderIds.unfiled,
        prompt: String(this.metadataValue(params, "prompt") ?? ""),
        sentPrompt: String(this.metadataValue(params, "prompt") ?? ""),
        negativePrompt: String(this.metadataValue(params, "negativeprompt", "negative prompt") ?? ""),
        model: String(this.metadataValue(params, "model") ?? ""),
        width: asNumber(String(this.metadataValue(params, "width") ?? dims.width), dims.width),
        height: asNumber(String(this.metadataValue(params, "height") ?? dims.height), dims.height),
        seed: asNumber(String(this.metadataValue(params, "seed") ?? -1), -1),
        starred: false,
        createdAt: Number(file.lastModified) || Date.now(),
        metadata,
        request: { ...params },
        loras,
        presets: [],
        ...timing,
      };
      this.droppedInspectorOutput = record;
      this.store.updateUi({ selectedOutputId: record.id });
      this.render();
      this.notify(metadata ? "Swarm image metadata loaded into Inspect." : "Image opened in Inspect; no Swarm metadata was found.", metadata ? "success" : "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog(`Could not inspect dropped image: ${message}`, "error", "studio");
      this.notify(message, "error");
    }
  }

  private async resolveSeedFromImageFile(output: OutputRecord): Promise<number | null> {
    if (!output.url && !output.swarmPath) return null;
    try {
      const resolvedUrl = this.outputImageUrl(output);
      const dataUrl = resolvedUrl.startsWith("data:") ? resolvedUrl : await runtime.fetchDataUrl(resolvedUrl, this.store.state.connection.authToken);
      const metadata = this.pngParametersFromDataUrl(dataUrl);
      if (!metadata) return null;
      const seed = this.resolvedSeedFor({ image: output.swarmPath, metadata }, metadata, -1);
      if (seed < 0) return null;
      this.store.updateOutput(output.id, { seed, metadata });
      this.addLog(`Resolved latest output seed from embedded PNG metadata: ${seed}.`, "info", "api");
      return seed;
    } catch (error) {
      this.addLog(`Could not read embedded output metadata: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
      return null;
    }
  }

  private async resolveStoredOutputSeed(output: OutputRecord, attempts = 7): Promise<number | null> {
    if (Number.isFinite(output.seed) && output.seed >= 0) return output.seed;
    const path = this.normalizeSwarmPath(output.swarmPath);
    if (!path || !this.connected) return null;
    const leaf = path.split("/").pop() || "";
    // The final PNG is the source of truth and Swarm writes its generation parameters into
    // the embedded `parameters` text chunk. Read that first so the seed shortcut does not
    // wait through several history polls when ListImages metadata is late or blank.
    const embeddedSeed = await this.resolveSeedFromImageFile(output);
    if (embeddedSeed != null) return embeddedSeed;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const files = await this.client.listImages("", 40);
        const match = files.find((file) => {
          const candidate = this.normalizeSwarmPath(file.src);
          return candidate === path || (leaf && candidate.split("/").pop() === leaf);
        });
        if (match) {
          const metadata = String(match.metadata ?? "");
          const seed = this.resolvedSeedFor({ image: output.swarmPath, metadata }, metadata, -1);
          if (seed >= 0) {
            this.store.updateOutput(output.id, { seed, metadata: metadata || output.metadata });
            this.addLog(`Resolved latest output seed from Swarm history: ${seed}.`, "info", "api");
            return seed;
          }
        }
      } catch (error) {
        if (attempt === attempts - 1) this.addLog(`Could not resolve latest output seed: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
      }
      if (attempt < attempts - 1) await sleep(300 + attempt * 220);
    }
    return null;
  }

  private async ensureOutputMetadata(output: OutputRecord): Promise<Record<string, unknown>> {
    let metadata = output.metadata || "";
    let params = this.metadataParams(metadata);
    const hasResolvedPrompt = this.metadataValue(params, "prompt") != null;
    if (!hasResolvedPrompt && (output.url || output.swarmPath)) {
      try {
        const resolvedUrl = this.outputImageUrl(output);
        const dataUrl = resolvedUrl.startsWith("data:") ? resolvedUrl : await runtime.fetchDataUrl(resolvedUrl, this.store.state.connection.authToken);
        const embedded = this.pngParametersFromDataUrl(dataUrl);
        if (embedded) {
          metadata = embedded;
          params = this.metadataParams(embedded);
          const seed = this.resolvedSeedFor({ image: output.swarmPath, metadata: embedded }, embedded, output.seed);
          this.store.updateOutput(output.id, { metadata: embedded, seed });
          this.addLog("Loaded resolved generation metadata from the final PNG.", "info", "api");
        }
      } catch (error) {
        this.addLog(`Could not load resolved output metadata: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
      }
    }
    return params;
  }

  private async reuseLatestAsVariationSeed(): Promise<void> {
    const latest = this.store.state.outputs[0];
    if (!latest) {
      this.notify("No generated output yet.", "info");
      return;
    }
    const seed = latest.seed >= 0 ? latest.seed : await this.resolveStoredOutputSeed(latest, 3);
    if (seed == null || seed < 0) {
      this.notify("The latest output seed is not resolved yet.", "info");
      return;
    }
    this.store.updateDraft({ variationSeed: seed, variationSeedEnabled: true });
    this.notify(`Variation seed set from latest output · ${seed}.`, "success");
    this.render();
  }

  private async toggleSeedMode(): Promise<void> {
    const draft = this.store.state.draft;
    if (draft.seed !== -1) {
      this.store.updateDraft({ seed: -1 });
      const input = this.root.querySelector<HTMLInputElement>("#seed");
      if (input) input.value = "-1";
      this.notify("Seed set to -1 · randomize each generation.", "info");
      return;
    }
    const latest = this.store.state.outputs[0];
    if (!latest) {
      this.notify("No generated output yet.", "info");
      return;
    }
    const seed = latest.seed >= 0 ? latest.seed : await this.resolveStoredOutputSeed(latest);
    if (seed == null || seed < 0) {
      this.notify("The latest output exists, but Swarm has not exposed its resolved seed yet.", "info");
      return;
    }
    this.store.updateDraft({ seed });
    const input = this.root.querySelector<HTMLInputElement>("#seed");
    if (input) input.value = String(seed);
    this.notify(`Seed locked to latest output · ${seed}.`, "success");
  }

  private handleDimensionInput(changed: "width" | "height"): void {
    const widthInput = this.root.querySelector<HTMLInputElement>("#width");
    const heightInput = this.root.querySelector<HTMLInputElement>("#height");
    if (!widthInput || !heightInput) return;
    const draft = this.store.state.draft;
    if (draft.lockRatio && draft.ratio) {
      const [baseW, baseH] = draft.ratio.split(":").map(Number);
      const ratioW = draft.ratioReversed ? baseH : baseW;
      const ratioH = draft.ratioReversed ? baseW : baseH;
      if (ratioW && ratioH) {
        if (changed === "width") heightInput.value = String(round64(asNumber(widthInput.value, draft.width) * ratioH / ratioW));
        else widthInput.value = String(round64(asNumber(heightInput.value, draft.height) * ratioW / ratioH));
      }
    }
    this.persistDraftFromForm();
    const display = this.root.querySelector<HTMLElement>("#resolution-value");
    if (display) display.textContent = `${Math.max(asNumber(widthInput.value, draft.width), asNumber(heightInput.value, draft.height))}px`;
    const widthDisplay = this.root.querySelector<HTMLElement>("#resolution-width-value");
    const heightDisplay = this.root.querySelector<HTMLElement>("#resolution-height-value");
    if (widthDisplay) widthDisplay.textContent = `${asNumber(widthInput.value, draft.width)}px`;
    if (heightDisplay) heightDisplay.textContent = `${asNumber(heightInput.value, draft.height)}px`;
  }

  private handleResolutionSlider(size: number): void {
    const draft = this.store.state.draft;
    const [baseW, baseH] = draft.ratio.split(":").map(Number);
    let ratioW = draft.ratioReversed ? baseH : baseW;
    let ratioH = draft.ratioReversed ? baseW : baseH;
    if (!ratioW || !ratioH) {
      ratioW = draft.width;
      ratioH = draft.height;
    }
    const width = ratioW >= ratioH ? round64(size) : round64(size * ratioW / ratioH);
    const height = ratioH >= ratioW ? round64(size) : round64(size * ratioH / ratioW);
    this.store.updateDraft({ width, height });
    const widthInput = this.root.querySelector<HTMLInputElement>("#width");
    const heightInput = this.root.querySelector<HTMLInputElement>("#height");
    if (widthInput) widthInput.value = String(width);
    if (heightInput) heightInput.value = String(height);
    const display = this.root.querySelector<HTMLElement>("#resolution-value");
    if (display) display.textContent = `${Math.max(width, height)}px`;
    const widthDisplay = this.root.querySelector<HTMLElement>("#resolution-width-value");
    const heightDisplay = this.root.querySelector<HTMLElement>("#resolution-height-value");
    if (widthDisplay) widthDisplay.textContent = `${width}px`;
    if (heightDisplay) heightDisplay.textContent = `${height}px`;
  }

  private handleResolutionAxisSlider(changed: "width" | "height", size: number): void {
    const value = round64(size);
    const patch = changed === "width" ? { width: value } : { height: value };
    this.store.updateDraft(patch);
    const input = this.root.querySelector<HTMLInputElement>(changed === "width" ? "#width" : "#height");
    if (input) input.value = String(value);
    const display = this.root.querySelector<HTMLElement>(changed === "width" ? "#resolution-width-value" : "#resolution-height-value");
    if (display) display.textContent = `${value}px`;
  }

  private applyRatioToInputs(ratio: string, reversed: boolean): void {
    const [baseW, baseH] = ratio.split(":").map(Number);
    if (!baseW || !baseH) return;
    const w = reversed ? baseH : baseW;
    const h = reversed ? baseW : baseH;
    const currentMax = clamp(Math.max(this.store.state.draft.width, this.store.state.draft.height), 256, 2048);
    const width = w >= h ? round64(currentMax) : round64(currentMax * w / h);
    const height = h >= w ? round64(currentMax) : round64(currentMax * h / w);
    this.store.updateDraft({ width, height, ratio, ratioReversed: reversed });
  }

  private openPresetEditor(title = ""): void {
    const preset = title ? this.presetByTitle(title) : undefined;
    this.presetEditorOpen = true;
    this.presetEditorEditing = preset?.title ?? "";
    this.presetEditorTitle = preset?.title ?? "";
    this.presetEditorDescription = preset?.description ?? "";
    this.render();
  }

  private presetTextApplied(raw: unknown, current: string): string {
    const text = String(raw ?? "");
    if (!text.includes("{value}")) return text;
    return text
      .replaceAll("{value}", current)
      .replace(/(?:^|\s*[,;]\s*){2,}/g, ", ")
      .replace(/^\s*[,;]\s*/, "")
      .replace(/\s*[,;]\s*$/, "")
      .trim();
  }

  private stringList(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String).map((item) => item.trim()).filter(Boolean);
      } catch { /* plain string list */ }
      return trimmed.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
    }
    return [];
  }

  private async applyPresetFromStack(index: number): Promise<void> {
    const title = this.store.state.draft.activePresets[index];
    const preset = title ? this.presetByTitle(title) : undefined;
    if (!preset) {
      this.notify("That preset is no longer available from Swarm.", "error");
      return;
    }
    const draft = this.store.state.draft;
    const patch: Partial<GenerationDraft> = {
      activePresets: draft.activePresets.filter((_, itemIndex) => itemIndex !== index),
    };
    const extraParams = { ...draft.extraParams };
    let loraNames: string[] | null = null;
    let loraWeights: string[] = [];
    const known = new Set(["prompt", "negativeprompt", "model", "width", "height", "steps", "cfgscale", "seed", "variationseed", "variationseedstrength", "sampler", "scheduler", "images", "loras", "loraweights"]);
    for (const [rawKey, value] of Object.entries(preset.param_map ?? {})) {
      const key = rawKey.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (key === "prompt") patch.prompt = this.presetTextApplied(value, draft.prompt);
      else if (key === "negativeprompt") patch.negativePrompt = this.presetTextApplied(value, draft.negativePrompt);
      else if (key === "model") patch.model = String(value ?? draft.model);
      else if (key === "width") patch.width = Number(value) || draft.width;
      else if (key === "height") patch.height = Number(value) || draft.height;
      else if (key === "steps") patch.steps = Number(value) || draft.steps;
      else if (key === "cfgscale") patch.cfgScale = Number(value) || draft.cfgScale;
      else if (key === "seed") patch.seed = Number.isFinite(Number(value)) ? Number(value) : draft.seed;
      else if (key === "variationseed") { patch.variationSeed = Number.isFinite(Number(value)) ? Number(value) : draft.variationSeed; patch.variationSeedEnabled = true; }
      else if (key === "variationseedstrength") { patch.variationSeedStrength = Number.isFinite(Number(value)) ? Number(value) : draft.variationSeedStrength; patch.variationSeedEnabled = true; }
      else if (key === "sampler") patch.sampler = String(value ?? draft.sampler);
      else if (key === "scheduler") patch.scheduler = String(value ?? draft.scheduler);
      else if (key === "images") patch.images = Math.max(1, Number(value) || draft.images);
      else if (key === "loras") loraNames = this.stringList(value);
      else if (key === "loraweights") loraWeights = this.stringList(value);
      else if (!known.has(key)) extraParams[rawKey] = value;
    }
    if (loraNames) {
      const merged = cloneStack(draft.loras);
      for (const [loraIndex, name] of loraNames.entries()) {
        const live = this.loras.find((model) => serverModelKey(model.name) === serverModelKey(name));
        const weight = Number(loraWeights[loraIndex]);
        const existing = merged.find((item) => serverModelKey(item.name) === serverModelKey(live?.name ?? name));
        if (existing) {
          existing.enabled = true;
          if (Number.isFinite(weight)) existing.weight = weight;
          continue;
        }
        merged.push({
          id: createId(),
          name: live?.name ?? name,
          title: live?.title || prettyName(name),
          weight: Number.isFinite(weight) ? weight : 1,
          enabled: true,
          useTrigger: false,
          sourceUrl: "",
        });
      }
      patch.loras = merged;
    }
    patch.extraParams = extraParams;
    const enabledGroups = new Set(draft.advancedEnabledGroups);
    for (const rawKey of Object.keys(extraParams)) {
      const normalized = rawKey.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const param = this.params.find((item) => [item.id, item.name].filter(Boolean).some((name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, "") === normalized));
      const group = param ? this.paramGroupFor(param) : undefined;
      if (this.advancedGroupRequiresToggle(group)) enabledGroups.add(this.advancedGroupKey(group, String(param?.group ?? "Other")));
    }
    patch.advancedEnabledGroups = [...enabledGroups];
    this.store.updateDraft(patch);
    this.notify(`${preset.title} applied to the workspace and removed from the preset stack.`, "success");
    this.render();
  }

  private async refreshPresets(): Promise<void> {
    const userData = await this.client.userData();
    this.userData = userData;
    this.presets = userData.presets ?? [];
  }

  private async savePresetFromEditor(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    if (!title) {
      this.notify("Give the preset a name first.", "error");
      return;
    }
    const selected = new Set(data.getAll("preset-param").map(String));
    const candidates = this.presetSaveCandidates();
    const paramMap: Record<string, unknown> = {};
    for (const candidate of candidates) {
      if (!selected.has(candidate.key)) continue;
      if (candidate.key === "__loras__") {
        const enabled = this.store.state.draft.loras.filter((item) => item.enabled && Boolean(this.resolveLora(item)));
        if (enabled.length) {
          paramMap.loras = enabled.map((item) => this.resolveLora(item)?.name ?? item.name);
          paramMap.loraweights = enabled.map((item) => String(item.weight));
        }
      } else {
        paramMap[candidate.key] = candidate.value;
      }
    }
    if (!Object.keys(paramMap).length) {
      this.notify("Choose at least one value to save in the preset.", "error");
      return;
    }
    try {
      const editing = this.presetEditorEditing || null;
      await this.client.savePreset({ title, description, paramMap, editing });
      await this.refreshPresets();
      if (editing && editing !== title) {
        this.store.updateDraft({ activePresets: this.store.state.draft.activePresets.map((item) => item === editing ? title : item) });
      }
      this.presetEditorOpen = false;
      this.presetEditorEditing = "";
      this.presetEditorTitle = "";
      this.presetEditorDescription = "";
      this.notify(editing ? `Updated preset ${title}.` : `Saved preset ${title} to Swarm.`, "success");
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog(`Preset save failed: ${message}`, "error", "api");
      this.notify(message, "error");
    }
  }

  private async deletePresetFromEditor(): Promise<void> {
    const title = this.presetEditorEditing;
    if (!title) return;
    if (!window.confirm(`Delete Swarm preset “${title}”?`)) return;
    try {
      await this.client.deletePreset(title);
      await this.refreshPresets();
      this.store.updateDraft({ activePresets: this.store.state.draft.activePresets.filter((item) => item !== title) });
      this.presetEditorOpen = false;
      this.presetEditorEditing = "";
      this.notify(`Deleted preset ${title}.`, "success");
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog(`Preset delete failed: ${message}`, "error", "api");
      this.notify(message, "error");
    }
  }

  private reorderPreset(from: number, to: number): void {
    const items = [...this.store.state.draft.activePresets];
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return;
    const [moved] = items.splice(from, 1);
    if (!moved) return;
    items.splice(to, 0, moved);
    this.store.updateDraft({ activePresets: items });
    this.render();
  }

  private insertSyntax(syntax: string): void {
    const textarea = this.root.querySelector<HTMLTextAreaElement>("#prompt");
    if (!textarea || !syntax) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const spacerBefore = before && !/[\s,]$/.test(before) ? ", " : "";
    const spacerAfter = after && !/^[\s,]/.test(after) ? ", " : "";
    textarea.value = `${before}${spacerBefore}${syntax}${spacerAfter}${after}`;
    const cursor = before.length + spacerBefore.length + syntax.length;
    textarea.setSelectionRange(cursor, cursor);
    textarea.focus();
    this.persistDraftFromForm();
  }

  private persistReviewBeforeSave(element: HTMLInputElement): void {
    const param = this.reviewBeforeSaveParamDefinition();
    const key = String(param?.id ?? param?.name ?? "DoNotSave");
    const normalized = this.normalizeParamKey(key);
    const current = { ...this.store.state.draft.extraParams };
    delete current[key];
    delete current[normalized];
    if (element.checked) current[key] = true;
    this.store.updateDraft({ extraParams: current });
  }

  private persistExtraParam(element: HTMLInputElement | HTMLSelectElement): void {
    const key = element.dataset.extraParam;
    if (!key) return;
    const current = { ...this.store.state.draft.extraParams };
    let value: unknown;
    if (element instanceof HTMLInputElement && element.type === "checkbox") value = element.checked;
    else if (element instanceof HTMLInputElement && element.type === "number") value = element.value === "" ? "" : element.valueAsNumber;
    else value = element.value;
    if (value === "" || value == null) delete current[key];
    else current[key] = value;
    this.store.updateDraft({ extraParams: current });
  }

  private patchLora(id: string, patch: Partial<LoraStackItem>): void {
    this.store.updateDraft({
      loras: this.store.state.draft.loras.map((item) => item.id === id ? { ...item, ...patch } : item),
    });
  }

  private reorderLora(from: number, to: number): void {
    const items = [...this.store.state.draft.loras];
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return;
    const [moved] = items.splice(from, 1);
    if (!moved) return;
    items.splice(to, 0, moved);
    this.store.updateDraft({ loras: items });
    this.render();
  }

  private addLoraToStack(name: string): void {
    // Models is a long scrolling library. Adding a LoRA rerenders the shared composer,
    // but should not teleport the user back to the top of the inventory.
    const preserveScroll = this.view === "models" ? (this.root.querySelector<HTMLElement>(".content")?.scrollTop ?? null) : null;
    const model = this.loras.find((lora) => lora.name === name);
    if (!model) return;
    const existing = this.store.state.draft.loras.find((item) => serverModelKey(item.name) === serverModelKey(model.name));
    if (existing) {
      this.notify("That LoRA is already in the stack.", "info");
      return;
    }
    this.store.updateDraft({
      loras: [...this.store.state.draft.loras, {
        id: createId(),
        name: model.name,
        title: model.title || prettyName(model.name),
        weight: 1,
        enabled: true,
        useTrigger: false,
        sourceUrl: "",
      }],
    });
    this.render();
    if (preserveScroll != null) {
      window.requestAnimationFrame(() => {
        const content = this.root.querySelector<HTMLElement>(".content");
        if (content) content.scrollTop = preserveScroll;
      });
    }
  }

  private async importLoraFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const imported = importLumiSwarmStack(JSON.parse(await file.text()) as unknown, this.loras);
      if (!imported.items.length) throw new Error("The stack contained no usable LoRA entries.");
      this.store.updateDraft({ loras: imported.items });
      this.store.saveLoraProfile(imported.name, imported.items, "lumiswarm-import");
      this.addLog(`Imported LoRA stack "${imported.name}" with ${imported.items.length} items.${imported.missing.length ? ` Missing on server: ${imported.missing.join(", ")}` : ""}`, imported.missing.length ? "warn" : "info", "studio");
      this.notify(imported.missing.length
        ? `Imported ${imported.items.length} LoRAs; ${imported.missing.length} could not be matched to this server.`
        : `Imported ${imported.items.length} LoRAs.`, imported.missing.length ? "info" : "success");
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog(message, "error", "studio");
      this.notify(message, "error");
    }
  }

  private exportLoraStack(): void {
    const items = this.store.state.draft.loras;
    if (!items.length) return;
    const profileId = this.root.querySelector<HTMLSelectElement>("#lora-profile-select")?.value ?? "";
    const profile = this.store.state.loraProfiles.find((item) => item.id === profileId);
    const name = profile?.name || "LoRA stack";
    const payload = {
      version: 1,
      type: "swarm_studio_lora_stack",
      stack: {
        name,
        items: items.map(({ name: modelName, title, weight, enabled, useTrigger, sourceUrl }) => ({ name: modelName, title, weight, enabled, useTrigger, sourceUrl })),
      },
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "lora-stack"}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    this.notify(`Exported ${items.length} LoRA${items.length === 1 ? "" : "s"}.`, "success");
  }

  private async loadInitFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("Could not read init image."));
        reader.readAsDataURL(file);
      });
      this.store.updateDraft({ initImage: dataUrl, initImageName: file.name, initImageEnabled: true });
      this.render();
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  private async useOutputAsInit(id: string): Promise<void> {
    const output = this.outputById(id);
    if (!output) return;
    try {
      const resolvedUrl = this.outputImageUrl(output);
      const dataUrl = resolvedUrl.startsWith("data:") ? resolvedUrl : await runtime.fetchDataUrl(resolvedUrl, this.store.state.connection.authToken);
      if (!/^data:image\//i.test(dataUrl)) throw new Error("Swarm returned a non-image response for the init image.");
      this.store.updateDraft({
        initImage: dataUrl,
        initImageName: prettyName(output.swarmPath) || "Swarm output",
        initImageEnabled: true,
      });
      this.store.updateUi({ selectedOutputId: "", lastView: "create" });
      this.view = "create";
      this.notify("Output loaded as the init image.", "success");
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog(message, "error", "api");
      this.notify(message, "error");
    }
  }

  private async reuseOutput(id: string): Promise<void> {
    const output = this.outputById(id);
    if (!output) return;
    const current = this.store.state.draft;
    const request = output.request ?? {};
    const params = await this.ensureOutputMetadata(output);
    const resolvedSeed = output.seed >= 0 ? output.seed : await this.resolveStoredOutputSeed(output, 3);
    const resolvedPrompt = String(this.metadataValue(params, "prompt") ?? output.sentPrompt ?? output.prompt ?? "");
    const resolvedNegative = String(this.metadataValue(params, "negativeprompt", "negative prompt") ?? output.negativePrompt ?? "");
    const variationSeedRaw = this.metadataValue(params, "variationseed", "variation seed") ?? request.variationseed;
    const variationStrengthRaw = this.metadataValue(params, "variationseedstrength", "variation seed strength") ?? request.variationseedstrength;
    const variationSeed = asNumber(String(variationSeedRaw ?? -1), -1);
    const variationStrength = asNumber(String(variationStrengthRaw ?? current.variationSeedStrength), current.variationSeedStrength);
    const hasVariation = variationSeedRaw != null && variationSeed >= -1;
    const source: Record<string, unknown> = Object.keys(params).length ? params : request;
    const normalize = (key: string) => key.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const core = new Set(["prompt", "negativeprompt", "model", "width", "height", "steps", "cfgscale", "seed", "variationseed", "variationseedstrength", "sampler", "scheduler", "scheduletype", "images", "loras", "loraweights", "initimage", "initimagecreativity", "studioregionalprompt"]);
    // Wildcard Seed is a resolved/transient prompt-randomization seed. Copying it out of final
    // image metadata into persistent advanced params makes every later <random:...> / wildcard
    // expansion repeat identically even while the main generation seed changes. The resolved
    // prompt already reproduces the exact image, so this transient seed must not be materialized.
    const transientResolved = new Set(["wildcardseed", "swarmversion"]);
    const extraParams = Object.fromEntries(Object.entries(source).filter(([key]) => {
      const normalized = normalize(key);
      return !core.has(normalized) && !transientResolved.has(normalized);
    }));
    const model = String(this.metadataValue(params, "model") ?? output.model ?? current.model);
    const width = asNumber(String(this.metadataValue(params, "width") ?? output.width ?? current.width), current.width);
    const height = asNumber(String(this.metadataValue(params, "height") ?? output.height ?? current.height), current.height);
    const steps = asNumber(String(this.metadataValue(params, "steps") ?? request.steps ?? current.steps), current.steps);
    const cfgScale = asNumber(String(this.metadataValue(params, "cfgscale", "cfg scale") ?? request.cfgscale ?? current.cfgScale), current.cfgScale);
    const sampler = String(this.metadataValue(params, "sampler") ?? request.sampler ?? current.sampler);
    const scheduler = String(this.metadataValue(params, "scheduler", "schedule type") ?? request.scheduler ?? current.scheduler);
    this.store.updateDraft({
      // Reuse All is exact-image reproduction: use Swarm's resolved prompt, not the
      // source <preset:...> shorthand, and clear active presets so nothing is applied twice.
      prompt: resolvedPrompt,
      negativePrompt: resolvedNegative,
      model,
      width,
      height,
      steps,
      cfgScale,
      seed: resolvedSeed != null && resolvedSeed >= 0 ? resolvedSeed : asNumber(String(this.metadataValue(params, "seed") ?? request.seed ?? current.seed), current.seed),
      variationSeedEnabled: hasVariation,
      variationSeed: hasVariation ? variationSeed : current.variationSeed,
      variationSeedStrength: hasVariation ? variationStrength : current.variationSeedStrength,
      sampler,
      scheduler,
      images: asNumber(String(this.metadataValue(params, "images") ?? request.images ?? current.images), current.images),
      loras: output.loras?.length ? cloneStack(output.loras) : current.loras,
      activePresets: [],
      extraParams,
    });
    this.store.updateOutput(output.id, {
      prompt: resolvedPrompt,
      negativePrompt: resolvedNegative,
      seed: resolvedSeed != null && resolvedSeed >= 0 ? resolvedSeed : output.seed,
    });
    this.store.updateUi({ selectedOutputId: "", lastView: "create", mobileCreatePane: "generation" });
    this.view = "create";
    this.notify(resolvedSeed != null && resolvedSeed >= 0
      ? `Resolved generation restored · seed ${resolvedSeed}.`
      : "Resolved generation restored.", "success");
    this.render();
  }

  private readDraftFromForm(): GenerationDraft {
    const previous = this.store.state.draft;
    const value = (selector: string) => this.root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)?.value ?? "";
    return {
      ...previous,
      prompt: value("#prompt"),
      negativePrompt: value("#negative-prompt"),
      model: value("#model") || previous.model,
      width: asNumber(value("#width"), previous.width),
      height: asNumber(value("#height"), previous.height),
      steps: asNumber(value("#steps"), previous.steps),
      cfgScale: asNumber(value("#cfg"), previous.cfgScale),
      seed: asNumber(value("#seed"), previous.seed),
      variationSeed: this.root.querySelector<HTMLInputElement>("#variation-seed")?.valueAsNumber ?? previous.variationSeed,
      variationSeedStrength: this.root.querySelector<HTMLInputElement>("#variation-strength")?.valueAsNumber ?? previous.variationSeedStrength,
      sampler: value("#sampler") || previous.sampler,
      scheduler: value("#scheduler") || previous.scheduler,
    };
  }

  private promptWithTriggers(draft: GenerationDraft): string {
    const presets = draft.activePresets.map((title) => `<preset:${title}>`);
    const triggers = draft.loras
      .filter((item) => item.enabled && item.useTrigger)
      .map((item) => String(this.resolveLora(item)?.trigger_phrase ?? "").replaceAll(";", ",").trim())
      .filter(Boolean);
    const basePrompt = [presets.join(", "), triggers.join(", "), draft.prompt].filter(Boolean).join(", ");
    return compileRegionalPrompt(basePrompt, draft.regionalPrompt);
  }

  private wireGenerationRequest(request: SwarmGenerationRequest): SwarmGenerationRequest {
    const normalized = normalizeGenerationRequest(request, this.params);
    for (const note of normalized.notes) this.addLog(`Request normalized: ${note}`, "warn", "studio");
    return normalized.request;
  }

  private generationRequest(draft: GenerationDraft, loraSelection = this.generationLoraSelection(draft)): SwarmGenerationRequest {
    return {
      ...this.activeExtraParams(draft),
      prompt: this.promptWithTriggers(draft),
      negativeprompt: draft.negativePrompt,
      model: draft.model,
      width: draft.width,
      height: draft.height,
      steps: draft.steps,
      cfgscale: draft.cfgScale,
      seed: draft.seed,
      variationseed: draft.variationSeedEnabled ? draft.variationSeed : undefined,
      variationseedstrength: draft.variationSeedEnabled ? draft.variationSeedStrength : undefined,
      sampler: draft.sampler || undefined,
      scheduler: draft.scheduler || undefined,
      images: draft.images,
      loras: loraSelection.values.length ? loraSelection.values : undefined,
      loraweights: loraSelection.weights.length ? loraSelection.weights : undefined,
      initimage: draft.initImageEnabled && draft.initImage ? draft.initImage : undefined,
      initimagecreativity: draft.initImageEnabled && draft.initImage ? draft.initImageCreativity : undefined,
    };
  }

  private seedFromGenerationPayload(value: unknown, depth = 0): number | null {
    if (depth > 5 || value == null) return null;
    if (typeof value === "string") {
      if (!value.trim()) return null;
      try { return this.seedFromGenerationPayload(JSON.parse(value), depth + 1); } catch { return null; }
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const seed = this.seedFromGenerationPayload(item, depth + 1);
        if (seed != null) return seed;
      }
      return null;
    }
    if (typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const candidate = Number(record.seed);
    if (Number.isSafeInteger(candidate) && candidate >= 0) return candidate;
    for (const key of ["sui_image_params", "metadata", "image", "params", "parameters", "sui_extra_data"]) {
      if (record[key] == null) continue;
      const seed = this.seedFromGenerationPayload(record[key], depth + 1);
      if (seed != null) return seed;
    }
    return null;
  }

  private metadataFromGenerationPayload(value: unknown): string {
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    const raw = record.metadata ?? (record.image && typeof record.image === "object" ? (record.image as Record<string, unknown>).metadata : undefined);
    if (raw == null) return "";
    if (typeof raw === "string") return raw;
    try { return JSON.stringify(raw); } catch { return ""; }
  }

  private patchLatestGenerationSeed(seed: number, metadata = ""): void {
    const latest = this.store.state.outputs[0];
    if (!latest || latest.seed >= 0) return;
    const finalPath = this.normalizeSwarmPath(this.generationFinalPath);
    const latestPath = this.normalizeSwarmPath(latest.swarmPath);
    if (finalPath && latestPath && finalPath !== latestPath) return;
    this.store.updateOutput(latest.id, { seed, metadata: metadata || latest.metadata });
    if (!this.generating) this.renderGenerationStage();
  }

  private handleGenerationEvent(event: SwarmGenerationEvent): void {
    const eventMetadata = this.metadataFromGenerationPayload(event);
    const eventSeed = this.seedFromGenerationPayload(event);
    if (eventMetadata) this.generationResolvedMetadata = eventMetadata;
    if (eventSeed != null) {
      this.generationResolvedSeed = eventSeed;
      this.patchLatestGenerationSeed(eventSeed, eventMetadata);
    }
    if (event.error || event.error_id) {
      this.addLog(event.error || `Swarm API error: ${event.error_id}`, "error", "api");
    }
    if (event.backend_status?.message) {
      this.generationMessage = String(event.backend_status.message);
      this.addLog(String(event.backend_status.message), event.backend_status.class === "error" ? "error" : "info", "swarm");
    }
    if (event.gen_progress) {
      if (!this.generationSamplingStartedAt) this.generationSamplingStartedAt = performance.now();
      const progress = event.gen_progress;
      const steps = Math.max(1, this.store.state.draft.steps || 1);
      const current = clamp(Number(progress.current_percent ?? 0), 0, 1);
      const candidateStep = current > 0 ? Math.max(1, Math.min(steps, Math.ceil(current * steps))) : this.generationStep;
      // Swarm's overall_percent measures workflow nodes and can jump as nodes begin/end. Studio's
      // visible generation progress is sampler-step based instead, and never regresses.
      if (candidateStep >= this.generationStep) this.generationStep = candidateStep;
      this.generationPercent = this.generationStep / steps;
      if (progress.preview) this.generationPreview = this.client.imageUrl(progress.preview);
      this.generationMessage = `Step ${this.generationStep || 0} / ${steps}`;
      this.renderGenerationStage();
      this.renderInpaintGenerationStatus();
    }
    const image = normalizeGenerationImage(event.image);
    if (image) {
      if (!this.generationFinishedAt) this.generationFinishedAt = performance.now();
      this.generationFinalUrl = this.client.imageUrl(this.normalizeSwarmPath(image.image));
      this.generationFinalPath = image.image;
      if (image.metadata) this.generationResolvedMetadata = image.metadata;
      const imageSeed = this.resolvedSeedFor(image, image.metadata || this.generationResolvedMetadata, -1);
      if (imageSeed >= 0) this.generationResolvedSeed = imageSeed;
      this.generationPreview = this.generationFinalUrl;
      this.generationStep = Math.max(1, this.inpaintAwaitingResult ? this.inpaintConfigSteps : (this.store.state.draft.steps || 1));
      this.generationPercent = 1;
      this.generationMessage = this.generationReviewModeActive ? "Preparing review" : "Saving output";
      this.renderGenerationStage();
      this.renderInpaintGenerationStatus();
    }
  }

  private requestSnapshot(request: SwarmGenerationRequest, draft: GenerationDraft): Record<string, unknown> {
    return {
      ...request,
      studioRegionalPrompt: cloneRegionalPromptDraft(draft.regionalPrompt),
      initimage: request.initimage ? `[init image: ${draft.initImageName || "embedded image"}]` : undefined,
    };
  }

  private async generate(draftOverride?: GenerationDraft, options: { allowPendingApprovals?: boolean; focusNewestApproval?: boolean } = {}): Promise<void> {
    if (this.generating) return;
    if (this.pendingGenerationApprovals.length && !options.allowPendingApprovals) {
      this.notify("Save or review the pending result before starting another batch.", "info");
      return;
    }
    const draft = draftOverride ? this.cloneDraftForApproval(draftOverride) : this.readDraftFromForm();
    this.store.updateDraft(draft);
    if (!draft.prompt.trim() && !draft.activePresets.length && !hasRegionalPromptContent(draft.regionalPrompt)) {
      this.notify("Give Swarm a global prompt, preset, or regional prompt first, bestie.", "error");
      return;
    }
    if (!draft.model) {
      this.notify("Pick a checkpoint first.", "error");
      return;
    }
    if (!this.connected) {
      await this.connect(false);
      if (!this.connected) return;
    }
    await this.ensureGenerationParameterHydration(draft);
    const loraSelection = this.generationLoraSelection(draft);
    if (loraSelection.missing.length) {
      const names = loraSelection.missing.map((item) => item.title || prettyName(item.name)).join(", " );
      this.addLog(`Generation blocked because ${loraSelection.missing.length} enabled LoRA${loraSelection.missing.length === 1 ? "" : "s"} could not be matched to Swarm's current LoRA options: ${names}`, "error", "api");
      this.notify(`Refresh or re-add the missing LoRA${loraSelection.missing.length === 1 ? "" : "s"}: ${names}`, "error");
      return;
    }
    this.generating = true;
    this.generationStartedAt = performance.now();
    this.generationSamplingStartedAt = 0;
    this.generationFinishedAt = 0;
    this.generationPreview = "";
    this.generationFinalUrl = "";
    this.generationResolvedSeed = null;
    this.generationResolvedMetadata = "";
    this.generationFinalPath = "";
    this.generationPercent = 0;
    this.generationStep = 0;
    this.generationMessage = "Opening generation stream";
    const request = this.wireGenerationRequest(this.generationRequest(draft, loraSelection));
    const reviewBeforeSave = this.requestUsesReviewBeforeSave(request);
    const pendingApprovalStart = this.pendingGenerationApprovals.length;
    this.generationReviewModeActive = reviewBeforeSave;
    this.addLog(`Generation started with ${draft.model}, ${draft.loras.filter((item) => item.enabled).length} LoRAs, ${draft.activePresets.length} presets, ${draft.width}×${draft.height}${reviewBeforeSave ? " · review-before-save" : ""}.`, "info", "api");
    this.refreshGenerationChrome();
    let historyBefore: Set<string> | null = null;
    if (!reviewBeforeSave) {
      try {
        historyBefore = new Set((await this.client.listImages("", 6)).map((file) => String(file.src ?? "")).filter(Boolean));
      } catch (error) {
        this.addLog(`Could not snapshot Swarm history before generation: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
      }
    }
    let images: SwarmGenerationImage[] = [];
    let responseMetadata: string[] = [];
    let sawStreamEvent = false;
    const discarded = new Set<number>();
    try {
      try {
        images = await this.client.generateStream(request, (event) => {
          sawStreamEvent = true;
          for (const index of event.discard_indices ?? []) discarded.add(index);
          this.handleGenerationEvent(event);
        });
      } catch (streamError) {
        if (sawStreamEvent) throw streamError;
        this.addLog(`Generation WebSocket unavailable before work began; falling back to HTTP: ${streamError instanceof Error ? streamError.message : String(streamError)}`, "warn", "api");
        const response = await this.client.generate(request);
        responseMetadata = response.metadata ?? [];
        images = (response.images ?? []).flatMap((raw, index) => {
          const image = normalizeGenerationImage(raw, index);
          return image ? [image] : [];
        });
      }
      images = images.filter((image) => !discarded.has(Number(image.batch_index ?? -1)));
      if (images.length && !this.generationFinishedAt) this.generationFinishedAt = performance.now();
      if (reviewBeforeSave) {
        if (!images.length) throw new Error("Swarm completed the ephemeral generation without returning an image payload.");
        for (const [index, result] of images.entries()) await this.queueGenerationApproval(result, request, draft, responseMetadata[index] || "");
        this.pendingGenerationApprovalIndex = options.focusNewestApproval ? Math.min(this.pendingGenerationApprovals.length - 1, pendingApprovalStart) : 0;
        const first = this.pendingGenerationApprovals[0];
        this.generationFinalUrl = first?.objectUrl || "";
        this.generationFinalPath = "";
        this.generationPreview = "";
        this.addLog(`Generation completed with ${images.length} unsaved result${images.length === 1 ? "" : "s"}; waiting for manual approval.`, "info", "api");
        this.notify(`${images.length} result${images.length === 1 ? "" : "s"} ready for review. Nothing has been saved yet.`, "success");
        return;
      }
      if (!images.length && historyBefore) {
        this.addLog("The generation stream ended without a final image event; recovering the output from Swarm history.", "warn", "api");
        for (let attempt = 0; attempt < 6 && !images.length; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 500 + attempt * 250));
          const recent = await this.client.listImages("", 6);
          images = recent
            .filter((file) => file.src && !historyBefore!.has(String(file.src)))
            .slice(0, Math.max(1, draft.images))
            .map((file, index) => ({ image: String(file.src), batch_index: String(index), metadata: String(file.metadata ?? "") }));
        }
      }
      if (!images.length) throw new Error("Swarm completed without returning or indexing a final image path.");
      const recentMetadata = new Map<string, string>();
      const recordRecentMetadata = (files: SwarmImageListItem[]) => {
        for (const file of files) {
          if (!file.src) continue;
          const key = this.normalizeSwarmPath(file.src);
          recentMetadata.set(key, String(file.metadata ?? ""));
          const leaf = key.split("/").pop();
          if (leaf) recentMetadata.set(leaf, String(file.metadata ?? ""));
        }
      };
      if (draft.seed === -1 || images.some((image) => !image.metadata)) {
        try {
          // One fast history read is enough for the foreground path. If Swarm has not indexed
          // metadata yet, Studio finishes the render immediately and repairs it in background.
          recordRecentMetadata(await this.client.listImages("", Math.max(18, images.length * 6)));
        } catch (error) {
          this.addLog(`Could not read immediate final generation metadata: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
        }
      }
      let firstRecord: OutputRecord | null = null;
      for (const [index, result] of images.entries()) {
        const path = String(result.image ?? "");
        if (!path) continue;
        const url = this.client.imageUrl(this.normalizeSwarmPath(path));
        const key = this.normalizeSwarmPath(path);
        const leaf = key.split("/").pop() || "";
        const capturedMetadata = index === 0 ? this.generationResolvedMetadata : "";
        const resolvedMetadata = result.metadata || capturedMetadata || responseMetadata[index] || recentMetadata.get(key) || recentMetadata.get(leaf) || "";
        const eventSeed = index === 0 && this.generationResolvedSeed != null ? this.generationResolvedSeed : undefined;
        const resolvedSeed = this.resolvedSeedFor({ ...result, seed: eventSeed ?? result.seed }, resolvedMetadata, draft.seed);
        const record = this.store.addOutput({
          url,
          swarmPath: path,
          swarmSourcePath: this.swarmMutationPath(path),
          prompt: draft.prompt,
          sentPrompt: request.prompt,
          negativePrompt: draft.negativePrompt,
          model: draft.model,
          width: draft.width,
          height: draft.height,
          seed: resolvedSeed,
          metadata: resolvedMetadata,
          request: this.requestSnapshot(request, draft),
          loras: cloneStack(draft.loras),
          presets: [...draft.activePresets],
          ...this.currentGenerationTiming(),
        });
        firstRecord ??= record;
        if (index === 0) { this.generationFinalUrl = url; this.generationFinalPath = path; }
      }
      if (!firstRecord) throw new Error("Swarm returned image events without a usable path.");
      if (draft.seed === -1 && firstRecord.seed < 0) {
        void this.resolveStoredOutputSeed(firstRecord, 8).then((resolved) => {
          if (resolved != null) {
            this.addLog(`Random generation resolved to seed ${resolved}.`, "info", "api");
            if (!this.generating) this.renderGenerationStage();
          }
        }).catch((error) => this.addLog(`Background seed resolution failed: ${error instanceof Error ? error.message : String(error)}`, "warn", "api"));
      }
      this.addLog(`Generation completed with ${images.length} output${images.length === 1 ? "" : "s"}.`, "info", "api");
      this.notify(`${images.length} output${images.length === 1 ? "" : "s"} indexed in Library.`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog(message, "error", "api");
      this.notify(message, "error");
    } finally {
      if (this.generationStartedAt && !this.generationFinishedAt) this.generationFinishedAt = performance.now();
      this.generating = false;
      this.generationReviewModeActive = false;
      this.generationPreview = "";
      this.generationPercent = 0;
      this.generationStep = 0;
      this.generationMessage = "";
      // Completion is a background state change, not a navigation event. Never rebuild the active
      // view here: doing so replaced focused prompt/settings fields and collapsed mobile keyboards.
      this.refreshGenerationChrome();
      this.root.querySelector<HTMLElement>("[data-generation-mini]")?.remove();
    }
  }

  private async interrupt(): Promise<void> {
    try {
      await this.client.interrupt();
      this.addLog("Interrupt sent to the current Swarm session.", "warn", "api");
      this.notify("Interrupt sent to Swarm.", "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog(message, "error", "api");
      this.notify(message, "error");
    }
  }

  private maskParamKey(): string {
    const live = this.params.find((param) => String(param.id ?? param.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "") === "maskimage");
    return String(live?.id ?? "maskimage");
  }

  private sourceDraftForInpaint(fallback: GenerationDraft): GenerationDraft {
    const snapshot = this.inpaintSourceOutputContext;
    if (!snapshot) return fallback;
    const merged: GenerationDraft = {
      ...fallback,
      ...snapshot,
      loras: snapshot.loras ? cloneStack(snapshot.loras) : cloneStack(fallback.loras),
      activePresets: snapshot.activePresets ? [...snapshot.activePresets] : [...fallback.activePresets],
      extraParams: snapshot.extraParams ? { ...snapshot.extraParams } : { ...fallback.extraParams },
    };
    return merged;
  }

  private buildInpaintSourceContext(output: OutputRecord): Partial<GenerationDraft> | null {
    const params = this.metadataParams(output.metadata);
    const request = output.request ?? {};
    const current = this.store.state.draft;
    const get = (...keys: string[]) => this.metadataValue(params, ...keys);
    const width = asNumber(String(get("width") ?? request.width ?? output.width ?? current.width), current.width);
    const height = asNumber(String(get("height") ?? request.height ?? output.height ?? current.height), current.height);
    const steps = asNumber(String(get("steps") ?? request.steps ?? current.steps), current.steps);
    const cfgScale = asNumber(String(get("cfgscale", "cfg scale") ?? request.cfgscale ?? current.cfgScale), current.cfgScale);
    const seed = output.seed >= 0 ? output.seed : asNumber(String(get("seed") ?? request.seed ?? current.seed), current.seed);
    const variationSeedRaw = get("variationseed", "variation seed") ?? request.variationseed;
    const variationStrengthRaw = get("variationseedstrength", "variation seed strength") ?? request.variationseedstrength;
    const variationSeed = asNumber(String(variationSeedRaw ?? current.variationSeed), current.variationSeed);
    const variationStrength = asNumber(String(variationStrengthRaw ?? current.variationSeedStrength), current.variationSeedStrength);
    const hasVariation = variationSeedRaw != null && variationSeed >= -1;
    const normalize = (key: string) => key.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const blocked = new Set([
      "prompt", "negativeprompt", "model", "width", "height", "steps", "cfgscale", "seed",
      "variationseed", "variationseedstrength", "sampler", "scheduler", "scheduletype", "images",
      "loras", "loraweights", "initimage", "initimagecreativity", "maskimage", "maskbehavior",
      "maskshrinkgrow", "maskblur", "maskgrow", "maskcompositeunthresholded",
      "initimagerecompositemask", "useinpaintingencode", "nointernalspecialhandling",
      "forwardswarmdata", "forwardrawbackenddata", "wildcardseed", "studioregionalprompt"
    ]);
    const source = Object.keys(params).length ? params : request;
    const extraParams = Object.fromEntries(Object.entries(source).filter(([key]) => {
      const normalized = normalize(key);
      return !blocked.has(normalized) && !normalized.includes("customworkflow") && normalized !== "workflow";
    }));
    const model = String(get("model") ?? output.model ?? current.model);
    return {
      model,
      width,
      height,
      steps,
      cfgScale,
      seed,
      variationSeedEnabled: hasVariation,
      variationSeed: variationSeed,
      variationSeedStrength: variationStrength,
      sampler: String(get("sampler") ?? request.sampler ?? current.sampler),
      scheduler: String(get("scheduler", "schedule type") ?? request.scheduler ?? current.scheduler),
      images: 1,
      loras: output.loras?.length ? cloneStack(output.loras) : cloneStack(current.loras),
      activePresets: output.presets?.length ? [...output.presets] : [...current.activePresets],
      extraParams,
    };
  }

  private resetInpaintGenerationConfigFromSource(): void {
    const source = this.inpaintSourceOutputContext ?? this.store.state.draft;
    const image = this.inpaintImageElement;
    this.inpaintConfigWidth = Math.max(64, Math.round(Number(source.width ?? image?.naturalWidth ?? this.store.state.draft.width) || 1024));
    this.inpaintConfigHeight = Math.max(64, Math.round(Number(source.height ?? image?.naturalHeight ?? this.store.state.draft.height) || 1024));
    this.inpaintConfigSteps = Math.max(1, Math.round(Number(source.steps ?? this.store.state.draft.steps) || 20));
    this.inpaintConfigCfg = Number(source.cfgScale ?? this.store.state.draft.cfgScale) || 0;
    this.inpaintConfigSeed = Number.isFinite(Number(source.seed)) ? Number(source.seed) : -1;
    this.inpaintConfigSampler = String(source.sampler ?? this.store.state.draft.sampler ?? "");
    this.inpaintConfigScheduler = String(source.scheduler ?? this.store.state.draft.scheduler ?? "");
  }

  private inpaintRequestExtras(draft: GenerationDraft): Record<string, unknown> {
    const extras = { ...this.activeExtraParams(draft) };
    // The editor owns the entire init/mask pipeline. Strip stale Create-tab mask state and custom
    // workflow overrides so an old advanced setting cannot silently turn an inpaint into img2img.
    const blocked = new Set([
      "initimage", "initimagecreativity", "initimageresettonorm", "initimagenoise",
      "maskimage", "maskbehavior", "maskshrinkgrow", "maskblur", "maskgrow",
      "maskcompositeunthresholded", "initimagerecompositemask", "useinpaintingencode",
      "nointernalspecialhandling", "forwardswarmdata", "forwardrawbackenddata"
    ]);
    for (const key of Object.keys(extras)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (blocked.has(normalized) || normalized.includes("customworkflow") || normalized === "workflow") delete extras[key];
    }
    return extras;
  }

  private inpaintMaskCoverage(): number {
    const mask = this.processedInpaintMask();
    if (!mask) return 0;
    const ctx = mask.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0;
    const pixels = ctx.getImageData(0, 0, mask.width, mask.height).data;
    const totalPixels = mask.width * mask.height;
    const stridePixels = Math.max(1, Math.floor(Math.sqrt(totalPixels / 50000)));
    let sampled = 0;
    let weight = 0;
    for (let y = 0; y < mask.height; y += stridePixels) {
      for (let x = 0; x < mask.width; x += stridePixels) {
        const index = (y * mask.width + x) * 4;
        weight += (pixels[index] ?? 0) / 255;
        sampled += 1;
      }
    }
    return sampled ? weight / sampled : 0;
  }

  private renderInpaintGenerationStatus(): void {
    if (!this.inpaintOpen) return;
    const overlay = this.root.querySelector<HTMLElement>("[data-inpaint-generation-preview]");
    if (!overlay) return;
    overlay.classList.toggle("is-active", this.inpaintAwaitingResult);
    const label = overlay.querySelector<HTMLElement>("[data-inpaint-generation-label]");
    const step = overlay.querySelector<HTMLElement>("[data-inpaint-generation-step]");
    const meter = overlay.querySelector<HTMLElement>("[data-inpaint-generation-meter]");
    if (label) label.textContent = this.generationMessage || (this.inpaintAwaitingResult ? "Generating edit" : "Ready");
    if (step) step.textContent = this.generationStep ? `Step ${this.generationStep} / ${Math.max(1, this.inpaintConfigSteps)}` : "Waiting for sampler";
    if (meter) meter.style.width = `${Math.round(clamp(this.generationPercent, 0, 1) * 100)}%`;
    const image = overlay.querySelector<HTMLImageElement>("[data-inpaint-generation-image]");
    const source = this.generationPreview;
    if (image && source && image.dataset.previewSource !== source) {
      image.dataset.previewSource = source;
      const apply = (resolved: string) => {
        if (!image.isConnected || image.dataset.previewSource !== source) return;
        image.src = resolved;
        image.classList.add("has-preview");
      };
      if (runtime.kind === "tauri" && !/^(data:|blob:)/i.test(source)) {
        void runtime.fetchDataUrl(source, this.store.state.connection.authToken).then(apply).catch(() => {});
      } else apply(source);
    }
    this.refreshInpaintActionState();
  }

  private scheduleInpaintMaskShapeRender(immediate = false): void {
    window.clearTimeout(this.inpaintMaskShapeTimer);
    const apply = () => {
      this.inpaintMaskShapeTimer = 0;
      this.inpaintProcessedMaskDirty = true;
      this.drawInpaintCanvas();
    };
    if (immediate) apply();
    else this.inpaintMaskShapeTimer = window.setTimeout(apply, 90);
  }

  private clearInpaintReview(): void {
    this.inpaintResultReviewOpen = false;
    this.inpaintPendingResultRecord = null;
  }

  private resetInpaintMaskSession(): void {
    this.inpaintStrokes = [];
    this.inpaintRedo = [];
    this.inpaintPreviewStroke = null;
    this.inpaintMaskDirty = true;
    this.inpaintProcessedMaskDirty = true;
    this.inpaintImportedMaskDataUrl = "";
    this.inpaintImportedMaskElement = null;
    this.inpaintFeather = 0;
    this.inpaintExpand = 0;
    this.inpaintInvert = false;
  }

  private async applyApprovedInpaintResult(): Promise<void> {
    const record = this.inpaintPendingResultRecord;
    if (!record) return;
    this.inpaintSourceId = record.id;
    this.inpaintSourceUrl = this.outputImageUrl(record);
    this.inpaintSourceDataUrl = "";
    this.inpaintSourceName = prettyName(record.swarmPath) || this.inpaintSourceName;
    this.inpaintSourceOutputContext = this.buildInpaintSourceContext(record);
    this.inpaintPrompt = record.prompt || this.inpaintPrompt;
    this.inpaintNegativePrompt = record.negativePrompt || this.inpaintNegativePrompt;
    this.clearInpaintReview();
    try {
      const dataUrl = this.inpaintSourceUrl.startsWith("data:") ? this.inpaintSourceUrl : await runtime.fetchDataUrl(this.inpaintSourceUrl, this.store.state.connection.authToken);
      if (!/^data:image\//i.test(dataUrl)) throw new Error("The edited output route returned non-image data.");
      this.inpaintSourceDataUrl = dataUrl;
    } catch (error) {
      this.addLog(`Could not prefetch the approved inpaint result: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
    }
    this.inpaintImageElement = null;
    this.inpaintMaskCanvas = null;
    this.inpaintProcessedMaskCanvas = null;
    this.resetInpaintMaskSession();
    this.notify("Approved edit loaded as the new inpaint base.", "success");
    this.render();
  }

  private closeInpaintEditor(): void {
    this.inpaintOpen = false;
    this.inpaintAwaitingResult = false;
    window.clearTimeout(this.inpaintMaskShapeTimer);
    this.inpaintMaskShapeTimer = 0;
    this.inpaintResizeObserver?.disconnect();
    this.inpaintResizeObserver = null;
    this.inpaintSourceOutputContext = null;
    this.inpaintSettingsOpen = false;
    this.inpaintHelpOpen = false;
    this.clearInpaintReview();
    this.render();
  }

  private async openInpaintForOutput(id: string): Promise<void> {
    const output = this.outputById(id);
    if (!output) return;
    this.inpaintOpen = true;
    this.inpaintSourceId = output.id;
    this.inpaintSourceUrl = this.outputImageUrl(output);
    this.inpaintSourceDataUrl = "";
    this.inpaintSourceName = prettyName(output.swarmPath) || prettyName(output.model) || "Swarm output";
    this.inpaintSourceOutputContext = this.buildInpaintSourceContext(output);
    this.inpaintSettingsOpen = false;
    this.inpaintHelpOpen = false;
    this.clearInpaintReview();
    this.resetInpaintGenerationConfigFromSource();
    this.inpaintPrompt = output.prompt || output.sentPrompt || this.store.state.draft.prompt || "";
    this.inpaintNegativePrompt = output.negativePrompt || this.store.state.draft.negativePrompt || "";
    this.inpaintCreativity = clamp(this.store.state.draft.initImageCreativity || 0.5, 0, 1);
    this.inpaintEngine = "simple";
    this.inpaintBrushSize = 36;
    this.inpaintTool = "paint";
    this.inpaintShowMask = true;
    this.inpaintMaskOpacity = 0.38;
    this.inpaintInvert = false;
    this.inpaintFeather = 0;
    this.inpaintExpand = 0;
    this.inpaintZoom = 1;
    this.inpaintPanX = 0;
    this.inpaintPanY = 0;
    this.inpaintCursorX = null;
    this.inpaintCursorY = null;
    this.inpaintStrokes = [];
    this.inpaintRedo = [];
    this.inpaintPreviewStroke = null;
    this.inpaintImageElement = null;
    this.inpaintMaskCanvas = null;
    this.inpaintProcessedMaskCanvas = null;
    this.inpaintMaskDirty = true;
    this.inpaintProcessedMaskDirty = true;
    this.inpaintImportedMaskDataUrl = "";
    this.inpaintImportedMaskElement = null;
    this.store.updateUi({ selectedOutputId: "" });
    this.render();
    try {
      const dataUrl = this.inpaintSourceUrl.startsWith("data:") ? this.inpaintSourceUrl : await runtime.fetchDataUrl(this.inpaintSourceUrl, this.store.state.connection.authToken);
      if (!/^data:image\//i.test(dataUrl)) throw new Error("The source route returned non-image data.");
      this.inpaintSourceDataUrl = dataUrl;
      if (this.inpaintOpen && this.inpaintSourceId === output.id) this.render();
    } catch (error) {
      this.addLog(`Could not prefetch the inpaint source image: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
      if (this.inpaintOpen && this.inpaintSourceId === output.id) this.render();
    }
  }

  private ensureInpaintImage(): void {
    if (!this.inpaintOpen || !this.inpaintSourceUrl) return;
    // Canvas always consumes an in-memory/data image. On desktop this prevents the abandoned
    // raw WebView request from racing the Rust bridge; on mobile it also avoids CORS/relay
    // differences between <img> and canvas security rules. openInpaintForOutput prefetches it.
    const imageSource = this.inpaintSourceDataUrl || (/^(data:|blob:)/i.test(this.inpaintSourceUrl) ? this.inpaintSourceUrl : "");
    if (!imageSource) return;
    if (this.inpaintImageElement?.dataset.studioSource === imageSource && this.inpaintImageElement.complete && this.inpaintImageElement.naturalWidth) {
      if (!this.inpaintMaskCanvas) {
        this.inpaintMaskCanvas = document.createElement("canvas");
        this.inpaintMaskCanvas.width = this.inpaintImageElement.naturalWidth;
        this.inpaintMaskCanvas.height = this.inpaintImageElement.naturalHeight;
        this.inpaintMaskDirty = true;
      }
      this.drawInpaintCanvas();
      return;
    }
    const requestedSourceId = this.inpaintSourceId;
    const image = new Image();
    image.decoding = "async";
    image.dataset.studioSource = imageSource;
    image.onload = () => {
      if (!this.inpaintOpen || this.inpaintSourceId !== requestedSourceId) return;
      this.inpaintImageElement = image;
      this.inpaintMaskCanvas = document.createElement("canvas");
      this.inpaintMaskCanvas.width = image.naturalWidth;
      this.inpaintMaskCanvas.height = image.naturalHeight;
      this.inpaintMaskDirty = true;
      this.inpaintProcessedMaskDirty = true;
      this.render();
    };
    image.onerror = () => {
      if (!this.inpaintOpen || this.inpaintSourceId !== requestedSourceId || this.inpaintSourceDataUrl !== imageSource) return;
      this.notify("Could not decode that source image for the inpaint canvas.", "error");
      this.inpaintImageElement = null;
      this.render();
    };
    this.inpaintImageElement = image;
    image.src = imageSource;
  }

  private inpaintPlacement(canvas: HTMLCanvasElement): { cssWidth: number; cssHeight: number; imageWidth: number; imageHeight: number; scale: number; offsetX: number; offsetY: number; } | null {
    const image = this.inpaintImageElement;
    if (!image || !image.naturalWidth || !image.naturalHeight) return null;
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width);
    const cssHeight = Math.max(1, rect.height);
    const fit = Math.min(cssWidth / image.naturalWidth, cssHeight / image.naturalHeight);
    const scale = fit * this.inpaintZoom;
    const imageWidth = image.naturalWidth * scale;
    const imageHeight = image.naturalHeight * scale;
    const offsetX = (cssWidth - imageWidth) / 2 + this.inpaintPanX;
    const offsetY = (cssHeight - imageHeight) / 2 + this.inpaintPanY;
    return { cssWidth, cssHeight, imageWidth, imageHeight, scale, offsetX, offsetY };
  }

  private imagePointFromCanvas(canvas: HTMLCanvasElement, clientX: number, clientY: number): InpaintPoint | null {
    const placement = this.inpaintPlacement(canvas);
    const image = this.inpaintImageElement;
    if (!placement || !image) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const ix = (x - placement.offsetX) / placement.scale;
    const iy = (y - placement.offsetY) / placement.scale;
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;
    if (ix < 0 || iy < 0 || ix > image.naturalWidth || iy > image.naturalHeight) return null;
    return { x: clamp(ix, 0, image.naturalWidth), y: clamp(iy, 0, image.naturalHeight) };
  }

  private inpaintHasMask(): boolean {
    return Boolean(this.inpaintStrokes.length || this.inpaintImportedMaskDataUrl || this.inpaintInvert);
  }

  private refreshInpaintActionState(): void {
    if (!this.inpaintOpen) return;
    const loaded = Boolean(this.inpaintImageElement?.complete && this.inpaintImageElement.naturalWidth > 0);
    const hasMask = this.inpaintHasMask();
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='generate-inpaint']").forEach((button) => {
      button.disabled = this.generating || !loaded || !hasMask;
    });
    const clear = this.root.querySelector<HTMLButtonElement>("[data-action='inpaint-clear']");
    if (clear) clear.disabled = !hasMask;
    const exportButton = this.root.querySelector<HTMLButtonElement>("[data-action='export-inpaint-mask']");
    if (exportButton) exportButton.disabled = !hasMask || !loaded;
    const undo = this.root.querySelector<HTMLButtonElement>("[data-action='inpaint-undo']");
    if (undo) undo.disabled = !this.inpaintStrokes.length;
    const redo = this.root.querySelector<HTMLButtonElement>("[data-action='inpaint-redo']");
    if (redo) redo.disabled = !this.inpaintRedo.length;
    const count = this.root.querySelector<HTMLElement>("[data-inpaint-mask-count]");
    if (count) count.textContent = this.inpaintImportedMaskDataUrl ? "Imported + drawn" : `${this.inpaintStrokes.length} action${this.inpaintStrokes.length === 1 ? "" : "s"}`;
  }

  private drawInpaintMaskAction(ctx: CanvasRenderingContext2D, stroke: InpaintStroke): void {
    if (!stroke.points.length) return;
    const fill = stroke.mode === "erase" ? "#000" : "#fff";
    ctx.save();
    ctx.strokeStyle = fill;
    ctx.fillStyle = fill;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.size;
    const shape = stroke.shape ?? "stroke";
    if (shape === "rect" && stroke.points.length >= 2) {
      const a = stroke.points[0]!;
      const b = stroke.points[stroke.points.length - 1]!;
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else if (shape === "lasso" && stroke.points.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(stroke.points[0]!.x, stroke.points[0]!.y);
      for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(stroke.points[0]!.x, stroke.points[0]!.y);
      for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
      if (stroke.points.length === 1) {
        ctx.arc(stroke.points[0]!.x, stroke.points[0]!.y, stroke.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.stroke();
    }
    ctx.restore();
  }

  private rebuildInpaintMask(): void {
    const image = this.inpaintImageElement;
    const canvas = this.inpaintMaskCanvas;
    if (!image || !canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (this.inpaintImportedMaskElement?.complete && this.inpaintImportedMaskElement.naturalWidth) {
      ctx.drawImage(this.inpaintImportedMaskElement, 0, 0, canvas.width, canvas.height);
    }
    for (const stroke of this.inpaintStrokes) this.drawInpaintMaskAction(ctx, stroke);
    this.inpaintMaskDirty = false;
    this.inpaintProcessedMaskDirty = true;
  }

  private thresholdMaskCanvas(canvas: HTMLCanvasElement, threshold: number, invert = false): void {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < data.data.length; index += 4) {
      const source = data.data[index] ?? 0;
      const on = source >= threshold;
      const value = (invert ? !on : on) ? 255 : 0;
      data.data[index] = value;
      data.data[index + 1] = value;
      data.data[index + 2] = value;
      data.data[index + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
  }

  private invertMaskCanvas(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < data.data.length; index += 4) {
      const value = 255 - (data.data[index] ?? 0);
      data.data[index] = value;
      data.data[index + 1] = value;
      data.data[index + 2] = value;
      data.data[index + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
  }

  private processedInpaintMask(): HTMLCanvasElement | null {
    if (this.inpaintMaskDirty) this.rebuildInpaintMask();
    const source = this.inpaintMaskCanvas;
    if (!source) return null;
    if (!this.inpaintProcessedMaskCanvas || this.inpaintProcessedMaskCanvas.width !== source.width || this.inpaintProcessedMaskCanvas.height !== source.height) {
      this.inpaintProcessedMaskCanvas = document.createElement("canvas");
      this.inpaintProcessedMaskCanvas.width = source.width;
      this.inpaintProcessedMaskCanvas.height = source.height;
      this.inpaintProcessedMaskDirty = true;
    }
    if (!this.inpaintProcessedMaskDirty) return this.inpaintProcessedMaskCanvas;
    const output = this.inpaintProcessedMaskCanvas;
    const ctx = output.getContext("2d", { willReadFrequently: true });
    if (!ctx) return source;
    ctx.save();
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, output.width, output.height);
    ctx.drawImage(source, 0, 0);
    ctx.restore();

    if (this.inpaintExpand !== 0) {
      const radius = Math.abs(Math.round(this.inpaintExpand));
      if (radius > 0) {
        if (this.inpaintExpand < 0) this.invertMaskCanvas(output);
        const scratch = document.createElement("canvas");
        scratch.width = output.width;
        scratch.height = output.height;
        const scratchCtx = scratch.getContext("2d");
        if (scratchCtx) {
          scratchCtx.filter = `blur(${radius}px)`;
          scratchCtx.drawImage(output, 0, 0);
          ctx.clearRect(0, 0, output.width, output.height);
          ctx.drawImage(scratch, 0, 0);
          this.thresholdMaskCanvas(output, 3);
        }
        if (this.inpaintExpand < 0) this.invertMaskCanvas(output);
      }
    }
    if (this.inpaintInvert) this.invertMaskCanvas(output);
    if (this.inpaintFeather > 0) {
      const scratch = document.createElement("canvas");
      scratch.width = output.width;
      scratch.height = output.height;
      const scratchCtx = scratch.getContext("2d");
      if (scratchCtx) {
        scratchCtx.filter = `blur(${Math.round(this.inpaintFeather)}px)`;
        scratchCtx.drawImage(output, 0, 0);
        ctx.clearRect(0, 0, output.width, output.height);
        ctx.drawImage(scratch, 0, 0);
      }
    }
    this.inpaintProcessedMaskDirty = false;
    return output;
  }

  private async importInpaintMask(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = "";
    if (!file || !this.inpaintImageElement?.naturalWidth) return;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("Could not read mask image."));
        reader.readAsDataURL(file);
      });
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const next = new Image();
        next.onload = () => resolve(next);
        next.onerror = () => reject(new Error("Could not decode mask image."));
        next.src = dataUrl;
      });
      const normalized = document.createElement("canvas");
      normalized.width = this.inpaintImageElement.naturalWidth;
      normalized.height = this.inpaintImageElement.naturalHeight;
      const ctx = normalized.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas is unavailable.");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, normalized.width, normalized.height);
      ctx.drawImage(image, 0, 0, normalized.width, normalized.height);
      const pixels = ctx.getImageData(0, 0, normalized.width, normalized.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const alpha = (pixels.data[index + 3] ?? 255) / 255;
        const luminance = ((pixels.data[index] ?? 0) * 0.2126 + (pixels.data[index + 1] ?? 0) * 0.7152 + (pixels.data[index + 2] ?? 0) * 0.0722) * alpha;
        const value = luminance >= 128 ? 255 : 0;
        pixels.data[index] = value;
        pixels.data[index + 1] = value;
        pixels.data[index + 2] = value;
        pixels.data[index + 3] = 255;
      }
      ctx.putImageData(pixels, 0, 0);
      this.inpaintImportedMaskDataUrl = normalized.toDataURL("image/png");
      const imported = new Image();
      imported.onload = () => {
        this.inpaintImportedMaskElement = imported;
        this.inpaintMaskDirty = true;
        this.inpaintProcessedMaskDirty = true;
        this.render();
      };
      imported.src = this.inpaintImportedMaskDataUrl;
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  private downloadInpaintMask(): void {
    try {
      const mask = this.exportInpaintMask();
      const anchor = document.createElement("a");
      anchor.href = mask;
      anchor.download = `${(this.inpaintSourceName || "swarm-output").replace(/[^a-z0-9._-]+/gi, "-")}-mask.png`;
      anchor.click();
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  private drawInpaintCanvas(): void {
    const canvas = this.root.querySelector<HTMLCanvasElement>("#inpaint-canvas");
    const image = this.inpaintImageElement;
    if (!canvas || !image || !image.naturalWidth || !image.naturalHeight) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const targetWidth = Math.max(1, Math.round(rect.width * dpr));
    const targetHeight = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const placement = this.inpaintPlacement(canvas);
    if (!placement) return;
    const visibleMask = this.processedInpaintMask();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, placement.cssWidth, placement.cssHeight);
    ctx.fillStyle = "rgba(10, 8, 13, 1)";
    ctx.fillRect(0, 0, placement.cssWidth, placement.cssHeight);
    ctx.drawImage(image, placement.offsetX, placement.offsetY, placement.imageWidth, placement.imageHeight);
    if (this.inpaintShowMask && visibleMask) {
      ctx.save();
      ctx.globalAlpha = this.inpaintMaskOpacity;
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(visibleMask, placement.offsetX, placement.offsetY, placement.imageWidth, placement.imageHeight);
      ctx.restore();
    }
    if (visibleMask) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.strokeRect(placement.offsetX + 0.5, placement.offsetY + 0.5, placement.imageWidth - 1, placement.imageHeight - 1);
      ctx.restore();
    }
    const themeStyle = getComputedStyle(document.documentElement);
    const themeAccent = themeStyle.getPropertyValue("--purple").trim() || "#c3a5ff";
    const themeAlt = themeStyle.getPropertyValue("--pink").trim() || "#ffb5df";
    if (this.inpaintPreviewStroke?.points.length) {
      const preview = this.inpaintPreviewStroke;
      const color = preview.mode === "erase" ? themeAlt : themeAccent;
      const toCanvas = (point: InpaintPoint) => ({ x: placement.offsetX + point.x * placement.scale, y: placement.offsetY + point.y * placement.scale });
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.globalAlpha = preview.mode === "erase" ? 0.24 : 0.28;
      ctx.lineWidth = Math.max(1.5, preview.size * placement.scale);
      const shape = preview.shape ?? "stroke";
      if (shape === "rect" && preview.points.length >= 2) {
        const a = toCanvas(preview.points[0]!);
        const b = toCanvas(preview.points[preview.points.length - 1]!);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      } else if (shape === "lasso" && preview.points.length >= 2) {
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const first = toCanvas(preview.points[0]!);
        ctx.moveTo(first.x, first.y);
        for (const point of preview.points.slice(1)) {
          const mapped = toCanvas(point);
          ctx.lineTo(mapped.x, mapped.y);
        }
        if (preview.points.length >= 3) {
          ctx.closePath();
          ctx.fill();
        }
        ctx.stroke();
      } else {
        ctx.beginPath();
        const first = toCanvas(preview.points[0]!);
        ctx.moveTo(first.x, first.y);
        for (const point of preview.points.slice(1)) {
          const mapped = toCanvas(point);
          ctx.lineTo(mapped.x, mapped.y);
        }
        if (preview.points.length === 1) {
          ctx.arc(first.x, first.y, Math.max(2, preview.size * placement.scale / 2), 0, Math.PI * 2);
          ctx.fill();
        } else ctx.stroke();
      }
      ctx.restore();
    }
    if ((this.inpaintTool === "paint" || this.inpaintTool === "erase") && this.inpaintCursorX != null && this.inpaintCursorY != null) {
      const brushPreviewSize = this.inpaintBrushSize * placement.scale;
      ctx.save();
      const cursorColor = this.inpaintTool === "erase" ? themeAlt : themeAccent;
      ctx.strokeStyle = cursorColor;
      ctx.fillStyle = cursorColor;
      ctx.globalAlpha = 0.88;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(this.inpaintCursorX, this.inpaintCursorY, Math.max(3, brushPreviewSize / 2), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  private bindInpaintEditor(): void {
    const canvas = this.root.querySelector<HTMLCanvasElement>("#inpaint-canvas");
    const shell = this.root.querySelector<HTMLElement>(".inpaint-canvas-shell");
    this.inpaintResizeObserver?.disconnect();
    this.inpaintResizeObserver = null;
    if (!canvas || !shell || !this.inpaintOpen) return;
    this.ensureInpaintImage();
    if (!this.inpaintImageElement?.complete || !this.inpaintImageElement.naturalWidth) return;
    const resizeObserver = new ResizeObserver(() => this.drawInpaintCanvas());
    resizeObserver.observe(shell);
    this.inpaintResizeObserver = resizeObserver;
    this.drawInpaintCanvas();
    const pointers = new Map<number, { x: number; y: number }>();
    let drawing = false;
    let panning = false;
    let currentStroke: InpaintStroke | null = null;
    let panStartX = 0;
    let panStartY = 0;
    let panOriginX = this.inpaintPanX;
    let panOriginY = this.inpaintPanY;
    let pinchDistance = 0;
    let pinchZoom = this.inpaintZoom;
    let pinchPanX = this.inpaintPanX;
    let pinchPanY = this.inpaintPanY;
    let pinchCenter = { x: 0, y: 0 };
    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    const center = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const finishStroke = () => {
      if (currentStroke?.points.length) {
        const shape = currentStroke.shape ?? "stroke";
        const valid = shape === "rect" ? currentStroke.points.length >= 2 && Math.abs(currentStroke.points[0]!.x - currentStroke.points.at(-1)!.x) > 1 && Math.abs(currentStroke.points[0]!.y - currentStroke.points.at(-1)!.y) > 1
          : shape === "lasso" ? currentStroke.points.length >= 3
          : true;
        if (valid) {
          this.inpaintStrokes.push(currentStroke);
          this.inpaintRedo = [];
          this.inpaintMaskDirty = true;
          this.inpaintProcessedMaskDirty = true;
        }
      }
      drawing = false;
      currentStroke = null;
      this.inpaintPreviewStroke = null;
      this.drawInpaintCanvas();
      this.refreshInpaintActionState();
    };
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const oldZoom = this.inpaintZoom;
      const nextZoom = clamp(oldZoom * (event.deltaY < 0 ? 1.1 : 0.9), 0.4, 8);
      const rect = canvas.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      const before = this.inpaintPlacement(canvas);
      if (before) {
        const imageX = (cursorX - before.offsetX) / before.scale;
        const imageY = (cursorY - before.offsetY) / before.scale;
        this.inpaintZoom = nextZoom;
        const after = this.inpaintPlacement(canvas);
        if (after) {
          this.inpaintPanX += cursorX - (after.offsetX + imageX * after.scale);
          this.inpaintPanY += cursorY - (after.offsetY + imageY * after.scale);
        }
      } else this.inpaintZoom = nextZoom;
      this.drawInpaintCanvas();
    }, { passive: false });
    canvas.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") {
        const rect = canvas.getBoundingClientRect();
        this.inpaintCursorX = event.clientX - rect.left;
        this.inpaintCursorY = event.clientY - rect.top;
      }
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size >= 2) {
        drawing = false;
        currentStroke = null;
        this.inpaintPreviewStroke = null;
        panning = false;
        const [a, b] = [...pointers.values()];
        pinchDistance = distance(a!, b!);
        pinchZoom = this.inpaintZoom;
        pinchPanX = this.inpaintPanX;
        pinchPanY = this.inpaintPanY;
        pinchCenter = center(a!, b!);
        return;
      }
      if (this.inpaintTool === "pan" || event.button === 1 || event.button === 2) {
        panning = true;
        drawing = false;
        panStartX = event.clientX;
        panStartY = event.clientY;
        panOriginX = this.inpaintPanX;
        panOriginY = this.inpaintPanY;
        return;
      }
      const point = this.imagePointFromCanvas(canvas, event.clientX, event.clientY);
      if (!point) return;
      drawing = true;
      const shape = this.inpaintTool === "rect" ? "rect" : this.inpaintTool === "lasso" ? "lasso" : "stroke";
      currentStroke = { mode: this.inpaintTool === "erase" ? "erase" : "paint", size: this.inpaintBrushSize, points: [point], shape };
      if (shape === "rect") currentStroke.points.push({ ...point });
      this.inpaintPreviewStroke = currentStroke;
      this.drawInpaintCanvas();
    });
    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "touch") {
        const rect = canvas.getBoundingClientRect();
        this.inpaintCursorX = event.clientX - rect.left;
        this.inpaintCursorY = event.clientY - rect.top;
        if (!pointers.has(event.pointerId)) { this.drawInpaintCanvas(); return; }
      }
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const currentDistance = Math.max(1, distance(a!, b!));
        const currentCenter = center(a!, b!);
        this.inpaintZoom = clamp(pinchZoom * (currentDistance / Math.max(1, pinchDistance)), 0.4, 8);
        this.inpaintPanX = pinchPanX + (currentCenter.x - pinchCenter.x);
        this.inpaintPanY = pinchPanY + (currentCenter.y - pinchCenter.y);
        this.drawInpaintCanvas();
        return;
      }
      if (panning) {
        this.inpaintPanX = panOriginX + (event.clientX - panStartX);
        this.inpaintPanY = panOriginY + (event.clientY - panStartY);
        this.drawInpaintCanvas();
        return;
      }
      if (!drawing || !currentStroke) return;
      const point = this.imagePointFromCanvas(canvas, event.clientX, event.clientY);
      if (!point) return;
      const shape = currentStroke.shape ?? "stroke";
      if (shape === "rect") currentStroke.points[currentStroke.points.length - 1] = point;
      else {
        const last = currentStroke.points[currentStroke.points.length - 1];
        const spacing = shape === "lasso" ? 2 : Math.max(0.75, currentStroke.size * 0.04);
        if (!last || Math.hypot(last.x - point.x, last.y - point.y) >= spacing) currentStroke.points.push(point);
      }
      this.inpaintPreviewStroke = currentStroke;
      this.drawInpaintCanvas();
    });
    const releasePointer = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (drawing && pointers.size === 0) finishStroke();
      if (panning && pointers.size === 0) panning = false;
      if (pointers.size < 2) {
        const next = [...pointers.values()][0];
        if (next) {
          panStartX = next.x;
          panStartY = next.y;
          panOriginX = this.inpaintPanX;
          panOriginY = this.inpaintPanY;
        }
      }
    };
    canvas.addEventListener("pointerup", releasePointer);
    canvas.addEventListener("pointercancel", releasePointer);
    canvas.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse" && drawing) finishStroke();
      if (event.pointerType !== "touch") {
        this.inpaintCursorX = null;
        this.inpaintCursorY = null;
        this.drawInpaintCanvas();
      }
    });
  }

  private exportInpaintMask(): string {
    if (!this.inpaintImageElement) throw new Error("The source image has not finished loading yet.");
    if (!this.inpaintMaskCanvas) {
      this.inpaintMaskCanvas = document.createElement("canvas");
      this.inpaintMaskCanvas.width = this.inpaintImageElement.naturalWidth;
      this.inpaintMaskCanvas.height = this.inpaintImageElement.naturalHeight;
      this.inpaintMaskDirty = true;
      this.inpaintProcessedMaskDirty = true;
    }
    const mask = this.processedInpaintMask();
    if (!mask) throw new Error("The mask canvas is unavailable.");
    return mask.toDataURL("image/png");
  }

  private async generateInpaint(): Promise<void> {
    if (this.generating) return;
    if (!this.inpaintPrompt.trim()) {
      this.notify("Give the masked area a prompt first.", "error");
      return;
    }
    if (!this.inpaintHasMask()) {
      this.notify("Paint, select, or import a mask first, bestie.", "error");
      return;
    }
    if (!this.inpaintImageElement?.naturalWidth || !this.inpaintImageElement?.naturalHeight) {
      this.notify("The source image is still loading.", "error");
      return;
    }
    let mask = "";
    try {
      mask = this.exportInpaintMask();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.notify(`Could not export the painted mask. ${message}`, "error");
      return;
    }
    const draft = this.sourceDraftForInpaint(this.readDraftFromForm());
    if (!draft.model) {
      this.notify("Pick a checkpoint first.", "error");
      return;
    }
    if (!this.connected) {
      await this.connect(false);
      if (!this.connected) return;
    }
    await this.ensureGenerationParameterHydration({
      ...draft,
      sampler: this.inpaintConfigSampler || draft.sampler,
      scheduler: this.inpaintConfigScheduler || draft.scheduler,
    });
    const loraSelection = this.generationLoraSelection(draft);
    if (loraSelection.missing.length) {
      const names = loraSelection.missing.map((item) => item.title || prettyName(item.name)).join(", " );
      this.addLog(`Inpaint blocked because ${loraSelection.missing.length} enabled LoRA${loraSelection.missing.length === 1 ? "" : "s"} could not be matched to Swarm's current LoRA options: ${names}`, "error", "api");
      this.notify(`Refresh or re-add the missing LoRA${loraSelection.missing.length === 1 ? "" : "s"}: ${names}`, "error");
      return;
    }
    const coverage = this.inpaintMaskCoverage();
    if (coverage < 0.0005) {
      this.notify("The exported mask is effectively empty. Paint a larger area or check mask inversion.", "error");
      return;
    }
    const request = this.wireGenerationRequest({
      ...this.inpaintRequestExtras(draft),
      prompt: [draft.activePresets.map((title) => `<preset:${title}>`).join(", "), draft.loras.filter((item) => item.enabled && item.useTrigger).map((item) => String(this.resolveLora(item)?.trigger_phrase ?? "").replaceAll(";", ",").trim()).filter(Boolean).join(", "), this.inpaintPrompt].filter(Boolean).join(", "),
      negativeprompt: this.inpaintNegativePrompt,
      model: draft.model,
      width: this.inpaintConfigWidth,
      height: this.inpaintConfigHeight,
      steps: this.inpaintConfigSteps,
      cfgscale: this.inpaintConfigCfg,
      seed: this.inpaintConfigSeed,
      variationseed: draft.variationSeedEnabled ? draft.variationSeed : undefined,
      variationseedstrength: draft.variationSeedEnabled ? draft.variationSeedStrength : undefined,
      sampler: this.inpaintConfigSampler || draft.sampler || undefined,
      scheduler: this.inpaintConfigScheduler || draft.scheduler || undefined,
      images: 1,
      loras: loraSelection.values,
      loraweights: loraSelection.weights,
      initimage: this.inpaintSourceDataUrl || (this.inpaintSourceUrl.startsWith("data:") ? this.inpaintSourceUrl : await runtime.fetchDataUrl(this.inpaintSourceUrl, this.store.state.connection.authToken)),
      initimagecreativity: this.inpaintCreativity,
      maskimage: mask,
      maskbehavior: this.inpaintEngine === "differential" ? "Differential" : "Simple Latent",
      useinpaintingencode: this.inpaintEngine === "encode" ? true : undefined,
      maskcompositeunthresholded: this.inpaintFeather > 0 ? true : undefined,
      forwardswarmdata: true,
    });
    this.clearInpaintReview();
    this.inpaintAwaitingResult = true;
    this.generating = true;
    this.generationPreview = "";
    this.generationFinalUrl = "";
    this.generationResolvedSeed = null;
    this.generationResolvedMetadata = "";
    this.generationFinalPath = "";
    this.generationPercent = 0;
    this.generationStep = 0;
    this.generationMessage = "Opening generation stream";
    const sourceLoraCount = draft.loras.filter((item) => item.enabled).length;
    this.addLog(`Inpaint started with ${draft.model} on ${this.inpaintSourceName} · ${this.inpaintEngine} engine · ${(coverage * 100).toFixed(1)}% mask coverage · ${sourceLoraCount} LoRAs.`, "info", "api");
    this.refreshGenerationChrome();
    this.renderInpaintGenerationStatus();
    let historyBefore: Set<string> | null = null;
    try {
      historyBefore = new Set((await this.client.listImages("", 6)).map((file) => String(file.src ?? "")).filter(Boolean));
    } catch (error) {
      this.addLog(`Could not snapshot Swarm history before inpaint: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
    }
    let images: SwarmGenerationImage[] = [];
    let responseMetadata: string[] = [];
    let sawStreamEvent = false;
    const discarded = new Set<number>();
    const paramsUsed = new Set<string>();
    let firstRecord: OutputRecord | null = null;
    try {
      try {
        images = await this.client.generateStream(request, (event) => {
          sawStreamEvent = true;
          for (const index of event.discard_indices ?? []) discarded.add(index);
          for (const key of event.raw_swarm_data?.params_used ?? []) paramsUsed.add(String(key).toLowerCase().replace(/[^a-z0-9]+/g, ""));
          this.handleGenerationEvent(event);
        });
      } catch (streamError) {
        if (sawStreamEvent) throw streamError;
        this.addLog(`Inpaint WebSocket unavailable before work began; falling back to HTTP: ${streamError instanceof Error ? streamError.message : String(streamError)}`, "warn", "api");
        const response = await this.client.generate(request);
        responseMetadata = response.metadata ?? [];
        images = (response.images ?? []).flatMap((raw, index) => {
          const image = normalizeGenerationImage(raw, index);
          return image ? [image] : [];
        });
      }
      images = images.filter((image) => !discarded.has(Number(image.batch_index ?? -1)));
      if (!images.length && historyBefore) {
        for (let attempt = 0; attempt < 6 && !images.length; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 500 + attempt * 250));
          const recent = await this.client.listImages("", 6);
          images = recent.filter((file) => file.src && !historyBefore!.has(String(file.src))).slice(0, 1).map((file, index) => ({ image: String(file.src), batch_index: String(index), metadata: String(file.metadata ?? "") }));
        }
      }
      if (!images.length) throw new Error("Swarm completed without returning or indexing a final image path.");
      const recentMetadata = new Map<string, string>();
      const recordRecentMetadata = (files: SwarmImageListItem[]) => {
        for (const file of files) {
          if (!file.src) continue;
          const key = this.normalizeSwarmPath(file.src);
          recentMetadata.set(key, String(file.metadata ?? ""));
          const leaf = key.split("/").pop();
          if (leaf) recentMetadata.set(leaf, String(file.metadata ?? ""));
        }
      };
      try {
        recordRecentMetadata(await this.client.listImages("", 18));
      } catch (error) {
        this.addLog(`Could not read immediate final inpaint metadata: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
      }
      for (const [index, result] of images.entries()) {
        const path = String(result.image ?? "");
        if (!path) continue;
        const url = this.client.imageUrl(this.normalizeSwarmPath(path));
        const key = this.normalizeSwarmPath(path);
        const leaf = key.split("/").pop() || "";
        const capturedMetadata = index === 0 ? this.generationResolvedMetadata : "";
        const resolvedMetadata = result.metadata || capturedMetadata || responseMetadata[index] || recentMetadata.get(key) || recentMetadata.get(leaf) || "";
        const eventSeed = index === 0 && this.generationResolvedSeed != null ? this.generationResolvedSeed : undefined;
        const resolvedSeed = this.resolvedSeedFor({ ...result, seed: eventSeed ?? result.seed }, resolvedMetadata, draft.seed);
        const record = this.store.addOutput({
          url,
          swarmPath: path,
          swarmSourcePath: this.swarmMutationPath(path),
          prompt: this.inpaintPrompt,
          sentPrompt: request.prompt,
          negativePrompt: this.inpaintNegativePrompt,
          model: draft.model,
          width: this.inpaintConfigWidth,
          height: this.inpaintConfigHeight,
          seed: resolvedSeed,
          metadata: resolvedMetadata,
          request: { ...this.requestSnapshot(request, draft), [this.maskParamKey()]: "[mask image: embedded png]" },
          loras: cloneStack(draft.loras),
          presets: [...draft.activePresets],
        });
        firstRecord ??= record;
        if (index === 0) { this.generationFinalUrl = url; this.generationFinalPath = path; }
      }
      if (!firstRecord) throw new Error("Swarm returned image events without a usable path.");
      if (paramsUsed.size) {
        if (paramsUsed.has("maskimage")) this.addLog(`Swarm confirmed maskimage was queried by the generated workflow (${this.inpaintEngine} engine).`, "info", "api");
        else this.addLog(`Swarm did not report maskimage among queried parameters: ${[...paramsUsed].join(", ")}.`, "warn", "api");
      }
      this.addLog("Inpaint completed with 1 output. Review the result before replacing the current base.", "info", "api");
      this.notify("Edited output indexed in Library. Approve it if you want to continue from the new base.", "success");
      this.inpaintPendingResultRecord = firstRecord;
      this.inpaintResultReviewOpen = true;
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog(message, "error", "api");
      this.notify(message, "error");
    } finally {
      this.inpaintAwaitingResult = false;
      this.generating = false;
      this.generationPreview = "";
      this.generationPercent = 0;
      this.generationStep = 0;
      this.generationMessage = "";
      this.refreshGenerationChrome();
      this.renderInpaintGenerationStatus();
      this.root.querySelector<HTMLElement>("[data-generation-mini]")?.remove();
      if (this.inpaintOpen) this.render();
    }
  }

  private normalizeSwarmPath(path: unknown): string {
    return swarmImageViewPath(path, this.session);
  }

  private swarmMutationPath(path: unknown): string {
    return swarmImageMutationPath(path, this.session);
  }

  private outputMutationPath(output: OutputRecord): string {
    return this.swarmMutationPath(output.swarmSourcePath || output.swarmPath || output.url);
  }

  private joinSwarmHistoryPath(parent: string, child: unknown): string {
    const base = this.swarmMutationPath(parent).replace(/\/+$/, "");
    const leaf = this.swarmMutationPath(child).replace(/^\/+/, "");
    if (!base) return leaf;
    if (!leaf) return base;
    if (leaf.toLowerCase() === base.toLowerCase() || leaf.toLowerCase().startsWith(`${base.toLowerCase()}/`)) return leaf;
    return `${base}/${leaf}`;
  }

  private seedFromPath(path: unknown): number | null {
    const normalized = this.normalizeSwarmPath(path);
    const leaf = normalized.split("/").pop() || "";
    const match = leaf.match(/(?:^|[-_])(\d{1,19})(?=\.[^.]+$|$)/g)?.pop()?.match(/(\d{1,19})/);
    if (!match) return null;
    const seed = Number(match[1]);
    return Number.isSafeInteger(seed) && seed >= 0 ? seed : null;
  }

  private resolvedSeedFor(image: SwarmGenerationImage, metadata: unknown, fallback: number): number {
    if (Number.isFinite(image.seed) && Number(image.seed) >= 0) return Number(image.seed);
    const params = this.metadataParams(metadata);
    const metadataSeed = Number(this.metadataValue(params, "seed", "main seed", "mainseed"));
    if (Number.isFinite(metadataSeed) && metadataSeed >= 0) return metadataSeed;
    const pathSeed = this.seedFromPath(image.image);
    if (pathSeed != null) return pathSeed;
    return fallback;
  }

  private outputDateFromPath(path: string): number | null {
    const match = String(path ?? "").match(/(?:^|\/)(\d{4})-(\d{2})-(\d{2})(?:\/|$)/);
    if (!match) return null;
    const time = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0).getTime();
    return Number.isFinite(time) ? time : null;
  }

  private metadataObject(metadata: unknown): Record<string, unknown> {
    let parsed: unknown = metadata;
    for (let depth = 0; depth < 4 && typeof parsed === "string" && parsed.trim(); depth += 1) {
      try { parsed = JSON.parse(parsed); } catch { return {}; }
    }
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  }

  private generationTimingFromMetadata(metadata: unknown): Pick<OutputRecord, "prepTimeMs" | "generationTimeMs" | "totalTimeMs"> {
    const rawText = typeof metadata === "string" ? metadata : (() => { try { return JSON.stringify(metadata ?? ""); } catch { return ""; } })();
    const root = this.metadataObject(metadata);
    const extraRaw = root.sui_extra_data ?? root.suiExtraData;
    const extra = this.metadataObject(extraRaw);
    const normalizedEntries = (record: Record<string, unknown>) => new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]+/g, ""), value]));
    const rootEntries = normalizedEntries(root);
    const extraEntries = normalizedEntries(extra);
    const read = (...names: string[]): unknown => {
      for (const name of names) {
        const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
        const value = extraEntries.get(key) ?? rootEntries.get(key);
        if (value != null) return value;
      }
      return undefined;
    };
    const seconds = (value: unknown): number | undefined => {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
      if (typeof value === "string") {
        const match = value.match(/-?\d+(?:\.\d+)?/);
        const number = match ? Number(match[0]) : NaN;
        if (Number.isFinite(number) && number >= 0) return number;
      }
      return undefined;
    };
    let prepSeconds = seconds(read("prep_time", "preptime", "prepare_time", "preparation_time"));
    let generationSeconds = seconds(read("generation_time", "generationtime", "gen_time", "gentime"));
    let totalSeconds = seconds(read("total_time", "totaltime"));

    const combined = rawText.match(/(\d+(?:\.\d+)?)\s*\(prep\)\s*(?:and|\+)\s*(\d+(?:\.\d+)?)\s*\((?:gen|generation)\)\s*seconds?/i);
    if (combined) {
      prepSeconds ??= Number(combined[1]);
      generationSeconds ??= Number(combined[2]);
    }
    const prepOnly = rawText.match(/(?:prep(?:aration)?[_\s-]*time|prepping)[^0-9]{0,12}(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?/i);
    const genOnly = rawText.match(/(?:generation[_\s-]*time|generating|gen[_\s-]*time)[^0-9]{0,12}(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?/i);
    if (prepOnly) prepSeconds ??= Number(prepOnly[1]);
    if (genOnly) generationSeconds ??= Number(genOnly[1]);
    if (totalSeconds == null && prepSeconds != null && generationSeconds != null) totalSeconds = prepSeconds + generationSeconds;
    return {
      prepTimeMs: prepSeconds != null && Number.isFinite(prepSeconds) ? Math.max(0, prepSeconds * 1000) : undefined,
      generationTimeMs: generationSeconds != null && Number.isFinite(generationSeconds) ? Math.max(0, generationSeconds * 1000) : undefined,
      totalTimeMs: totalSeconds != null && Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds * 1000) : undefined,
    };
  }

  private outputTiming(output: OutputRecord): Pick<OutputRecord, "prepTimeMs" | "generationTimeMs" | "totalTimeMs"> {
    const metadataTiming = this.generationTimingFromMetadata(output.metadata);
    const prepTimeMs = Number.isFinite(Number(output.prepTimeMs)) ? Number(output.prepTimeMs) : metadataTiming.prepTimeMs;
    const generationTimeMs = Number.isFinite(Number(output.generationTimeMs)) ? Number(output.generationTimeMs) : metadataTiming.generationTimeMs;
    const totalTimeMs = Number.isFinite(Number(output.totalTimeMs)) ? Number(output.totalTimeMs) : metadataTiming.totalTimeMs ?? (prepTimeMs != null && generationTimeMs != null ? prepTimeMs + generationTimeMs : undefined);
    return { prepTimeMs, generationTimeMs, totalTimeMs };
  }

  private formatDuration(milliseconds: number | undefined): string {
    if (!Number.isFinite(Number(milliseconds)) || Number(milliseconds) < 0) return "—";
    const ms = Number(milliseconds);
    if (ms < 1000) return `${Math.round(ms)} ms`;
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(2) : seconds.toFixed(1)} s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${(seconds - minutes * 60).toFixed(1)}s`;
  }

  private currentGenerationTiming(): Pick<OutputRecord, "prepTimeMs" | "generationTimeMs" | "totalTimeMs"> {
    const start = this.generationStartedAt;
    const sampling = this.generationSamplingStartedAt;
    const end = this.generationFinishedAt || (start ? performance.now() : 0);
    if (!start || !end) return {};
    if (!sampling) return { prepTimeMs: 0, generationTimeMs: Math.max(0, end - start), totalTimeMs: Math.max(0, end - start) };
    return {
      prepTimeMs: Math.max(0, sampling - start),
      generationTimeMs: Math.max(0, end - sampling),
      totalTimeMs: Math.max(0, end - start),
    };
  }

  private metadataParams(metadata: unknown): Record<string, unknown> {
    let parsed: unknown = metadata;
    for (let depth = 0; depth < 3 && typeof parsed === "string" && parsed.trim(); depth += 1) {
      try { parsed = JSON.parse(parsed); } catch { return {}; }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    for (const key of ["sui_image_params", "parameters", "params", "metadata"]) {
      let value: unknown = record[key];
      for (let depth = 0; depth < 3 && typeof value === "string" && value.trim(); depth += 1) {
        try { value = JSON.parse(value); } catch { break; }
      }
      if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    }
    return record;
  }

  private metadataValue(params: Record<string, unknown>, ...names: string[]): unknown {
    const normalized = new Map(Object.entries(params).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]+/g, ""), value]));
    for (const name of names) {
      const value = normalized.get(name.toLowerCase().replace(/[^a-z0-9]+/g, ""));
      if (value != null) return value;
    }
    return undefined;
  }

  private updateLibrarySyncProgress(phase: string, done: number, total: number): void {
    this.librarySyncPhase = phase;
    this.librarySyncDone = Math.max(0, done);
    this.librarySyncTotal = Math.max(0, total);
    const label = total > 0 ? `${phase} ${Math.min(done, total)}/${total}` : phase;
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='sync-swarm-history']").forEach((button) => {
      button.textContent = label;
      button.disabled = true;
    });
    const phaseNode = this.root.querySelector<HTMLElement>("[data-library-sync-phase]");
    if (phaseNode) phaseNode.textContent = label;
    const progressNode = this.root.querySelector<HTMLElement>("[data-library-sync-progress]");
    if (progressNode) progressNode.style.width = total > 0 ? `${clamp(done / Math.max(1, total), 0, 1) * 100}%` : "12%";
  }

  private async yieldLibrarySync(): Promise<void> {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  private async syncSwarmHistory(): Promise<void> {
    if (!this.connected || this.librarySyncing) return;
    this.librarySyncing = true;
    this.librarySyncDone = 0;
    this.librarySyncTotal = 0;
    this.librarySyncPhase = "Preparing index…";
    // Deliberately render once here: renderLibrary() swaps the entire card grid for a tiny sync
    // screen. With a 10k-image archive, keeping thousands of cards mounted while reconciling is
    // dramatically more expensive than the indexing work itself.
    this.render();
    await this.yieldLibrarySync();
    try {
      const files: Array<{ src: string; metadata?: string }> = [];
      const seenFiles = new Set<string>();
      const starredLeaves = new Set<string>();
      const queued = [""];
      const visited = new Set<string>();
      let foldersRead = 0;
      let sawStarredFolder = false;

      while (queued.length) {
        // Swarm's date folders are independent ListImages calls. Read a small BFS batch in parallel
        // so a multi-year archive does not pay one full round-trip per date while still keeping
        // pressure on the server modest.
        const folderBatch: string[] = [];
        while (queued.length && folderBatch.length < 6) {
          const candidate = this.swarmMutationPath(queued.shift() ?? "").replace(/\/+$/, "");
          const key = candidate.toLowerCase();
          if (visited.has(key)) continue;
          visited.add(key);
          folderBatch.push(candidate);
        }
        if (!folderBatch.length) continue;
        const listings = await Promise.all(folderBatch.map(async (folderKey) => ({
          folderKey,
          listing: await this.client.listImageDirectory(folderKey, 1),
        })));
        for (const { folderKey, listing } of listings) {
          const isStarredFolder = /^Starred(?:\/|$)/i.test(folderKey);
          if (isStarredFolder) sawStarredFolder = true;
          foldersRead += 1;
          for (const child of listing.folders ?? []) {
            const childPath = this.joinSwarmHistoryPath(folderKey, child);
            if (!childPath || visited.has(childPath.toLowerCase())) continue;
            queued.push(childPath);
          }
          for (const file of listing.files ?? []) {
            const sourcePath = this.joinSwarmHistoryPath(folderKey, file.src);
            if (!sourcePath) continue;
            const relativeToFolder = folderKey && sourcePath.toLowerCase().startsWith(`${folderKey.toLowerCase()}/`)
              ? sourcePath.slice(folderKey.length + 1)
              : sourcePath;
            // depth=1 can include direct children from the next folder down. Those children get
            // their own request, so only consume files physically direct to this folder here.
            if (relativeToFolder.includes("/")) continue;
            const leaf = sourcePath.split("/").pop()?.toLowerCase() || "";
            if (isStarredFolder) {
              if (leaf) starredLeaves.add(leaf);
              continue;
            }
            const key = sourcePath.toLowerCase();
            if (seenFiles.has(key)) continue;
            seenFiles.add(key);
            files.push({ src: sourcePath, metadata: file.metadata });
          }
        }
        this.updateLibrarySyncProgress(`Reading ${foldersRead} folders · ${files.length} files`, 0, 0);
        await this.yieldLibrarySync();
      }

      const outputs = this.store.state.outputs;
      const existingByPath = new Map<string, OutputRecord>();
      const existingByLeaf = new Map<string, OutputRecord[]>();
      for (const output of outputs) {
        const source = output.swarmSourcePath || output.swarmPath || (!/^(data:|blob:)/i.test(output.url) ? output.url : "");
        const canonical = this.normalizeSwarmPath(source);
        if (!canonical) continue;
        if (!existingByPath.has(canonical)) existingByPath.set(canonical, output);
        const leaf = canonical.split("/").pop()?.toLowerCase() || "";
        if (leaf) {
          const bucket = existingByLeaf.get(leaf);
          if (bucket) bucket.push(output);
          else existingByLeaf.set(leaf, [output]);
        }
      }

      const liveLeafCounts = new Map<string, number>();
      for (const file of files) {
        const canonical = this.normalizeSwarmPath(file.src);
        const leaf = canonical.split("/").pop()?.toLowerCase() || "";
        if (leaf) liveLeafCounts.set(leaf, (liveLeafCounts.get(leaf) ?? 0) + 1);
      }

      let added = 0;
      let refreshed = 0;
      let repaired = 0;
      let starredSynced = 0;
      const matchedIds = new Set<string>();
      const chunkSize = 200;
      this.updateLibrarySyncProgress("Matching", 0, files.length);

      for (let offset = 0; offset < files.length; offset += chunkSize) {
        const chunk = files.slice(offset, offset + chunkSize);
        for (const file of chunk) {
          const sourcePath = this.swarmMutationPath(file.src);
          const path = this.normalizeSwarmPath(sourcePath);
          if (!path || !sourcePath) continue;
          const leaf = path.split("/").pop()?.toLowerCase() || "";
          let current = existingByPath.get(path);
          if (!current && leaf && liveLeafCounts.get(leaf) === 1) {
            const candidates = (existingByLeaf.get(leaf) ?? []).filter((item) => !matchedIds.has(item.id));
            if (candidates.length === 1) current = candidates[0];
          }

          if (current) {
            matchedIds.add(current.id);
            const oldSwarmPath = current.swarmPath;
            const oldSourcePath = current.swarmSourcePath;
            const oldCanonical = this.normalizeSwarmPath(current.swarmSourcePath || current.swarmPath || current.url);
            const refreshedMetadata = String(file.metadata ?? current.metadata ?? "");
            Object.assign(current, {
              swarmPath: path,
              swarmSourcePath: sourcePath,
              url: this.client.imageUrl(path),
              metadata: refreshedMetadata,
              ...this.generationTimingFromMetadata(refreshedMetadata),
            });
            existingByPath.set(path, current);
            refreshed += 1;
            if (oldCanonical !== path || oldSwarmPath !== path || oldSourcePath !== sourcePath) repaired += 1;
            continue;
          }

          const params = this.metadataParams(file.metadata);
          const request = { ...params };
          const loraNames = Array.isArray(params.loras) ? params.loras.map(String) : [];
          const loraWeights = Array.isArray(params.loraweights) ? params.loraweights.map(Number) : [];
          const loras = loraNames.map((name, index) => {
            const model = this.loras.find((item) => serverModelKey(item.name) === serverModelKey(name));
            return {
              id: createId(),
              name: model?.name ?? name,
              title: model?.title || prettyName(name),
              weight: Number.isFinite(loraWeights[index]) ? loraWeights[index]! : 1,
              enabled: true,
              useTrigger: false,
              sourceUrl: "",
            } satisfies LoraStackItem;
          });
          const historicDate = this.outputDateFromPath(sourcePath);
          const hydrated: OutputRecord = {
            id: createId(),
            url: this.client.imageUrl(path),
            swarmPath: path,
            swarmSourcePath: sourcePath,
            folderId: folderIds.unfiled,
            prompt: String(this.metadataValue(params, "prompt") ?? ""),
            sentPrompt: String(this.metadataValue(params, "prompt") ?? ""),
            negativePrompt: String(this.metadataValue(params, "negativeprompt", "negative prompt") ?? ""),
            model: String(this.metadataValue(params, "model") ?? ""),
            width: asNumber(String(this.metadataValue(params, "width") ?? 0), 0),
            height: asNumber(String(this.metadataValue(params, "height") ?? 0), 0),
            seed: asNumber(String(this.metadataValue(params, "seed") ?? -1), -1),
            starred: leaf ? starredLeaves.has(leaf) : false,
            createdAt: historicDate ?? Date.now(),
            metadata: String(file.metadata ?? ""),
            request,
            loras,
            presets: [],
            ...this.generationTimingFromMetadata(file.metadata),
          };
          outputs.push(hydrated);
          existingByPath.set(path, hydrated);
          matchedIds.add(hydrated.id);
          added += 1;
        }
        this.updateLibrarySyncProgress("Matching", Math.min(offset + chunk.length, files.length), files.length);
        await this.yieldLibrarySync();
      }

      const unmatched = outputs.filter((output) => !matchedIds.has(output.id));
      const staleIds = new Set<string>();
      let removed = 0;
      this.updateLibrarySyncProgress("Pruning missing", 0, unmatched.length);
      for (let offset = 0; offset < unmatched.length; offset += chunkSize) {
        const chunk = unmatched.slice(offset, offset + chunkSize);
        for (const output of chunk) {
          const source = output.swarmSourcePath || output.swarmPath || (!/^(data:|blob:)/i.test(output.url) ? output.url : "");
          const isLocalOnly = !output.swarmSourcePath
            && !output.swarmPath
            && (!output.url || /^(data:|blob:)/i.test(output.url));

          // A completed Sync is authoritative for Swarm-backed outputs. If the full live crawl did
          // not match this record, the file has been deleted/moved outside Studio and keeping the
          // old record only creates a broken-image ghost. Preserve genuinely local-only records.
          if (!isLocalOnly && source) {
            staleIds.add(output.id);
            continue;
          }

          // Local-only records are not part of Swarm history and therefore cannot be reconciled by
          // this crawl. Leave them intact rather than treating their absence as deletion.
        }
        this.updateLibrarySyncProgress("Pruning missing", Math.min(offset + chunk.length, unmatched.length), unmatched.length);
        await this.yieldLibrarySync();
      }

      if (staleIds.size) {
        for (let index = outputs.length - 1; index >= 0; index -= 1) {
          if (!staleIds.has(outputs[index]!.id)) continue;
          outputs.splice(index, 1);
          removed += 1;
        }
        for (const id of staleIds) this.librarySelected.delete(id);
      }

      // Starred is a mirror tree rather than a flag on ListImages. Use it as an index of favorite
      // filenames instead of hydrating duplicate cards from Starred/.
      if (sawStarredFolder) {
        this.updateLibrarySyncProgress("Syncing favorites", 0, outputs.length);
        for (let offset = 0; offset < outputs.length; offset += chunkSize) {
          const chunk = outputs.slice(offset, offset + chunkSize);
          for (const output of chunk) {
            const leaf = this.outputMutationPath(output).split("/").pop()?.toLowerCase() || "";
            const next = Boolean(leaf && starredLeaves.has(leaf));
            if (output.starred !== next) {
              output.starred = next;
              starredSynced += 1;
            }
          }
          this.updateLibrarySyncProgress("Syncing favorites", Math.min(offset + chunk.length, outputs.length), outputs.length);
          await this.yieldLibrarySync();
        }
      }

      outputs.sort((a, b) => b.createdAt - a.createdAt);
      this.store.save();
      this.clearNativeImageCache();
      this.libraryRenderLimit = 240;
      this.librarySelected.clear();
      this.libraryLastSelectedId = "";
      this.addLog(`Swarm history sync walked ${foldersRead} folders and found ${files.length} outputs, indexed ${added}, refreshed ${refreshed}, repaired ${repaired} paths, removed ${removed} missing records, and reconciled ${starredSynced} favorite states.`, "info", "api");
      const summary = [
        `${files.length} found`,
        added ? `${added} indexed` : "",
        repaired ? `${repaired} paths repaired` : "",
        removed ? `${removed} ghosts removed` : "",
        starredSynced ? `${starredSynced} favorites reconciled` : "",
      ].filter(Boolean).join(" · ");
      this.notify(`Library synced: ${summary}.`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog(`Swarm history sync failed: ${message}`, "error", "api");
      this.notify(message, "error");
    } finally {
      this.librarySyncing = false;
      this.librarySyncDone = 0;
      this.librarySyncTotal = 0;
      this.librarySyncPhase = "";
      this.render();
    }
  }

  private bindLibraryEvents(): void {
    const resetMounted = () => { this.libraryRenderLimit = 240; };
    const captureBrowseInputs = () => {
      const search = this.root.querySelector<HTMLInputElement>("#library-search-modal");
      const from = this.root.querySelector<HTMLInputElement>("#library-date-from");
      const to = this.root.querySelector<HTMLInputElement>("#library-date-to");
      const model = this.root.querySelector<HTMLSelectElement>("#library-model-filter");
      const star = this.root.querySelector<HTMLSelectElement>("#library-star-filter");
      if (search) this.librarySearch = search.value;
      if (from) this.libraryDateFrom = from.value;
      if (to) this.libraryDateTo = to.value;
      if (model) this.libraryModelFilter = model.value;
      if (star) this.libraryStarFilter = ["starred", "unstarred"].includes(star.value) ? star.value as typeof this.libraryStarFilter : "all";
    };
    const rerenderBrowsePreservingScroll = () => {
      const scroll = this.root.querySelector<HTMLElement>(".library-browse-scroll");
      if (scroll) this.libraryBrowseScrollTop = scroll.scrollTop;
      this.render();
    };
    const selectOutput = (id: string, shiftRange: boolean) => {
      if (!id) return;
      if (shiftRange && this.libraryLastSelectedId) {
        const ordered = this.libraryVisibleOutputs();
        const from = ordered.findIndex((output) => output.id === this.libraryLastSelectedId);
        const to = ordered.findIndex((output) => output.id === id);
        if (from >= 0 && to >= 0) {
          const [start, end] = from <= to ? [from, to] : [to, from];
          for (let index = start; index <= end; index += 1) this.librarySelected.add(ordered[index]!.id);
        } else {
          this.librarySelected.add(id);
        }
      } else if (this.librarySelected.has(id)) {
        this.librarySelected.delete(id);
      } else {
        this.librarySelected.add(id);
      }
      this.libraryLastSelectedId = id;
      this.render();
    };
    const runSelectedInBatches = async (worker: (output: OutputRecord) => Promise<void>, batchSize = 8): Promise<number> => {
      const outputs = [...this.librarySelected]
        .map((id) => this.store.state.outputs.find((output) => output.id === id))
        .filter((output): output is OutputRecord => Boolean(output));
      let failures = 0;
      for (let offset = 0; offset < outputs.length; offset += batchSize) {
        const batch = outputs.slice(offset, offset + batchSize);
        const results = await Promise.allSettled(batch.map(worker));
        failures += results.filter((result) => result.status === "rejected").length;
        await this.yieldLibrarySync();
      }
      return failures;
    };

    this.root.querySelectorAll<HTMLElement>("[data-action='sync-swarm-history']").forEach((button) => button.addEventListener("click", () => void this.syncSwarmHistory()));
    this.root.querySelector<HTMLElement>("[data-action='load-more-library']")?.addEventListener("click", () => { this.libraryRenderLimit += 240; this.render(); });
    this.root.querySelectorAll<HTMLElement>("[data-action='open-library-filters']").forEach((button) => button.addEventListener("click", () => { this.libraryFiltersOpen = true; this.libraryBrowseScrollTop = 0; this.render(); }));

    this.root.querySelectorAll<HTMLElement>("[data-action='close-library-filters']").forEach((element) => element.addEventListener("click", (event) => {
      if (element.classList.contains("download-backdrop") && event.target !== element) return;
      this.libraryFiltersOpen = false;
      this.libraryBrowseScrollTop = 0;
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-action='toggle-library-dock']")?.addEventListener("click", () => {
      if (!window.matchMedia("(min-width: 761px)").matches) return;
      const scroll = this.root.querySelector<HTMLElement>(".library-browse-scroll");
      if (scroll) this.libraryBrowseScrollTop = scroll.scrollTop;
      this.libraryFiltersDocked = !this.libraryFiltersDocked;
      try { localStorage.setItem("swarm-studio-library-browse-docked", String(this.libraryFiltersDocked)); } catch {}
      this.render();
    });
    this.root.querySelectorAll<HTMLElement>("[data-library-date-preset]").forEach((button) => button.addEventListener("click", () => {
      captureBrowseInputs();
      [this.libraryDateFrom, this.libraryDateTo] = this.libraryDatePresetRange(button.dataset.libraryDatePreset ?? "all");
      resetMounted();
      rerenderBrowsePreservingScroll();
    }));
    this.root.querySelectorAll<HTMLElement>("[data-library-date-folder]").forEach((button) => button.addEventListener("click", () => {
      captureBrowseInputs();
      const date = button.dataset.libraryDateFolder ?? "";
      this.libraryDateFrom = date;
      this.libraryDateTo = date;
      resetMounted();
      rerenderBrowsePreservingScroll();
    }));
    this.root.querySelectorAll<HTMLElement>("[data-library-modal-folder]").forEach((button) => button.addEventListener("click", () => {
      captureBrowseInputs();
      this.libraryFolder = button.dataset.libraryModalFolder ?? "all";
      this.store.updateUi({ libraryFolder: this.libraryFolder });
      resetMounted();
      rerenderBrowsePreservingScroll();
    }));
    this.root.querySelectorAll<HTMLElement>("[data-action='new-folder']").forEach((button) => button.addEventListener("click", () => {
      captureBrowseInputs();
      const name = window.prompt("Folder name?");
      if (!name?.trim()) return;
      const folder = this.store.createFolder(name);
      this.libraryFolder = folder.id;
      this.store.updateUi({ libraryFolder: folder.id });
      resetMounted();
      rerenderBrowsePreservingScroll();
    }));
    this.root.querySelector<HTMLElement>("[data-action='apply-library-filters']")?.addEventListener("click", () => {
      this.librarySearch = this.root.querySelector<HTMLInputElement>("#library-search-modal")?.value ?? this.librarySearch;
      this.libraryDateFrom = this.root.querySelector<HTMLInputElement>("#library-date-from")?.value ?? this.libraryDateFrom;
      this.libraryDateTo = this.root.querySelector<HTMLInputElement>("#library-date-to")?.value ?? this.libraryDateTo;
      if (this.libraryDateFrom && this.libraryDateTo && this.libraryDateFrom > this.libraryDateTo) [this.libraryDateFrom, this.libraryDateTo] = [this.libraryDateTo, this.libraryDateFrom];
      this.libraryModelFilter = this.root.querySelector<HTMLSelectElement>("#library-model-filter")?.value ?? "";
      const star = this.root.querySelector<HTMLSelectElement>("#library-star-filter")?.value ?? "all";
      this.libraryStarFilter = ["starred", "unstarred"].includes(star) ? star as typeof this.libraryStarFilter : "all";
      this.libraryFiltersOpen = false;
      resetMounted();
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='clear-library-filters']")?.addEventListener("click", () => {
      this.librarySearch = "";
      this.libraryDateFrom = "";
      this.libraryDateTo = "";
      this.libraryModelFilter = "";
      this.libraryStarFilter = "all";
      this.libraryFolder = "all";
      this.store.updateUi({ libraryFolder: "all" });
      resetMounted();
      this.render();
    });

    // Right-click is the fast path into batch mode: keep the user's place in a huge archive,
    // select the card under the pointer, and surface the sticky action rail immediately.
    this.root.querySelectorAll<HTMLElement>("[data-output-card]").forEach((card) => card.addEventListener("contextmenu", (event) => {
      if (this.libraryBatchBusy) return;
      const id = card.dataset.outputCard ?? "";
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      this.librarySelectMode = true;
      this.librarySelected.add(id);
      this.libraryLastSelectedId = id;
      this.render();
    }));

    // Shift-clicking an image enters batch mode immediately, even if selection mode was not
    // already enabled. Once active, Shift-click selects the full range from the previous anchor.
    this.root.querySelectorAll<HTMLElement>("[data-output-card]").forEach((card) => card.addEventListener("click", (event) => {
      if (!event.shiftKey || this.librarySelectMode || !(event.target as HTMLElement).closest(".image-card-media")) return;
      event.preventDefault();
      event.stopPropagation();
      this.librarySelectMode = true;
      const id = card.dataset.outputCard ?? "";
      if (id) {
        this.librarySelected.add(id);
        this.libraryLastSelectedId = id;
      }
      this.render();
    }, { capture: true }));
    this.root.querySelectorAll<HTMLElement>("[data-select-output]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectOutput(button.dataset.selectOutput ?? "", event.shiftKey);
    }));
    this.root.querySelector<HTMLElement>("[data-action='select-mounted-outputs']")?.addEventListener("click", () => {
      this.libraryVisibleOutputs().slice(0, this.libraryRenderLimit).forEach((output) => this.librarySelected.add(output.id));
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='clear-output-selection']")?.addEventListener("click", () => { this.librarySelected.clear(); this.libraryLastSelectedId = ""; this.render(); });
    this.root.querySelector<HTMLElement>("[data-action='toggle-library-selection']")?.addEventListener("click", () => {
      if (this.libraryBatchBusy) return;
      this.librarySelectMode = !this.librarySelectMode;
      if (!this.librarySelectMode) {
        this.librarySelected.clear();
        this.libraryLastSelectedId = "";
      }
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='finish-library-selection']")?.addEventListener("click", () => { this.librarySelectMode = false; this.librarySelected.clear(); this.libraryLastSelectedId = ""; this.render(); });

    const setFavoriteState = async (desired: boolean) => {
      if (!this.librarySelected.size || this.libraryBatchBusy) return;
      this.libraryBatchBusy = true;
      this.render();
      let failures = 0;
      try {
        failures = await runSelectedInBatches(async (output) => {
          if (output.starred === desired) return;
          const state = await this.client.toggleImageStarred(this.outputMutationPath(output));
          output.starred = state;
        });
        this.store.save();
        this.notify(`${desired ? "Favorited" : "Unfavorited"} selected outputs${failures ? ` · ${failures} failed` : ""}.`, failures ? "info" : "success");
      } finally {
        this.libraryBatchBusy = false;
        this.render();
      }
    };
    this.root.querySelector<HTMLElement>("[data-action='favorite-selected-outputs']")?.addEventListener("click", () => void setFavoriteState(true));
    this.root.querySelector<HTMLElement>("[data-action='unfavorite-selected-outputs']")?.addEventListener("click", () => void setFavoriteState(false));

    this.root.querySelector<HTMLElement>("[data-action='open-library-move']")?.addEventListener("click", () => { if (this.librarySelected.size) { this.libraryMoveOpen = true; this.render(); } });
    this.root.querySelectorAll<HTMLElement>("[data-action='close-library-move']").forEach((element) => element.addEventListener("click", (event) => {
      if (element.classList.contains("download-backdrop") && event.target !== element) return;
      this.libraryMoveOpen = false;
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-action='apply-library-move']")?.addEventListener("click", () => {
      const folderId = this.root.querySelector<HTMLSelectElement>("#library-batch-folder")?.value;
      if (!folderId) return;
      for (const output of this.store.state.outputs) if (this.librarySelected.has(output.id)) output.folderId = folderId;
      this.store.save();
      this.libraryMoveOpen = false;
      this.notify(`Moved ${this.librarySelected.size} selected outputs.`, "success");
      this.render();
    });

    this.root.querySelector<HTMLElement>("[data-action='delete-selected-outputs']")?.addEventListener("click", async () => {
      const selectedIds = [...this.librarySelected];
      if (!selectedIds.length || this.libraryBatchBusy || !window.confirm(`Delete ${selectedIds.length} selected output${selectedIds.length === 1 ? "" : "s"} from Swarm history? This cannot be undone.`)) return;
      this.libraryBatchBusy = true;
      this.render();
      const deleted = new Set<string>();
      let failures = 0;
      try {
        failures = await runSelectedInBatches(async (output) => {
          await this.client.deleteImage(this.outputMutationPath(output));
          deleted.add(output.id);
        }, 6);
        if (deleted.size) this.store.state.outputs = this.store.state.outputs.filter((output) => !deleted.has(output.id));
        this.store.save();
        for (const id of deleted) this.librarySelected.delete(id);
        this.notify(`Deleted ${deleted.size} output${deleted.size === 1 ? "" : "s"}${failures ? ` · ${failures} failed` : ""}.`, failures ? "info" : "success");
      } finally {
        this.libraryBatchBusy = false;
        this.render();
      }
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-star]").forEach((button) => button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = button.dataset.star ?? "";
      const output = this.store.state.outputs.find((item) => item.id === id);
      if (!output || button.disabled) return;
      button.disabled = true;
      try {
        const state = await this.client.toggleImageStarred(this.outputMutationPath(output));
        this.store.updateOutput(id, { starred: state });
        this.notify(state ? "Added to Swarm Starred + Studio Favorites." : "Removed from Swarm Starred + Studio Favorites.", "success");
      } catch (error) {
        this.addLog(`Could not toggle Starred for ${output.swarmPath}: ${error instanceof Error ? error.message : String(error)}`, "error", "api");
        this.notify(error instanceof Error ? error.message : String(error), "error");
      }
      this.render();
    }));
    this.root.querySelectorAll<HTMLSelectElement>("[data-move-output]").forEach((select) => select.addEventListener("change", () => { this.store.updateOutput(select.dataset.moveOutput ?? "", { folderId: select.value }); this.render(); }));
    this.root.querySelectorAll<HTMLElement>("[data-delete-output]").forEach((button) => button.addEventListener("click", async () => {
      const id = button.dataset.deleteOutput ?? "";
      const output = this.store.state.outputs.find((item) => item.id === id);
      if (!output || !window.confirm("Delete this image from Swarm history? This cannot be undone.")) return;
      try {
        await this.client.deleteImage(this.outputMutationPath(output));
        this.store.deleteOutput(id);
        this.notify("Deleted from Swarm history.", "success");
        this.render();
      } catch (error) {
        this.notify(error instanceof Error ? error.message : String(error), "error");
      }
    }));
  }

  private bindIdentityEvents(): void {
    this.root.querySelector<HTMLElement>("[data-action='new-identity']")?.addEventListener("click", () => { this.identityEditingId = ""; this.store.updateUi({ identityEditorOpen: true }); this.render(); });
    this.root.querySelector<HTMLElement>("[data-action='close-identity-editor']")?.addEventListener("click", () => { this.identityEditingId = ""; this.store.updateUi({ identityEditorOpen: false }); this.render(); });
    this.root.querySelectorAll<HTMLElement>("[data-edit-identity]").forEach((button) => button.addEventListener("click", () => { this.identityEditingId = button.dataset.editIdentity ?? ""; this.store.updateUi({ identityEditorOpen: true }); this.render(); }));
    const readPicture = (file: File, id: string | null) => { const reader = new FileReader(); reader.onload = () => { const avatarUrl = String(reader.result ?? ""); if (id) { const identity = this.store.state.identities.find((item) => item.id === id); if (identity) this.store.saveIdentity({ ...identity, id, avatarUrl }); } else { const input = this.root.querySelector<HTMLInputElement>("#identity-form input[name='avatarUrl']"); if (input) input.value = avatarUrl; } this.render(); }; reader.readAsDataURL(file); };
    this.root.querySelector<HTMLElement>("[data-action='choose-identity-picture']")?.addEventListener("click", () => this.root.querySelector<HTMLInputElement>("#identity-picture-input")?.click());
    this.root.querySelector<HTMLInputElement>("#identity-picture-input")?.addEventListener("change", (event) => { const file = (event.currentTarget as HTMLInputElement).files?.[0]; if (file) readPicture(file, null); });
    this.root.querySelector<HTMLElement>("[data-action='clear-identity-picture']")?.addEventListener("click", () => { const input = this.root.querySelector<HTMLInputElement>("#identity-form input[name='avatarUrl']"); if (input) input.value = ""; const current = this.store.state.identities.find((item) => item.id === this.identityEditingId); if (current) this.store.saveIdentity({ ...current, id: current.id, avatarUrl: "" }); this.render(); });
    this.root.querySelectorAll<HTMLElement>("[data-picture-identity]").forEach((button) => button.addEventListener("click", () => this.root.querySelector<HTMLInputElement>(`[data-identity-picture-input="${button.dataset.pictureIdentity}"]`)?.click()));
    this.root.querySelectorAll<HTMLInputElement>("[data-identity-picture-input]").forEach((input) => input.addEventListener("change", () => { const file = input.files?.[0]; const id = input.dataset.identityPictureInput ?? ""; if (file && id) readPicture(file, id); }));
    const form = this.root.querySelector<HTMLFormElement>("#identity-form");
    form?.addEventListener("submit", (event) => {
      event.preventDefault(); const data = new FormData(form); const bindLoras = data.get("bindLoras") === "on"; const id = String(data.get("id") ?? ""); const existing = this.store.state.identities.find((item) => item.id === id);
      this.store.saveIdentity({ id: id || undefined, name: String(data.get("name") ?? ""), folderId: String(data.get("folderId") ?? folderIds.unfiled), positivePrompt: String(data.get("positivePrompt") ?? ""), negativePrompt: String(data.get("negativePrompt") ?? ""), model: String(data.get("model") ?? ""), notes: String(data.get("notes") ?? ""), avatarUrl: String(data.get("avatarUrl") ?? existing?.avatarUrl ?? ""), loraStack: bindLoras ? cloneStack(existing?.loraStack.length ? existing.loraStack : this.store.state.draft.loras) : [] });
      this.identityEditingId = ""; this.store.updateUi({ identityEditorOpen: false }); this.notify("Identity saved to the library.", "success"); this.render();
    });
    this.root.querySelectorAll<HTMLElement>("[data-apply-identity]").forEach((button) => button.addEventListener("click", () => { const identity = this.store.state.identities.find((item) => item.id === button.dataset.applyIdentity); if (!identity) return; const current = this.store.state.draft; this.store.updateDraft({ prompt: [identity.positivePrompt, current.prompt].filter(Boolean).join(", "), negativePrompt: [identity.negativePrompt, current.negativePrompt].filter(Boolean).join(", "), model: identity.model || current.model, loras: identity.loraStack.length ? cloneStack(identity.loraStack) : current.loras }); this.view = "create"; this.store.updateUi({ lastView: "create" }); this.render(); this.notify(`${identity.name} applied to Create.`, "success"); }));
    this.root.querySelectorAll<HTMLElement>("[data-delete-identity]").forEach((button) => button.addEventListener("click", () => { if (window.confirm("Delete this identity?")) { this.store.deleteIdentity(button.dataset.deleteIdentity ?? ""); this.render(); } }));
  }

  private loraArchitectureForFamily(family: string): string {
    if (!family) return "";
    const sibling = this.loras.find((lora) => modelFamily(lora) === family && Boolean(lora.architecture));
    if (sibling?.architecture) return sibling.architecture;
    const checkpoint = this.models.find((model) => modelFamily(model) === family && Boolean(model.compat_class));
    if (checkpoint?.compat_class) {
      const compatibleSibling = this.loras.find((lora) => lora.compat_class === checkpoint.compat_class && Boolean(lora.architecture));
      if (compatibleSibling?.architecture) return compatibleSibling.architecture;
    }
    return "";
  }

  private sanitizeLoraName(value: string): string {
    return value.trim().replace(/\\/g, "/").split("/").pop()?.replace(/\.(safetensors|ckpt|pt)$/i, "").replace(/[^a-zA-Z0-9._()\- +\[\]]+/g, "_").trim() || "downloaded-lora";
  }

  private unpackMetadataForward(payload: Record<string, unknown>): Record<string, unknown> {
    const keys = ["response", "result", "data", "body", "content", "json"];
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === "string" && value.trim()) {
        try {
          const parsed = JSON.parse(value) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch { /* keep looking */ }
      }
      if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    }
    return payload;
  }

  private async jsonFromUrl(url: string): Promise<Record<string, unknown>> {
    let hostname = "";
    try { hostname = new URL(url).hostname.toLowerCase(); } catch { /* normal error below */ }
    const isCivitai = isCivitaiHost(hostname);
    const permissions = this.userData?.permissions ?? this.session?.permissions ?? [];
    if (isCivitai && this.connected && permissions.includes("edit_model_metadata")) {
      try {
        const forwarded = this.unpackMetadataForward(await this.client.forwardMetadataRequest(url));
        const meaningful = Object.keys(forwarded).filter((key) => !["success", "session_id"].includes(key));
        if (meaningful.length) return forwarded;
      } catch (error) {
        this.addLog(`Swarm metadata proxy failed; falling back to Studio relay: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
      }
    }

    const text = await runtime.getText(url);
    let data: unknown;
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      const preview = text.replace(/\s+/g, " ").trim().slice(0, 160);
      throw new Error(`Expected JSON from ${hostname || url}, but received ${preview || "an empty response"}.`);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`Expected JSON from ${url}.`);
    return data as Record<string, unknown>;
  }

  private async prepareLoraDownload(rawUrl: string, overrideName: string, includePreviewData = false): Promise<PreparedLoraDownload> {
    let url = rawUrl.trim();
    if (!/^https:\/\//i.test(url)) throw new Error("Use an HTTPS Civitai or Hugging Face URL.");
    const parsed = new URL(url);
    let sourceUrl = parsed.href;
    let name = this.sanitizeLoraName(overrideName);
    let title = "";
    let versionTitle = "";
    let author = "";
    let description = "";
    let baseModel = "";
    let modelType = "LoRA";
    let family = "";
    let architecture = "";
    let triggerWords: string[] = [];
    let tags: string[] = [];
    let previewUrl = "";
    let previewDataUrl = "";
    let date = "";
    let usageHint = "";
    let metadata: Record<string, unknown> = { "modelspec.sai_model_spec": "1.0.0", "modelspec.source": url };

    if (/civitai\.(com|red)$/i.test(parsed.hostname)) {
      sourceUrl = routeCivitaiUrl(parsed.href);
      metadata["modelspec.source"] = sourceUrl;
      let versionId = parsed.searchParams.get("modelVersionId") || "";
      const downloadMatch = parsed.pathname.match(/\/api\/download\/models\/(\d+)/i);
      if (downloadMatch) versionId = downloadMatch[1]!;
      const modelMatch = parsed.pathname.match(/\/models\/(\d+)/i);
      let modelId = modelMatch?.[1] || "";
      let model: Record<string, unknown> = {};
      if (!versionId && modelId) {
        model = await this.jsonFromUrl(`${CIVITAI_ORIGIN}/api/v1/models/${modelId}`);
        const versions = Array.isArray(model.modelVersions) ? model.modelVersions as Array<Record<string, unknown>> : [];
        versionId = String(versions[0]?.id ?? "");
      }
      if (!versionId) throw new Error("Could not resolve a Civitai model version. Open a specific version or include modelVersionId in the URL.");
      const version = await this.jsonFromUrl(`${CIVITAI_ORIGIN}/api/v1/model-versions/${versionId}`);
      modelId = String(version.modelId ?? modelId);
      if (!Object.keys(model).length && modelId) model = await this.jsonFromUrl(`${CIVITAI_ORIGIN}/api/v1/models/${modelId}`);

      const nestedModel = version.model && typeof version.model === "object" ? version.model as Record<string, unknown> : {};
      modelType = String(model.type ?? nestedModel.type ?? "LoRA");
      if (modelType && !/(?:lora|locon|lycoris|dora)/i.test(modelType)) {
        throw new Error(`Civitai classifies this as ${modelType}, not a LoRA. Use Swarm's matching downloader/model type for that asset.`);
      }

      const files = Array.isArray(version.files) ? version.files as Array<Record<string, unknown>> : [];
      const file = files.find((entry) => String(entry.name ?? "").toLowerCase().endsWith(".safetensors")) ?? files.find((entry) => Boolean(entry.primary)) ?? files[0];
      if (!overrideName.trim()) name = this.sanitizeLoraName(String(file?.name ?? version.name ?? model.name ?? `civitai-${versionId}`));
      url = routeCivitaiUrl(String(version.downloadUrl ?? file?.downloadUrl ?? `${CIVITAI_ORIGIN}/api/download/models/${versionId}`));
      if (!/^https:\/\//i.test(url)) url = `${CIVITAI_ORIGIN}/api/download/models/${versionId}`;

      triggerWords = Array.isArray(version.trainedWords) ? version.trainedWords.map(String).map((item) => item.trim()).filter(Boolean) : [];
      tags = normalizeCivitaiTags(model.tags);
      const creator = model.creator && typeof model.creator === "object" ? model.creator as Record<string, unknown> : {};
      author = String(creator.username ?? model.creatorName ?? "");
      title = String(model.name ?? nestedModel.name ?? version.name ?? name);
      versionTitle = String(version.name ?? "");
      description = String(model.description ?? "");
      usageHint = String(version.description ?? "");
      date = String(version.createdAt ?? model.createdAt ?? "");
      baseModel = String(version.baseModel ?? "");
      family = familyFromCivitaiBaseModel(baseModel);
      architecture = this.loraArchitectureForFamily(family);
      const images = Array.isArray(version.images) ? version.images as Array<Record<string, unknown>> : [];
      const preferredImage = images.find((entry) => String(entry.type ?? "image").toLowerCase() === "image" && entry.url) ?? images.find((entry) => entry.url);
      previewUrl = String(preferredImage?.url ?? "");

      metadata = {
        "modelspec.sai_model_spec": "1.0.0",
        "modelspec.title": title,
        "modelspec.description": description,
        "modelspec.date": date,
        "modelspec.author": author,
        "modelspec.trigger_phrase": triggerWords.join(", "),
        "modelspec.tags": tags.join(", "),
        "modelspec.usage_hint": usageHint,
        "modelspec.source": parsed.href,
        "swarmstudio.civitai_model_id": modelId,
        "swarmstudio.civitai_version_id": versionId,
        "swarmstudio.civitai_base_model": baseModel,
      };
      // Swarm's `architecture` field is a model-class ID. Reuse the live architecture ID from
      // another LoRA in the same family instead of inventing names that can drift between Swarm releases.
      if (architecture) metadata["modelspec.architecture"] = architecture;
      if (previewUrl && includePreviewData) {
        try {
          previewDataUrl = await runtime.fetchDataUrl(previewUrl);
          if (previewDataUrl) metadata["modelspec.thumbnail"] = previewDataUrl;
        } catch (error) {
          this.addLog(`Could not cache Civitai preview image: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
        }
      }
    } else if (/huggingface\.co$/i.test(parsed.hostname)) {
      if (parsed.pathname.includes("/blob/")) url = parsed.href.replace("/blob/", "/resolve/");
      if (!url.includes("/resolve/")) throw new Error("For Hugging Face, paste a direct file URL containing /resolve/ (or /blob/). ");
      const leaf = decodeURIComponent(new URL(url).pathname.split("/").pop() || "downloaded-lora");
      if (!overrideName.trim()) name = this.sanitizeLoraName(leaf);
      title = name;
      sourceUrl = parsed.href;
      metadata["modelspec.title"] = name;
      metadata["modelspec.source"] = sourceUrl;
    } else {
      throw new Error("The downloader currently supports Civitai and Hugging Face URLs.");
    }

    return {
      url,
      name,
      metadata: JSON.stringify(metadata),
      sourceUrl,
      title,
      versionTitle,
      author,
      description,
      baseModel,
      modelType,
      family,
      architecture,
      triggerWords,
      tags,
      previewUrl,
      previewDataUrl,
      date,
      usageHint,
    };
  }

  private async resolveLoraDownload(rawUrl: string, overrideName: string): Promise<void> {
    const requestedUrl = rawUrl.trim();
    if (!requestedUrl) {
      this.loraDownloadResolved = null;
      this.loraDownloadResolving = false;
      this.loraDownloadMessage = "Ready.";
      this.render();
      return;
    }
    this.loraDownloadResolving = true;
    this.loraDownloadResolved = null;
    this.loraDownloadMessage = "Resolving metadata…";
    this.render();
    try {
      const resolved = await this.prepareLoraDownload(requestedUrl, overrideName, false);
      if (this.loraDownloadUrl.trim() !== requestedUrl) return;
      this.loraDownloadResolved = resolved;
      this.loraDownloadMessage = resolved.baseModel
        ? `Resolved ${resolved.modelType || "LoRA"} · ${resolved.baseModel}${resolved.architecture ? ` · ${resolved.architecture}` : ""}.`
        : "Resolved download metadata.";
    } catch (error) {
      if (this.loraDownloadUrl.trim() !== requestedUrl) return;
      this.loraDownloadResolved = null;
      this.loraDownloadMessage = error instanceof Error ? error.message : String(error);
    } finally {
      if (this.loraDownloadUrl.trim() === requestedUrl) {
        this.loraDownloadResolving = false;
        this.render();
      }
    }
  }

  private async repairDownloadedLoraMetadata(model: SwarmModel, prepared: PreparedLoraDownload): Promise<SwarmModel> {
    let described = model;
    try { described = await this.client.describeModel(model.name, "LoRA"); } catch { /* ListModels data is enough to continue. */ }

    const expectedArchitecture = prepared.architecture || this.loraArchitectureForFamily(prepared.family);
    const permissions = this.userData?.permissions ?? this.session?.permissions ?? [];
    const canEdit = permissions.includes("edit_model_metadata");
    const expectedFamily = prepared.family;
    const detectedFamily = modelFamily(described);
    const needsArchitectureRepair = Boolean(expectedArchitecture && expectedFamily && detectedFamily !== expectedFamily);
    const needsMetadataWrite = Boolean(
      needsArchitectureRepair
      || prepared.previewDataUrl
      || prepared.title
      || prepared.author
      || prepared.description
      || prepared.triggerWords.length
      || prepared.tags.length
    );

    if (!canEdit || !needsMetadataWrite) {
      if (needsArchitectureRepair && !canEdit) {
        this.addLog(`Swarm indexed ${prepared.name} as ${detectedFamily || described.architecture || "unknown"}; this session cannot edit model metadata to repair it.`, "warn", "api");
      }
      return described;
    }

    try {
      await this.client.editModelMetadata(described, "LoRA", {
        title: prepared.title || described.title,
        author: prepared.author || described.author,
        description: prepared.description || described.description,
        architecture: expectedArchitecture || described.architecture,
        trigger_phrase: prepared.triggerWords.join(", ") || described.trigger_phrase,
        tags: prepared.tags.length ? prepared.tags : described.tags,
        preview_image: prepared.previewDataUrl || undefined,
      });
      await sleep(250);
      try { this.applyParameterData(await this.client.refreshInventory()); } catch { /* metadata edit can still be live without a strong refresh */ }
      try { described = await this.client.describeModel(model.name, "LoRA"); } catch { /* keep the pre-edit description */ }
      const repairedFamily = modelFamily(described);
      if (expectedFamily && repairedFamily !== expectedFamily) {
        this.addLog(`Metadata was written for ${prepared.name}, but Swarm still reports ${repairedFamily || described.architecture || "unknown"} instead of ${expectedFamily}.`, "warn", "api");
      } else {
        this.addLog(`Applied Civitai metadata${expectedArchitecture ? ` and ${expectedArchitecture} architecture` : ""} to ${prepared.name}.`, "info", "api");
      }
    } catch (error) {
      this.addLog(`Could not apply resolved metadata to ${prepared.name}: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
    }
    return described;
  }

  private async downloadPreparedLora(prepared: PreparedLoraDownload, onProgress?: (progress: number, message: string) => void): Promise<boolean> {
    const beforeKeys = new Set(this.loras.map((model) => this.sanitizeLoraName(model.name).toLowerCase()));
    this.loraDownloadProgress = 0;
    this.loraDownloadMessage = `Downloading ${prepared.name}…`;
    onProgress?.(this.loraDownloadProgress, this.loraDownloadMessage);
    if (!onProgress) this.render();
    await this.client.downloadModel({ url: prepared.url, type: "LoRA", name: prepared.name, metadata: prepared.metadata }, (event) => {
      const current = Number(event.current_percent ?? event.percent ?? 0);
      if (Number.isFinite(current)) this.loraDownloadProgress = current > 1 ? current / 100 : current;
      if (event.message) this.loraDownloadMessage = String(event.message);
      if (event.success === true) { this.loraDownloadProgress = 1; this.loraDownloadMessage = "Downloaded. Refreshing LoRA library…"; }
      onProgress?.(this.loraDownloadProgress, this.loraDownloadMessage);
      if (!onProgress) {
        const bar = this.root.querySelector<HTMLElement>(".download-progress > div");
        if (bar) bar.style.width = `${Math.round(clamp(this.loraDownloadProgress, 0, 1) * 100)}%`;
        const status = this.root.querySelector<HTMLElement>(".download-status");
        if (status) status.textContent = this.loraDownloadMessage;
      }
    });
    try { this.applyParameterData(await this.client.refreshInventory()); } catch (error) {
      this.addLog(`Swarm inventory refresh after download failed: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
    }
    const wantedKey = this.sanitizeLoraName(prepared.name).toLowerCase();
    let indexed = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      this.loras = await this.client.listModels("LoRA");
      const keys = new Set(this.loras.map((model) => this.sanitizeLoraName(model.name).toLowerCase()));
      indexed = keys.has(wantedKey) || [...keys].some((key) => !beforeKeys.has(key));
      if (indexed) break;
      await sleep(500 + attempt * 250);
      try { this.applyParameterData(await this.client.refreshInventory()); } catch { /* keep polling ListModels */ }
    }
    if (indexed) {
      const downloaded = this.loras.find((model) => this.sanitizeLoraName(model.name).toLowerCase() === wantedKey)
        ?? this.loras.find((model) => !beforeKeys.has(this.sanitizeLoraName(model.name).toLowerCase()));
      if (downloaded) {
        await this.repairDownloadedLoraMetadata(downloaded, prepared);
        this.loras = await this.client.listModels("LoRA");
      }
    }
    this.loraDownloadProgress = 1;
    this.loraDownloadMessage = indexed
      ? `Done — Swarm indexed the LoRA${prepared.baseModel ? ` as ${prepared.baseModel}` : ""} and the library is live.`
      : "Download finished, but Swarm has not indexed the file yet. Refresh Models in a moment; a Swarm restart should not normally be required.";
    onProgress?.(this.loraDownloadProgress, this.loraDownloadMessage);
    this.addLog(`Downloaded LoRA ${prepared.name} into Swarm.${indexed ? " Inventory refreshed and metadata reconciled." : " Waiting for Swarm indexing."}`, indexed ? "info" : "warn", "api");
    this.notify(indexed ? `${prepared.name} downloaded and indexed.` : `${prepared.name} downloaded; waiting for Swarm to index it.`, indexed ? "success" : "info");
    if (!onProgress) this.render();
    return indexed;
  }

  private async startLoraDownload(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form);
    const rawUrl = String(data.get("url") ?? "");
    const overrideName = String(data.get("name") ?? "");
    try {
      this.loraDownloadProgress = 0;
      this.loraDownloadMessage = "Resolving metadata…";
      this.render();
      const prepared = await this.prepareLoraDownload(rawUrl, overrideName, true);
      this.loraDownloadResolved = prepared;
      await this.downloadPreparedLora(prepared);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.loraDownloadMessage = message;
      this.addLog(message, "error", "api");
      this.notify(message, "error");
      this.render();
    }
  }

  private async searchCivitai(resetPage = false): Promise<void> {
    if (resetPage) {
      this.civitaiPage = 1;
      this.civitaiResults = [];
      this.civitaiTotal = 0;
      this.civitaiTotalPages = 1;
      this.civitaiUpstreamPage = 1;
      this.civitaiUpstreamTotalPages = 1;
      this.civitaiNextUrl = "";
      this.civitaiServerFilteredBaseModel = "";
      this.civitaiExhausted = false;
      this.civitaiScanned = 0;
      this.civitaiPreviewProbed.clear();
    }
    this.civitaiLoading = true;
    this.civitaiError = "";
    this.render();
    try {
      const pageSize = 24;
      const targetCount = this.civitaiPage * pageSize;
      let matching = this.civitaiMatchingResults();
      let requests = 0;

      // CivitAI now mixes two pagination modes: ordinary browsing may use pages/cursors, while
      // text query searches explicitly reject a page parameter. Follow metadata.nextPage exactly
      // rather than inventing page numbers. When CivitAI understands the active family, send
      // baseModels upstream so users receive full 24-card pages without a client-side scavenger hunt.
      while (matching.length < targetCount && !this.civitaiExhausted && requests < 8) {
        const requestUrl = this.civitaiNextUrl || this.civitaiInitialRequestUrl();
        const payload = await this.jsonFromUrl(requestUrl) as unknown as CivitaiSearchResponse;
        const items = Array.isArray(payload.items) ? payload.items : [];
        const existing = new Set(this.civitaiResults.map((item) => item.id));
        for (const item of items) if (!existing.has(item.id)) { this.civitaiResults.push(item); existing.add(item.id); }

        this.civitaiScanned += items.length;
        this.civitaiTotal = Number(payload.metadata?.totalItems ?? (this.civitaiTotal || this.civitaiResults.length)) || this.civitaiResults.length;
        this.civitaiTotalPages = Math.max(1, Math.ceil(this.civitaiTotal / pageSize));
        this.civitaiNextUrl = this.civitaiNormalizedNextUrl(payload, requestUrl);
        this.civitaiExhausted = !items.length || !this.civitaiNextUrl;
        this.civitaiUpstreamPage += 1;
        matching = this.civitaiMatchingResults();
        requests += 1;
      }
      this.civitaiLoadedOnce = true;
      const visibleStart = (this.civitaiPage - 1) * pageSize;
      const visible = matching.slice(visibleStart, visibleStart + pageSize);
      this.addLog(`CivitAI browse page ${this.civitaiPage}: ${visible.length} shown, ${matching.length} matching loaded after ${requests} upstream request${requests === 1 ? "" : "s"}.`, "info", "api");

      // List responses occasionally omit preview arrays even though the model detail has them.
      // Probe only the visible missing cards, once per model, and merge the richer record in-place.
      const missing = visible.filter((model) => {
        const version = this.civitaiDefaultVersion(model);
        return version && !(version.images ?? []).some((image) => Boolean(image.url)) && !this.civitaiPreviewProbed.has(model.id);
      });
      if (missing.length) void this.hydrateCivitaiMissingPreviews(missing);
    } catch (error) {
      this.civitaiError = error instanceof Error ? error.message : String(error);
      this.addLog(`CivitAI search failed: ${this.civitaiError}`, "error", "api");
    } finally {
      this.civitaiLoading = false;
      this.render();
    }
  }

  private async hydrateCivitaiMissingPreviews(models: CivitaiModelItem[]): Promise<void> {
    // Detail records are much more reliable about media than the list endpoint. Hydrate every
    // visible missing card, but do it in small batches so a 24-card page does not hammer CivitAI.
    let changed = false;
    const batchSize = 6;
    for (let offset = 0; offset < models.length; offset += batchSize) {
      const batch = models.slice(offset, offset + batchSize);
      const details = await Promise.all(batch.map(async (model) => {
        try {
          const detail = await this.jsonFromUrl(`${CIVITAI_ORIGIN}/api/v1/models/${model.id}`) as unknown as CivitaiModelItem;
          this.civitaiPreviewProbed.add(model.id);
          return detail;
        } catch {
          return null;
        }
      }));
      for (const detail of details) {
        if (!detail?.id) continue;
        const index = this.civitaiResults.findIndex((item) => item.id === detail.id);
        if (index >= 0) { this.civitaiResults[index] = detail; changed = true; }
      }
      if (changed && this.view === "civitai") this.render();
    }
  }

  private async openCivitaiDetail(modelId: number): Promise<void> {
    const cached = this.civitaiResults.find((model) => model.id === modelId) ?? null;
    this.civitaiDetail = cached;
    this.civitaiDetailLoading = true;
    this.civitaiDetailVersionId = this.civitaiDefaultVersion(cached ?? { id: modelId, name: "", modelVersions: [] })?.id ?? cached?.modelVersions?.[0]?.id ?? 0;
    this.loraDownloadProgress = 0;
    this.loraDownloadMessage = "";
    this.render();
    try {
      const model = await this.jsonFromUrl(`${CIVITAI_ORIGIN}/api/v1/models/${modelId}`) as unknown as CivitaiModelItem;
      this.civitaiDetail = model;
      const preferred = this.civitaiDefaultVersion(model) ?? model.modelVersions?.[0];
      if (!model.modelVersions?.some((version) => version.id === this.civitaiDetailVersionId)) this.civitaiDetailVersionId = preferred?.id ?? 0;
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error), "error");
      if (!cached) this.civitaiDetail = null;
    } finally {
      this.civitaiDetailLoading = false;
      this.render();
    }
  }

  private installCivitaiVersion(versionId: number): void {
    if (!versionId || !this.connected) return;
    const existing = this.civitaiInstallEntry(versionId);
    if (existing) {
      this.notify(existing.status === "installing" ? "That LoRA is already installing." : "That LoRA is already queued.", "info");
      return;
    }
    const owner = (this.civitaiDetail && (this.civitaiDetail.modelVersions ?? []).some((version) => version.id === versionId))
      ? this.civitaiDetail
      : this.civitaiResults.find((model) => (model.modelVersions ?? []).some((version) => version.id === versionId)) ?? null;
    const version = owner?.modelVersions?.find((item) => item.id === versionId);
    if (this.civitaiVersionInstalled(version)) {
      this.notify("That LoRA is already installed.", "info");
      return;
    }
    this.civitaiInstallQueue.push({
      versionId,
      modelId: owner?.id ?? 0,
      title: owner?.name || version?.name || `CivitAI version ${versionId}`,
      status: "queued",
      progress: 0,
      message: "Waiting for the current install to finish…",
    });
    this.refreshCivitaiInstallQueueDom();
    this.updateCivitaiQueueDom(this.civitaiInstallQueue[this.civitaiInstallQueue.length - 1]!);
    void this.processCivitaiInstallQueue();
  }

  private async processCivitaiInstallQueue(): Promise<void> {
    if (this.civitaiInstallProcessing) return;
    this.civitaiInstallProcessing = true;
    try {
      while (true) {
        const item = this.civitaiInstallQueue.find((entry) => entry.status === "queued");
        if (!item) break;
        item.status = "installing";
        item.progress = 0;
        item.message = "Resolving CivitAI metadata…";
        this.civitaiInstalling = true;
        this.refreshCivitaiInstallQueueDom();
        this.updateCivitaiQueueDom(item);
        try {
          const prepared = await this.prepareLoraDownload(`${CIVITAI_ORIGIN}/api/download/models/${item.versionId}`, "", true);
          item.title = prepared.title || prepared.name || item.title;
          item.message = `Installing ${item.title}…`;
          this.updateCivitaiQueueDom(item);
          await this.downloadPreparedLora(prepared, (progress, message) => {
            item.progress = progress;
            item.message = message;
            this.updateCivitaiQueueDom(item);
          });
          item.status = "done";
          item.progress = 1;
          item.message = "Installed and indexed.";
          this.updateCivitaiQueueDom(item);
          window.setTimeout(() => {
            this.civitaiInstallQueue = this.civitaiInstallQueue.filter((entry) => entry !== item);
            if (this.view === "civitai") this.refreshCivitaiInstallQueueDom();
          }, 4500);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          item.status = "error";
          item.message = message;
          this.addLog(`CivitAI install failed: ${message}`, "error", "api");
          this.notify(message, "error");
          this.updateCivitaiQueueDom(item);
          window.setTimeout(() => {
            this.civitaiInstallQueue = this.civitaiInstallQueue.filter((entry) => entry !== item);
            if (this.view === "civitai") this.refreshCivitaiInstallQueueDom();
          }, 8000);
        } finally {
          this.civitaiInstalling = false;
          if (this.view === "civitai") this.refreshCivitaiInstallQueueDom();
        }
      }
    } finally {
      this.civitaiInstallProcessing = false;
      this.civitaiInstalling = false;
    }
  }

  private async openModelMetadataViewer(modelName: string): Promise<void> {
    if (!modelName) return;
    this.modelMetadataViewerLoading = true;
    this.modelMetadataViewer = this.loras.find((model) => serverModelKey(model.name) === serverModelKey(modelName)) ?? null;
    this.render();
    try {
      this.modelMetadataViewer = await this.client.describeModel(modelName, "LoRA");
    } catch (error) {
      if (!this.modelMetadataViewer) this.notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      this.modelMetadataViewerLoading = false;
      this.render();
    }
  }

  private async openModelMetadataEditor(modelName: string): Promise<void> {
    if (!modelName) return;
    this.modelMetadataLoading = true;
    this.modelMetadataEditor = this.loras.find((model) => model.name === modelName) ?? null;
    this.modelMetadataPreviewDataUrl = "";
    this.modelMetadataCivitaiUrl = this.modelMetadataEditor ? this.modelCivitaiUrl(this.modelMetadataEditor) : "";
    this.modelMetadataCivitaiLoading = false;
    this.render();
    try {
      this.modelMetadataEditor = await this.client.describeModel(modelName, "LoRA");
      this.modelMetadataCivitaiUrl = this.modelCivitaiUrl(this.modelMetadataEditor);
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      this.modelMetadataLoading = false;
      this.render();
    }
  }

  private normalizedCivitaiLookupHash(value: string): string {
    return String(value ?? "").trim().replace(/^0x/i, "").replace(/\s+/g, "");
  }

  private async civitaiSourceFromModelHash(model: SwarmModel): Promise<{ sourceUrl: string; hash: string }> {
    const swarmHash = await this.client.getModelHash(model.name, "LoRA");
    const hash = this.normalizedCivitaiLookupHash(swarmHash);
    if (!/^[a-f0-9]{8,}$/i.test(hash)) throw new Error(`Swarm returned an invalid model hash: ${swarmHash || "empty"}.`);
    this.addLog(`Resolving CivitAI metadata by Swarm model hash for ${model.name}: ${hash.slice(0, 12)}…`, "info", "api");
    const redLookup = `${CIVITAI_ORIGIN}/api/v1/model-versions/by-hash/${encodeURIComponent(hash)}`;
    let version: Record<string, unknown>;
    try {
      version = await this.jsonFromUrl(redLookup);
    } catch (redError) {
      // Keep .red as the canonical route, but tolerate mirrors that expose the documented hash
      // endpoint only on civitai.com. Any resolved model/version URL is still canonicalized to .red.
      this.addLog(`CivitAI .red hash lookup failed; trying the compatible .com metadata endpoint: ${redError instanceof Error ? redError.message : String(redError)}`, "warn", "api");
      version = await this.jsonFromUrl(`${CIVITAI_FALLBACK_ORIGIN}/api/v1/model-versions/by-hash/${encodeURIComponent(hash)}`);
    }
    const nestedModel = version.model && typeof version.model === "object" && !Array.isArray(version.model) ? version.model as Record<string, unknown> : {};
    const versionId = String(version.id ?? version.modelVersionId ?? "").trim();
    const modelId = String(version.modelId ?? nestedModel.id ?? "").trim();
    if (!versionId) throw new Error("CivitAI did not return a model version for this LoRA hash.");
    const sourceUrl = modelId
      ? `${CIVITAI_ORIGIN}/models/${modelId}?modelVersionId=${versionId}`
      : `${CIVITAI_ORIGIN}/api/download/models/${versionId}`;
    return { sourceUrl, hash };
  }

  private async pullModelMetadataFromCivitai(): Promise<void> {
    const model = this.modelMetadataEditor;
    if (!model || this.modelMetadataCivitaiLoading) return;
    const input = this.root.querySelector<HTMLInputElement>("#model-metadata-civitai-url");
    const enteredSource = (input?.value || this.modelMetadataCivitaiUrl || this.modelCivitaiUrl(model)).trim();
    this.modelMetadataCivitaiLoading = true;
    this.modelMetadataCivitaiUrl = enteredSource;
    this.render();
    try {
      let sourceUrl = enteredSource;
      let prepared: PreparedLoraDownload | null = null;
      let urlError: unknown = null;

      if (sourceUrl) {
        try {
          prepared = await this.prepareLoraDownload(sourceUrl, model.name, true);
        } catch (error) {
          urlError = error;
          this.addLog(`Stored CivitAI source failed for ${model.name}; trying Swarm hash fallback: ${error instanceof Error ? error.message : String(error)}`, "warn", "api");
        }
      }

      if (!prepared) {
        try {
          const resolved = await this.civitaiSourceFromModelHash(model);
          sourceUrl = resolved.sourceUrl;
          prepared = await this.prepareLoraDownload(sourceUrl, model.name, true);
          this.addLog(`Resolved ${model.name} from CivitAI by hash ${resolved.hash.slice(0, 12)}….`, "info", "api");
        } catch (hashError) {
          if (urlError) {
            const urlMessage = urlError instanceof Error ? urlError.message : String(urlError);
            const hashMessage = hashError instanceof Error ? hashError.message : String(hashError);
            throw new Error(`CivitAI URL lookup failed (${urlMessage}) and hash fallback failed (${hashMessage}).`);
          }
          throw hashError;
        }
      }

      this.modelMetadataEditor = {
        ...model,
        title: prepared.title || model.title,
        author: prepared.author || model.author,
        description: prepared.description || model.description,
        usage_hint: prepared.usageHint || prepared.versionTitle || model.usage_hint,
        date: prepared.date || model.date,
        architecture: prepared.architecture || model.architecture,
        trigger_phrase: prepared.triggerWords.length ? prepared.triggerWords.join(", ") : model.trigger_phrase,
        tags: prepared.tags.length ? prepared.tags : model.tags,
      };
      if (prepared.previewDataUrl) this.modelMetadataPreviewDataUrl = prepared.previewDataUrl;
      this.modelMetadataCivitaiUrl = prepared.sourceUrl || sourceUrl;
      this.notify(`Pulled CivitAI metadata for ${prepared.title || prettyName(model.name)}. Review it, then Save metadata.`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog(`Could not pull CivitAI metadata for ${model.name}: ${message}`, "error", "api");
      this.notify(message, "error");
    } finally {
      this.modelMetadataCivitaiLoading = false;
      this.render();
    }
  }

  private async saveModelMetadata(form: HTMLFormElement): Promise<void> {
    const model = this.modelMetadataEditor;
    if (!model) return;
    const data = new FormData(form);
    const tags = String(data.get("tags") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    try {
      await this.client.editModelMetadata(model, "LoRA", {
        title: String(data.get("title") ?? ""),
        author: String(data.get("author") ?? ""),
        architecture: String(data.get("architecture") ?? ""),
        trigger_phrase: String(data.get("trigger") ?? ""),
        tags,
        standard_width: asNumber(String(data.get("width") ?? "0"), 0),
        standard_height: asNumber(String(data.get("height") ?? "0"), 0),
        lora_default_weight: String(data.get("defaultWeight") ?? ""),
        prediction_type: String(data.get("predictionType") ?? ""),
        description: String(data.get("description") ?? ""),
        usage_hint: String(data.get("usageHint") ?? ""),
        preview_image: this.modelMetadataPreviewDataUrl || undefined,
      });
      await sleep(200);
      try { this.applyParameterData(await this.client.refreshInventory()); } catch { /* metadata is still written */ }
      this.loras = await this.client.listModels("LoRA");
      this.modelMetadataEditor = null;
      this.modelMetadataPreviewDataUrl = "";
      this.modelMetadataCivitaiUrl = "";
      this.modelMetadataCivitaiLoading = false;
      this.notify("LoRA metadata saved to Swarm.", "success");
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog(`Could not save LoRA metadata: ${message}`, "error", "api");
      this.notify(message, "error");
    }
  }

  private async moveSelectedLoras(destination: string): Promise<void> {
    if (this.loraMoveBusy || !this.loraBatchSelected.size) return;
    const targetFolder = this.normalizeLoraPath(destination);
    const selected = [...this.loraBatchSelected];
    this.loraMoveBusy = true;
    this.render();
    let moved = 0;
    const failures: string[] = [];
    const renamed = new Map<string, string>();
    for (const oldName of selected) {
      const newName = targetFolder ? `${targetFolder}/${this.loraLeafName(oldName)}` : this.loraLeafName(oldName);
      if (this.normalizeLoraPath(oldName) === this.normalizeLoraPath(newName)) {
        moved += 1;
        continue;
      }
      try {
        await this.client.renameModel(oldName, newName, "LoRA");
        renamed.set(oldName, newName);
        moved += 1;
      } catch (error) {
        failures.push(`${prettyName(oldName)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    try {
      this.applyParameterData(await this.client.refreshInventory());
    } catch { /* RenameModel already completed server-side. */ }
    try { this.loras = await this.client.listModels("LoRA"); } catch { /* keep previous inventory if refresh fetch fails */ }
    if (renamed.size) {
      const renameEntries = [...renamed.entries()];
      const nextStack = this.store.state.draft.loras.map((item) => {
        const itemPath = this.normalizeLoraPath(item.name);
        const exact = renameEntries.find(([oldName]) => this.normalizeLoraPath(oldName) === itemPath);
        if (exact) return { ...item, name: exact[1] };
        const leafMatches = renameEntries.filter(([oldName]) => serverModelKey(oldName) === serverModelKey(item.name));
        return leafMatches.length === 1 ? { ...item, name: leafMatches[0]![1] } : item;
      });
      this.store.updateDraft({ loras: nextStack });
    }
    this.loraMoveBusy = false;
    this.loraMoveModalOpen = false;
    this.loraBatchSelected.clear();
    if (moved) this.loraFolderPath = targetFolder;
    if (failures.length) {
      this.addLog(`LoRA batch move completed with ${failures.length} failure(s): ${failures.join(" | ")}`, "error", "api");
      this.notify(`Moved ${moved}. ${failures.length} failed — check Logs.`, "error");
    } else {
      this.notify(`Moved ${moved} LoRA${moved === 1 ? "" : "s"} to ${targetFolder || "LoRA root"}.`, "success");
    }
    this.render();
  }

  private async deleteSelectedLoras(): Promise<void> {
    if (this.loraDeleteBusy || !this.loraBatchSelected.size) return;
    const selected = [...this.loraBatchSelected];
    this.loraDeleteBusy = true;
    this.render();
    const deleted = new Set<string>();
    const failures: Array<{ name: string; message: string }> = [];
    for (const modelName of selected) {
      try {
        await this.client.deleteModel(modelName, "LoRA");
        deleted.add(modelName);
      } catch (error) {
        failures.push({ name: modelName, message: error instanceof Error ? error.message : String(error) });
      }
    }
    try { this.applyParameterData(await this.client.refreshInventory()); } catch { /* DeleteModel already completed server-side. */ }
    try { this.loras = await this.client.listModels("LoRA"); } catch { /* keep the previous inventory if refresh fetch fails */ }

    if (deleted.size) {
      const deletedKeys = new Set([...deleted].map(serverModelKey));
      this.store.updateDraft({ loras: this.store.state.draft.loras.filter((item) => !deletedKeys.has(serverModelKey(item.name))) });
    }

    this.loraDeleteBusy = false;
    this.loraDeleteModalOpen = false;
    this.loraBatchSelected = new Set(failures.map((failure) => failure.name));
    if (failures.length) {
      this.addLog(`LoRA batch delete completed with ${failures.length} failure(s): ${failures.map((failure) => `${prettyName(failure.name)}: ${failure.message}`).join(" | ")}`, "error", "api");
      this.notify(`Deleted ${deleted.size}. ${failures.length} failed — check Logs.`, "error");
    } else {
      this.notify(`Deleted ${deleted.size} LoRA${deleted.size === 1 ? "" : "s"} from Swarm.`, "success");
    }
    this.render();
  }

  private bindLoraOrganizerEvents(): void {
    this.root.querySelector<HTMLElement>("[data-action='toggle-lora-tree']")?.addEventListener("click", () => {
      this.loraFolderTreeOpen = !this.loraFolderTreeOpen;
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='close-lora-tree']")?.addEventListener("click", () => {
      this.loraFolderTreeOpen = false;
      this.render();
    });
    this.root.querySelectorAll<HTMLElement>("[data-lora-folder]").forEach((button) => button.addEventListener("click", () => {
      this.loraFolderPath = this.normalizeLoraPath(button.dataset.loraFolder ?? "");
      this.loraFolderTreeOpen = false;
      this.loraBatchSelected.clear();
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-action='toggle-lora-batch']")?.addEventListener("click", () => {
      this.loraBatchMode = !this.loraBatchMode;
      if (!this.loraBatchMode) this.loraBatchSelected.clear();
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='finish-lora-batch']")?.addEventListener("click", () => {
      this.loraBatchMode = false;
      this.loraBatchSelected.clear();
      this.render();
    });
    this.root.querySelectorAll<HTMLElement>("[data-toggle-lora-select]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const name = button.dataset.toggleLoraSelect ?? "";
      if (!name) return;
      if (this.loraBatchSelected.has(name)) this.loraBatchSelected.delete(name);
      else this.loraBatchSelected.add(name);
      this.render();
    }));
    this.root.querySelectorAll<HTMLElement>("#lora-library-grid.is-batch-mode [data-lora-model]").forEach((card) => card.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("button, input, select, textarea, a")) return;
      const name = card.dataset.loraModel ?? "";
      if (!name) return;
      if (this.loraBatchSelected.has(name)) this.loraBatchSelected.delete(name);
      else this.loraBatchSelected.add(name);
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-action='select-visible-loras']")?.addEventListener("click", () => {
      this.root.querySelectorAll<HTMLElement>("#lora-library-grid [data-lora-model]").forEach((card) => {
        if (!card.hidden && card.dataset.loraModel) this.loraBatchSelected.add(card.dataset.loraModel);
      });
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='clear-lora-selection']")?.addEventListener("click", () => {
      this.loraBatchSelected.clear();
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='open-lora-move']")?.addEventListener("click", () => {
      if (!this.loraBatchSelected.size) return;
      this.loraMoveDestination = this.loraFolderPath;
      this.loraMoveModalOpen = true;
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='open-lora-delete']")?.addEventListener("click", () => {
      if (!this.loraBatchSelected.size) return;
      this.loraDeleteModalOpen = true;
      this.render();
    });
    this.root.querySelectorAll<HTMLElement>("[data-action='close-lora-delete']").forEach((element) => element.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-lora-delete-dialog]") && element.classList.contains("download-backdrop")) return;
      if (this.loraDeleteBusy) return;
      this.loraDeleteModalOpen = false;
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-action='confirm-lora-delete']")?.addEventListener("click", () => void this.deleteSelectedLoras());
    this.root.querySelectorAll<HTMLElement>("[data-action='close-lora-move']").forEach((element) => element.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-lora-move-dialog]") && element.classList.contains("download-backdrop")) return;
      this.loraMoveModalOpen = false;
      this.loraMoveBusy = false;
      this.render();
    }));
    this.root.querySelector<HTMLSelectElement>("#lora-move-folder-select")?.addEventListener("change", (event) => {
      this.loraMoveDestination = this.normalizeLoraPath((event.currentTarget as HTMLSelectElement).value);
      const input = this.root.querySelector<HTMLInputElement>("#lora-move-folder-input");
      if (input) input.value = this.loraMoveDestination;
    });
    this.root.querySelector<HTMLInputElement>("#lora-move-folder-input")?.addEventListener("input", (event) => {
      this.loraMoveDestination = (event.currentTarget as HTMLInputElement).value;
    });
    this.root.querySelector<HTMLElement>("[data-action='stage-lora-folder']")?.addEventListener("click", () => {
      const input = this.root.querySelector<HTMLInputElement>("#lora-move-folder-input");
      const staged = this.normalizeLoraPath(input?.value ?? this.loraMoveDestination);
      if (!staged) { this.notify("Type a folder path first.", "info"); return; }
      this.loraMoveDestination = staged;
      if (input) input.value = staged;
      this.notify(`Folder ${staged} will be created when the selected LoRAs move.`, "info");
    });
    this.root.querySelector<HTMLFormElement>("#lora-move-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.moveSelectedLoras(this.root.querySelector<HTMLInputElement>("#lora-move-folder-input")?.value ?? this.loraMoveDestination);
    });
  }

  private bindModelEvents(): void {
    this.bindModelComposerEvents();
    this.root.querySelector<HTMLElement>("[data-action='toggle-checkpoints']")?.addEventListener("click", () => { this.checkpointsOpen = !this.checkpointsOpen; try { localStorage.setItem("swarm-studio-checkpoints-open", String(this.checkpointsOpen)); } catch {} this.render(); });
    this.bindLoraOrganizerEvents();
    this.root.querySelector<HTMLElement>("[data-action='refresh-models']")?.addEventListener("click", () => void this.connect(false));
    this.root.querySelectorAll<HTMLElement>("[data-use-model]").forEach((button) => button.addEventListener("click", () => {
      this.loraOrphanMode = false;
      this.store.updateDraft({ model: button.dataset.useModel ?? "" });
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-action='show-orphaned-loras']")?.addEventListener("click", () => {
      this.loraOrphanMode = true;
      this.loraShowNonMatching = false;
      this.loraBatchSelected.clear();
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='exit-orphaned-loras']")?.addEventListener("click", () => {
      this.loraOrphanMode = false;
      this.loraBatchSelected.clear();
      this.render();
    });
    this.root.querySelectorAll<HTMLElement>("[data-add-model-lora]").forEach((button) => button.addEventListener("click", () => {
      this.addLoraToStack(button.dataset.addModelLora ?? "");
    }));
    this.root.querySelectorAll<HTMLElement>("[data-edit-model-metadata]").forEach((button) => button.addEventListener("click", () => {
      void this.openModelMetadataEditor(button.dataset.editModelMetadata ?? "");
    }));
    this.root.querySelector<HTMLInputElement>("#lora-library-search")?.addEventListener("input", (event) => {
      const input = event.currentTarget as HTMLInputElement;
      this.loraSearch = input.value;
      const query = input.value.trim().toLowerCase();
      let visible = 0;
      this.root.querySelectorAll<HTMLElement>("#lora-library-grid [data-lora-search]").forEach((card) => {
        card.hidden = Boolean(query) && !(card.dataset.loraSearch ?? "").includes(query);
        if (!card.hidden) visible += 1;
      });
      const empty = this.root.querySelector<HTMLElement>("#lora-search-empty");
      if (empty) empty.hidden = visible > 0;
    });
    this.root.querySelector<HTMLElement>("[data-action='toggle-lora-view']")?.addEventListener("click", () => {
      this.loraMobileGrid = !this.loraMobileGrid;
      try {
        localStorage.setItem("swarm-studio-lora-view", this.loraMobileGrid ? "grid" : "list");
      } catch { /* layout preference can remain session-only */ }
      this.render();
    });
    this.root.querySelector<HTMLInputElement>("#lora-show-nonmatching")?.addEventListener("change", (event) => {
      this.loraShowNonMatching = (event.currentTarget as HTMLInputElement).checked;
      try {
        localStorage.setItem("swarm-studio-lora-show-nonmatching", String(this.loraShowNonMatching));
      } catch { /* visibility preference can remain session-only */ }
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='open-lora-download']")?.addEventListener("click", () => {
      this.loraDownloadOpen = true;
      this.loraDownloadProgress = 0;
      this.loraDownloadMessage = "Ready.";
      this.render();
    });
  }

  private bindCivitaiEvents(): void {
    this.root.querySelector<HTMLFormElement>("#civitai-search-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.civitaiQuery = this.root.querySelector<HTMLInputElement>("#civitai-query")?.value ?? this.civitaiQuery;
      void this.searchCivitai(true);
    });
    this.root.querySelector<HTMLSelectElement>("#civitai-sort")?.addEventListener("change", (event) => {
      this.civitaiSort = (event.currentTarget as HTMLSelectElement).value;
      void this.searchCivitai(true);
    });
    this.root.querySelector<HTMLSelectElement>("#civitai-period")?.addEventListener("change", (event) => {
      this.civitaiPeriod = (event.currentTarget as HTMLSelectElement).value;
      void this.searchCivitai(true);
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-civitai-compatible-toggle]").forEach((input) => input.addEventListener("change", (event) => {
      this.civitaiCompatibleOnly = (event.currentTarget as HTMLInputElement).checked;
      void this.searchCivitai(true);
    }));
    this.root.querySelectorAll<HTMLInputElement>("[data-civitai-nsfw-toggle]").forEach((input) => input.addEventListener("change", (event) => {
      this.civitaiIncludeNsfw = (event.currentTarget as HTMLInputElement).checked;
      void this.searchCivitai(true);
    }));
    this.root.querySelector<HTMLElement>("[data-action='open-civitai-mobile-filters']")?.addEventListener("click", () => {
      this.civitaiMobileFiltersOpen = true;
      this.render();
    });
    this.root.querySelectorAll<HTMLElement>("[data-action='close-civitai-mobile-filters']").forEach((button) => button.addEventListener("click", (event) => {
      // The backdrop is itself a close action, so using target.closest(close-action)
      // makes every click inside the sheet look like a close click while bubbling.
      // Only close the backdrop when the backdrop itself was tapped; explicit
      // Cancel/X buttons may always close.
      if (button.classList.contains("civitai-mobile-filter-backdrop") && event.target !== button) return;
      event.stopPropagation();
      this.civitaiMobileFiltersOpen = false;
      this.render();
    }));
    this.root.querySelector<HTMLFormElement>("#civitai-mobile-filter-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.civitaiSort = this.root.querySelector<HTMLSelectElement>("#civitai-mobile-sort")?.value ?? this.civitaiSort;
      this.civitaiPeriod = this.root.querySelector<HTMLSelectElement>("#civitai-mobile-period")?.value ?? this.civitaiPeriod;
      this.civitaiMobileFiltersOpen = false;
      void this.searchCivitai(true);
    });
    this.root.querySelectorAll<HTMLElement>("[data-civitai-page]").forEach((button) => button.addEventListener("click", () => {
      const nextPage = Math.max(1, Number(button.dataset.civitaiPage ?? 1));
      this.civitaiPage = nextPage;
      const pageSize = 24;
      const matching = this.civitaiMatchingResults();
      if (matching.length >= (nextPage - 1) * pageSize + 1 || (nextPage === 1 && matching.length)) {
        this.render();
        window.requestAnimationFrame(() => this.root.querySelector<HTMLElement>(".content")?.scrollTo({ top: 0, behavior: "smooth" }));
      } else {
        void this.searchCivitai(false);
      }
    }));
    this.root.querySelector<HTMLElement>("[data-action='retry-civitai']")?.addEventListener("click", () => void this.searchCivitai(false));
    this.root.querySelectorAll<HTMLElement>("[data-civitai-detail]").forEach((button) => button.addEventListener("click", () => {
      const modelId = Number(button.dataset.civitaiDetail ?? 0);
      if (modelId) void this.openCivitaiDetail(modelId);
    }));
    this.root.querySelectorAll<HTMLElement>("[data-civitai-install-version]").forEach((button) => button.addEventListener("click", () => {
      const versionId = Number(button.dataset.civitaiInstallVersion ?? 0);
      if (versionId) void this.installCivitaiVersion(versionId);
    }));
    this.root.querySelectorAll<HTMLElement>("[data-civitai-block-author]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const author = String(button.dataset.civitaiBlockAuthor || "").trim();
      const key = author.toLowerCase();
      if (!key) return;
      if (this.civitaiBlockedAuthors.has(key)) {
        this.civitaiBlockedAuthors.delete(key);
        this.notify(`${author} unblocked.`, "success");
      } else {
        this.civitaiBlockedAuthors.add(key);
        this.notify(`${author} blocked from CivitAI results.`, "success");
      }
      this.persistCivitaiBlockedAuthors();
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-action='clear-civitai-blocks']")?.addEventListener("click", () => {
      if (!this.civitaiBlockedAuthors.size) return;
      if (!window.confirm(`Clear all ${this.civitaiBlockedAuthors.size} blocked CivitAI creator${this.civitaiBlockedAuthors.size === 1 ? "" : "s"}?`)) return;
      this.civitaiBlockedAuthors.clear();
      this.persistCivitaiBlockedAuthors();
      this.render();
    });
    this.root.querySelectorAll<HTMLElement>("[data-action='close-civitai-detail']").forEach((element) => element.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-civitai-detail-panel]") && !(event.target as HTMLElement).closest("[data-action='close-civitai-detail']")) return;
      this.civitaiDetail = null;
      this.civitaiDetailLoading = false;
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-civitai-detail-panel]")?.addEventListener("click", (event) => event.stopPropagation());
    this.root.querySelector<HTMLSelectElement>("#civitai-version-select")?.addEventListener("change", (event) => {
      this.civitaiDetailVersionId = Number((event.currentTarget as HTMLSelectElement).value || 0);
      this.loraDownloadProgress = 0;
      this.loraDownloadMessage = "";
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='open-lora-download']")?.addEventListener("click", () => {
      this.loraDownloadOpen = true;
      this.loraDownloadProgress = 0;
      this.loraDownloadMessage = "Ready.";
      this.render();
    });
  }

  private bindModelComposerEvents(): void {
    this.root.querySelector<HTMLSelectElement>("#model")?.addEventListener("change", (event) => {
      this.store.updateDraft({ model: (event.currentTarget as HTMLSelectElement).value });
      this.render();
    });
    this.bindLoraStackControls();
    this.bindStackReorderModalEvents();
  }

  private bindLogEvents(): void {
    this.root.querySelector<HTMLElement>("[data-action='reset-memory-peaks']")?.addEventListener("click", () => {
      this.sampleMemoryDiagnostics(false);
      this.memoryPeakJsHeapBytes = this.memoryDiagnostics?.jsHeapUsed ?? 0;
      this.memoryPeakTrackedBlobBytes = this.memoryDiagnostics?.trackedBlobBytes ?? 0;
      this.renderMemoryDiagnostics();
    });
    this.root.querySelector<HTMLElement>("[data-action='clear-logs']")?.addEventListener("click", () => {
      this.logs = [];
      this.renderLogList();
    });
    this.root.querySelector<HTMLElement>("[data-action='copy-logs']")?.addEventListener("click", async () => {
      const text = this.logs.map((entry) => `${new Date(entry.timestamp).toISOString()} [${entry.source}/${entry.level}] ${entry.message}`).join("\n");
      try {
        await navigator.clipboard.writeText(text);
        this.notify("Logs copied.", "success");
      } catch (error) {
        this.notify(error instanceof Error ? error.message : String(error), "error");
      }
    });
    this.renderLogList();
  }

  private async reloadServerNetworkSettings(): Promise<void> {
    try {
      this.serverSettings = await this.client.listServerSettings();
      this.serverSettingsError = "";
      const origin = this.corsOriginFromServerSettings();
      const savedOrigins = origin && origin !== "*" ? [...new Set([...this.store.state.connection.allowedOrigins, origin])] : this.store.state.connection.allowedOrigins;
      this.store.updateConnection({ allowedOrigins: savedOrigins, activeOrigin: origin });
      this.notify("Loaded network settings from Swarm.", "success");
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.serverSettingsError = message;
      this.addLog(`ListServerSettings failed: ${message}`, "error", "api");
      this.notify(message, "error");
      this.render();
    }
  }

  private async saveServerNetworkSettings(): Promise<void> {
    const permissions = this.userData?.permissions ?? this.session?.permissions ?? [];
    const canEditSettings = permissions.includes("edit_server_settings");
    const originKey = this.serverSettingKey("networkaccesscontrolalloworigin", "accesscontrolalloworigin") ?? (canEditSettings ? "Network.AccessControlAllowOrigin" : undefined);
    const hostKey = this.serverSettingKey("networkhost") ?? (canEditSettings ? "Network.Host" : undefined);
    if (!originKey || !canEditSettings) {
      this.notify("This Swarm session does not report edit_server_settings.", "error");
      return;
    }
    const rawData: Record<string, unknown> = {
      [originKey]: this.store.state.connection.activeOrigin,
    };
    const bindAll = this.root.querySelector<HTMLInputElement>("#bind-all-hosts")?.checked === true;
    if (hostKey) rawData[hostKey] = bindAll ? "0.0.0.0" : "localhost";
    try {
      await this.client.changeServerSettings(rawData);
      this.addLog(`Updated Swarm network settings: ${Object.keys(rawData).join(", ")}.`, "info", "api");
      this.notify("Swarm network settings saved. Restart Swarm if the listener address changed.", "success");
      try {
        this.serverSettings = await this.client.listServerSettings();
        this.serverSettingsError = "";
      } catch (probeError) {
        this.serverSettingsError = probeError instanceof Error ? probeError.message : String(probeError);
        this.addLog(`Write succeeded, but ListServerSettings still failed: ${this.serverSettingsError}`, "warn", "api");
      }
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog(message, "error", "api");
      this.notify(message, "error");
    }
  }

  private readConnectionFromForm(): void {
    const form = this.root.querySelector<HTMLFormElement>("#connection-form");
    if (!form) return;
    const data = new FormData(form);
    this.store.updateConnection({
      mode: runtime.kind === "tauri" ? "local" : (String(data.get("mode") ?? "local") === "remote" ? "remote" : "local"),
      baseUrl: String(data.get("baseUrl") ?? "http://127.0.0.1:7801"),
      authToken: String(data.get("authToken") ?? ""),
      autoStart: data.get("autoStart") === "on",
      launchMode: String(data.get("launchMode") ?? "managed") === "system" ? "system" : "managed",
      launchCommand: String(data.get("launchCommand") ?? ""),
      launchArgs: parseLaunchArgs(String(data.get("launchArgs") ?? "")),
      workingDirectory: String(data.get("workingDirectory") ?? ""),
    });
  }

  private bindSettingsEvents(): void {
    this.root.querySelector<HTMLElement>("[data-action='refresh-backend-control']")?.addEventListener("click", () => void this.refreshBackendControl(true, false));
    this.root.querySelector<HTMLElement>("[data-action='fetch-swarm-versions']")?.addEventListener("click", () => void this.runBackendControlAction("Fetch Swarm refs", async () => {
      this.swarmRepoStatus = await runtime.fetchRepoVersions("swarm", this.store.state.connection.workingDirectory || undefined);
      this.swarmRepoError = "";
      this.notify("Swarm refs refreshed.", "success");
    }));
    this.root.querySelector<HTMLElement>("[data-action='fetch-comfy-versions']")?.addEventListener("click", () => void this.runBackendControlAction("Fetch Comfy refs", async () => {
      this.comfyRepoStatus = await runtime.fetchRepoVersions("comfy", this.comfyRepoPathHint());
      this.comfyRepoError = "";
      this.notify("Comfy refs refreshed.", "success");
    }));
    this.root.querySelector<HTMLElement>("[data-action='pin-swarm-version']")?.addEventListener("click", () => {
      const target = this.root.querySelector<HTMLInputElement>("#swarm-version-target")?.value ?? "";
      void this.mutateBackendRepo("swarm", "pin", target);
    });
    this.root.querySelector<HTMLElement>("[data-action='latest-swarm-version']")?.addEventListener("click", () => void this.mutateBackendRepo("swarm", "latest"));
    this.root.querySelector<HTMLInputElement>("#swarm-launch-autopull")?.addEventListener("change", (event) => {
      const input = event.currentTarget as HTMLInputElement;
      input.disabled = true;
      void this.setSwarmLaunchAutoPull(input.checked);
    });
    this.root.querySelector<HTMLElement>("[data-action='restart-owned-swarm']")?.addEventListener("click", () => void this.restartOwnedSwarm());
    this.root.querySelector<HTMLElement>("[data-action='pin-comfy-version']")?.addEventListener("click", () => {
      const target = this.root.querySelector<HTMLInputElement>("#comfy-version-target")?.value ?? "";
      void this.mutateBackendRepo("comfy", "pin", target);
    });
    this.root.querySelector<HTMLElement>("[data-action='latest-comfy-version']")?.addEventListener("click", () => void this.mutateBackendRepo("comfy", "latest"));
    this.root.querySelector<HTMLElement>("[data-action='restart-comfy-backend']")?.addEventListener("click", () => void this.restartComfyBackend());
    this.root.querySelector<HTMLElement>("[data-action='toggle-comfy-backend']")?.addEventListener("click", () => void this.toggleComfyBackend());
    this.root.querySelector<HTMLElement>("[data-action='free-comfy-memory']")?.addEventListener("click", () => void this.freeComfyMemory());
    this.root.querySelectorAll<HTMLElement>("[data-action='apply-comfy-runtime-preset']").forEach((button) => button.addEventListener("click", () => {
      this.applyComfyRuntimePreset(String(button.dataset.preset ?? ""));
    }));
    this.root.querySelector<HTMLFormElement>("#comfy-backend-policy-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.saveComfyBackendPolicy(event.currentTarget as HTMLFormElement);
    });

    this.root.querySelectorAll<HTMLElement>("[data-settings-pane]").forEach((button) => button.addEventListener("click", () => {
      const pane = button.dataset.settingsPane as "connection" | "backend" | "appearance" | undefined;
      if (!pane) return;
      this.store.updateUi({ settingsPane: pane });
      this.render();
    }));

    this.root.querySelector<HTMLInputElement>("#generation-mini-enabled")?.addEventListener("change", (event) => { this.generationMiniEnabled = (event.currentTarget as HTMLInputElement).checked; try { localStorage.setItem("swarm-studio-generation-mini", String(this.generationMiniEnabled)); } catch {} });

    this.root.querySelector<HTMLSelectElement>("#lora-grid-size")?.addEventListener("change", (event) => {
      this.loraGridSize = (event.currentTarget as HTMLSelectElement).value === "compact" ? "compact" : "comfortable";
      try { localStorage.setItem("swarm-studio-lora-grid-size", this.loraGridSize); } catch { /* preference can remain session-only */ }
    });

    const themeForm = this.root.querySelector<HTMLFormElement>("#theme-form");
    const syncThemeForm = (source?: HTMLInputElement | HTMLSelectElement) => {
      if (!themeForm) return;
      const data = new FormData(themeForm);
      this.store.updateTheme({
        accent: String(data.get("accent") ?? this.store.state.theme.accent),
        accentAlt: String(data.get("accentAlt") ?? this.store.state.theme.accentAlt),
        background: String(data.get("background") ?? this.store.state.theme.background),
        panel: String(data.get("panel") ?? this.store.state.theme.panel),
        surfaceAlt: String(data.get("surfaceAlt") ?? this.store.state.theme.surfaceAlt),
        text: String(data.get("text") ?? this.store.state.theme.text),
        muted: String(data.get("muted") ?? this.store.state.theme.muted),
        outline: String(data.get("outline") ?? this.store.state.theme.outline),
        success: String(data.get("success") ?? this.store.state.theme.success),
        warning: String(data.get("warning") ?? this.store.state.theme.warning),
        danger: String(data.get("danger") ?? this.store.state.theme.danger),
        dangerSurface: String(data.get("dangerSurface") ?? this.store.state.theme.dangerSurface),
        titleFont: String(data.get("titleFont") ?? this.store.state.theme.titleFont) as StudioTheme["titleFont"],
        subtitleFont: String(data.get("subtitleFont") ?? this.store.state.theme.subtitleFont) as StudioTheme["subtitleFont"],
        radius: Number(data.get("radius") ?? this.store.state.theme.radius),
        controlRadius: Number(data.get("controlRadius") ?? this.store.state.theme.controlRadius),
        borderStrength: Number(data.get("borderStrength") ?? this.store.state.theme.borderStrength),
        surfaceOpacity: Number(data.get("surfaceOpacity") ?? this.store.state.theme.surfaceOpacity),
      });
      this.applyTheme();
      const values: Record<string,string> = {
        "theme-radius-value": `${this.store.state.theme.radius}px`,
        "theme-control-radius-value": `${this.store.state.theme.controlRadius}px`,
        "theme-border-value": `${Math.round(this.store.state.theme.borderStrength * 100)}%`,
        "theme-opacity-value": `${Math.round(this.store.state.theme.surfaceOpacity * 100)}%`,
      };
      for (const [id,value] of Object.entries(values)) { const node=this.root.querySelector<HTMLElement>(`#${id}`); if(node) node.textContent=value; }
      if (source instanceof HTMLInputElement) source.closest(".theme-color")?.querySelector("code")?.replaceChildren(document.createTextNode(source.value));
    };
    themeForm?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach((control) => {
      control.addEventListener("input", () => syncThemeForm(control));
      if (control instanceof HTMLSelectElement) control.addEventListener("change", () => syncThemeForm(control));
    });
    this.root.querySelectorAll<HTMLElement>("[data-theme-built-in]").forEach((button) => button.addEventListener("click", () => {
      const profile = builtInThemes.find((item) => item.id === button.dataset.themeBuiltIn);
      if (!profile) return;
      this.store.updateTheme({ ...profile.theme });
      this.render();
    }));
    this.root.querySelector<HTMLElement>("[data-action='reset-theme']")?.addEventListener("click", () => {
      this.store.updateTheme({ ...builtInThemes[0].theme });
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='save-theme-profile']")?.addEventListener("click", () => {
      const name = window.prompt("Theme profile name?", "My theme");
      if (!name?.trim()) return;
      this.store.saveThemeProfile(name);
      this.notify("Theme profile saved.", "success");
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='load-theme-profile']")?.addEventListener("click", () => {
      const id = this.root.querySelector<HTMLSelectElement>("#theme-profile-select")?.value;
      const profile = this.store.state.themeProfiles.find((item) => item.id === id);
      if (!profile) return;
      this.store.updateTheme({ ...profile.theme });
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='delete-theme-profile']")?.addEventListener("click", () => {
      const id = this.root.querySelector<HTMLSelectElement>("#theme-profile-select")?.value;
      if (!id) return;
      this.store.deleteThemeProfile(id);
      this.render();
    });

    const form = this.root.querySelector<HTMLFormElement>("#connection-form");
    form?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select").forEach((element) => {
      element.addEventListener("input", () => this.readConnectionFromForm());
      element.addEventListener("change", () => {
        const before = this.store.state.connection.launchMode;
        this.readConnectionFromForm();
        if (element.getAttribute("name") === "launchMode" && before !== this.store.state.connection.launchMode) this.render();
      });
    });
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.readConnectionFromForm();
      const settings = this.store.state.connection;
      // Native Connect is an explicit request to make local Swarm available. It probes the
      // loopback API first and launches the configured/discovered process when nothing answers.
      // Browser/PWA Connect never spawns a desktop process.
      void this.connect(runtime.kind === "tauri");
    });
    this.root.querySelector<HTMLElement>("[data-action='start-swarm']")?.addEventListener("click", async () => {
      this.readConnectionFromForm();
      await this.connect(true);
      await this.refreshProcessStatus(true);
    });
    this.root.querySelector<HTMLElement>("[data-action='stop-swarm']")?.addEventListener("click", async () => {
      try {
        const message = await runtime.stopLocalSwarm();
        this.addLog(message, "info", "swarm");
        this.notify(message, "info");
        this.connected = false;
        this.session = null;
        await this.refreshProcessStatus(false);
        this.render();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.addLog(message, "error", "swarm");
        this.notify(message, "error");
      }
    });
    this.root.querySelector<HTMLElement>("[data-action='add-origin']")?.addEventListener("click", () => {
      const input = this.root.querySelector<HTMLInputElement>("#origin-input");
      const value = input?.value.trim().replace(/\/$/, "") ?? "";
      if (!value) return;
      try {
        const parsed = new URL(value.includes("://") ? value : `http://${value}`);
        const origin = parsed.origin;
        const allowedOrigins = this.store.state.connection.allowedOrigins.includes(origin)
          ? this.store.state.connection.allowedOrigins
          : [...this.store.state.connection.allowedOrigins, origin];
        this.store.updateConnection({ allowedOrigins, activeOrigin: origin });
        this.render();
      } catch {
        this.notify("Use a full origin such as http://192.168.1.50:1420.", "error");
      }
    });
    this.root.querySelectorAll<HTMLElement>("[data-select-origin]").forEach((button) => button.addEventListener("click", () => {
      const origin = this.store.state.connection.allowedOrigins[Number(button.dataset.selectOrigin)];
      if (!origin) return;
      this.store.updateConnection({ activeOrigin: origin });
      this.render();
    }));
    this.root.querySelectorAll<HTMLElement>("[data-remove-origin]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.removeOrigin);
      const removed = this.store.state.connection.allowedOrigins[index];
      const allowedOrigins = this.store.state.connection.allowedOrigins.filter((_, itemIndex) => itemIndex !== index);
      const activeOrigin = this.store.state.connection.activeOrigin === removed ? (allowedOrigins[0] ?? "") : this.store.state.connection.activeOrigin;
      this.store.updateConnection({ allowedOrigins, activeOrigin });
      this.render();
    }));
    this.root.querySelector<HTMLInputElement>("#allow-any-origin")?.addEventListener("change", (event) => {
      const checked = (event.currentTarget as HTMLInputElement).checked;
      this.store.updateConnection({ activeOrigin: checked ? "*" : (this.store.state.connection.allowedOrigins[0] ?? "") });
      this.render();
    });
    this.root.querySelector<HTMLElement>("[data-action='load-server-network']")?.addEventListener("click", () => void this.reloadServerNetworkSettings());
    this.root.querySelector<HTMLElement>("[data-action='save-server-network']")?.addEventListener("click", () => void this.saveServerNetworkSettings());
  }
}
