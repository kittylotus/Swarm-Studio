import type { LoraStackItem } from '../types';
import type { SwarmGenerationRequest } from '../swarm/types';

export type ExpressionLora = LoraStackItem & { triggerPhrase: string };

export function applyExpressionLoras(request: SwarmGenerationRequest, stack: ExpressionLora[]): SwarmGenerationRequest {
    const enabled = stack.filter(item => item.enabled);
    if (!enabled.length) return request;
    const triggers = enabled.filter(item => item.useTrigger).map(item => item.triggerPhrase.replaceAll(';', ',').trim()).filter(Boolean);
    return { ...request, prompt: [...triggers, request.prompt].filter(Boolean).join(', '), loras: enabled.map(item => item.name), loraweights: enabled.map(item => String(item.weight)) };
}
