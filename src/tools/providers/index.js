// ─── Provider Adapter Index ─────────────────────────────────────────
// Maps provider types to their specific tool serialization/parsing.

import * as openai from './openai'
import * as anthropic from './anthropic'
import * as ollama from './ollama'

const adapters = {
    openai,
    anthropic,
    ollama,
}

/**
 * Get the adapter for a provider type.
 * @param {'openai'|'anthropic'|'ollama'} providerType
 * @returns {{ serializeTools: Function, parseToolCallDeltas: Function }}
 */
export function getProviderAdapter(providerType) {
    return adapters[providerType] || adapters.openai
}
