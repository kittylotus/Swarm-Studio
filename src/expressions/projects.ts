import { expressionProjectFiles } from '../runtime';
import type { SheetProject } from './pipeline';
import { projectActivity } from './activity';
export interface ProjectListing {
    root: string;
    folder: string;
    folders: string[];
    projects: {
        file: string;
        name: string;
        count: number;
        total: number;
        hasReference: boolean;
        needsIndex?: boolean;
        modified: number;
    }[];
    project?: SheetProject;
    reference?: string;
    summary?: ProjectListing['projects'][number];
}
export const projectFiles = (body: Record<string, unknown>) => expressionProjectFiles<ProjectListing>(body);
interface ProjectActions {
    current: {
        folder: string;
        file: string;
    };
    selectFolder(folder: string): Promise<void>;
    open(project: unknown, folder: string, file: string): Promise<void>;
    renamed(folder: string, file: string, name: string): void;
    deleted(folder: string, file: string): Promise<void>;
    create(folder: string): Promise<boolean>;
    importFile(folder: string): void;
    closed(): void;
    prepare(): Promise<void>;
}
const folderIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11H3Z"/></svg>';
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
export function openProjectBrowser(host: HTMLElement, initialFolder: string, actions: ProjectActions): void {
    if (host.querySelector('.expression-project-browser'))
        return;
    const dialog = document.createElement('dialog');
    dialog.className = 'expression-project-browser';
    dialog.setAttribute('aria-label', 'Expression projects');
    dialog.innerHTML = `<header><div>${folderIcon}<h2>Projects</h2></div><div class="project-manager-header-actions"><button type="button" class="secondary-button" data-import>Import file</button><button type="button" class="primary-button" data-new>New project</button><button type="button" class="icon-button" aria-label="Close projects">×</button></div></header>
    <div class="project-manager-tools"><button type="button" class="secondary-button project-folders-toggle" aria-expanded="false" aria-controls="project-manager-folders">Folders</button><nav class="project-manager-path" aria-label="Project folders"></nav><input type="search" aria-label="Search projects" placeholder="Search projects…"></div>
    <div class="project-manager-workspace"><aside id="project-manager-folders" aria-label="Folders"><div class="project-manager-folder-heading"><b>Folders</b><button type="button" class="icon-button" aria-label="New folder">＋</button></div><div data-folders></div></aside><section class="project-manager-files" aria-label="Projects in this folder"></section><div class="project-manager-operation" hidden></div></div>
    <p class="project-manager-error" role="alert" hidden></p><footer><span data-location></span><button type="button" class="secondary-button" data-retry hidden>Retry</button><button type="button" class="secondary-button" data-use-folder>Save current project here</button></footer>`;
    let folder = initialFolder, busy = false, request = 0, listing: ProjectListing | undefined;
    let covers: IntersectionObserver | undefined;
    const previewCache = new Map<string, Promise<ProjectListing>>();
    let activePreviews = 0;
    const previewQueue: Array<() => void> = [];
    const fetchPreview = async (body: Record<string, unknown>): Promise<ProjectListing> => {
        if (activePreviews >= 2) await new Promise<void>(resolve => previewQueue.push(resolve));
        else activePreviews++;
        try {
            if (!dialog.open) return {} as ProjectListing;
            return await projectFiles(body);
        } finally {
            const next = previewQueue.shift();
            if (next) next();
            else activePreviews--;
        }
    };
    const files = dialog.querySelector<HTMLElement>('.project-manager-files')!;
    const note = dialog.querySelector<HTMLElement>('[role="alert"]')!;
    const search = dialog.querySelector<HTMLInputElement>('input[type="search"]')!;
    const retry = dialog.querySelector<HTMLButtonElement>('[data-retry]')!;
    const report = (error: unknown) => {
        note.textContent = error instanceof Error ? error.message : String(error);
        note.hidden = false;
        retry.hidden = false;
        dialog.querySelector<HTMLElement>('footer')!.hidden = false;
    };
    const button = (label: string, action: () => void, className = 'secondary-button') => {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = className;
        node.textContent = label;
        node.addEventListener('click', action);
        return node;
    };
    const mutate = async (action: () => Promise<void>, label = 'Updating projects…') => {
        if (busy)
            return;
        busy = true;
        dialog.setAttribute('aria-busy', 'true');
        const operation = dialog.querySelector<HTMLElement>('.project-manager-operation')!;
        operation.innerHTML = projectActivity(label);
        operation.hidden = false;
        dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input').forEach(node => { node.disabled = true; });
        try {
            await action();
        }
        catch (error) {
            if (dialog.isConnected)
                report(error);
        }
        finally {
            busy = false;
            operation.hidden = true;
            dialog.removeAttribute('aria-busy');
            dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input').forEach(node => { node.disabled = false; });
        }
    };
    const navigate = (next: string) => { if (!busy) {
        folder = next;
        search.value = '';
        void load();
    } };
    const drawFiles = () => {
        if (!listing)
            return;
        const generation = request, currentFolder = folder;
        covers?.disconnect();
        covers = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const card = entry.target as HTMLElement;
                covers?.unobserve(card);
                const project = listing?.projects.find(project => project.file === card.dataset.projectFile);
                if (!project) continue;
                const key = currentFolder + '/' + project.file + ':' + project.modified;
                let preview = previewCache.get(key);
                if (!preview) {
                    preview = fetchPreview({ action: project.needsIndex ? 'inspect' : 'cover', folder: currentFolder, file:project.file }).then(async result => {
                        if (!result.reference && project.hasReference && dialog.open) result = await fetchPreview({ action:'inspect',folder:currentFolder,file:project.file });
                        if (result.reference && (result.summary || result.reference.length > 60_000)) {
                            const image = new Image();
                            image.src = result.reference;
                            await image.decode();
                            const canvas = document.createElement('canvas');
                            const scale = Math.min(1,256 / Math.max(image.width,image.height));
                            canvas.width = Math.max(1,Math.round(image.width * scale));
                            canvas.height = Math.max(1,Math.round(image.height * scale));
                            canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
                            result.reference = canvas.toDataURL('image/webp',.75);
                            void projectFiles({ action:'cache-cover',folder:currentFolder,file:project.file,modified:result.summary?.modified ?? project.modified,cover:result.reference }).catch(() => {});
                        }
                        return result;
                    });
                    if (previewCache.size >= 64) previewCache.delete(previewCache.keys().next().value!);
                    previewCache.set(key,preview);
                }
                void preview.then(result => {
                    if (result.summary) {
                        Object.assign(project,result.summary,{ needsIndex:false });
                        if (card.isConnected) {
                            card.querySelector('.project-file-caption b')!.textContent = project.name;
                            card.querySelector('.project-file-caption span')!.textContent = `${project.count} / ${project.total} portraits`;
                            card.querySelector('button')!.setAttribute('aria-label',`Open ${project.name}`);
                        }
                    }
                    if (!dialog.open || generation !== request || !card.isConnected || !result.reference) return;
                    const image = document.createElement('img');
                    image.src = result.reference;
                    image.alt = '';
                    card.querySelector('.project-file-cover > span')?.replaceWith(image);
                }).catch(() => {});
            }
        }, { root: files, rootMargin: '100px' });
        const matches = listing.projects.filter(project => project.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()));
        files.replaceChildren();
        for (const project of matches) {
            const active = actions.current.folder === folder && actions.current.file === project.file;
            const card = document.createElement('article');
            card.className = 'project-file-card';
            card.innerHTML = `<button type="button" class="project-file-open" aria-label="Open ${escape(project.name)}"><div class="project-file-cover"><span aria-hidden="true">${escape([...project.name][0]?.toUpperCase() ?? 'P')}</span>${active ? '<small>Current</small>' : ''}</div><div class="project-file-caption"><b>${escape(project.name)}</b><span>${project.count} / ${project.total} portraits</span></div></button><div class="project-file-actions"><button type="button" class="ghost-button" data-rename>Rename</button><button type="button" class="ghost-button" data-delete>Delete</button></div>`;
            card.querySelector('.project-file-open')!.addEventListener('click', () => void mutate(async () => {
                const result = await projectFiles({ action: 'open', folder: currentFolder, file: project.file });
                if (!dialog.open)
                    return;
                await actions.open(result.project, currentFolder, project.file);
                dialog.close();
            }, 'Opening project…'));
            card.querySelector('[data-rename]')!.addEventListener('click', () => {
                if (busy || card.querySelector('form'))
                    return;
                const form = document.createElement('form');
                form.className = 'project-rename-form';
                form.innerHTML = '<label class="field"><span>Project name</span><input required maxlength="120"></label><div><button type="submit" class="primary-button">Save name</button><button type="button" class="ghost-button">Cancel</button></div>';
                const input = form.querySelector('input')!;
                input.value = project.name;
                form.querySelector('[type="button"]')!.addEventListener('click', () => {
                    form.remove();
                    card.querySelector<HTMLElement>('[data-rename]')?.focus();
                });
                form.addEventListener('submit', event => {
                    event.preventDefault();
                    const name = input.value.trim();
                    if (!name) {
                        input.focus();
                        return;
                    }
                    void mutate(async () => {
                        await actions.prepare();
                        await projectFiles({ action: 'rename', folder: currentFolder, file: project.file, name });
                        actions.renamed(currentFolder, project.file, name);
                        await load();
                    });
                });
                card.append(form);
                input.focus();
                input.select();
            });
            card.querySelector('[data-delete]')!.addEventListener('click', () => {
                if (busy)
                    return;
                if (!window.confirm(`Delete project “${project.name}” and its saved portraits from this project folder?`))
                    return;
                void mutate(async () => { await actions.prepare(); await projectFiles({ action: 'delete', folder: currentFolder, file: project.file }); await actions.deleted(currentFolder, project.file); await load(); });
            });
            files.append(card);
            if (project.hasReference || project.needsIndex) {
                card.dataset.projectFile = project.file;
                covers.observe(card);
            }
        }
        if (!matches.length) {
            if (search.value) {
                const empty = document.createElement('p');
                empty.className = 'project-empty';
                empty.textContent = 'No projects match your search.';
                files.append(empty);
            }
            else
                files.append(button('Start your first project in this folder', () => void mutate(async () => { if (await actions.create(folder)) dialog.close(); }), 'project-empty'));
        }
    };
    async function load(): Promise<void> {
        const generation = ++request;
        listing = undefined;
        note.hidden = retry.hidden = true;
        files.setAttribute('aria-busy', 'true');
        files.innerHTML = projectActivity('Opening folder…');
        try {
            const result = await projectFiles({ action: 'list', folder });
            if (!dialog.open || generation !== request)
                return;
            listing = result;
            const nav = dialog.querySelector('nav')!;
            nav.replaceChildren(button('Projects', () => navigate('')));
            folder.split('/').filter(Boolean).forEach((name, index, parts) => nav.append(button(name, () => navigate(parts.slice(0, index + 1).join('/')))));
            const folders = dialog.querySelector('[data-folders]')!;
            folders.replaceChildren(button('Project root', () => navigate(''), 'project-folder'));
            if (folder)
                folders.append(button('↑ Parent folder', () => navigate(folder.split('/').slice(0, -1).join('/')), 'project-folder'));
            result.folders.forEach(name => {
                const item = button(name, () => navigate([folder, name].filter(Boolean).join('/')), 'project-folder');
                item.insertAdjacentHTML('afterbegin', folderIcon);
                folders.append(item);
            });
            const location = dialog.querySelector<HTMLElement>('[data-location]')!;
            location.textContent = folder || 'Expressions';
            location.title = result.root + (folder ? '/' + folder : '');
            drawFiles();
            dialog.querySelector<HTMLElement>('footer')!.hidden = folder === actions.current.folder && result.projects.some(project => project.file === actions.current.file);
        }
        catch (error) {
            if (generation === request && dialog.open) {
                files.textContent = 'This folder could not be opened.';
                report(error);
            }
        }
        finally {
            if (generation === request)
                files.removeAttribute('aria-busy');
        }
    }
    search.addEventListener('input', drawFiles);
    dialog.querySelector('[aria-label="Close projects"]')!.addEventListener('click', () => dialog.close());
    dialog.querySelector('.project-folders-toggle')!.addEventListener('click', event => {
        const button = event.currentTarget as HTMLButtonElement;
        const expanded = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded',String(expanded));
        dialog.toggleAttribute('data-folders-open',expanded);
    });
    dialog.querySelector('[data-import]')!.addEventListener('click', () => { dialog.close(); actions.importFile(folder); });
    dialog.querySelector('[data-new]')!.addEventListener('click', () => void mutate(async () => { if (await actions.create(folder)) dialog.close(); }));
    dialog.querySelector('[data-use-folder]')!.addEventListener('click', () => void mutate(async () => { await actions.selectFolder(folder); dialog.close(); }, 'Saving project…'));
    dialog.querySelector('[aria-label="New folder"]')!.addEventListener('click', () => {
        const name = window.prompt('Folder name')?.trim();
        if (!name)
            return;
        void mutate(async () => { const next = [folder, name].filter(Boolean).join('/'); await projectFiles({ action: 'mkdir', folder: next }); folder = next; search.value = ''; await load(); });
    });
    retry.addEventListener('click', () => void load());
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.addEventListener('cancel', event => { if (busy)
        event.preventDefault(); });
    dialog.addEventListener('close', () => { request++; covers?.disconnect(); dialog.remove(); actions.closed(); host.querySelector<HTMLElement>('[popovertarget="expression-project-menu"]')?.focus({ preventScroll: true }); }, { once: true });
    host.append(dialog);
    dialog.showModal();
    void load();
}
