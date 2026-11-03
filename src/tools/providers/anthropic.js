// ─── Provider Adapter: Anthropic ────────────────────────────────────
// Converts internal tool definitions to Anthropic format and parses
// streaming tool_use content blocks.

/**
 * Serialize tools for the Anthropic API format.
 * @param {import('../types.js').AsteriaTool[]} tools
 * @returns {Object[]} Anthropic tools array
 */
export function serializeTools(tools) {
    return tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.schema,
    }))
}

/**
 * Parse a streaming delta into normalized tool call fragments.
 * Anthropic sends:
 *   type: "content_block_start" with content_block: { type: "tool_use", id, name }
 *   type: "content_block_delta" with delta: { type: "input_json_delta", partial_json }
 *
 * @param {Object} event - Parsed JSON event from the stream
 * @returns {Array<{ type: 'tool_call_start'|'tool_call_delta'|'tool_call_stop', id?: string, name?: string, argumentsFragment?: string }>}
 */
export function parseToolCallDeltas(event) {
    const results = []

    if (event.type === 'content_block_start') {
        const block = event.content_block
        if (block?.type === 'tool_use') {
            results.push({
                type: 'tool_call_start',
                id: block.id,
                name: block.name,
            })
        }
    } else if (event.type === 'content_block_delta') {
        const delta = event.delta
        if (delta?.type === 'input_json_delta') {
            results.push({
                type: 'tool_call_delta',
                argumentsFragment: delta.partial_json,
            })
        }
    } else if (event.type === 'content_block_stop') {
        results.push({ type: 'tool_call_stop' })
    }

    return results
}

/**
 * Check if the response has tool use blocks (non-streaming).
 * @param {Object} response
 * @returns {boolean}
 */
export function hasToolCalls(response) {
    return response.content?.some(block => block.type === 'tool_use')
}
