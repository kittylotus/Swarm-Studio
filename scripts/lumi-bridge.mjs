import { randomBytes, timingSafeEqual } from 'node:crypto';

const MAX_BODY = 20 * 1024 * 1024;
export function validateReferenceEnvelope(body, scope, previousUser = '', previousAt = 0, now = Date.now()) {
    const snapshot = body?.snapshot;
    if (typeof body?.sourceUserId !== 'string' || !body.sourceUserId || body.sourceUserId.length > 200
        || (previousUser && body.sourceUserId !== previousUser) || body.scope !== scope
        || snapshot?.schema !== 1 || typeof snapshot.complete !== 'boolean' || typeof snapshot.activeJobs !== 'boolean'
        || !Array.isArray(snapshot.coverage) || !snapshot.coverage.every(x => typeof x === 'string')
        || !Array.isArray(snapshot.claims) || snapshot.claims.length > 100000
        || !Number.isFinite(snapshot.generatedAt) || snapshot.generatedAt <= previousAt
        || snapshot.generatedAt > now + 5000 || now - snapshot.generatedAt > 120000) throw new Error('Invalid, stale or mismatched Lumi reference feed.');
    const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[47][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
    const stages = ['general_generation','expression_draft','expression_final','upscale_result','background_removed','inpaint_variant','inline_illustration'];
    for (const c of snapshot.claims) if (!c || !uuid(c.assetId) || !uuid(c.metadata?.studio_pipeline_id) || (c.metadata?.studio_parent_id !== '' && !uuid(c.metadata?.studio_parent_id))
        || !stages.includes(c.metadata?.studio_stage) || Object.entries(c.metadata || {}).some(([key,value])=>key.startsWith('studio_') && typeof value !== 'string') || typeof c.assetId !== 'string' || c.metadata?.studio_asset_id !== c.assetId || c.metadata?.studio_schema !== '1'
        || c.metadata?.studio_origin !== 'lumiswarm' || typeof c.imageId !== 'string' || typeof c.swarmPath !== 'string'
        || typeof c.scope !== 'string' || typeof c.swarmPathVerified !== 'boolean'
        || typeof c.persisted !== 'boolean' || typeof c.usableCopyVerified !== 'boolean' || typeof c.protected !== 'boolean'
        || !Array.isArray(c.references) || !c.references.every(x => typeof x === 'string')) throw new Error('Invalid Lumi asset claim.');
    return snapshot;
}
export function createLumiBridge({ now = Date.now, token = () => randomBytes(32).toString('hex') } = {}) {
    let credential = '', scope = '', expiresAt = 0, receivedAt = 0, sourceUserId = '', snapshot = null;
    const authorized = bearer => { const a = Buffer.from(bearer || ''), b = Buffer.from(credential); return Boolean(credential) && expiresAt > now() && a.length === b.length && timingSafeEqual(a,b); };
    return {
        authorized,
        pair(requestedScope, origin) {
            const parsed = new URL(origin);
            const routing = JSON.parse(requestedScope);
            if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.origin !== origin
                || !Array.isArray(routing) || routing.length !== 3 || typeof routing[0] !== 'string' || typeof routing[1] !== 'string' || typeof routing[2] !== 'boolean') throw new Error('Verify the Swarm scope and Studio receiver address first.');
            credential = token(); scope = requestedScope; expiresAt = now() + 30 * 86400000; receivedAt = 0; sourceUserId = ''; snapshot = null;
            return { version: 1, url: origin + '/__studio/lumi-bridge/push', token: credential, scope, expiresAt };
        },
        accept(bearer, body) {
            if (!authorized(bearer)) throw new Error('Lumi connection credential is invalid or expired.');
            const next = validateReferenceEnvelope(body, scope, sourceUserId, snapshot?.generatedAt || 0, now());
            sourceUserId = body.sourceUserId; snapshot = structuredClone(next); receivedAt = now();
        },
        state() { return { paired: Boolean(credential) && expiresAt > now(), scope, expiresAt, receivedAt, sourceUserId, snapshot: expiresAt > now() ? snapshot : null }; },
        disconnect() { credential = ''; scope = ''; expiresAt = receivedAt = 0; snapshot = null; sourceUserId = ''; },
    };
}
async function readBody(req) {
    let size = 0; const chunks = [];
    const timer = setTimeout(() => req.destroy(new Error('Reference feed timed out.')), 8000);
    try {
        for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw new Error('Reference feed exceeds 20 MB.'); chunks.push(chunk); }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } finally { clearTimeout(timer); }
}
export function lumiBridgePlugin() {
    const install = server => {
        const bridge = createLumiBridge(), session = randomBytes(32).toString('hex');
        server.middlewares.use(async (req, res, next) => {
            const path = (req.url || '').split('?')[0]; if (!path.startsWith('/__studio/lumi-bridge/')) return next();
            res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store');
            const sameOrigin = () => { try { return new URL(String(req.headers.origin)).host === req.headers.host; } catch { return false; } };
            if (path === '/__studio/lumi-bridge/session' && req.method === 'GET' && req.headers['sec-fetch-site'] !== 'cross-site' && (!req.headers.origin || sameOrigin())) {
                res.setHeader('set-cookie', `studio_lumi=${session}; HttpOnly; SameSite=Strict; Path=/__studio/lumi-bridge${req.socket?.encrypted || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`); res.end('{}'); return;
            }
            try {
                if (path === '/__studio/lumi-bridge/push' && req.method === 'POST') {
                    if (!String(req.headers['content-type']).startsWith('application/json')) throw new Error('JSON is required.');
                    const auth = String(req.headers.authorization || '');
                    if (!/^Bearer [a-f0-9]{64}$/.test(auth) || !bridge.authorized(auth.slice(7))) throw new Error('Unauthorized reference feed.');
                    bridge.accept(auth.slice(7), await readBody(req)); res.end('{"accepted":true}'); return;
                }
                const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).includes(`studio_lumi=${session}`);
                if (!cookie || (req.headers.origin && !sameOrigin())) { res.statusCode = 401; res.end('{"error":"Studio session required."}'); return; }
                if (path === '/__studio/lumi-bridge/state' && req.method === 'GET') { res.end(JSON.stringify(bridge.state())); return; }
                if (!sameOrigin() || req.method !== 'POST') { res.statusCode = 403; res.end('{}'); return; }
                if (path === '/__studio/lumi-bridge/pair') { const body = await readBody(req); res.end(JSON.stringify(bridge.pair(body.scope, body.origin))); return; }
                if (path === '/__studio/lumi-bridge/disconnect') { bridge.disconnect(); res.end('{}'); return; }
                res.statusCode = 404; res.end('{}');
            } catch { res.statusCode = 400; res.end('{"error":"Lumi connection request was rejected. Check pairing, scope and freshness."}'); }
        });
    };
    return { name: 'studio-readonly-lumi-bridge', configureServer: install, configurePreviewServer: install };
}
