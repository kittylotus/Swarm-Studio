import { createId } from '../id';
import './expanded-editor.css';

const expandIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M432 320v112H320m101.8-10.23L304 304M80 192V80h112M90.2 90.23L208 208M320 80h112v112M421.77 90.2L304 208M192 432H80V320m10.23 101.8L208 304"/></svg>`;

interface ExpandedDialogOptions {
  title: string;
  content: HTMLElement;
  actions?: readonly HTMLElement[];
  trigger?: HTMLElement;
}

export function openExpandedDialog({ title, content, actions = [], trigger }: ExpandedDialogOptions): HTMLDialogElement {
  const previousFocus = trigger ?? document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'expanded-editor-dialog';
  const header = document.createElement('header');
  const heading = document.createElement('h2');
  heading.id = `expanded-editor-${createId()}`;
  heading.textContent = title;
  heading.tabIndex = -1;
  heading.autofocus = true;
  dialog.setAttribute('aria-labelledby', heading.id);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-button';
  close.setAttribute('aria-label', 'Close expanded editor');
  close.textContent = '×';
  close.addEventListener('click', () => dialog.close());
  const tools = document.createElement('div');
  tools.className = 'expanded-editor-actions';
  tools.append(...actions, close);
  header.append(heading, tools);
  dialog.append(header, content);
  const viewport = window.visualViewport;
  const viewportEvents = new AbortController();
  if (viewport) {
    const fitViewport = () => {
      dialog.style.setProperty('--expanded-viewport-height', `${viewport.height}px`);
      dialog.style.setProperty('--expanded-viewport-top', `${viewport.offsetTop}px`);
    };
    viewport.addEventListener('resize', fitViewport, { signal: viewportEvents.signal });
    viewport.addEventListener('scroll', fitViewport, { signal: viewportEvents.signal });
    fitViewport();
  }
  dialog.addEventListener('close', () => {
    viewportEvents.abort();
    dialog.remove();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

interface ExpandedEditorOptions {
  title: string;
  value: string;
  trigger?: HTMLElement;
  description?: string;
  actions?: (editor: HTMLTextAreaElement) => readonly HTMLElement[];
  save(value: string): string | void;
}

export function openExpandedEditor({ title, value, trigger, description, actions, save }: ExpandedEditorOptions): void {
  const content = document.createElement('div');
  content.className = 'expanded-editor-content';
  const editor = document.createElement('textarea');
  editor.setAttribute('aria-label', title);
  editor.value = value;
  if (description) {
    const hint = document.createElement('p');
    hint.id = `expanded-editor-hint-${createId()}`;
    hint.className = 'expanded-editor-hint';
    hint.textContent = description;
    editor.setAttribute('aria-describedby', hint.id);
    content.append(hint);
  }
  const status = document.createElement('p');
  status.className = 'expanded-editor-status';
  status.setAttribute('role', 'status');
  editor.addEventListener('input', () => { status.textContent = ''; });
  content.append(editor, status);

  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'primary-button';
  done.textContent = 'Done';
  const dialog = openExpandedDialog({ title, content, actions: [...(actions?.(editor) ?? []), done], trigger });
  done.addEventListener('click', () => {
    const error = save(editor.value);
    if (error) status.textContent = error;
    else dialog.close();
  });
}

export function bindExpandedField(field: HTMLTextAreaElement, title: string, resolveField: () => HTMLTextAreaElement | null = () => field): HTMLButtonElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'expandable-field';
  const expand = document.createElement('button');
  expand.type = 'button';
  expand.disabled = field.disabled;
  expand.className = 'icon-button expandable-field-button';
  expand.title = `Expand ${title.toLowerCase()}`;
  expand.setAttribute('aria-label', expand.title);
  expand.setAttribute('aria-haspopup', 'dialog');
  expand.innerHTML = expandIcon;
  field.before(wrapper);
  field.classList.add('expandable-field-input');
  wrapper.append(field, expand);
  expand.addEventListener('click', () => {
    const original = field.value;
    openExpandedEditor({ title, value: original, trigger: expand, save: value => {
      if (value === original) return;
      const current = resolveField();
      if (!current?.isConnected || current.disabled || current.readOnly || current.value !== original) {
        return 'The original field changed while you were editing. Copy your edits before closing.';
      }
      current.value = value;
      current.dispatchEvent(new Event('input', { bubbles: true }));
      current.dispatchEvent(new Event('change', { bubbles: true }));
    } });
  });
  return expand;
}

export function bindExpandedFields(root: ParentNode): void {
  for (const field of root.querySelectorAll<HTMLTextAreaElement>('textarea[data-expand-editor]:not(.expandable-field-input)')) {
    const title = field.labels?.[0]?.textContent?.trim();
    if (title) bindExpandedField(field, title);
  }
}
