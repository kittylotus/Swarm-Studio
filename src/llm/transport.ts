import { buildModelsRequest, parseModelsResponse, LlmStreamParser, type LlmSettings, type LlmModelsRequest, type LlmModelOption, type LlmRequest, type LlmDelta } from './contracts';

interface StreamLimits { idleMs?: number; timeoutMs?: number }

/** Bound the operation independently of native invoke completion or HTTP keep-alive. */
export async function streamEnhancement(request: LlmRequest, signal: AbortSignal, emit: (delta: LlmDelta) => void, limits: StreamLimits = {}): Promise<void> {
  const parser = new LlmStreamParser(emit);
  const decoder = new TextDecoder();
  const operation = new AbortController();
  const abort = () => operation.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  let timeoutError: Error | undefined;
  let idleTimer: ReturnType<typeof setTimeout>;
  const expire = (message: string) => { timeoutError = new Error(message); operation.abort(); };
  const touch = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => expire('The LLM stream stopped responding. Retry or use Test connection in settings.'), limits.idleMs ?? 45_000); };
  const totalTimer = setTimeout(() => expire('The LLM request timed out. Retry or use Test connection in settings.'), limits.timeoutMs ?? 180_000);
  touch();
  try {
    if ('__TAURI_INTERNALS__' in window) {
      const { invoke, Channel } = await import('@tauri-apps/api/core');
      operation.signal.throwIfAborted();
      const id = crypto.randomUUID();
      const channel = new Channel<number[]>();
      const cancel = () => { void invoke('cancel_llm_stream', { id }).catch(() => undefined); };
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: unknown) => {
          if (settled) return;
          settled = true; channel.onmessage = () => {}; operation.signal.removeEventListener('abort', onAbort); cancel();
          if (error) reject(error); else resolve();
        };
        const onAbort = () => finish(operation.signal.reason ?? new DOMException('Aborted', 'AbortError'));
        operation.signal.addEventListener('abort', onAbort, { once: true });
        channel.onmessage = bytes => {
          if (settled) return;
          touch();
          try {
            if (!bytes.length) { parser.push(decoder.decode()); parser.finish(); finish(); }
            else { parser.push(decoder.decode(new Uint8Array(bytes), { stream: true })); if (parser.done) finish(); }
          } catch (error) { finish(error); }
        };
        // Invoke may resolve before queued Channel callbacks. The ordered EOF message or
        // protocol terminal event owns completion; late callbacks cannot reopen the UI state.
        void invoke('stream_llm', { id, request, onChunk: channel }).catch(error => finish(error));
      });
      return;
    }
    await relaySession(operation.signal);
    const response = await fetch('/__studio/llm/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: operation.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`LLM request failed (${response.status}). Check the API base URL, key, model and reasoning support.`);
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('The provider did not return a streaming SSE response.');
    const reader = response.body.getReader();
    try {
      while (!parser.done) {
        const { done, value } = await reader.read();
        if (done) break;
        touch(); parser.push(decoder.decode(value, { stream: true }));
      }
      parser.push(decoder.decode()); parser.finish();
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  } catch (error) { if (timeoutError && !signal.aborted) throw timeoutError; throw error; }
  finally { clearTimeout(idleTimer!); clearTimeout(totalTimer); signal.removeEventListener('abort', abort); operation.abort(); }
}

async function relaySession(signal: AbortSignal): Promise<void> {
  const session = await fetch('/__studio/llm/session', { signal, cache: 'no-store' });
  if (!session.ok || !session.headers.get('content-type')?.includes('application/json')) throw new Error('The LLM relay is unavailable. Run Studio through start.ps1, npm run dev or npm run preview.');
}

function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function discoverLlmModels(settings: LlmSettings, signal: AbortSignal): Promise<LlmModelOption[]> {
  const operation = new AbortController();
  const abort = () => operation.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; operation.abort(); }, 20_000);
  const found = new Map<string, LlmModelOption>();
  const seen = new Set<string>();
  let cursor = '';
  try {
    for (let page = 0; page < 10; page++) {
      operation.signal.throwIfAborted();
      const request: LlmModelsRequest = buildModelsRequest(settings, cursor);
      let raw: unknown;
      if ('__TAURI_INTERNALS__' in window) {
        const { invoke } = await import('@tauri-apps/api/core');
        raw = JSON.parse(await abortable(invoke<string>('list_llm_models', { request }), operation.signal));
      } else {
        await relaySession(operation.signal);
        const response = await fetch('/__studio/llm/models', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: operation.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`Model discovery failed (${response.status}). Check the base URL and key, or enter a model ID manually.`);
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Model discovery returned a non-JSON response. Check the API base URL.');
        raw = await response.json();
      }
      const result = parseModelsResponse(settings.provider, raw);
      result.models.forEach(model => found.set(model.id, model));
      if (!result.next) return [...found.values()].sort((a, b) => a.label.localeCompare(b.label));
      if (seen.has(result.next)) throw new Error('The provider repeated its model pagination cursor.');
      seen.add(result.next); cursor = result.next;
    }
    throw new Error('The model list exceeded the discovery page limit. Enter a model ID manually.');
  } catch (error) { if (timedOut && !signal.aborted) throw new Error('Model discovery timed out. Check the API base URL and network.'); throw error; }
  finally { clearTimeout(timer); signal.removeEventListener('abort', abort); operation.abort(); }
}
