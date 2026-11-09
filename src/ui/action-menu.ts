import './action-menu.css';

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** A disclosure of ordinary actions: native dismissal and Tab order, without fake menu roles. */
export function actionMenu(id: string, label: string, title: string, content: string, primary = false): string {
  return `<div class="studio-action-group"><button type="button" class="${primary ? 'primary-button' : 'secondary-button'} studio-menu-trigger" popovertarget="${id}" aria-controls="${id}" aria-expanded="false"><span>${escape(label)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>
    <section id="${id}" popover="auto" class="studio-action-menu" aria-labelledby="${id}-title"><header><span class="panel-kicker" id="${id}-title">${escape(title)}</span></header>${content}</section></div>`;
}

const cleanups = new WeakMap<HTMLElement, () => void>();
export function bindActionMenus(root: HTMLElement): void {
  cleanups.get(root)?.();
  const controllers = new Set<AbortController>();
  cleanups.set(root, () => controllers.forEach(controller => controller.abort()));
  root.querySelectorAll<HTMLElement>('.studio-action-menu').forEach(menu => {
    const trigger = root.querySelector<HTMLButtonElement>(`[popovertarget="${CSS.escape(menu.id)}"]`);
    const position = () => {
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = menu.offsetWidth || Math.min(280, innerWidth - 24);
      const height = menu.offsetHeight || 0;
      menu.style.left = `${Math.max(12, Math.min(rect.right - width, innerWidth - width - 12))}px`;
      menu.style.top = `${Math.max(12, Math.min(rect.bottom + 8, innerHeight - height - 12))}px`;
    };
    let controller: AbortController | undefined;
    menu.addEventListener('beforetoggle', event => {
      if ((event as ToggleEvent).newState === 'open') position();
      else if (controller) { controller.abort(); controllers.delete(controller); }
    });
    menu.addEventListener('toggle', () => {
      const open = menu.matches(':popover-open');
      trigger?.setAttribute('aria-expanded', String(open));
      if (open) {
        position(); menu.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')?.focus({preventScroll:true});
        controller = new AbortController(); controllers.add(controller);
        window.addEventListener('resize', position, {signal:controller.signal});
        window.addEventListener('scroll', event => { if (!menu.contains(event.target as Node) && menu.matches(':popover-open')) menu.hidePopover(); }, {capture:true,signal:controller.signal});
      }
    });
    menu.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button || button.disabled) return;
      if (menu.isConnected && menu.matches(':popover-open')) menu.hidePopover();
      // An action may redraw its owner. Restore its replacement trigger without stealing
      // focus from a dialog or from a destination view that no longer has this disclosure.
      if (!menu.isConnected) queueMicrotask(() => {
        if (!document.querySelector('dialog[open]')) root.querySelector<HTMLElement>(`[popovertarget="${CSS.escape(menu.id)}"]`)?.focus({preventScroll:true});
      });
    });
  });
}
