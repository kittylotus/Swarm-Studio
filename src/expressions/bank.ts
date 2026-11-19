import { createId } from '../id';

const storageKey = 'swarm-studio-expression-bank-v1';
const bankLimit = 500;
type Direction = { name: string; prompt: string };
type Template = Direction & { id: string };
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function direction(raw: unknown): Direction {
    const value = raw as Partial<Direction> | null;
    if (typeof value?.name !== 'string' || !value.name.trim() || typeof value.prompt !== 'string')
        throw new Error('Each template needs a name and a prompt direction.');
    return { name: value.name.trim().slice(0, 80), prompt: value.prompt.trim().slice(0, 3000) };
}

function readBank(): Template[] {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (!Array.isArray(raw)) throw new Error('Could not read the custom expression bank.');
    return raw.map(item => ({ ...direction(item), id: String(item.id) }));
}

function writeBank(templates: Template[]): void {
    if (templates.length > bankLimit) throw new Error(`The bank can hold up to ${bankLimit} templates.`);
    localStorage.setItem(storageKey, JSON.stringify(templates));
}

function mergeBank(templates: Template[], extra: Direction[]): Template[] {
    for (const item of extra) {
        if (!templates.some(existing => existing.name === item.name && existing.prompt === item.prompt))
            templates.push({ ...item, id: createId() });
    }
    return templates;
}

interface BankActions {
    restoreFocus(): void;
    checkAdd(): void;
    add(item: Direction): void;
    export(json: string): void;
}

