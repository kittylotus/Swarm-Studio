import type { RegionLayoutPreset, RegionalPromptDraft, RegionalPromptRegion } from "./types";

function createRegionId(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === "function") return cryptoObject.randomUUID();
  return `region-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export interface RegionLayoutDefinition {
  id: RegionLayoutPreset;
  label: string;
  shortLabel: string;
  description: string;
  regions: Array<Omit<RegionalPromptRegion, "id" | "prompt" | "strength" | "enabled">>;
}

export type RegionResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export interface RegionOverlapArea {
  aIndex: number;
  bIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MAX_REGION_SPACING = 0.2;
export const MIN_REGION_SIZE = 0.05;

export const REGION_LAYOUT_PRESETS: RegionLayoutDefinition[] = [
  {
    id: "left-right",
    label: "Left / Right",
    shortLabel: "2 columns",
    description: "Two full-height regions split down the middle.",
    regions: [
      { name: "Left", x: 0, y: 0, width: 0.5, height: 1 },
      { name: "Right", x: 0.5, y: 0, width: 0.5, height: 1 },
    ],
  },
  {
    id: "top-bottom",
    label: "Top / Bottom",
    shortLabel: "2 rows",
    description: "Two full-width regions split horizontally.",
    regions: [
      { name: "Top", x: 0, y: 0, width: 1, height: 0.5 },
      { name: "Bottom", x: 0, y: 0.5, width: 1, height: 0.5 },
    ],
  },
  {
    id: "three-columns",
    label: "Three columns",
    shortLabel: "3 columns",
    description: "Three equal vertical regions.",
    regions: [
      { name: "Left", x: 0, y: 0, width: 1 / 3, height: 1 },
      { name: "Center", x: 1 / 3, y: 0, width: 1 / 3, height: 1 },
      { name: "Right", x: 2 / 3, y: 0, width: 1 / 3, height: 1 },
    ],
  },
  {
    id: "three-rows",
    label: "Three rows",
    shortLabel: "3 rows",
    description: "Three equal horizontal regions.",
    regions: [
      { name: "Top", x: 0, y: 0, width: 1, height: 1 / 3 },
      { name: "Middle", x: 0, y: 1 / 3, width: 1, height: 1 / 3 },
      { name: "Bottom", x: 0, y: 2 / 3, width: 1, height: 1 / 3 },
    ],
  },
  {
    id: "grid-2x2",
    label: "2 × 2 grid",
    shortLabel: "4 regions",
    description: "Four equal quadrants.",
    regions: [
      { name: "Top left", x: 0, y: 0, width: 0.5, height: 0.5 },
      { name: "Top right", x: 0.5, y: 0, width: 0.5, height: 0.5 },
      { name: "Bottom left", x: 0, y: 0.5, width: 0.5, height: 0.5 },
      { name: "Bottom right", x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
    ],
  },
];

export function emptyRegionalPromptDraft(): RegionalPromptDraft {
  return {
    layout: "",
    spacing: 0,
    customGeometry: false,
    regions: [],
    backgroundEnabled: false,
    backgroundPrompt: "",
  };
}

function finite(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeRegionSpacing(value: unknown): number {
  return clamp(finite(value, 0), -MAX_REGION_SPACING, MAX_REGION_SPACING);
}

function normalizeRegionGeometry(
  region: Pick<RegionalPromptRegion, "x" | "y" | "width" | "height">,
  minSize = 0.001,
): Pick<RegionalPromptRegion, "x" | "y" | "width" | "height"> {
  const width = clamp(finite(region.width, 1), minSize, 1);
  const height = clamp(finite(region.height, 1), minSize, 1);
  const x = clamp(finite(region.x, 0), 0, Math.max(0, 1 - width));
  const y = clamp(finite(region.y, 0), 0, Math.max(0, 1 - height));
  return { x, y, width, height };
}

function spacePresetRegion(
  region: Omit<RegionalPromptRegion, "id" | "prompt" | "strength" | "enabled">,
  spacing: number,
): Omit<RegionalPromptRegion, "id" | "prompt" | "strength" | "enabled"> {
  if (spacing === 0) return { ...region };
  const epsilon = 1e-9;
  const half = spacing / 2;
  const leftEdge = region.x > epsilon ? half : 0;
  const rightEdge = region.x + region.width < 1 - epsilon ? half : 0;
  const topEdge = region.y > epsilon ? half : 0;
  const bottomEdge = region.y + region.height < 1 - epsilon ? half : 0;
  return {
    ...region,
    x: region.x + leftEdge,
    y: region.y + topEdge,
    width: region.width - leftEdge - rightEdge,
    height: region.height - topEdge - bottomEdge,
  };
}

export function normalizeRegionalPromptDraft(value: unknown): RegionalPromptDraft {
  if (!value || typeof value !== "object") return emptyRegionalPromptDraft();
  const raw = value as Partial<RegionalPromptDraft> & { gutter?: unknown };
  const layout = REGION_LAYOUT_PRESETS.some((preset) => preset.id === raw.layout) ? raw.layout as RegionLayoutPreset : "";
  const regions = Array.isArray(raw.regions) ? raw.regions.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const region = item as Partial<RegionalPromptRegion>;
    const geometry = normalizeRegionGeometry({
      x: finite(region.x, 0),
      y: finite(region.y, 0),
      width: finite(region.width, 1),
      height: finite(region.height, 1),
    });
    return [{
      id: typeof region.id === "string" && region.id ? region.id : createRegionId(),
      name: typeof region.name === "string" && region.name.trim() ? region.name.trim() : "Region",
      ...geometry,
      strength: Math.max(0, finite(region.strength, 1)),
      prompt: typeof region.prompt === "string" ? region.prompt : "",
      enabled: region.enabled !== false,
    }];
  }) : [];
  return {
    layout,
    spacing: normalizeRegionSpacing(raw.spacing ?? raw.gutter),
    customGeometry: raw.customGeometry === true,
    regions,
    backgroundEnabled: raw.backgroundEnabled === true,
    backgroundPrompt: typeof raw.backgroundPrompt === "string" ? raw.backgroundPrompt : "",
  };
}

export function cloneRegionalPromptDraft(value: RegionalPromptDraft): RegionalPromptDraft {
  return {
    layout: value.layout,
    spacing: normalizeRegionSpacing(value.spacing),
    customGeometry: value.customGeometry === true,
    regions: value.regions.map((region) => ({ ...region })),
    backgroundEnabled: value.backgroundEnabled,
    backgroundPrompt: value.backgroundPrompt,
  };
}

export function applyRegionLayoutPreset(current: RegionalPromptDraft, presetId: RegionLayoutPreset): RegionalPromptDraft {
  const preset = REGION_LAYOUT_PRESETS.find((item) => item.id === presetId);
  if (!preset) return cloneRegionalPromptDraft(current);
  const previousPreset = REGION_LAYOUT_PRESETS.find((item) => item.id === current.layout);
  const spacing = normalizeRegionSpacing(current.spacing);
  return {
    layout: preset.id,
    spacing,
    customGeometry: false,
    regions: preset.regions.map((baseSlot, index) => {
      const slot = spacePresetRegion(baseSlot, spacing);
      const existing = current.regions[index];
      const previousDefaultName = previousPreset?.regions[index]?.name;
      const existingName = existing?.name?.trim() || "";
      const name = existingName && existingName !== previousDefaultName ? existingName : slot.name;
      return {
        id: existing?.id || createRegionId(),
        ...slot,
        name,
        prompt: existing?.prompt || "",
        strength: existing && Number.isFinite(existing.strength) ? existing.strength : 1,
        enabled: existing?.enabled !== false,
      };
    }),
    backgroundEnabled: current.backgroundEnabled,
    backgroundPrompt: current.backgroundPrompt,
  };
}

export function applyRegionPresetSpacing(current: RegionalPromptDraft, spacing: number): RegionalPromptDraft {
  const normalized = normalizeRegionSpacing(spacing);
  const next = cloneRegionalPromptDraft(current);
  next.spacing = normalized;
  if (!next.layout) return next;
  return applyRegionLayoutPreset(next, next.layout);
}

/** @deprecated Kept as a compatibility alias for the first gutter-only preview build. */
export const applyRegionPresetGutter = applyRegionPresetSpacing;

export function moveRegionGeometry(region: RegionalPromptRegion, dx: number, dy: number): RegionalPromptRegion {
  return {
    ...region,
    x: clamp(region.x + dx, 0, Math.max(0, 1 - region.width)),
    y: clamp(region.y + dy, 0, Math.max(0, 1 - region.height)),
  };
}

export function resizeRegionGeometry(
  region: RegionalPromptRegion,
  handle: RegionResizeHandle,
  dx: number,
  dy: number,
  minSize = MIN_REGION_SIZE,
): RegionalPromptRegion {
  let left = region.x;
  let top = region.y;
  let right = region.x + region.width;
  let bottom = region.y + region.height;

  if (handle.includes("w")) left = clamp(left + dx, 0, right - minSize);
  if (handle.includes("e")) right = clamp(right + dx, left + minSize, 1);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - minSize);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + minSize, 1);

  return {
    ...region,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function regionOverlapAreas(regions: RegionalPromptRegion[]): RegionOverlapArea[] {
  const overlaps: RegionOverlapArea[] = [];
  for (let aIndex = 0; aIndex < regions.length; aIndex += 1) {
    const a = regions[aIndex];
    if (!a || !a.enabled) continue;
    for (let bIndex = aIndex + 1; bIndex < regions.length; bIndex += 1) {
      const b = regions[bIndex];
      if (!b || !b.enabled) continue;
      const left = Math.max(a.x, b.x);
      const top = Math.max(a.y, b.y);
      const right = Math.min(a.x + a.width, b.x + b.width);
      const bottom = Math.min(a.y + a.height, b.y + b.height);
      if (right <= left || bottom <= top) continue;
      overlaps.push({ aIndex, bIndex, x: left, y: top, width: right - left, height: bottom - top });
    }
  }
  return overlaps;
}

function syntaxNumber(value: number): string {
  const rounded = Math.round(value * 10000) / 10000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function compileRegionalPrompt(basePrompt: string, regional: RegionalPromptDraft): string {
  const lines = [basePrompt.trim()].filter(Boolean);
  for (const region of regional.regions) {
    const prompt = region.prompt.trim();
    if (!region.enabled || !prompt) continue;
    lines.push(`<region:${syntaxNumber(region.x)},${syntaxNumber(region.y)},${syntaxNumber(region.width)},${syntaxNumber(region.height)},${syntaxNumber(region.strength)}> ${prompt}`);
  }
  if (regional.backgroundEnabled && regional.backgroundPrompt.trim()) {
    lines.push(`<region:background> ${regional.backgroundPrompt.trim()}`);
  }
  return lines.join("\n");
}

export function hasRegionalPromptContent(regional: RegionalPromptDraft): boolean {
  return regional.regions.some((region) => region.enabled && Boolean(region.prompt.trim()))
    || (regional.backgroundEnabled && Boolean(regional.backgroundPrompt.trim()));
}
