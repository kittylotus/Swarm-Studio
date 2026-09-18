export type StudioKeybindAction =
  | "generate"
  | "nav-create"
  | "nav-library"
  | "nav-identities"
  | "nav-models"
  | "nav-civitai"
  | "nav-logs"
  | "nav-settings";

export interface StudioKeybindDefinition {
  id: StudioKeybindAction;
  label: string;
  description: string;
  group: "Generation" | "Navigation";
  defaultBinding: string;
  allowWhenEditing: boolean;
}

export type StudioKeybindMap = Record<StudioKeybindAction, string>;

export interface StudioKeybindPreferences {
  enabled: boolean;
  bindings: StudioKeybindMap;
}

export const STUDIO_KEYBIND_STORAGE_KEY = "swarm-studio-keybinds-v1";

export const STUDIO_KEYBIND_ACTIONS: readonly StudioKeybindDefinition[] = [
  { id: "generate", label: "Generate image", description: "Starts the current Create generation without stealing plain Enter from multiline prompts.", group: "Generation", defaultBinding: "Mod+Enter", allowWhenEditing: true },
  { id: "nav-create", label: "Open Create", description: "Jump to the prompt workspace.", group: "Navigation", defaultBinding: "Alt+1", allowWhenEditing: false },
  { id: "nav-library", label: "Open Library", description: "Jump to generated outputs and folders.", group: "Navigation", defaultBinding: "Alt+2", allowWhenEditing: false },
  { id: "nav-identities", label: "Open Identities", description: "Jump to reusable identity profiles.", group: "Navigation", defaultBinding: "Alt+3", allowWhenEditing: false },
  { id: "nav-models", label: "Open Models", description: "Jump to the local model inventory.", group: "Navigation", defaultBinding: "Alt+4", allowWhenEditing: false },
  { id: "nav-civitai", label: "Open CivitAI", description: "Jump to model discovery.", group: "Navigation", defaultBinding: "Alt+5", allowWhenEditing: false },
  { id: "nav-logs", label: "Open Logs", description: "Jump to runtime and generation logs.", group: "Navigation", defaultBinding: "Alt+6", allowWhenEditing: false },
  { id: "nav-settings", label: "Open Settings", description: "Jump to Studio settings.", group: "Navigation", defaultBinding: "Alt+7", allowWhenEditing: false },
] as const;

const actionIds = new Set<StudioKeybindAction>(STUDIO_KEYBIND_ACTIONS.map((item) => item.id));

export function defaultStudioKeybinds(): StudioKeybindMap {
  return Object.fromEntries(STUDIO_KEYBIND_ACTIONS.map((item) => [item.id, item.defaultBinding])) as StudioKeybindMap;
}

function canonicalKey(value: string): string {
  if (value === " ") return "Space";
  const key = value.trim();
  const lower = key.toLowerCase();
  if (!key) return "";
  if (lower === "spacebar" || lower === "space") return "Space";
  if (lower === "esc" || lower === "escape") return "Escape";
  if (lower === "arrowup") return "ArrowUp";
  if (lower === "arrowdown") return "ArrowDown";
  if (lower === "arrowleft") return "ArrowLeft";
  if (lower === "arrowright") return "ArrowRight";
  if (lower === "enter") return "Enter";
  if (lower === "tab") return "Tab";
  if (lower === "backspace") return "Backspace";
  if (lower === "delete" || lower === "del") return "Delete";
  if (lower === "home") return "Home";
  if (lower === "end") return "End";
  if (lower === "pageup") return "PageUp";
  if (lower === "pagedown") return "PageDown";
  if (/^f(?:[1-9]|1[0-2])$/i.test(key)) return key.toUpperCase();
  if (key.length === 1) return /[a-z]/i.test(key) ? key.toUpperCase() : key;
  return key;
}

export function normalizeKeybindBinding(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const tokens = value.split("+").map((token) => token.trim()).filter(Boolean);
  let mod = false;
  let alt = false;
  let shift = false;
  let key = "";
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (["mod", "ctrl", "control", "cmd", "command", "meta"].includes(lower)) mod = true;
    else if (lower === "alt" || lower === "option") alt = true;
    else if (lower === "shift") shift = true;
    else if (!key) key = canonicalKey(token);
    else return "";
  }
  if (!key) return "";
  return [mod ? "Mod" : "", alt ? "Alt" : "", shift ? "Shift" : "", key].filter(Boolean).join("+");
}

export interface KeybindEventLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

function eventKey(event: KeybindEventLike): string {
  if (/^Digit[0-9]$/.test(event.code ?? "")) return event.code!.slice(5);
  if (event.altKey && /^Key[A-Z]$/.test(event.code ?? "")) return event.code!.slice(3);
  return canonicalKey(event.key);
}

export function eventToKeybind(event: KeybindEventLike): string {
  if (["Control", "Meta", "Alt", "Shift"].includes(event.key)) return "";
  const key = eventKey(event);
  if (!key) return "";
  return [event.ctrlKey || event.metaKey ? "Mod" : "", event.altKey ? "Alt" : "", event.shiftKey ? "Shift" : "", key].filter(Boolean).join("+");
}

export function keybindMatches(binding: string, event: KeybindEventLike): boolean {
  const normalized = normalizeKeybindBinding(binding);
  return Boolean(normalized) && normalized === eventToKeybind(event);
}

export function keybindDisplay(binding: string): string {
  const normalized = normalizeKeybindBinding(binding);
  if (!normalized) return "Unbound";
  return normalized.split("+").map((token) => token === "Mod" ? "Ctrl/Cmd" : token).join(" + ");
}

export function normalizeStudioKeybindPreferences(value: unknown): StudioKeybindPreferences {
  const defaults = defaultStudioKeybinds();
  if (!value || typeof value !== "object") return { enabled: false, bindings: defaults };
  const raw = value as { enabled?: unknown; bindings?: unknown };
  const bindings = { ...defaults };
  if (raw.bindings && typeof raw.bindings === "object") {
    for (const [id, binding] of Object.entries(raw.bindings as Record<string, unknown>)) {
      if (!actionIds.has(id as StudioKeybindAction)) continue;
      bindings[id as StudioKeybindAction] = normalizeKeybindBinding(binding);
    }
  }
  return { enabled: raw.enabled === true, bindings };
}
