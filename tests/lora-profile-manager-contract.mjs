import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const app = readFileSync(join(root, 'src/app.ts'), 'utf8');
const store = readFileSync(join(root, 'src/library/store.ts'), 'utf8');
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(app.includes('data-action="manage-lora-profiles"'), 'Composer must expose a discoverable saved-stack manager action.');
assert(app.includes('Manage saved stacks') && app.includes('renderLoraProfileManagerModal()'), 'Saved-stack manager modal must render from the main shell.');
assert(app.includes('data-lora-profile-weight') && app.includes('data-lora-profile-trigger') && app.includes('data-lora-profile-remove'), 'Saved stacks must support direct weight, trigger, and membership edits.');
assert(app.includes("[data-action='profile-use-current']") && app.includes("[data-action='profile-load-composer']"), 'Manager must support current→saved and saved→composer workflows.');
assert(app.includes("[data-action='save-lora-profile-edits']") && app.includes('updateLoraProfile('), 'Manager edits must persist through a dedicated update path rather than creating duplicates.');
assert(app.includes('cloneStack(this.loraProfileManagerDraftItems)'), 'Loading an edited saved stack into the composer must clone item ids instead of aliasing profile state.');
assert(app.includes('loraProfileManagerDeleteArmed') && app.includes('Confirm delete'), 'Saved-stack deletion must require an explicit second action.');
assert(store.includes('updateLoraProfile(id: string') && store.includes('updatedAt: Date.now()'), 'Store must update saved stacks in place and refresh updatedAt.');
assert(store.includes('patch.items === undefined ? cloneLoraStack(current.items) : cloneLoraStack(patch.items)'), 'Saved profile updates must clone LoRA items rather than aliasing editor state.');
assert(store.includes('this.state.loraProfiles = this.state.loraProfiles.map((profile) => profile.id === id ? updated : profile)'), 'Saved profile update must preserve the existing record position/id instead of inserting a duplicate.');
assert(store.includes('this.state.loraProfiles = this.state.loraProfiles.filter((profile) => profile.id !== id)'), 'Saved profile deletion must remove the persisted record.');
assert(css.includes('/* saved LoRA stack manager */') && css.includes('.lora-profile-manager-modal') && css.includes('@media (max-width:760px)'), 'Saved-stack manager needs desktop and mobile layout styles.');

console.log('LoRA profile manager contract OK.');
