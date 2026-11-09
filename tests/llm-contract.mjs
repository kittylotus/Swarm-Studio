import assert from 'node:assert/strict';
import { buildLlmRequest, buildModelsRequest, parseModelsResponse, defaultLlmSettings, LlmStreamParser, providers } from '../src/llm/contracts.ts';
import { compileMossLayout, detectPromptMode, enhancementInstructions, validateMossComposition } from '../src/llm/prompts.ts';
import { validateLlmRelayRequest } from '../scripts/llm-relay.mjs';

const settings = (provider, overrides = {}) => ({ ...defaultLlmSettings(provider), model: 'test-model', apiKey: 'fixture-key', ...overrides });
for (const provider of Object.keys(providers)) {
  const request = buildLlmRequest(settings(provider), 'system instruction', 'image idea');
  assert.equal(new URL(request.url).protocol.startsWith('http'), true);
  assert.equal(JSON.stringify(request.body).includes('image idea'), true);
  assert.equal(JSON.stringify(request.body).includes('fixture-key'), false);
  assert.doesNotThrow(() => validateLlmRelayRequest(request));
}
const openai = buildLlmRequest(settings('openai', { effort: 'high' }), 'system', 'idea');
assert.match(openai.url, /\/responses$/); assert.deepEqual(openai.body.reasoning, { effort: 'high', summary: 'auto' }); assert.equal(openai.body.store, false);
assert.equal('reasoning' in buildLlmRequest(settings('openai'), 'system', 'idea').body, false);
assert.equal(buildLlmRequest(settings('compatible', { apiKey: '' }), 'system', 'idea').headers.authorization, undefined);
const anthropic = buildLlmRequest(settings('anthropic', { model: 'claude-sonnet-4-6', effort: 'low' }), 'system', 'idea');
assert.equal(anthropic.headers.authorization, undefined); assert.equal(anthropic.headers['x-api-key'], 'fixture-key'); assert.equal(anthropic.body.thinking.type, 'adaptive'); assert.equal(anthropic.body.output_config.effort, 'low');
const legacy = buildLlmRequest(settings('anthropic', { model: 'claude-sonnet-4-5', effort: 'high', maxTokens: 1024 }), 'system', 'idea');
assert.ok(legacy.body.thinking.budget_tokens >= 1024 && legacy.body.thinking.budget_tokens < legacy.body.max_tokens);
for (const [model, field] of [['gemini-2.5-pro', 'thinkingBudget'], ['gemini-3.1-pro-preview', 'thinkingLevel']]) {
  const request = buildLlmRequest(settings('gemini', { model, effort: 'high' }), 'system', 'idea');
  assert.equal(request.headers['x-goog-api-key'], 'fixture-key'); assert.equal(new URL(request.url).search, '?alt=sse'); assert.ok(field in request.body.generationConfig.thinkingConfig);
}
const deepseek = buildLlmRequest(settings('deepseek', { effort: 'none' }), 'system', 'idea');
assert.deepEqual(deepseek.body.thinking, { type: 'disabled' }); assert.equal(deepseek.body.reasoning_effort, undefined);
assert.throws(() => buildLlmRequest(settings('openai', { apiKey: '' }), 'system', 'idea'), /API key/);
assert.throws(() => buildLlmRequest(settings('openai', { baseUrl: 'https://name:secret@example.com' }), 'system', 'idea'), /base URL/);
assert.throws(() => buildLlmRequest(settings('gemini', { effort: 'xhigh' }), 'system', 'idea'), /effort/);
for (const invalid of [{ ...openai, url: 'file:///tmp/chat/completions' }, { ...openai, url: 'http://localhost/private' }, { ...openai, headers: { cookie: 'secret' } }, { ...openai, headers: { authorization: 'a\r\nb' } }]) assert.throws(() => validateLlmRelayRequest(invalid));
for (const provider of Object.keys(providers)) {
  const request = buildModelsRequest(settings(provider, { model: '' }), 'cursor +/');
  assert.match(new URL(request.url).pathname, /\/models$/);
  assert.equal('body' in request, false);
  assert.doesNotThrow(() => validateLlmRelayRequest(request, 'models'));
}
const anthropicModels = buildModelsRequest(settings('anthropic'), 'next id');
assert.equal(anthropicModels.headers.authorization, undefined); assert.equal(anthropicModels.headers['x-api-key'], 'fixture-key'); assert.equal(new URL(anthropicModels.url).searchParams.get('after_id'), 'next id');
const geminiModels = buildModelsRequest(settings('gemini'), 'next+page');
assert.equal(geminiModels.headers['x-goog-api-key'], 'fixture-key'); assert.equal(new URL(geminiModels.url).searchParams.get('pageToken'), 'next+page');
assert.deepEqual(parseModelsResponse('compatible', { data: [{ id: 'local-model' }, { id: 'friendly', name: 'Friendly name' }, null] }), { models: [{ id: 'local-model', label: 'local-model' }, { id: 'friendly', label: 'Friendly name · friendly' }], next: '' });
assert.deepEqual(parseModelsResponse('anthropic', { data: [{ id: 'claude-fixture', display_name: 'Claude' }], has_more: true, last_id: 'next' }).next, 'next');
assert.deepEqual(parseModelsResponse('gemini', { models: [{ name: 'models/gemini-text', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] }], nextPageToken: 'page2' }), { models: [{ id: 'gemini-text', label: 'models/gemini-text · gemini-text' }], next: 'page2' });
assert.throws(() => parseModelsResponse('openai', { models: [] }), /recognized/);
assert.throws(() => parseModelsResponse('anthropic', { data: [], has_more: true }), /pagination/);
assert.throws(() => validateLlmRelayRequest({ ...geminiModels, url: 'https://host/v1/models?key=secret' }, 'models'));
assert.throws(() => validateLlmRelayRequest({ ...geminiModels, url: 'https://host/v1/models?pageSize=999999' }, 'models'));
assert.throws(() => validateLlmRelayRequest({ ...geminiModels, url: 'https://host/v1/models?limit=10&limit=20' }, 'models'));

