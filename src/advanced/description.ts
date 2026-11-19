const escape = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const allowed = new Set(['p', 'br', 'b', 'strong', 'em', 'i', 'code', 'ul', 'ol', 'li']);
const discarded = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template']);

/** Server descriptions are untrusted HTML, never application markup. */
export function serverDescription(value: string): string {
  // Template contents are inert: images and other source markup never mount in the document.
  const template = document.createElement('template');
  template.innerHTML = value;
  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escape(node.textContent || '');
    if (!(node instanceof HTMLElement)) return '';
    const tag = node.localName;
    if (discarded.has(tag)) return '';
    const content = [...node.childNodes].map(serialize).join('');
    if (tag === 'a') {
      try {
        const url = new URL(node.getAttribute('href') || '');
        if (url.protocol === 'https:' || url.protocol === 'http:') return `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${content}</a>`;
      } catch { /* Relative and malformed URLs are displayed as text. */ }
      return content;
    }
    if (!allowed.has(tag)) return content;
    return tag === 'br' ? '<br>' : `<${tag}>${content}</${tag}>`;
  };
  return [...template.content.childNodes].map(serialize).join('');
}
