import type { SwarmPreset } from "./types";

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Recover preset-only inputs from older AddImageToHistory records using current presets.
 * Mirrors Swarm's preset before/after {value} handling. This cannot recover edited
 * historical preset definitions or already-lost random/wildcard expansions.
 */
export function recoverPresetParameters(source: Record<string, unknown>, presets: SwarmPreset[]): Record<string, unknown> {
  const params = Object.fromEntries(Object.entries(source).map(([name, value]) => [key(name), value]));
  const expand = (text: string, channel: "prompt" | "negativeprompt", ancestors: string[] = []): string => {
    let before = "";
    let after = "";
    const body = text.replace(/<(?:preset|p):([^>]+)>/gi, (_, rawName: string) => {
      const name = rawName.trim();
      if (ancestors.includes(name) || ancestors.length >= 16) throw new Error(`Recursive preset: ${name}`);
      const preset = presets.find((item) => item.title === name);
      if (!preset) throw new Error(`Preset "${name}" is not available on this Swarm account.`);
      const map = Object.fromEntries(Object.entries(preset.param_map).map(([name, value]) => [key(name), value]));
      for (const [name, value] of Object.entries(map)) {
        if (name === channel) continue;
        params[name] = typeof value === "string" && value.includes("{value}")
          ? value.replaceAll("{value}", String(params[name] ?? "")) : value;
      }
      if (map[channel] != null) {
        const template = String(map[channel]);
        const split = template.indexOf("{value}");
        const nested = [...ancestors, name];
        if (split >= 0) {
          before += expand(template.slice(0, split), channel, nested);
          after += expand(template.slice(split + 7), channel, nested);
        } else {
          after += expand(template, channel, nested);
        }
      }
      return "";
    });
    return before + body + after;
  };
  params.prompt = expand(String(params.prompt ?? ""), "prompt");
  params.negativeprompt = expand(String(params.negativeprompt ?? ""), "negativeprompt");
  return params;
}
