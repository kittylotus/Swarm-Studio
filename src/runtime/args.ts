export function parseLaunchArgs(value: string): string[] {
  const input = String(value ?? "").trim();
  if (!input) return [];
  const args: string[] = [];
  let current = "";
  let quote = "";
  let escaped = false;
  for (const char of input) {
    if (escaped) { current += char; escaped = false; continue; }
    if (char === "\\" && quote === '"') { escaped = true; continue; }
    if (quote) {
      if (char === quote) quote = "";
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (/\s/.test(char)) {
      if (current) { args.push(current); current = ""; }
      continue;
    }
    current += char;
  }
  if (current) args.push(current);
  return args;
}

export function formatLaunchArgs(args: string[]): string {
  return args.map((arg) => /\s/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg).join(" ");
}

function normalizedCliFlag(flag: string): string {
  return String(flag ?? "").trim().toLowerCase();
}

export function hasCliFlag(args: string[], flag: string): boolean {
  const wanted = normalizedCliFlag(flag);
  return args.some((arg) => {
    const value = String(arg ?? "");
    return normalizedCliFlag(value) === wanted || normalizedCliFlag(value).startsWith(`${wanted}=`);
  });
}

export function readCliFlagValue(args: string[], flag: string): string {
  const wanted = normalizedCliFlag(flag);
  for (let index = 0; index < args.length; index += 1) {
    const current = String(args[index] ?? "");
    const normalized = normalizedCliFlag(current);
    if (normalized === wanted) {
      const next = String(args[index + 1] ?? "").trim();
      if (next && !next.startsWith("--")) return next;
      return "";
    }
    if (normalized.startsWith(`${wanted}=`)) return current.slice(current.indexOf("=") + 1).trim();
  }
  return "";
}

export function stripCliFlag(args: string[], flag: string): string[] {
  const wanted = normalizedCliFlag(flag);
  const next: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const current = String(args[index] ?? "");
    const normalized = normalizedCliFlag(current);
    if (normalized === wanted) {
      const following = String(args[index + 1] ?? "").trim();
      if (following && !following.startsWith("--")) index += 1;
      continue;
    }
    if (normalized.startsWith(`${wanted}=`)) continue;
    next.push(current);
  }
  return next;
}

export function applyCliFlag(args: string[], flag: string, value = ""): string[] {
  const next = stripCliFlag(args, flag);
  const trimmedValue = String(value ?? "").trim();
  if (!trimmedValue) return [...next, flag];
  return [...next, flag, trimmedValue];
}

export interface ComfyManagedRuntimeFlags {
  cudaDevice: string;
  disableDynamicVram: boolean;
  disablePinnedMemory: boolean;
  disableAsyncOffload: boolean;
}

export function mergeComfyRuntimeFlags(rawExtraArgs: string, options: ComfyManagedRuntimeFlags): string {
  let args = parseLaunchArgs(rawExtraArgs);
  for (const flag of ["--cuda-device", "--disable-dynamic-vram", "--disable-pinned-memory", "--disable-async-offload"]) {
    args = stripCliFlag(args, flag);
  }
  const cudaDevice = options.cudaDevice.trim();
  if (cudaDevice) args = applyCliFlag(args, "--cuda-device", cudaDevice);
  if (options.disableDynamicVram) args = applyCliFlag(args, "--disable-dynamic-vram");
  if (options.disablePinnedMemory) args = applyCliFlag(args, "--disable-pinned-memory");
  if (options.disableAsyncOffload) args = applyCliFlag(args, "--disable-async-offload");
  return formatLaunchArgs(args);
}
