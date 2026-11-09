export type Provider = 'openai' | 'compatible' | 'anthropic' | 'gemini' | 'deepseek' | 'openrouter' | 'xai' | 'ollama';
export interface LlmSettings { provider: Provider; baseUrl: string; apiKey: string; model: string; effort: string; maxTokens: number; customInstructions: string; rememberKey: boolean }
export interface LlmRequest { url: string; headers: Record<string, string>; body: Record<string, unknown> }
export interface LlmModelsRequest { url: string; headers: Record<string, string> }
export interface LlmModelOption { id: string; label: string }
export const providers: Record<Provider, { label: string; baseUrl: string }> = {
  openai: { label: 'OpenAI · Responses', baseUrl: 'https://api.openai.com/v1' },
  compatible: { label: 'OpenAI compatible', baseUrl: 'http://127.0.0.1:1234/v1' },
  anthropic: { label: 'Anthropic · Messages', baseUrl: 'https://api.anthropic.com/v1' },
  gemini: { label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  xai: { label: 'xAI', baseUrl: 'https://api.x.ai/v1' },
  ollama: { label: 'Ollama · OpenAI compatible', baseUrl: 'http://127.0.0.1:11434/v1' },
};
export const defaultLlmSettings = (provider: Provider = 'openai'): LlmSettings => ({ provider, baseUrl: providers[provider].baseUrl, apiKey: '', model: '', effort: 'default', maxTokens: 8192, customInstructions: '', rememberKey: false });
export function effortOptions(provider: Provider, model = ''): string[] {
  if (provider === 'deepseek') return ['default', 'none', 'low', 'high', 'max'];
  if (provider === 'gemini') return ['default', 'low', 'high'];
  if (provider === 'anthropic') return ['default', 'low', 'medium', 'high'];
  if (provider === 'xai') return ['default', 'low', 'medium', 'high', 'xhigh'];
  return ['default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
}

function connectionDetails(settings: LlmSettings): LlmModelsRequest {
  const base = new URL(settings.baseUrl.trim().replace(/\/+$/, ''));
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Use an HTTP(S) API base URL without credentials, query or fragment.');
  if (!settings.apiKey.trim() && !['compatible', 'ollama'].includes(settings.provider)) throw new Error('Add this provider’s API key in Settings → LLM enhancer.');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (settings.provider === 'anthropic') { headers['x-api-key'] = settings.apiKey.trim(); headers['anthropic-version'] = '2023-06-01'; }
  else if (settings.provider === 'gemini') headers['x-goog-api-key'] = settings.apiKey.trim();
  else if (settings.apiKey.trim()) headers.authorization = `Bearer ${settings.apiKey.trim()}`;
  return { url: base.href.replace(/\/+$/, ''), headers };
}

export function buildModelsRequest(settings: LlmSettings, cursor = ''): LlmModelsRequest {
  const connection = connectionDetails(settings);
  const url = new URL(`${connection.url}/models`);
  if (settings.provider === 'gemini') { url.searchParams.set('pageSize', '1000'); if (cursor) url.searchParams.set('pageToken', cursor); }
  if (settings.provider === 'anthropic') { url.searchParams.set('limit', '1000'); if (cursor) url.searchParams.set('after_id', cursor); }
  return { url: url.href, headers: connection.headers };
}

export function parseModelsResponse(provider: Provider, raw: unknown): { models: LlmModelOption[]; next: string } {
  if (!raw || typeof raw !== 'object') throw new Error('The provider returned an invalid model list.');
  const data = raw as Record<string, unknown>;
  if (data.error) throw new Error('The provider rejected model discovery. Check the base URL and key.');
  const list = provider === 'gemini' ? data.models : data.data;
  if (!Array.isArray(list)) throw new Error('The provider did not return a recognized /models response. You can still enter a model ID manually.');
  const models: LlmModelOption[] = [];
  for (const value of list) {
    if (!value || typeof value !== 'object') continue;
    const model = value as Record<string, unknown>;
    if (provider === 'gemini' && Array.isArray(model.supportedGenerationMethods) && !model.supportedGenerationMethods.some(method => method === 'generateContent' || method === 'streamGenerateContent')) continue;
    const id = provider === 'gemini' && typeof model.name === 'string' ? model.name.replace(/^models\//, '') : model.id;
    if (typeof id !== 'string' || !id.trim()) continue;
    const title = model.display_name ?? model.displayName ?? model.name;
    models.push({ id, label: typeof title === 'string' && title !== id ? `${title} · ${id}` : id });
  }
  const next = provider === 'gemini' && typeof data.nextPageToken === 'string' ? data.nextPageToken : provider === 'anthropic' && data.has_more === true && typeof data.last_id === 'string' ? data.last_id : '';
  if (provider === 'anthropic' && data.has_more === true && !next) throw new Error('The provider returned an invalid model pagination cursor.');
  return { models, next };
}

export function buildLlmRequest(settings: LlmSettings, system: string, input: string): LlmRequest {
  const s = settings;
  if (!s.model.trim()) throw new Error('Choose an LLM model in Settings → LLM enhancer.');
  if (!input.trim()) throw new Error('Write a positive prompt or an instruction first.');
  if (!effortOptions(s.provider, s.model).includes(s.effort)) throw new Error('Unsupported reasoning effort for this provider.');
  const connection = connectionDetails(s);
  const headers = connection.headers;
  const limit = Math.max(1024, Math.min(65536, Math.trunc(s.maxTokens) || 8192));
  let route = '/chat/completions';
  let body: Record<string, unknown> = { model: s.model.trim(), messages: [{ role: 'system', content: system }, { role: 'user', content: input }], stream: true, max_tokens: limit };
  if (s.apiKey.trim()) headers.authorization = `Bearer ${s.apiKey.trim()}`;
  if (s.provider === 'openai') {
    route = '/responses';
    body = { model: s.model.trim(), instructions: system, input, stream: true, store: false, max_output_tokens: limit };
    if (s.effort !== 'default') body.reasoning = { effort: s.effort, ...(s.effort !== 'none' ? { summary: 'auto' } : {}) };
    else if (/^(?:o[134](?:-|$)|gpt-[5-9](?:[.-]|$))/.test(s.model)) body.reasoning = { summary: 'auto' };
  } else if (s.provider === 'anthropic') {
    route = '/messages'; delete headers.authorization;
    headers['x-api-key'] = s.apiKey.trim(); headers['anthropic-version'] = '2023-06-01';
    body = { model: s.model.trim(), system, messages: [{ role: 'user', content: input }], stream: true, max_tokens: limit };
    const adaptive = /claude-(?:opus-4-[6-9]|sonnet-4-[6-9]|(?:opus|sonnet|haiku|fable|mythos)-[5-9])/.test(s.model);
    if (adaptive) body.thinking = { type: 'adaptive', display: 'summarized' };
    if (s.effort !== 'default') {
      if (adaptive) {
        body.output_config = { effort: s.effort };
      } else {
        const budget = { low: 1024, medium: 4096, high: 8192 }[s.effort as 'low' | 'medium' | 'high'];
        const maxTokens = Math.max(1536, limit);
        body.thinking = { type: 'enabled', budget_tokens: Math.min(budget, maxTokens - 512) };
        body.max_tokens = maxTokens;
      }
    }
  } else if (s.provider === 'gemini') {
    route = `/models/${encodeURIComponent(s.model.trim().replace(/^models\//, ''))}:streamGenerateContent?alt=sse`;
    delete headers.authorization; headers['x-goog-api-key'] = s.apiKey.trim();
    const thinkingConfig = s.effort === 'default' ? (/^gemini-(?:2\.5|[3-9])/.test(s.model.replace(/^models\//, '')) ? { includeThoughts: true } : undefined) : /^gemini-2\.5/.test(s.model.replace(/^models\//, '')) ? { includeThoughts: true, thinkingBudget: s.effort === 'low' ? 1024 : 8192 } : { includeThoughts: true, thinkingLevel: s.effort };
    body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: input }] }], generationConfig: { maxOutputTokens: limit, ...(thinkingConfig ? { thinkingConfig } : {}) } };
  } else if (s.provider === 'deepseek' && s.effort !== 'default') {
    body.thinking = { type: s.effort === 'none' ? 'disabled' : 'enabled' };
    if (s.effort !== 'none') body.reasoning_effort = s.effort;
  } else if (s.provider === 'openrouter' && s.effort !== 'default') {
    body.reasoning = { effort: s.effort };
  } else if (s.effort !== 'default') body.reasoning_effort = s.effort;
  return { url: `${connection.url}${route}`, headers, body };
}

export interface LlmDelta { kind: 'thinking' | 'output'; text: string }
/** Shared by browser and native transports; accepts arbitrarily split SSE frames. */
export class LlmStreamParser {
  private pending = '';
  private line = '';
  private data: string[] = [];
  private eventName = '';
  done = false;
  private emit: (delta: LlmDelta) => void;
  constructor(emit: (delta: LlmDelta) => void) { this.emit = emit; }
  push(chunk: string): void {
    if (this.done) return;
    this.pending += chunk;
    let match: RegExpExecArray | null;
    while (!this.done && (match = /\r\n|\r(?!$)|\n/.exec(this.pending))) {
      this.line = this.pending.slice(0, match.index); this.pending = this.pending.slice(match.index + match[0].length);
      if (this.line === '') this.dispatch();
      else if (this.line.startsWith('data:')) this.data.push(this.line.slice(5).replace(/^ /, ''));
      else if (this.line.startsWith('event:')) this.eventName = this.line.slice(6).trim();
    }
  }
  finish(): void { if (this.done) return; if (this.pending.startsWith('data:')) this.data.push(this.pending.slice(5).trimStart()); this.pending = ''; this.dispatch(); if (!this.done) throw new Error('The provider stream ended before completion. Retry the enhancement.'); }
  private dispatch(): void {
    if (!this.data.length) { this.eventName = ''; return; }
    const text = this.data.join('\n'); this.data = [];
    if (text === '[DONE]') { this.done = true; return; }
    const event = JSON.parse(text);
    if (!event.type && this.eventName) event.type = this.eventName;
    this.eventName = '';
    if (event.error || event.type === 'error' || event.type === 'response.failed') throw new Error(event.error?.message || event.response?.error?.message || 'The LLM provider returned an error.');
    const send = (kind: LlmDelta['kind'], value: unknown) => { if (typeof value === 'string' && value) this.emit({ kind, text: value }); };
    if (event.type === 'response.output_text.delta') send('output', event.delta);
    if (event.type === 'response.reasoning_summary_text.delta') send('thinking', event.delta);
    if (event.type === 'response.completed' || event.type === 'message_stop') this.done = true;
    if (event.type === 'response.incomplete') throw new Error('The LLM output was truncated. Increase the output token limit.');
    if (event.type === 'content_block_delta') { send('output', event.delta?.text); send('thinking', event.delta?.thinking); }
    if (event.type === 'message_delta' && event.delta?.stop_reason === 'max_tokens') throw new Error('The LLM output was truncated. Increase the output token limit.');
    const choice = event.choices?.[0];
    if (choice) {
      send('output', choice.delta?.content); send('thinking', choice.delta?.reasoning_content ?? choice.delta?.reasoning);
      if (choice.finish_reason === 'length') throw new Error('The LLM output was truncated. Increase the output token limit.');
      if (choice.finish_reason === 'content_filter') throw new Error('The provider filtered this response.');
      if (choice.finish_reason) this.done = true;
    }
    if (event.promptFeedback?.blockReason) throw new Error(`Gemini blocked this request: ${event.promptFeedback.blockReason}`);
    const candidate = event.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) send(part.thought ? 'thinking' : 'output', part.text);
    if (candidate?.finishReason) { if (candidate.finishReason !== 'STOP') throw new Error(`Gemini stopped: ${candidate.finishReason}`); this.done = true; }
  }
}