const frame = event => `data: ${JSON.stringify(event)}\r\n\r\n`;
const parse = text => { const output = []; const parser = new LlmStreamParser(delta => output.push(delta)); for (const character of text) parser.push(character); parser.finish(); return output; };
assert.deepEqual(parse(frame({ type: 'response.reasoning_summary_text.delta', delta: 'Plan' }) + frame({ type: 'response.output_text.delta', delta: 'A café 🌸' }) + frame({ type: 'response.completed' })), [{ kind: 'thinking', text: 'Plan' }, { kind: 'output', text: 'A café 🌸' }]);
assert.deepEqual(parse(frame({ choices: [{ delta: { reasoning_content: 'Think', content: 'Portrait' } }] }) + 'data: [DONE]\n\n'), [{ kind: 'output', text: 'Portrait' }, { kind: 'thinking', text: 'Think' }]);
assert.deepEqual(parse(frame({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Consider' } }) + frame({ type: 'content_block_delta', delta: { text: 'Result' } }) + frame({ type: 'message_stop' })), [{ kind: 'thinking', text: 'Consider' }, { kind: 'output', text: 'Result' }]);
assert.deepEqual(parse(frame({ candidates: [{ content: { parts: [{ thought: true, text: 'Summary' }, { text: 'Caption' }] }, finishReason: 'STOP' }] })), [{ kind: 'thinking', text: 'Summary' }, { kind: 'output', text: 'Caption' }]);
assert.throws(() => parse(frame({ choices: [{ delta: { content: 'partial' } }] })), /before completion/);
assert.throws(() => parse(frame({ error: { message: 'fixture error' } })), /fixture error/);
assert.throws(() => parse(frame({ type: 'response.incomplete' })), /truncated/);
assert.throws(() => parse(frame({ choices: [{ finish_reason: 'length' }] })), /truncated/);
assert.throws(() => parse(frame({ promptFeedback: { blockReason: 'SAFETY' } })), /blocked/);
assert.deepEqual(parse(frame({ choices: [{ delta: { content: 'complete' }, finish_reason: 'stop' }] }) + frame({ choices: [{ delta: { content: 'late duplicate' } }] })), [{ kind: 'output', text: 'complete' }]);
assert.deepEqual(parse('event: response.completed\ndata: {}\n\n'), []);

for (const [name, mode] of [['anima-v1', 'anima'], ['wai-illustrious', 'illustrious'], ['flux-krea', 'krea'], ['MOSS-Image', 'moss'], ['unknown', 'general']]) assert.equal(detectPromptMode({ name }), mode);
assert.equal(detectPromptMode({ name: 'renamed', architecture: 'anima' }), 'anima');
assert.match(enhancementInstructions('moss-layout', undefined, 1536, 1024), /TOP LEFT/);
const animaRules = enhancementInstructions('auto', { name: 'Anima Aesthetic.safetensors' }, 1024, 1024);
assert.match(animaRules, /This checkpoint is Anima Aesthetic: do not add score_\*/);
assert.match(animaRules, /Left:.*Right:/s); assert.match(animaRules, /name \\\(series\\\)/);
assert.match(animaRules, /ye-pop/); assert.match(animaRules, /<region:\.\.\.>/);
assert.match(enhancementInstructions('illustrious', undefined, 1024, 1024), /Natural language is possible/);
assert.match(enhancementInstructions('krea', undefined, 1024, 1024), /not newer FLUX models/);
assert.match(enhancementInstructions('auto', { name: 'krea-2-turbo.safetensors' }, 1024, 1024), /This checkpoint is Krea 2/);
assert.match(enhancementInstructions('moss', undefined, 1024, 1024), /Quality -> Score -> Meta -> Year -> Character -> Series -> Artist -> General/);
const draft = { width: 1536, height: 1024, summary: { caption: 'A poster' }, items: [{ label: 'text', caption: 'Title', text: 'Hello\nWorld', bbox: [176, 224, 800, 864] }] };
const compiled = compileMossLayout(JSON.stringify(draft), 1536, 1024);
assert.deepEqual(JSON.parse(compiled).items[0].bbox, [-288, -592, 352, 32]);
assert.equal(JSON.parse(compiled).items[0].text, 'Hello\nWorld'); assert.equal(JSON.parse(compiled).width, undefined);
assert.doesNotThrow(() => validateMossComposition(compiled, 1536, 1024, false));
assert.throws(() => validateMossComposition(compiled, 1536, 1024, true), /automatic LoRA/);
assert.throws(() => compileMossLayout(JSON.stringify(draft), 1024, 1024), /dimensions/);
assert.throws(() => compileMossLayout(JSON.stringify({ ...draft, items: [{ ...draft.items[0], bbox: [0, 0, 1600, 2] }] }), 1536, 1024), /inside/);
assert.throws(() => compileMossLayout(JSON.stringify({ ...draft, items: [{ ...draft.items[0], text: '' }] }), 1536, 1024), /visible text/);
console.log('LLM provider, streaming and MOSS contracts: ok');
