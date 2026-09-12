export interface ResolutionGeometry {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round64(value: number): number {
  return clamp(Math.max(64, Math.round(value / 64) * 64), 64, 4096);
}

function parsedRatio(ratio: string): [number, number] | null {
  const parts = ratio.split(":");
  const width = Number(parts[0]);
  const height = Number(parts[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return [width, height];
}

export function ratioReversedForDimensions(ratio: string, width: number, height: number, fallback = false): boolean {
  const parsed = parsedRatio(ratio);
  if (!parsed) return fallback;
  const [baseWidth, baseHeight] = parsed;
  if (baseWidth === baseHeight || width === height) return baseWidth === baseHeight ? false : fallback;
  return (width > height) !== (baseWidth > baseHeight);
}

export function dimensionsForRatio(
  ratio: string,
  reversed: boolean,
  currentWidth: number,
  currentHeight: number,
): ResolutionGeometry | null {
  const parsed = parsedRatio(ratio);
  if (!parsed) return null;
  const [baseWidth, baseHeight] = parsed;
  const ratioWidth = reversed ? baseHeight : baseWidth;
  const ratioHeight = reversed ? baseWidth : baseHeight;
  const longSide = clamp(Math.max(currentWidth, currentHeight), 256, 2048);
  const width = ratioWidth >= ratioHeight ? round64(longSide) : round64(longSide * ratioWidth / ratioHeight);
  const height = ratioHeight >= ratioWidth ? round64(longSide) : round64(longSide * ratioHeight / ratioWidth);
  return { width, height };
}

export function swapResolutionDimensions(width: number, height: number): ResolutionGeometry {
  return { width: height, height: width };
}
