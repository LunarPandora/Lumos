// ─── Provider Adapter: Ollama ───────────────────────────────────────
// Ollama supports OpenAI-compatible tool calling when available.
// This adapter delegates to the OpenAI adapter format.

import { serializeTools as serializeOpenAI, parseToolCallDeltas as parseOpenAIDeltas } from './openai'

/**
 * Serialize tools for Ollama (uses OpenAI format).
 * @param {import('../types.js').AsteriaTool[]} tools
 * @returns {Object[]}
 */
export function serializeTools(tools) {
    return serializeOpenAI(tools)
}

/**
 * Parse streaming tool call deltas (uses OpenAI format).
 * @param {Object} chunk
 * @returns {Array}
 */
export function parseToolCallDeltas(chunk) {
    return parseOpenAIDeltas(chunk)
}
