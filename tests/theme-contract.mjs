import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  builtInThemes,
  defaultTheme,
  isLightTheme,
  normalizeStudioTheme,
  themeFontStack,
} from '../src/theme.ts';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const app = readFileSync(join(root, 'src/app.ts'), 'utf8');
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');
const store = readFileSync(join(root, 'src/library/store.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(builtInThemes.map((profile) => profile.name).join('|') === 'Vibecoder Purple|Shrek|Bubbly McBubbles|Sticky White Substance', 'Built-in theme names must keep the intentionally unserious canonical labels.');
const shrek = builtInThemes.find((profile) => profile.id === 'mint');
const bubbly = builtInThemes.find((profile) => profile.id === 'bubblegum');
const sticky = builtInThemes.find((profile) => profile.id === 'minimal');
assert(shrek?.theme.titleFont === 'comic' && shrek?.theme.subtitleFont === 'comic', 'Shrek must commit to Comic Sans heading crimes.');
assert(themeFontStack('comic').includes('Comic Sans MS'), 'Comic font stack must include Comic Sans MS.');
assert(Boolean(bubbly) && isLightTheme(bubbly.theme.background), 'Bubbly McBubbles must be a genuine light princess-core theme.');
assert(Boolean(sticky) && isLightTheme(sticky.theme.background), 'Sticky White Substance must be a genuine light neutral theme.');
assert(!isLightTheme(defaultTheme.background), 'Vibecoder Purple must remain a dark theme.');

const migrated = normalizeStudioTheme({ accent: '#123456', radius: 99, titleFont: 'nonsense' });
assert(migrated.accent === '#123456', 'Theme migration must preserve supplied legacy colors.');
assert(migrated.surfaceAlt === defaultTheme.surfaceAlt && migrated.success === defaultTheme.success && migrated.dangerSurface === defaultTheme.dangerSurface, 'Legacy themes must receive new semantic/utility defaults.');
assert(migrated.radius === 32, 'Theme normalization must clamp shape values.');
assert(migrated.titleFont === defaultTheme.titleFont, 'Unknown font keys must fall back safely.');

for (const profile of builtInThemes) {
  for (const key of ['surfaceAlt', 'success', 'warning', 'danger', 'dangerSurface', 'titleFont', 'subtitleFont']) {
    assert(Boolean(profile.theme[key]), `${profile.name} is missing ${key}.`);
  }
}

assert(store.includes('normalizeStudioTheme(parsed.theme)') && store.includes('theme: normalizeStudioTheme(raw.theme)'), 'Persisted themes and saved profiles must migrate through the shared normalizer.');
assert(app.includes('style.setProperty("--surface-alt", theme.surfaceAlt)') && app.includes('style.setProperty("--success", theme.success)') && app.includes('style.setProperty("--danger-surface", theme.dangerSurface)'), 'Theme application must publish semantic/utility CSS variables.');
assert(app.includes('style.setProperty("--font-title", themeFontStack(theme.titleFont))') && app.includes('style.setProperty("--font-subtitle", themeFontStack(theme.subtitleFont))'), 'Theme application must publish title/subtitle font stacks.');
assert(app.includes('root.style.colorScheme = isLightTheme(theme.background) ? "light" : "dark"'), 'Theme application must switch native light/dark color-scheme.');
assert(app.includes('fontField("titleFont"') && app.includes('fontField("subtitleFont"'), 'Appearance settings must expose title and subtitle font selectors.');
assert(app.includes('colorField("danger", "Danger text + icons", theme.danger)') && app.includes('colorField("surfaceAlt", "Utility surface", theme.surfaceAlt)'), 'Appearance settings must expose destructive and neutral utility surfaces.');
assert(css.includes('.status-chip.is-online {') && css.includes('border-color: color-mix(in srgb,var(--success)'), 'Online state must have a themeable semantic border.');
assert(css.includes('.link-dimensions.is-active { color: var(--accent);'), 'Linked resolution state must use the primary theme accent instead of the legacy secondary color.');
assert(css.includes('.log-console {') && css.includes('background: var(--surface-alt);'), 'Logs must use the themeable utility surface instead of a fixed dark gray mix.');
assert(css.includes('.log-row--warn p { color: var(--warning); }') && css.includes('.danger-icon { color:var(--danger) !important; }'), 'Warning and destructive UI must use semantic theme colors.');
assert(css.includes('color-scheme: inherit;') && css.includes('color-scheme:inherit;'), 'Nested selects must not force dark native controls inside light themes.');
assert(css.includes('font-family: var(--font-title);') && css.includes('font-family: var(--font-subtitle);'), 'Heading typography must resolve through theme font tokens.');

console.log('Theme contract OK.');
