// ─── Tool Executor ──────────────────────────────────────────────────
// Generic tool execution engine with policy evaluation, approval
// flow, timeout, and cancellation support.

import { reactive } from 'vue'
import { getTool, getToolPolicy } from './registry'

/** @type {import('./types.js').ToolExecution[]} */
export const executionHistory = reactive([])

/** Active approvals awaiting user decision */
export const pendingApprovals = reactive(new Map())

/** Event listeners */
const listeners = new Map()

/**
 * Execute a tool call with full policy evaluation.
 * @param {import('./types.js').NormalizedToolCall} toolCall
 * @param {AbortSignal} [signal]
 * @returns {Promise<import('./types.js').ToolResult>}
 */
export async function executeTool(toolCall, signal) {
    const executionId = crypto.randomUUID()
    const startTime = Date.now()

    const tool = getTool(toolCall.name)
    if (!tool) {
        return makeError(executionId, toolCall.name, 'TOOL_NOT_FOUND', `Tool not found: ${toolCall.name}`)
    }

    // Validate arguments against schema
    const validationError = validateArgs(tool, toolCall.arguments)
    if (validationError) {
        return makeError(executionId, toolCall.name, 'INVALID_ARGUMENTS', validationError)
    }

    const policy = getToolPolicy(toolCall.name) || tool.policy

    // Create execution record
    const execution = reactive({
        executionId,
        toolName: toolCall.name,
        toolCall,
        state: 'queued',
        result: null,
        startedAt: startTime,
        completedAt: null,
        timeout: 60000,
        signal,
    })

    executionHistory.push(execution)
    emit('queued', execution)

    try {
        // Policy check: requires approval?
        if (policy.requiresApproval && !policy.autoExecute) {
            execution.state = 'awaiting_approval'
            emit('awaiting_approval', execution)

            const approved = await requestApproval(execution, tool)
            if (!approved) {
                execution.state = 'declined'
                execution.result = makeResult(executionId, toolCall.name, 'declined')
                execution.completedAt = Date.now()
                emit('declined', execution)
                return execution.result
            }
        }

        // Execute
        execution.state = 'executing'
        emit('executing', execution)

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT')), execution.timeout)
        )

        const execPromise = tool.execute(toolCall.arguments)

        const result = await Promise.race([execPromise, timeoutPromise])

        execution.state = 'success'
        execution.result = { ...result, executionId }
        execution.completedAt = Date.now()
        emit('completed', execution)
        return execution.result

    } catch (err) {
        const errorCode = err.message === 'TIMEOUT' ? 'TIMEOUT' : 'EXECUTION_ERROR'
        const errorMsg = err.message === 'TIMEOUT' ? 'Tool execution timed out' : err.message

        execution.state = 'error'
        execution.result = makeError(executionId, toolCall.name, errorCode, errorMsg)
        execution.completedAt = Date.now()
        emit('failed', execution)
        return execution.result

    } finally {
        const duration = (execution.completedAt || Date.now()) - startTime
        console.log(`[ToolExecutor] ${toolCall.name} → ${execution.state} (${duration}ms)`)
    }
}

/**
 * Cancel a pending or executing tool.
 * @param {string} executionId
 */
export function cancelExecution(executionId) {
    const execution = executionHistory.find(e => e.executionId === executionId)
    if (execution && (execution.state === 'awaiting_approval' || execution.state === 'executing')) {
        execution.state = 'cancelled'
        execution.result = makeResult(executionId, execution.toolName, 'cancelled')
        execution.completedAt = Date.now()
        if (execution.signal?.abort) execution.signal.abort()
        emit('cancelled', execution)
    }
}

// ─── Approval ───────────────────────────────────────────────────────

function requestApproval(execution, tool) {
    return new Promise((resolve) => {
        const request = {
            executionId: execution.executionId,
            toolName: execution.toolName,
            title: formatTitle(tool),
            description: formatDescription(tool, execution.toolCall.arguments),
            risk: execution.toolCall.risk || tool.policy.risk,
            preview: null,
            _resolve: resolve,
        }

        // Generate preview if supported
        if (tool.preview && tool.policy.supportsPreview) {
            tool.preview(execution.toolCall.arguments)
                .then(preview => {
                    request.preview = preview
                })
                .catch(() => {})
        }

        pendingApprovals.set(execution.executionId, request)
        emit('approval_requested', request)
    })
}

/**
 * Approve a pending tool execution.
 * @param {string} executionId
 */
export function approveExecution(executionId) {
    const request = pendingApprovals.get(executionId)
    if (request) {
        request._resolve(true)
        pendingApprovals.delete(executionId)
        emit('approved', { executionId })
    }
}

/**
 * Reject a pending tool execution.
 * @param {string} executionId
 */
export function rejectExecution(executionId) {
    const request = pendingApprovals.get(executionId)
    if (request) {
        request._resolve(false)
        pendingApprovals.delete(executionId)
        emit('rejected', { executionId })
    }
}

// ─── Event System ───────────────────────────────────────────────────

/**
 * Subscribe to tool execution events.
 * @param {string} event
 * @param {Function} callback
 * @returns {Function} Unsubscribe function
 */
export function onToolEvent(event, callback) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event).add(callback)
    return () => listeners.get(event)?.delete(callback)
}

function emit(event, data) {
    const callbacks = listeners.get(event)
    if (callbacks) {
        for (const cb of callbacks) {
            try { cb(data) } catch (e) { console.error(`[ToolExecutor] Event listener error:`, e) }
        }
    }
}

// ─── Helpers ────────────────────────────────────────────────────────

function validateArgs(tool, args) {
    const schema = tool.schema
    if (!schema?.required) return null

    for (const field of schema.required) {
        if (!(field in args) || args[field] === undefined || args[field] === null) {
            return `Missing required argument: ${field}`
        }
    }
    return null
}

function makeResult(executionId, toolName, status, data = null) {
    return { executionId, toolName, status, data }
}

function makeError(executionId, toolName, code, message) {
    return {
        executionId,
        toolName,
        status: 'error',
        error: { code, message },
    }
}

function formatTitle(tool) {
    const titles = {
        read_file: 'Read File',
        list_files: 'List Directory',
        search_code: 'Search Code',
        edit_file: 'Edit File',
        write_file: 'Write File',
    }
    return titles[tool.name] || tool.name
}

function formatDescription(tool, args) {
    switch (tool.name) {
        case 'read_file': return `Read ${args.path}`
        case 'list_files': return `List ${args.recursive ? 'recursively: ' : ''}${args.path}`
        case 'search_code': return `Search for "${args.query}"${args.path ? ` in ${args.path}` : ''}`
        case 'edit_file': return `Edit ${args.path}`
        case 'write_file': return `${args.content?.includes('\n') ? 'Create' : 'Write'} ${args.path}`
        default: return `Execute ${tool.name}`
    }
}
