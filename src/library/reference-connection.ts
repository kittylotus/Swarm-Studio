import { runtime } from '../runtime';
import { parseLumiSnapshot, type LumiSnapshot } from './vacuum.ts';
export interface LumiLinkState { paired: boolean; scope: string; expiresAt: number; receivedAt: number; sourceUserId: string; snapshot: LumiSnapshot | null }
export interface LumiPairing { version: 1; url: string; token: string; scope: string; expiresAt: number }
let sessionReady = false;
export async function lumiReferenceBridge<T>(action: 'pair' | 'state' | 'disconnect', options: { scope?: string; origin?: string } = {}): Promise<T> {
    if (runtime.kind === 'tauri') {
        const { invoke } = await import('@tauri-apps/api/core');
        return invoke<T>('lumi_reference_bridge', { action, scope: options.scope || null, origin: options.origin || null });
    }
    const request = async (retry = true): Promise<T> => {
        if (!sessionReady) {
            const response = await fetch('/__studio/lumi-bridge/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000) });
            if (!response.ok) throw new Error('Live reference receiver is unavailable on this Studio host.'); sessionReady = true;
        }
        const response = await fetch('/__studio/lumi-bridge/' + action, { method: action === 'state' ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: action === 'state' ? {} : { 'Content-Type': 'application/json' }, body: action === 'state' ? undefined : JSON.stringify(options), signal: AbortSignal.timeout(8000) });
        if (response.status === 401 && retry) { sessionReady = false; return request(false); }
        if (!response.ok) throw new Error('Reference receiver rejected the request. Check pairing and scope.');
        return response.json();
    };
    return request();
}
export function liveSnapshot(state: LumiLinkState, scope: string, now = Date.now()): LumiSnapshot | null {
    if (!state.paired || state.scope !== scope || state.expiresAt <= now || !state.receivedAt || now - state.receivedAt > 150000 || state.receivedAt > now + 5000 || !state.snapshot) return null;
    return parseLumiSnapshot(state.snapshot);
}
