// ─── Provider Adapter: OpenAI / OpenCode / OpenRouter / Custom ──────
// Converts internal tool definitions to OpenAI function-calling format
// and parses streaming tool_call deltas.

/**
 * Serialize tools for the OpenAI API format.
 * @param {import('../types.js').AsteriaTool[]} tools
 * @returns {Object[]} OpenAI tools array
 */
export function serializeTools(tools) {
    return tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.schema,
        },
    }))
}

/**
 * Parse a streaming delta into normalized tool call fragments.
 * Handles the OpenAI streaming format where tool calls arrive as:
 *   choices[0].delta.tool_calls[{ index, id, function: { name, arguments } }]
 *
 * @param {Object} chunk - Parsed JSON chunk from the stream
 * @returns {Array<{ type: 'tool_call', index: number, id?: string, name?: string, argumentsFragment?: string }>}
 */
export function parseToolCallDeltas(chunk) {
    const deltas = []
    const toolCalls = chunk.choices?.[0]?.delta?.tool_calls

    if (!toolCalls || !Array.isArray(toolCalls)) return deltas

    for (const tc of toolCalls) {
        deltas.push({
            type: 'tool_call',
            index: tc.index ?? 0,
            id: tc.id ?? undefined,
            name: tc.function?.name ?? undefined,
            argumentsFragment: tc.function?.arguments ?? undefined,
        })
    }

    return deltas
}

/**
 * Check if the response has tool calls (non-streaming).
 * @param {Object} response
 * @returns {boolean}
 */
export function hasToolCalls(response) {
    return response.choices?.[0]?.message?.tool_calls?.length > 0
}
