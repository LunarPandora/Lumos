// ─── Tool Registry ──────────────────────────────────────────────────
// Central registry for all available tools. Single source of truth
// for tool metadata, schemas, and policies.

import { reactive } from 'vue'

/** @type {Map<string, import('./types.js').AsteriaTool>} */
const tools = new Map()

/** @type {Map<string, import('./types.js').ToolPolicy>} */
const policies = new Map()

/**
 * Register a tool.
 * @param {import('./types.js').AsteriaTool} tool
 */
export function registerTool(tool) {
    if (tools.has(tool.name)) {
        console.warn(`[ToolRegistry] Overwriting tool: ${tool.name}`)
    }
    tools.set(tool.name, tool)
    policies.set(tool.name, tool.policy)
    console.log(`[ToolRegistry] Registered: ${tool.name} (${tool.category})`)
}

/**
 * Register multiple tools.
 * @param {import('./types.js').AsteriaTool[]} toolList
 */
export function registerTools(toolList) {
    toolList.forEach(registerTool)
}

/**
 * Get a tool by name.
 * @param {string} name
 * @returns {import('./types.js').AsteriaTool|undefined}
 */
export function getTool(name) {
    return tools.get(name)
}

/**
 * Check if a tool exists.
 * @param {string} name
 * @returns {boolean}
 */
export function hasTool(name) {
    return tools.has(name)
}

/**
 * Get all registered tools.
 * @returns {import('./types.js').AsteriaTool[]}
 */
export function getAllTools() {
    return Array.from(tools.values())
}

/**
 * Get tools by category.
 * @param {string} category
 * @returns {import('./types.js').AsteriaTool[]}
 */
export function getToolsByCategory(category) {
    return getAllTools().filter(t => t.category === category)
}

/**
 * Get all tool schemas formatted for provider API.
 * Provider adapters call this and then convert to their specific format.
 * @returns {Object[]} Array of { name, description, schema, policy }
 */
export function getToolDefinitions() {
    return getAllTools().map(tool => ({
        name: tool.name,
        description: tool.description,
        category: tool.category,
        schema: tool.schema,
        policy: tool.policy,
    }))
}

/**
 * Get policy for a tool.
 * @param {string} name
 * @returns {import('./types.js').ToolPolicy|undefined}
 */
export function getToolPolicy(name) {
    return policies.get(name)
}

/**
 * Clear all tools (for testing).
 */
export function clearRegistry() {
    tools.clear()
    policies.clear()
}

/**
 * Get reactive tool count (for UI reactivity).
 */
export const toolCount = reactive({ value: 0 })

export function updateToolCount() {
    toolCount.value = tools.size
}
