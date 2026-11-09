import { randomBytes } from 'node:crypto';
import { once } from 'node:events';

export function validateLlmRelayRequest(raw, kind = 'stream') {
  if (!raw || typeof raw !== 'object' || typeof raw.url !== 'string' || (kind === 'stream' && (!raw.body || typeof raw.body !== 'object' || Array.isArray(raw.body)))) throw new Error('Invalid LLM request.');
  const target = new URL(raw.url);
  const validEndpoint = kind === 'models' ? target.pathname.endsWith('/models') : /(?:\/responses|\/messages|\/chat\/completions|\/models\/[^/]+:streamGenerateContent)$/.test(target.pathname);
  if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password || target.hash || !validEndpoint || (kind === 'stream' && target.search && target.search !== '?alt=sse')) throw new Error('Invalid LLM endpoint.');
  if (kind === 'models') {
    const seen = new Set();
    for (const [key, value] of target.searchParams) {
      if (!['pageSize', 'pageToken', 'limit', 'after_id'].includes(key) || seen.has(key) || value.length > 4096 || (['pageSize', 'limit'].includes(key) && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 1000))) throw new Error('Invalid model pagination.');
      seen.add(key);
    }
  }
  const headers = { 'content-type': 'application/json', accept: kind === 'models' ? 'application/json' : 'text/event-stream' };
  for (const [key, value] of Object.entries(raw.headers || {})) {
    if (!['authorization', 'x-api-key', 'x-goog-api-key', 'anthropic-version', 'content-type'].includes(key.toLowerCase()) || typeof value !== 'string' || /[\r\n]/.test(value)) throw new Error('Invalid LLM header.');
    headers[key.toLowerCase()] = value;
  }
  return { url: target.href, headers, ...(kind === 'stream' ? { body: JSON.stringify(raw.body) } : {}) };
}

export function llmRelayPlugin() {
  const token = randomBytes(32).toString('hex');
  const install = server => { server.middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith('/__studio/llm/')) return next();
    res.setHeader('cache-control', 'no-store');
    const sameOrigin = () => { try { return new URL(String(req.headers.origin)).host === req.headers.host; } catch { return false; } };
    if (req.url === '/__studio/llm/session' && req.method === 'GET' && req.headers['sec-fetch-site'] !== 'cross-site') {
      res.setHeader('set-cookie', `studio_llm=${token}; HttpOnly; SameSite=Strict; Path=/__studio/llm`);
      res.setHeader('content-type', 'application/json'); res.end('{"available":true}'); return;
    }
    const kind = req.url === '/__studio/llm/models' ? 'models' : 'stream';
    if (!['/__studio/llm/stream', '/__studio/llm/models'].includes(req.url) || req.method !== 'POST') { res.statusCode = 404; res.end(); return; }
    const cookie = String(req.headers.cookie || '').split(';').map(v => v.trim()).includes(`studio_llm=${token}`);
    if (!sameOrigin() || !cookie || !String(req.headers['content-type']).startsWith('application/json')) { res.statusCode = 403; res.end(); return; }
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), kind === 'models' ? 20_000 : 180_000);
    res.on('close', () => abort.abort());
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) throw new Error('Request too large.'); chunks.push(chunk); }
      const request = validateLlmRelayRequest(JSON.parse(Buffer.concat(chunks).toString('utf8')), kind);
      const upstream = await fetch(request.url, { method: kind === 'models' ? 'GET' : 'POST', headers: request.headers, body: request.body, redirect: 'error', signal: abort.signal });
      if (!upstream.ok || !upstream.body || !upstream.headers.get('content-type')?.includes(kind === 'models' ? 'application/json' : 'text/event-stream')) {
        await upstream.body?.cancel(); res.statusCode = upstream.ok ? 502 : upstream.status; res.end('LLM provider rejected the request or did not return SSE.'); return;
      }
      if (kind === 'models') {
        const parts = []; let bytes = 0;
        for await (const part of upstream.body) { bytes += part.length; if (bytes > 8 * 1024 * 1024) throw new Error('Model list too large.'); parts.push(Buffer.from(part)); }
        const text = Buffer.concat(parts).toString('utf8'); JSON.parse(text);
        res.setHeader('content-type', 'application/json'); res.end(text); return;
      }
      res.setHeader('content-type', 'text/event-stream; charset=utf-8'); res.setHeader('x-accel-buffering', 'no'); res.flushHeaders();
      for await (const chunk of upstream.body) { if (abort.signal.aborted) break; if (!res.write(chunk)) await once(res, 'drain', { signal: abort.signal }); }
      res.end();
    } catch { if (!res.headersSent) res.statusCode = 502; if (!res.destroyed) res.end(); }
    finally { clearTimeout(timer); abort.abort(); }
  }); };
  return { name: 'studio-llm-stream-relay', configureServer: install, configurePreviewServer: install };
}
