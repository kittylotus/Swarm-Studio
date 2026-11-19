export function projectActivity(label: string): string {
    return `<div class="project-activity" role="status" aria-live="polite"><span aria-hidden="true"></span><b>${label}</b><div class="library-sync-meter"><i></i></div></div>`;
}

export function showProjectActivity(host: HTMLElement, label: string): () => void {
    const dialog = document.createElement('dialog');
    dialog.className = 'expression-project-progress';
    dialog.setAttribute('aria-label', label);
    dialog.innerHTML = projectActivity(label);
    dialog.addEventListener('cancel', event => event.preventDefault());
    host.ownerDocument.body.append(dialog);
    dialog.showModal();
    return () => { dialog.close(); dialog.remove(); };
}
