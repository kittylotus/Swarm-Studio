import { openExpandedDialog } from '../ui/expanded-editor';
import { promptModes, type PromptMode } from './prompts';

const key = 'swarm-studio-enhancer-prompts-v1';
interface SavedPrompt { name: string; text: string }
interface PromptMemory { edits: Partial<Record<PromptMode, string>>; stash: SavedPrompt[] }

export function loadPromptMemory(): PromptMemory {
  const memory: PromptMemory = { edits: {}, stash: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    for (const mode of Object.keys(promptModes) as PromptMode[]) {
      if (typeof saved?.edits?.[mode] === 'string' && saved.edits[mode].trim()) memory.edits[mode] = saved.edits[mode];
    }
    if (Array.isArray(saved?.stash)) {
      for (const item of saved.stash) {
        if (typeof item?.name !== 'string' || !item.name.trim() || typeof item.text !== 'string' || !item.text.trim()) continue;
        if (!memory.stash.some(prompt => prompt.name === item.name.trim())) memory.stash.push({ name: item.name.trim(), text: item.text });
      }
    }
  } catch {}
  return memory;
}

export function savePromptMemory(memory: PromptMemory): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(memory));
    return true;
  } catch { return false; }
}

export function openPromptStash(editor: HTMLTextAreaElement, trigger: HTMLElement): void {
  const memory = loadPromptMemory();
  const content = document.createElement('div');
  content.className = 'enhancer-stash';
  content.innerHTML = `<p class="enhancer-stash-intro">Your reusable system prompts, saved on this device.</p>
    <section class="enhancer-stash-section" aria-labelledby="stash-browse-title">
      <div class="enhancer-stash-heading"><h3 id="stash-browse-title">Use a saved prompt</h3><span data-count></span></div>
      <label class="field"><span>Saved prompt</span><select aria-label="Saved prompt"></select></label>
      <p class="enhancer-stash-preview" data-preview></p>
      <div class="enhancer-stash-actions"><button class="secondary-button" type="button" data-load>Load prompt</button><button class="danger-soft" type="button" data-delete>Delete saved prompt</button></div>
      <p class="enhancer-stash-hint">Loading replaces the editor text. Choose Done in the editor to use it.</p>
    </section>
    <section class="enhancer-stash-section" aria-labelledby="stash-save-title">
      <h3 id="stash-save-title">Keep the current prompt</h3>
      <label class="field"><span>Prompt name</span><input aria-label="Prompt name" maxlength="100" placeholder="e.g. Soft portraits" /></label>
      <button class="primary-button" type="button" data-save>Save current prompt</button>
    </section>
    <p class="enhancer-stash-status" role="status" aria-live="polite"></p>`;
  const select = content.querySelector('select')!;
  const name = content.querySelector('input')!;
  const status = content.querySelector<HTMLElement>('[role="status"]')!;
  const load = content.querySelector<HTMLButtonElement>('[data-load]')!;
  const remove = content.querySelector<HTMLButtonElement>('[data-delete]')!;
  const preview = content.querySelector<HTMLElement>('[data-preview]')!;
  const syncPreview = () => {
    preview.textContent = memory.stash.find(item => item.name === select.value)?.text || 'No saved prompts yet. Give your current prompt a name below to start your stash.';
  };
  const refresh = () => {
    select.replaceChildren(...memory.stash.map(prompt => new Option(prompt.name, prompt.name)));
    if (!memory.stash.length) select.append(new Option('No saved prompts yet', ''));
    select.disabled = load.disabled = remove.disabled = !memory.stash.length;
    content.querySelector('[data-count]')!.textContent = `${memory.stash.length} saved`;
    syncPreview();
  };
  const persist = (next: SavedPrompt[]) => {
    if (!savePromptMemory({ ...loadPromptMemory(), stash: next })) {
      status.textContent = 'Could not save on this device. Free browser storage and try again.';
      return false;
    }
    memory.stash = next;
    refresh();
    return true;
  };
  const dialog = openExpandedDialog({ title: 'Prompt stash', content, trigger });
  dialog.classList.add('enhancer-stash-dialog');
  load.addEventListener('click', () => {
    const prompt = memory.stash.find(item => item.name === select.value);
    if (!prompt) return;
    editor.value = prompt.text;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    dialog.close();
  });
  select.addEventListener('change', () => { name.value = select.value; status.textContent = ''; syncPreview(); });
  remove.addEventListener('click', () => {
    const selected = select.value;
    if (persist(memory.stash.filter(item => item.name !== selected))) status.textContent = `Deleted “${selected}”.`;
  });
  content.querySelector('[data-save]')!.addEventListener('click', () => {
    const title = name.value.trim();
    if (!title || !editor.value.trim()) { status.textContent = 'Enter a name and a nonempty system prompt.'; return; }
    if (memory.stash.some(item => item.name.toLocaleLowerCase() === title.toLocaleLowerCase())) {
      status.textContent = 'That name already exists. Choose another name or delete the saved entry first.';
      return;
    }
    if (persist([...memory.stash, { name: title, text: editor.value }])) {
      select.value = title;
      syncPreview();
      status.textContent = `Saved “${title}”.`;
    }
  });
  refresh();
}
