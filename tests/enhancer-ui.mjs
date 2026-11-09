import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const requests = [];
let cancelled = 0;
const api = createHttpServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; requests.push({ url: req.url, body });
  if (req.method === 'GET' && new URL(req.url, 'http://fixture').pathname.endsWith('/models')) {
    const key = req.headers['x-api-key'] || req.headers['x-goog-api-key'] || req.headers.authorization;
    if (String(key).includes('rejected-fixture')) { res.writeHead(401); res.end('fixture rejection'); return; }
    const send = () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.headers['x-goog-api-key']) res.end(JSON.stringify(req.url.includes('pageToken=') ? { models: [{ name: 'models/alternate-model', displayName: 'Alternate', supportedGenerationMethods: ['generateContent'] }] } : { models: [{ name: 'models/fixture-model', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] }], nextPageToken: 'second-page' }));
      else if (req.headers['x-api-key']) res.end(JSON.stringify(req.url.includes('after_id=') ? { data: [{ id: 'alternate-model', display_name: 'Alternate' }], has_more: false } : { data: [{ id: 'fixture-model' }], has_more: true, last_id: 'second-page' }));
      else if (String(key).includes('bulk-fixture')) res.end(JSON.stringify({ data: Array.from({ length: 240 }, (_, index) => ({ id: `local/Model-${String(index).padStart(3, '0')}` })) }));
      else res.end(JSON.stringify({ data: [{ id: 'fixture-model' }, { id: 'alternate-model' }] }));
    };
    if (String(key).includes('slow-fixture')) { const timer = setTimeout(send, 800); res.on('close', () => clearTimeout(timer)); } else send();
    return;
  }
  const idea = body.input || body.messages?.at(-1)?.content || body.contents?.[0]?.parts?.[0]?.text || '';
  if (idea === 'fail') { res.writeHead(401); res.end('fixture rejection'); return; }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const send = value => res.write(`data: ${JSON.stringify(value)}\n\n`);
  if (idea === 'slow') { send({ choices: [{ delta: { content: 'Partial' } }] }); res.on('close', () => cancelled++); return; }
  const layout = JSON.stringify({ width: 1024, height: 1024, summary: { caption: 'A title poster' }, items: [{ label: 'text', caption: 'A title', text: 'HELLO', bbox: [64, 64, 960, 256] }] });
  const answer = idea === 'layout' ? layout : 'A café portrait 🌸, gentle light';
  if (req.url.endsWith('/responses')) send({ type: 'response.reasoning_summary_text.delta', delta: 'Choose composition.' });
  else if (req.url.endsWith('/messages')) send({ type: 'content_block_delta', delta: { thinking: 'Choose composition.' } });
  else if (req.url.includes('streamGenerateContent')) send({ candidates: [{ content: { parts: [{ thought: true, text: 'Choose composition.' }] } }] });
  else send({ choices: [{ delta: { reasoning_content: 'Choose composition.' } }] });
  // A visible pause proves we render progressively, rather than buffering the entire response.
  const timer = setTimeout(() => {
    const emit = req.url.endsWith('/responses') ? text => send({ type: 'response.output_text.delta', delta: text }) : req.url.endsWith('/messages') ? text => send({ type: 'content_block_delta', delta: { text } }) : req.url.includes('streamGenerateContent') ? text => send({ candidates: [{ content: { parts: [{ text }] } }] }) : text => send({ choices: [{ delta: { content: text } }] });
    emit(answer.slice(0, 10));
    const finish = setTimeout(() => {
      emit(answer.slice(10));
      if (req.url.endsWith('/responses')) send({ type: 'response.completed' });
      else if (req.url.endsWith('/messages')) send({ type: 'message_stop' });
      else if (req.url.includes('streamGenerateContent')) send({ candidates: [{ finishReason: 'STOP' }] });
      else res.write('data: [DONE]\n\n');
      if (idea === 'linger') res.on('close', () => cancelled++); else res.end();
    }, 250);
    res.on('close', () => clearTimeout(finish));
  }, 250);
  res.on('close', () => clearTimeout(timer));
});
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${api.address().port}/v1`;
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/></head><body><div id="app"></div><script type="module">
import '/src/styles.css'; import { StudioApp } from '/src/app.ts';
import { saveLlmSettings, loadLlmSettings } from '/src/llm/settings.ts'; import { defaultLlmSettings } from '/src/llm/contracts.ts';
import { streamEnhancement } from '/src/llm/transport.ts'; import { buildLlmRequest } from '/src/llm/contracts.ts';
import { builtInThemes } from '/src/theme.ts';
window.app = new StudioApp(document.querySelector('#app'));
window.configure = (provider='openai', rememberKey=false) => saveLlmSettings({...defaultLlmSettings(provider),baseUrl:${JSON.stringify(apiBase)},model:'fixture-model',apiKey:'fixture-key',rememberKey});
window.settings = () => { app.view='settings'; app.store.updateUi({settingsPane:'llm'});app.render(); };
window.create = (prompt='a portrait') => {app.view='create';app.store.updateUi({mobileCreatePane:'output'});app.store.updateDraft({prompt,model:'anima.safetensors',width:1024,height:1024});app.render();};
app.models=[{name:'anima.safetensors',architecture:'anima'}];
window.switchFixtureTheme=id=>{app.store.state.theme=structuredClone(builtInThemes.find(theme=>theme.id===id).theme);app.applyTheme();};
window.getLlm=loadLlmSettings;window.configure();window.create();window.ready=true;
window.nativeFixture = scenario => {
 const callbacks=new Map();let next=0;
 window.__TAURI_INTERNALS__={transformCallback(callback){callbacks.set(++next,callback);return next;},unregisterCallback(id){callbacks.delete(id);},invoke(command,args){
  if(command==='cancel_llm_stream')return Promise.resolve();
  if(command!=='stream_llm')return Promise.reject('unexpected fixture command');
  const callback=callbacks.get(args.onChunk.id);let index=0;
  const send=text=>callback({index:index++,message:Array.from(new TextEncoder().encode(text))});
  if(scenario==='stall')return new Promise(()=>{});
  setTimeout(()=>send('data: '+JSON.stringify({choices:[{delta:{content:'Native output'}}]})+'\\n\\n'),10);
  if(scenario==='incomplete')setTimeout(()=>callback({index:index++,message:[]}),20);
  else {setTimeout(()=>send('data: [DONE]\\n\\n'),25);setTimeout(()=>send('data: '+JSON.stringify({choices:[{delta:{content:' LATE'}}]})+'\\n\\n'),45);}
  // Deliberately resolve invoke BEFORE ordered stream deliveries, as native IPC can.
  return Promise.resolve();
 }};
};
window.nativeStreamCheck=async scenario=>{nativeFixture(scenario);let output='';try{await streamEnhancement(buildLlmRequest({...defaultLlmSettings('compatible'),model:'fixture'},'system','idea'),new AbortController().signal,delta=>output+=delta.text,{idleMs:75,timeoutMs:300});await new Promise(resolve=>setTimeout(resolve,60));return {output};}catch(error){return {error:String(error),output};}finally{delete window.__TAURI_INTERNALS__;}};
</script></body></html>`;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'enhancer-fixture', configureServer(server) { server.middlewares.use('/__enhancer_contract', (_req, res) => { res.setHeader('content-type', 'text/html'); res.end(fixture); }); } }] });
let browser;
try {
  await server.listen(); const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const session = await fetch(`${origin}/__studio/llm/session`); const cookie = session.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${origin}/__studio/llm/stream`, { method: 'POST', headers: { origin: 'https://foreign.invalid', cookie, 'content-type': 'application/json' }, body: '{}' })).status, 403);
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }); const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/__enhancer_contract`); await page.waitForFunction(() => window.ready);
    const scrollbarBefore = await page.locator('#prompt').evaluate(el => ({ color: getComputedStyle(el).scrollbarColor, width: getComputedStyle(el).scrollbarWidth }));
    assert.equal(scrollbarBefore.width, 'thin'); assert.notEqual(scrollbarBefore.color, 'auto');
    await page.evaluate(() => switchFixtureTheme('bubblegum'));
    assert.notEqual(await page.locator('#prompt').evaluate(el => getComputedStyle(el).scrollbarColor), scrollbarBefore.color, 'scrollbars must react to live theme changes');
    await page.emulateMedia({ forcedColors: 'active' });
    assert.equal(await page.locator('#prompt').evaluate(el => getComputedStyle(el).scrollbarColor), 'auto', 'high contrast keeps system scrollbar colors');
    await page.emulateMedia({ forcedColors: 'none' }); await page.evaluate(() => switchFixtureTheme('studio'));
    const promptField = page.getByRole('textbox', { name: 'Positive prompt', exact: true });
    await promptField.fill(Array.from({ length: 120 }, (_, index) => `Prompt detail ${index + 1}: lanterns, fireworks and festival lighting.`).join('\n'));
    await promptField.press('Control+End');
    assert.equal(await promptField.evaluate(el => el.scrollTop > 0), true, 'themed prompt scrollbars must retain keyboard scrolling');
    await mkdir('test-results', { recursive: true });
    await promptField.screenshot({ path: `test-results/scrollbar-dark-${viewport.width}.png` });
    await page.evaluate(() => switchFixtureTheme('bubblegum'));
    await promptField.screenshot({ path: `test-results/scrollbar-light-${viewport.width}.png` });
    await page.evaluate(() => switchFixtureTheme('studio'));
    const enhance = page.getByRole('button', { name: 'Enhance positive prompt', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Enhance positive prompt', exact: true });
    for (const provider of ['openai', 'compatible', 'anthropic', 'gemini', 'deepseek']) {
      await page.evaluate(provider => { configure(provider); create('a portrait'); }, provider);
      await enhance.focus(); await page.keyboard.press('Enter'); await dialog.waitFor();
      await page.waitForFunction(() => document.querySelector('[data-thinking]')?.textContent.includes('composition'));
      assert.equal(await page.getByRole('button', { name: 'Apply to positive prompt', exact: true }).isEnabled(), false);
      assert.equal(await page.getByRole('textbox', { name: 'Positive prompt', exact: true }).inputValue(), 'a portrait');
      await page.getByRole('button', { name: 'Apply to positive prompt', exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('[data-apply]').disabled);
      assert.equal(await dialog.locator('[data-output]').inputValue(), 'A café portrait 🌸, gentle light');
      assert.equal(await dialog.locator('[data-thinking]').evaluate(el => { const text = el.getBoundingClientRect(); const shell = el.closest('[data-thought-card]').getBoundingClientRect(); return text.height > 0 && text.bottom <= shell.bottom; }), true, 'thinking text must remain inside its visible shell on phones');
      if (provider === 'openai') { await mkdir('test-results', { recursive: true }); await page.screenshot({ path: `test-results/enhancer-${viewport.width}.png` }); }
      assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('fixture-key')), false);
      assert.equal(await dialog.evaluate(el => el.getBoundingClientRect().top >= 20), true, 'phone dialog stays away from top viewport edge');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.getByRole('button', { name: 'Apply to positive prompt', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await page.getByRole('textbox', { name: 'Positive prompt', exact: true }).inputValue(), 'A café portrait 🌸, gentle light');
      assert.equal(await enhance.evaluate(el => el === document.activeElement), true);
    }
    await page.evaluate(() => { configure('compatible'); create('linger'); }); await enhance.click();
    await page.waitForFunction(() => !document.querySelector('[data-apply]').disabled);
    assert.equal(await dialog.locator('[data-status]').textContent(), 'Ready to review and apply.');
    await page.keyboard.press('Escape');
    const native = await page.evaluate(() => nativeStreamCheck('complete'));
    assert.deepEqual(native, { output: 'Native output' }, 'native invoke completion must wait for ordered callbacks and ignore late deltas');
    assert.match((await page.evaluate(() => nativeStreamCheck('incomplete'))).error, /before completion/);
    assert.match((await page.evaluate(() => nativeStreamCheck('stall'))).error, /stopped responding/);
    // Exercise the real modal on the delayed native channel path from the screenshot.
    await page.evaluate(() => { configure('compatible'); create('native'); nativeFixture('complete'); }); await enhance.click();
    await page.waitForFunction(() => !document.querySelector('[data-apply]').disabled); await page.waitForTimeout(100);
    assert.equal(await dialog.locator('[data-output]').inputValue(), 'Native output');
    assert.equal(await dialog.locator('[data-status]').textContent(), 'Ready to review and apply.');
    assert.equal(await dialog.getByRole('button', { name: 'Stop', exact: true }).isEnabled(), false);
    await page.keyboard.press('Escape'); await page.evaluate(() => { delete window.__TAURI_INTERNALS__; });
    await page.evaluate(() => { configure('compatible'); create('slow'); }); await enhance.click();
    await page.waitForFunction(() => document.querySelector('[data-output]')?.value === 'Partial');
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent.startsWith('Stopped'));
    assert.equal(await page.getByRole('button', { name: 'Apply to positive prompt', exact: true }).isEnabled(), false);
    await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 0);
    assert.equal(await page.getByRole('textbox', { name: 'Positive prompt', exact: true }).inputValue(), 'slow');
    await page.evaluate(() => create('fail')); await enhance.click();
    await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent.includes('(401)'));
    await page.keyboard.press('Escape');
    await page.evaluate(() => create('layout')); await enhance.click();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[data-run]').disabled);
    await dialog.getByLabel('Prompt mode', { exact: true }).selectOption('moss-layout');
    await dialog.getByRole('button', { name: 'Enhance', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[data-apply]').disabled);
    await page.getByRole('button', { name: 'Apply to positive prompt', exact: true }).click();
    assert.deepEqual(JSON.parse(await page.getByRole('textbox', { name: 'Positive prompt', exact: true }).inputValue()).items[0].bbox, [-448, -448, -256, 448]);
    // Keep the user's newer edit if background state changes while the dialog is open.
    await page.evaluate(() => { localStorage.removeItem('swarm-studio-prompt-mode');create('a portrait'); }); await enhance.click();
    await page.waitForFunction(() => !document.querySelector('[data-apply]').disabled);
    await page.evaluate(() => app.store.updateDraft({ prompt: 'newer edit' }));
    await page.getByRole('button', { name: 'Apply to positive prompt', exact: true }).click();
    assert.match(await dialog.locator('[data-status]').textContent(), /changed while enhancing/); await page.keyboard.press('Escape');
    await page.evaluate(() => settings());
    const form = page.locator('#llm-settings-form');
    const suggestions = form.getByRole('listbox', { name: 'Matching LLM models', exact: true });
    for (const provider of ['compatible', 'openai', 'anthropic', 'gemini', 'deepseek']) {
      await page.evaluate(provider => { configure(provider); settings(); }, provider);
      const model = form.getByRole('combobox', { name: 'LLM model ID', exact: true });
      const beforeFocus = requests.length;
      await model.focus();
      await page.waitForFunction(() => document.querySelector('[data-llm-status]')?.textContent.startsWith('Found 2 models'));
      assert.ok(requests.length > beforeFocus, 'focusing the model field must automatically discover using current fields');
      assert.equal(await model.getAttribute('aria-expanded'), 'true');
      assert.equal(await suggestions.getByRole('option').count(), 1, 'existing ID filters the initial list');
      const afterLoad = requests.length;
      await model.fill('MODEL'); assert.equal(await suggestions.getByRole('option').count(), 2, 'ID search is case insensitive');
      await model.press('Escape'); assert.equal(await model.getAttribute('aria-expanded'), 'false');
      await model.click(); assert.equal(requests.length, afterLoad, 'reopening uses cached models until manual refresh');
      await model.fill('alternate'); assert.equal(await suggestions.getByRole('option').count(), 1);
      if (provider === 'compatible') {
        await model.press('ArrowDown'); assert.ok(await model.getAttribute('aria-activedescendant'));
        await model.press('Enter');
      } else await suggestions.getByRole('option', { name: /alternate-model/ }).click();
      assert.equal(await model.inputValue(), 'alternate-model');
      assert.equal(await model.getAttribute('aria-expanded'), 'false');
      assert.equal(await model.evaluate(el => document.activeElement === el), true, 'choosing a model restores input focus');
      await form.getByRole('button', { name: 'Test connection', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-llm-status]')?.textContent.startsWith('Connection OK'));
      assert.equal(await page.evaluate(() => getLlm().model), 'fixture-model', 'discovery and test must use unsaved fields without overwriting saved settings');
      if (provider === 'compatible') {
        const refreshStart = requests.length;
        await form.getByRole('button', { name: 'Refresh LLM models', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[data-llm-status]')?.textContent.startsWith('Found 2 models'));
        assert.ok(requests.length > refreshStart, 'manual refresh must fetch again');
        await model.fill(''); await form.locator('[data-llm-picker]').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `test-results/llm-settings-${viewport.width}.png` });
        await model.fill('custom/not-in-the-list');
        assert.equal(await suggestions.getByRole('option').count(), 0);
        assert.match(await form.locator('[data-llm-match-count]').textContent(), /custom ID/);
        await model.press('Escape'); assert.equal(await model.inputValue(), 'custom/not-in-the-list');
        await model.press('Tab'); assert.equal(await form.getByRole('button', { name: 'Refresh LLM models', exact: true }).evaluate(el => document.activeElement === el), true);
      }
    }
    await form.getByLabel('API key', { exact: true }).fill('rejected-fixture');
    await form.getByRole('button', { name: 'Refresh LLM models', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-llm-status]')?.textContent.includes('(401)'));
    assert.equal(await suggestions.getByRole('option').count(), 0);
    await form.getByLabel('API key', { exact: true }).fill('slow-fixture');
    await form.getByRole('combobox', { name: 'LLM model ID', exact: true }).focus();
    await form.getByLabel('LLM model ID').fill('alternate');
    await page.waitForFunction(() => document.querySelector('[data-llm-status]')?.textContent.startsWith('Found 2 models'));
    assert.equal(await suggestions.getByRole('option').count(), 1, 'typing while discovery loads must keep the request and apply the filter');
    await form.getByRole('button', { name: 'Refresh LLM models', exact: true }).click();
    await form.getByRole('button', { name: 'Cancel check', exact: true }).click();
    assert.equal(await form.locator('[data-llm-status]').textContent(), 'Cancelled.');
    await form.getByLabel('Provider / API contract').selectOption('compatible');
    await page.waitForTimeout(850);
    assert.equal(await form.locator('[role="option"]').count(), 0, 'a cancelled provider response cannot populate another connection');
    await form.getByLabel('API key', { exact: true }).fill('bulk-fixture');
    await form.getByLabel('LLM model ID').focus();
    await page.waitForFunction(() => document.querySelector('[data-llm-status]')?.textContent.startsWith('Found 240 models'));
    await form.getByLabel('LLM model ID').fill('');
    assert.equal(await suggestions.getByRole('option').count(), 100, 'large catalogs stay bounded');
    await form.getByLabel('LLM model ID').fill('model-239');
    assert.equal(await suggestions.getByRole('option').count(), 1, 'IDs beyond the visible cap are searchable');
    await form.getByLabel('LLM model ID').press('ArrowDown'); await form.getByLabel('LLM model ID').press('Enter');
    assert.equal(await form.getByLabel('LLM model ID').inputValue(), 'local/Model-239');
    await form.getByLabel('Provider / API contract').selectOption('gemini');
    await form.getByLabel('LLM model ID').fill('gemini-fixture');
    await form.getByLabel('API base URL').fill(apiBase); await form.getByLabel('API key', { exact: true }).fill('remembered-fixture');
    await form.getByLabel('Reasoning effort', { exact: true }).selectOption('high');
    await form.getByLabel('Remember key on this device').check();
    await form.getByRole('button', { name: 'Save LLM connection' }).click();
    assert.equal(await page.evaluate(() => getLlm().model), 'gemini-fixture');
    await form.getByLabel('Provider / API contract').selectOption('compatible');
    await form.getByLabel('Provider / API contract').selectOption('gemini');
    assert.equal(await form.getByLabel('API key', { exact: true }).inputValue(), 'remembered-fixture');
    await form.getByRole('button', { name: 'Save LLM connection' }).click();
    await page.reload(); await page.waitForFunction(() => window.ready); await page.evaluate(() => settings());
    // Fixture config intentionally selects OpenAI on boot; Gemini's remembered profile survives.
    await page.locator('#llm-settings-form').getByLabel('Provider / API contract').selectOption('gemini');
    assert.equal(await page.locator('#llm-settings-form').getByLabel('API key', { exact: true }).inputValue(), 'remembered-fixture');
    assert.equal(await page.locator('#llm-settings-form').getByLabel('Reasoning effort', { exact: true }).inputValue(), 'high');
    assert.deepEqual(errors, []);
    await context.close();
  }
  assert.ok(cancelled > 0, 'Stop must close the upstream request');
  assert.ok(requests.some(r => r.url.endsWith('/responses')) && requests.some(r => r.url.endsWith('/messages')) && requests.some(r => r.url.includes('streamGenerateContent')));
  console.log('LLM relay + desktop/phone streaming, cancellation, settings and apply contracts: ok');
} finally { await browser?.close(); await server.close(); api.closeAllConnections(); await new Promise(resolve => api.close(resolve)); }
