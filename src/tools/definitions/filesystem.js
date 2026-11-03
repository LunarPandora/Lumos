// ─── Filesystem Tools ───────────────────────────────────────────────
// Tool definitions for file operations. Each tool defines its schema,
// policy, and execution logic (delegating to Tauri Rust commands).

import { invoke } from '@tauri-apps/api/core'
import { registerTool } from '../registry'

// ─── read_file ──────────────────────────────────────────────────────

registerTool({
    name: 'read_file',
    description: 'Read the contents of a file. Returns the full content with line count and file size.',
    category: 'filesystem',
    schema: {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'Absolute or relative path to the file' },
        },
        required: ['path'],
    },
    policy: {
        autoExecute: true,
        risk: 'low',
        reversible: true,
        requiresApproval: false,
        supportsPreview: false,
    },
    async execute(args) {
        const result = await invoke('tool_read_file', { path: args.path })
        return {
            executionId: crypto.randomUUID(),
            toolName: 'read_file',
            status: 'success',
            data: result,
            metadata: { path: args.path, lines: result.lines, size: result.size },
        }
    },
})

// ─── list_files ─────────────────────────────────────────────────────

registerTool({
    name: 'list_files',
    description: 'List files and directories at a path. Optionally list recursively.',
    category: 'filesystem',
    schema: {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'Directory path to list' },
            recursive: { type: 'boolean', description: 'List recursively (default: false)', default: false },
        },
        required: ['path'],
    },
    policy: {
        autoExecute: true,
        risk: 'low',
        reversible: true,
        requiresApproval: false,
        supportsPreview: false,
    },
    async execute(args) {
        const result = await invoke('tool_list_files', {
            path: args.path,
            recursive: args.recursive ?? false,
        })
        return {
            executionId: crypto.randomUUID(),
            toolName: 'list_files',
            status: 'success',
            data: result,
            metadata: { path: args.path, total: result.total },
        }
    },
})

// ─── search_code ────────────────────────────────────────────────────

registerTool({
    name: 'search_code',
    description: 'Search for a pattern in source code files. Returns matching lines with file paths and line numbers.',
    category: 'filesystem',
    schema: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Search string or regex pattern' },
            path: { type: 'string', description: 'Directory to search in (default: current workspace)' },
            file_pattern: { type: 'string', description: 'File extension filter, e.g. ".js", ".vue" (default: all files)' },
        },
        required: ['query'],
    },
    policy: {
        autoExecute: true,
        risk: 'low',
        reversible: true,
        requiresApproval: false,
        supportsPreview: false,
    },
    async execute(args) {
        const result = await invoke('tool_search_code', {
            query: args.query,
            path: args.path ?? null,
            filePattern: args.file_pattern ?? null,
        })
        return {
            executionId: crypto.randomUUID(),
            toolName: 'search_code',
            status: 'success',
            data: result,
            metadata: {
                query: args.query,
                totalMatches: result.total_matches,
                totalFiles: result.total_files,
            },
        }
    },
})

// ─── edit_file ──────────────────────────────────────────────────────

registerTool({
    name: 'edit_file',
    description: 'Edit a file by replacing a specific text block. The old_text must exist in the file.',
    category: 'filesystem',
    schema: {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'Path to the file to edit' },
            old_text: { type: 'string', description: 'The exact text to find and replace' },
            new_text: { type: 'string', description: 'The replacement text' },
        },
        required: ['path', 'old_text', 'new_text'],
    },
    policy: {
        autoExecute: false,
        risk: 'high',
        reversible: true,
        requiresApproval: true,
        supportsPreview: true,
    },
    async preview(args) {
        const oldLines = args.old_text.split('\n')
        const newLines = args.new_text.split('\n')
        return {
            type: 'diff',
            filePath: args.path,
            diff: [
                ...oldLines.map(line => ({ type: 'removed', line: `- ${line}` })),
                ...newLines.map(line => ({ type: 'added', line: `+ ${line}` })),
            ],
        }
    },
    async execute(args) {
        const result = await invoke('tool_edit_file', {
            path: args.path,
            oldText: args.old_text,
            newText: args.new_text,
        })
        return {
            executionId: crypto.randomUUID(),
            toolName: 'edit_file',
            status: 'success',
            data: result,
            metadata: { path: args.path },
        }
    },
})

// ─── write_file ─────────────────────────────────────────────────────

registerTool({
    name: 'write_file',
    description: 'Create or overwrite a file with the given content.',
    category: 'filesystem',
    schema: {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'Path to the file to write' },
            content: { type: 'string', description: 'The full content to write to the file' },
        },
        required: ['path', 'content'],
    },
    policy: {
        autoExecute: false,
        risk: 'high',
        reversible: false,
        requiresApproval: true,
        supportsPreview: true,
    },
    async preview(args) {
        const lines = args.content.split('\n')
        return {
            type: args.path.includes('/') ? 'content' : 'info',
            filePath: args.path,
            content: args.content,
            info: `Create new file: ${args.path}`,
        }
    },
    async execute(args) {
        const result = await invoke('tool_write_file', {
            path: args.path,
            content: args.content,
        })
        return {
            executionId: crypto.randomUUID(),
            toolName: 'write_file',
            status: 'success',
            data: result,
            metadata: { path: args.path, bytesWritten: result.bytes_written, isNew: result.is_new },
        }
    },
})