export function openExpressionBank(host: HTMLElement, startWithForm: boolean, actions: BankActions): void {
    if (host.querySelector('.expression-bank-dialog')) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'expression-bank-dialog';
    dialog.setAttribute('aria-labelledby', 'expression-bank-title');
    dialog.innerHTML = `
        <header><h2 id="expression-bank-title"></h2><button type="button" class="icon-button" data-bank-close aria-label="Close">×</button></header>
        <p class="expression-bank-error" role="alert" hidden></p>
        <div class="expression-bank-body"></div>`;
    const title = dialog.querySelector<HTMLElement>('h2')!;
    const body = dialog.querySelector<HTMLElement>('.expression-bank-body')!;
    const errorNote = dialog.querySelector<HTMLElement>('[role="alert"]')!;
    let search = '';
    const showError = (error: unknown) => {
        if (!dialog.isConnected) return;
        errorNote.textContent = error instanceof Error ? error.message : String(error);
        errorNote.hidden = false;
    };
    const close = () => dialog.close();
    const add = (item: Direction, saveCopy: boolean) => {
        actions.checkAdd();
        if (saveCopy) writeBank(mergeBank(readBank(), [item]));
        close();
        actions.add(item);
    };

    function showList(): void {
        title.textContent = 'Custom expression bank';
        errorNote.hidden = true;
        body.innerHTML = `
            <div class="expression-bank-tools">
                <input type="search" placeholder="Search templates…" aria-label="Search templates">
                <button type="button" class="secondary-button" data-import>Import</button>
                <button type="button" class="secondary-button" data-export>Export</button>
                <button type="button" class="primary-button" data-new>New template</button>
                <input type="file" accept=".json,application/json" hidden>
            </div>
            <div class="expression-bank-list"></div>
            <p class="helper-copy">Templates are saved in this copy of Studio and can be used in any sheet.</p>`;
        const searchInput = body.querySelector<HTMLInputElement>('input[type="search"]')!;
        const fileInput = body.querySelector<HTMLInputElement>('input[type="file"]')!;
        const list = body.querySelector<HTMLElement>('.expression-bank-list')!;
        searchInput.value = search;
        const drawList = () => {
            try {
                const templates = readBank();
                const query = search.trim().toLowerCase();
                const matches = templates.filter(item => `${item.name} ${item.prompt}`.toLowerCase().includes(query));
                list.innerHTML = matches.map(item => `<article class="expression-bank-entry">
                    <div><b>${escape(item.name)}</b><p>${escape(item.prompt)}</p></div>
                    <div class="expression-bank-actions">
                        <button type="button" class="secondary-button" data-use>Use</button>
                        <button type="button" class="ghost-button" data-edit>Edit</button>
                        <button type="button" class="danger-soft" data-delete>Delete</button>
                    </div>
                </article>`).join('') || `<p class="helper-copy">${templates.length ? 'No templates match.' : 'No saved templates yet.'}</p>`;
                list.querySelectorAll('article').forEach((entry, index) => {
                    const item = matches[index]!;
                    entry.querySelector('[data-use]')?.addEventListener('click', () => {
                        try { add(item, false); } catch (error) { showError(error); }
                    });
                    entry.querySelector('[data-edit]')?.addEventListener('click', () => showForm('edit', item));
                    entry.querySelector('[data-delete]')?.addEventListener('click', () => {
                        if (!window.confirm(`Delete the saved template “${item.name}”?`)) return;
                        try {
                            writeBank(readBank().filter(template => template.id !== item.id));
                            drawList();
                            body.querySelector<HTMLElement>('[data-new]')?.focus();
                        } catch (error) { showError(error); }
                    });
                });
            } catch (error) { showError(error); }
        };
        searchInput.addEventListener('input', () => { search = searchInput.value; drawList(); });
        body.querySelector('[data-new]')?.addEventListener('click', () => showForm('new'));
        body.querySelector('[data-import]')?.addEventListener('click', () => fileInput.click());
        body.querySelector('[data-export]')?.addEventListener('click', () => {
            try {
                const templates = readBank().map(({ name, prompt }) => ({ name, prompt }));
                actions.export(JSON.stringify({ version: 1, templates }, null, 2));
            } catch (error) { showError(error); }
        });
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files?.[0];
            fileInput.value = '';
            if (!file) return;
            try {
                if (file.size > 8 * 1024 * 1024) throw new Error('Choose a bank file under 8 MB.');
                const raw = JSON.parse(await file.text());
                if (!dialog.open || !fileInput.isConnected) return;
                if (raw?.version !== 1 || !Array.isArray(raw.templates) || raw.templates.length > bankLimit)
                    throw new Error('Choose a Swarm Studio expression bank JSON file.');
                writeBank(mergeBank(readBank(), raw.templates.map(direction)));
                search = '';
                showList();
            } catch (error) { showError(error); }
        });
        drawList();
        if (dialog.open) body.querySelector<HTMLElement>('[data-new]')?.focus();
    }

    function showForm(mode: 'add' | 'new' | 'edit', item?: Template): void {
        title.textContent = mode === 'add' ? 'Add custom expression' : mode === 'edit' ? 'Edit template' : 'New template';
        errorNote.hidden = true;
        body.innerHTML = `<form class="expression-bank-form">
            <label class="field"><span>Expression name</span><input name="name" maxlength="80" required placeholder="e.g. Wistful"></label>
            <label class="field"><span>Prompt direction</span><textarea name="prompt" rows="4" maxlength="3000" placeholder="What should the face and pose communicate?"></textarea></label>
            ${mode === 'add' ? '<label class="check-row"><input type="checkbox" name="reuse" checked>Save a reusable copy in my custom bank</label>' : ''}
            <div class="form-actions">
                <button type="button" class="secondary-button" data-back>${mode === 'add' ? 'Cancel' : 'Back to bank'}</button>
                <button type="submit" class="primary-button">${mode === 'add' ? 'Add expression' : 'Save template'}</button>
            </div></form>`;
        const form = body.querySelector('form')!;
        const name = form.querySelector<HTMLInputElement>('input[name="name"]')!;
        name.value = item?.name ?? '';
        form.querySelector('textarea')!.value = item?.prompt ?? '';
        form.querySelector('[data-back]')?.addEventListener('click', mode === 'add' ? close : showList);
        form.addEventListener('submit', event => {
            event.preventDefault();
            const data = new FormData(form);
            try {
                const template = direction({ name: data.get('name'), prompt: data.get('prompt') });
                if (mode === 'add') add(template, data.has('reuse'));
                else {
                    const bank = readBank();
                    writeBank(item ? bank.map(existing => existing.id === item.id ? { ...template, id: item.id } : existing) : mergeBank(bank, [template]));
                    search = '';
                    showList();
                }
            } catch (error) { showError(error); }
        });
        if (dialog.open) name.focus();
    }

    dialog.querySelector('[data-bank-close]')?.addEventListener('click', close);
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.addEventListener('close', () => {
        dialog.remove();
        if (!host.querySelector('dialog[open]')) actions.restoreFocus();
    }, { once: true });
    if (startWithForm) showForm('add');
    else showList();
    host.append(dialog);
    dialog.showModal();
    if (startWithForm) body.querySelector<HTMLElement>('input')?.focus({ preventScroll: true });
}
