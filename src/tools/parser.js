// ─── Streaming Tool-Call Parser ─────────────────────────────────────
// Accumulates fragmented tool-call deltas from streaming responses
// into complete NormalizedToolCall objects.

/**
 * Create a new parser state for accumulating tool calls.
 * @returns {import('./types.js').NormalizedToolCall[]}
 */
export function createToolCallState() {
    return []
}

/**
 * Process a set of tool-call deltas from a provider, updating the
 * accumulator state. Returns any newly completed tool calls.
 *
 * @param {import('./types.js').NormalizedToolCall[]} state - Mutable accumulator
 * @param {Array} deltas - Normalized deltas from provider adapter
 * @returns {import('./types.js').NormalizedToolCall[]} Newly completed calls
 */
export function processDeltas(state, deltas) {
    const completed = []

    for (const delta of deltas) {
        if (delta.type === 'tool_call' || delta.type === 'tool_call_start') {
            // New tool call or new ID
            if (delta.id) {
                const existing = state.find(tc => tc.id === delta.id)
                if (!existing) {
                    const newCall = {
                        id: delta.id,
                        name: delta.name || '',
                        arguments: '',
                        _complete: false,
                    }
                    state.push(newCall)
                }
            }
        }

        if (delta.type === 'tool_call' || delta.type === 'tool_call_delta') {
            // Accumulate arguments fragment
            const current = findCurrentTool(state, delta)
            if (current && delta.argumentsFragment) {
                current.arguments += delta.argumentsFragment
            }
        }

        if (delta.name) {
            const current = state.find(tc => tc.id === delta.id)
            if (current && !current.name) {
                current.name = delta.name
            }
        }
    }

    return completed
}

/**
 * Mark all in-progress tool calls as complete and parse their arguments.
 * @param {import('./types.js').NormalizedToolCall[]} state
 * @returns {import('./types.js').NormalizedToolCall[]} Completed and parsed calls
 */
export function finalizeToolCalls(state) {
    const results = []

    for (const tc of state) {
        if (tc.name) {
            let parsedArgs = {}
            try {
                parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {}
            } catch (e) {
                console.warn(`[ToolParser] Failed to parse arguments for ${tc.name}:`, e.message)
                // Create an error result instead of crashing
                results.push({
                    id: tc.id,
                    name: tc.name,
                    arguments: {},
                    _parseError: true,
                    _rawArguments: tc.arguments,
                })
                continue
            }

            results.push({
                id: tc.id,
                name: tc.name,
                arguments: parsedArgs,
            })
        }
    }

    // Clear state
    state.length = 0

    return results
}

/**
 * Check if any tool calls are in progress.
 * @param {import('./types.js').NormalizedToolCall[]} state
 * @returns {boolean}
 */
export function hasInProgressToolCalls(state) {
    return state.some(tc => tc.name && !tc._complete)
}

// ─── Helpers ────────────────────────────────────────────────────────

function findCurrentTool(state, delta) {
    // Find by ID if available, otherwise find the most recent incomplete tool
    if (delta.id) {
        return state.find(tc => tc.id === delta.id)
    }
    return state[state.length - 1]
}
