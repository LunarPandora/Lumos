// ─── Tool Definition ────────────────────────────────────────────────
// Registered in the ToolRegistry. Describes what a tool does, its
// schema, policy, and implementation.

/**
 * @typedef {Object} ToolPolicy
 * @property {boolean} autoExecute - Execute without user approval
 * @property {'low'|'medium'|'high'|'critical'} risk - Risk level
 * @property {boolean} reversible - Can the operation be undone
 * @property {boolean} requiresApproval - Must user approve before execution
 * @property {boolean} supportsPreview - Can generate a preview/diff
 */

/**
 * @typedef {Object} AsteriaTool
 * @property {string} name - Unique tool identifier
 * @property {string} description - Human-readable description
 * @property {string} category - Tool category (filesystem, system, web, etc.)
 * @property {Object} schema - JSON Schema for arguments
 * @property {ToolPolicy} policy - Execution policy
 * @property {(args: Object) => Promise<ToolResult>} execute - Implementation
 * @property {(args: Object) => Promise<ToolPreview>} [preview] - Preview generator
 */

// ─── Tool Call ──────────────────────────────────────────────────────
// A request from the LLM to execute a tool.

/**
 * @typedef {Object} NormalizedToolCall
 * @property {string} id - Unique call ID (from provider or generated)
 * @property {string} name - Tool name to execute
 * @property {Record<string, unknown>} arguments - Parsed arguments
 */

// ─── Tool Result ────────────────────────────────────────────────────
// The outcome of a tool execution.

/**
 * @typedef {Object} ToolResult
 * @property {string} executionId - Links to the execution
 * @property {string} toolName - Tool that was executed
 * @property {'success'|'error'|'declined'|'cancelled'|'timeout'} status
 * @property {*} [data] - Result data
 * @property {{ code: string, message: string, details?: * }} [error]
 * @property {Record<string, *>} [metadata]
 */

// ─── Tool Execution ─────────────────────────────────────────────────
// Tracks the lifecycle of a single tool execution.

/**
 * @typedef {'queued'|'awaiting_approval'|'executing'|'success'|'error'|'declined'|'cancelled'|'timeout'} ToolExecutionState
 */

/**
 * @typedef {Object} ToolExecution
 * @property {string} executionId
 * @property {string} toolName
 * @property {NormalizedToolCall} toolCall
 * @property {ToolExecutionState} state
 * @property {ToolResult|null} result
 * @property {number} startedAt
 * @property {number} [completedAt]
 * @property {number} timeout - ms
 * @property {AbortSignal} [signal]
 */

// ─── Tool Approval ──────────────────────────────────────────────────
// Presented to the user when a tool requires approval.

/**
 * @typedef {Object} ToolApprovalRequest
 * @property {string} executionId
 * @property {string} toolName
 * @property {string} title - Human-readable action title
 * @property {string} description - What the tool will do
 * @property {'low'|'medium'|'high'|'critical'} risk
 * @property {ToolPreview} [preview]
 */

/**
 * @typedef {Object} ToolPreview
 * @property {'diff'|'content'|'info'} type
 * @property {string} [filePath]
 * @property {Array<{ type: 'added'|'removed'|'context', line: string }>} [diff]
 * @property {string} [content]
 * @property {string} [info]
 */

// ─── Tool Events ────────────────────────────────────────────────────
// Lifecycle events emitted by the executor.

/**
 * @typedef {Object} ToolEventBase
 * @property {string} executionId
 * @property {string} toolName
 * @property {number} timestamp
 */

// ToolEvent = ToolQueued | ToolApprovalRequested | ToolApproved | ToolRejected |
//             ToolStarted | ToolCompleted | ToolFailed | ToolCancelled
