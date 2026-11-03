import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import { getProvider, getApiKey } from './providers'
import { getToolDefinitions } from '../tools/registry'
import { getProviderAdapter } from '../tools/providers'
import { createToolCallState, processDeltas, finalizeToolCalls } from '../tools/parser'
import { executeTool, approveExecution, rejectExecution, pendingApprovals } from '../tools/executor'

let currentAbortController = null

export function abortGeneration() {
    if (currentAbortController) {
        currentAbortController.abort()
        currentAbortController = null
    }
}

// ─── Agent Loop ─────────────────────────────────────────────────────
// Orchestrates multi-step tool execution. After each LLM response,
// if tool calls are present, executes them and feeds results back.

export async function agentLoop(message, webData = null, file = null, callbacks = {}) {
    const chatStore = useChatStore()
    const settings = useSettingsStore()
    const { onText, onThinking, onToolCall, onToolResult, onComplete, onError } = callbacks

    const provider = getProvider(settings.currentProviderId)
    const model = settings.currentModelId
    const toolDefs = getToolDefinitions()
    const adapter = getProviderAdapter(provider.type)

    // Build initial messages
    const contextMessages = buildContext(chatStore.activeMessages)
    const hasWebData = webData?.results?.length > 0
    const messages = buildMessages(message, contextMessages, hasWebData, webData, file)

    let maxIterations = 5
    let iteration = 0

    while (iteration < maxIterations) {
        iteration++

        currentAbortController = new AbortController()
        const usage = { input: 0, output: 0 }

        try {
            console.log(`[AgentLoop] Iteration ${iteration}, calling LLM with ${messages.length} messages`)
            const response = await callLLM(provider, model, messages, toolDefs, adapter, currentAbortController.signal, usage)

            if (usage.input || usage.output) {
                settings.recordUsage(usage.input, usage.output)
            }

            // No tool calls — final text response, we're done
            if (!response.toolCalls || response.toolCalls.length === 0) {
                const finalText = response.text || response.reasoning
                if (finalText) {
                    onText?.(finalText)
                }
                onComplete?.()
                return
            }

            // Has tool calls — emit reasoning for tools UI
            const reasoningText = response.reasoning || response.text
            if (reasoningText) {
                console.log(`[AgentLoop] Reasoning: ${reasoningText.slice(0, 80)}`)
                onThinking?.(reasoningText)
            }

            // Execute each tool call sequentially
            for (const toolCall of response.toolCalls) {
                onToolCall?.(toolCall)
                console.log(`[AgentLoop] Executing tool: ${toolCall.name}`, toolCall.arguments)

                const result = await executeTool(toolCall, currentAbortController.signal)
                onToolResult?.(result)
                console.log(`[AgentLoop] Tool result: ${toolCall.name} → ${result.status}`)

                // Build messages for next LLM call
                messages.push({
                    role: 'assistant',
                    content: response.text || null,
                    tool_calls: [{
                        id: toolCall.id,
                        type: 'function',
                        function: {
                            name: toolCall.name,
                            arguments: JSON.stringify(toolCall.arguments),
                        },
                    }],
                })

                // Add the tool result
                const resultContent = result.status === 'success'
                    ? truncateResult(JSON.stringify(result.data), 4000)
                    : JSON.stringify(result.error || { message: 'Tool execution failed' })

                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: resultContent,
                })
            }

            // Loop continues — LLM will respond to tool results

        } catch (err) {
            console.error(`[AgentLoop] Error in iteration ${iteration}:`, err)
            streamingCid.value = null
            onError?.(err)
            return
        }
    }

    console.warn('[AgentLoop] Max iterations reached')
    onComplete?.()
}

// ─── Single-shot generation (backward compatible) ───────────────────

export async function generateAIResponse(message, webData = null, file = null) {
    const chatStore = useChatStore()
    const settings = useSettingsStore()

    const contextMessages = buildContext(chatStore.activeMessages)
    const hasWebData = webData?.results?.length > 0
    const messages = buildMessages(message, contextMessages, hasWebData, webData, file)

    const provider = getProvider(settings.currentProviderId)
    const model = settings.currentModelId

    currentAbortController = new AbortController()
    const usage = { input: 0, output: 0 }

    try {
        let stream
        if (provider.type === 'ollama') {
            stream = await streamOllama(provider, model, messages, currentAbortController.signal, usage)
        } else if (provider.type === 'anthropic') {
            stream = await streamAnthropic(provider, model, messages, currentAbortController.signal, usage)
        } else {
            stream = await streamOpenAICompatible(provider, model, messages, currentAbortController.signal, usage)
        }

        return { stream, usage }
    } catch (err) {
        currentAbortController = null
        if (err.name === 'AbortError') {
            throw new Error('GENERATION_ABORTED')
        }
        throw err
    }
}

// ─── LLM Call (non-streaming for agent loop) ────────────────────────

async function callLLM(provider, model, messages, toolDefs, adapter, signal, usage) {
    const apiKey = getApiKey(provider.id)
    const tools = toolDefs.length > 0 ? adapter.serializeTools(toolDefs) : undefined

    console.log(`[callLLM] Provider: ${provider.id}, model: ${model}, tools: ${tools?.length || 0}, messages: ${messages.length}`)

    if (provider.type === 'anthropic') {
        return callAnthropic(provider, model, messages, tools, apiKey, signal, usage)
    }

    // OpenAI-compatible (OpenAI, OpenCode, OpenRouter, Custom, Ollama)
    return callOpenAICompatible(provider, model, messages, tools, apiKey, signal, usage)
}

async function callOpenAICompatible(provider, model, messages, tools, apiKey, signal, usage) {
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    if (provider.id === 'opencode') {
        headers['x-opencode-session'] = `asteria-${Date.now().toString(36)}`
    }

    const body = { model, messages, stream: false }
    if (tools?.length > 0) body.tools = tools

    console.log(`[callOpenAI] URL: ${provider.baseURL}/chat/completions`)
    console.log(`[callOpenAI] Body:`, JSON.stringify(body).slice(0, 500))

    const res = await smartFetch(`${provider.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
        proxyOnly: provider.id === 'opencode',
    })

    if (!res.ok) {
        const errorText = await res.text().catch(() => '')
        console.error(`[callOpenAI] Error: ${res.status}`, errorText)
        throw new Error(`API error ${res.status}: ${errorText || res.statusText}`)
    }

    const json = await res.json()
    console.log(`[callOpenAI] Response:`, JSON.stringify(json).slice(0, 500))

    if (json.usage) {
        usage.input = json.usage.prompt_tokens || 0
        usage.output = json.usage.completion_tokens || 0
    }

    const choice = json.choices?.[0]
    const text = choice?.message?.content || null
    const reasoning = choice?.message?.reasoning || null
    const toolCalls = (choice?.message?.tool_calls || []).map(tc => ({
        id: tc.id,
        name: tc.function?.name || '',
        arguments: safeParse(tc.function?.arguments || '{}'),
    }))

    return { text, reasoning, toolCalls }
}

async function callAnthropic(provider, model, messages, tools, apiKey, signal, usage) {
    if (!apiKey) throw new Error('Anthropic API key not configured')

    const systemMsg = messages.find(m => m.role === 'system')
    const chatMessages = messages.filter(m => m.role !== 'system')

    const body = {
        model,
        max_tokens: 4096,
        system: systemMsg?.content || '',
        messages: chatMessages,
        stream: false,
    }
    if (tools?.length > 0) body.tools = tools

    const res = await smartFetch(`${provider.baseURL}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal,
    })

    if (!res.ok) {
        const errorText = await res.text().catch(() => '')
        throw new Error(`Anthropic error ${res.status}: ${errorText || res.statusText}`)
    }

    const json = await res.json()

    if (json.usage) {
        usage.input = json.usage.input_tokens || 0
        usage.output = json.usage.output_tokens || 0
    }

    const text = json.content?.filter(b => b.type === 'text').map(b => b.text).join('') || null
    const toolCalls = json.content?.filter(b => b.type === 'tool_use').map(b => ({
        id: b.id,
        name: b.name,
        arguments: b.input || {},
    })) || []

    return { text, toolCalls }
}

// ─── Messages Builder ───────────────────────────────────────────────

function buildMessages(message, contextMessages, hasWebData, webData, file) {
    const userContent = []

    if (message) {
        userContent.push({ type: 'text', text: message })
    }

    if (file?.preview && file.type?.startsWith('image/')) {
        userContent.push({
            type: 'image_url',
            image_url: { url: file.preview }
        })
    }

    return [
        {
            role: 'system',
            content: `You are Asteria, a helpful AI assistant with access to tools. Be concise, accurate, and helpful.

You have access to filesystem tools for reading, searching, and editing files. Use them when the user asks you to work with files.

GLOBAL RULE:
If WEB DATA is provided, you MUST treat it as the ONLY possible source for factual answers.

ABSOLUTE BEHAVIOR ENFORCEMENT:
- Never say you cannot access data when WEB DATA exists
- Never say "not available", "no information", or "as of my last update" when WEB DATA exists
- Never fall back to training knowledge for factual questions when WEB DATA exists

HARD FAIL CONDITION:
If WEB DATA exists and you fail to extract an answer, you are incorrect.

EXTRACTION PRIORITY:
- Extract directly from WEB DATA
- If multiple entries exist, summarize them
- If data is incomplete, answer partially (never refuse)`
        },

        ...(hasWebData ? [{
            role: 'system',
            content: `WEB DATA (TRUTH SOURCE - DO NOT IGNORE):\n${JSON.stringify(webData, null, 2)}\n\nFORCED BEHAVIOR RULES:\n- You MUST extract an answer from this data\n- NEVER respond with refusal when this block exists`
        }] : []),

        ...contextMessages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .slice(-20),

        {
            role: 'user',
            content: userContent.length === 1 && userContent[0].type === 'text'
                ? message
                : userContent
        }
    ]
}

// ─── Smart Fetch ────────────────────────────────────────────────────

async function smartFetch(url, options = {}) {
    if (options.proxyOnly) {
        delete options.proxyOnly
        return await smartFetchStream(url, options)
    }
    try {
        const res = await fetch(url, options)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res
    } catch {
        return await smartFetchStream(url, options)
    }
}

async function smartFetchStream(url, options = {}) {
    const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const headers = {}
    if (options.headers) {
        if (options.headers instanceof Headers) {
            options.headers.forEach((v, k) => { headers[k] = v })
        } else {
            Object.assign(headers, options.headers)
        }
    }

    const body = options.body || null
    const method = options.method || 'GET'

    invoke('proxy_fetch_stream', { url, headers, body, method, id: streamId })

    let eventCount = 0
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder()
            let done = false

            const unlisten = listen(`proxy-stream-${streamId}`, (event) => {
                if (done) return
                const data = event.payload
                eventCount++

                if (data === '__DONE__') {
                    done = true
                    controller.close()
                    unlisten.then(fn => fn())
                    return
                }

                if (data.startsWith('__ERROR__')) {
                    done = true
                    controller.error(new Error(data.slice(9)))
                    unlisten.then(fn => fn())
                    return
                }

                try {
                    const parsed = JSON.parse(data)
                    if (parsed.type === 'error') {
                        done = true
                        const msg = parsed.error?.message || parsed.error?.type || 'Unknown provider error'
                        controller.error(new Error(msg))
                        unlisten.then(fn => fn())
                        return
                    }
                } catch {}

                controller.enqueue(encoder.encode(data))
            })
        }
    })

    return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
    })
}

// ─── Streaming Functions ────────────────────────────────────────────

async function streamOllama(provider, model, messages, signal, usage) {
    const res = await smartFetch(`${provider.baseURL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, stream: true, messages }),
        signal,
    })

    if (!res.ok) {
        const errorText = await res.text().catch(() => '')
        throw new Error(`Ollama error ${res.status}: ${errorText || res.statusText}`)
    }

    if (!res.body) throw new Error('No stream from Ollama')

    return createAsyncIterator(res.body, signal, (line) => {
        const json = JSON.parse(line)
        if (json.prompt_eval_count !== undefined) usage.input = json.prompt_eval_count
        if (json.eval_count !== undefined) usage.output = json.eval_count
        return json.message?.content || null
    })
}

async function streamAnthropic(provider, model, messages, signal, usage) {
    const apiKey = getApiKey(provider.id)
    if (!apiKey) throw new Error('Anthropic API key not configured. Go to Settings to add it.')

    const systemMsg = messages.find(m => m.role === 'system')
    const chatMessages = messages.filter(m => m.role !== 'system')

    const res = await smartFetch(`${provider.baseURL}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            max_tokens: 4096,
            system: systemMsg?.content || '',
            messages: chatMessages,
            stream: true,
        }),
        signal,
    })

    if (!res.ok) {
        const errorText = await res.text().catch(() => '')
        throw new Error(`Anthropic error ${res.status}: ${errorText || res.statusText}`)
    }

    if (!res.body) throw new Error('No stream from Anthropic')

    return createAsyncIterator(res.body, signal, (line) => {
        const json = JSON.parse(line)
        if (json.type === 'content_block_delta') return json.delta?.text || null
        if (json.type === 'message_delta' && json.usage) usage.output = json.usage.output_tokens || 0
        if (json.type === 'message_start' && json.message?.usage) usage.input = json.message.usage.input_tokens || 0
        return null
    })
}

async function streamOpenAICompatible(provider, model, messages, signal, usage) {
    const apiKey = getApiKey(provider.id)

    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    if (provider.id === 'opencode') {
        headers['x-opencode-session'] = `asteria-${Date.now().toString(36)}`
    }

    const res = await smartFetch(`${provider.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model,
            stream: true,
            stream_options: { include_usage: true },
            messages,
        }),
        signal,
        proxyOnly: provider.id === 'opencode',
    })

    if (!res.ok) {
        const errorText = await res.text().catch(() => '')
        throw new Error(`API error ${res.status}: ${errorText || res.statusText}`)
    }

    if (!res.body) throw new Error('No stream from API')

    return createAsyncIterator(res.body, signal, (line) => {
        const json = JSON.parse(line)
        if (json.usage) {
            usage.input = json.usage.prompt_tokens || 0
            usage.output = json.usage.completion_tokens || 0
        }
        return json.choices?.[0]?.delta?.content || null
    })
}

function createAsyncIterator(body, signal, parser) {
    const reader = body.getReader()
    const decoder = new TextDecoder()

    return {
        async *[Symbol.asyncIterator]() {
            let buffer = ''

            try {
                while (true) {
                    if (signal.aborted) break

                    const { value, done } = await reader.read()
                    if (done) break

                    const raw = decoder.decode(value, { stream: true })
                    buffer += raw

                    const lines = buffer.split('\n')
                    buffer = lines.pop() || ''

                    for (const line of lines) {
                        const trimmed = line.trim()
                        if (!trimmed || trimmed === 'data: [DONE]') continue

                        const dataLine = trimmed.startsWith('data: ')
                            ? trimmed.slice(6)
                            : trimmed

                        if (!dataLine) continue

                        try {
                            const token = parser(dataLine)
                            if (token) yield token
                        } catch {}
                    }
                }

                if (buffer.trim() && buffer.trim() !== 'data: [DONE]') {
                    const dataLine = buffer.trim().startsWith('data: ')
                        ? buffer.trim().slice(6)
                        : buffer.trim()

                    if (dataLine) {
                        try {
                            const token = parser(dataLine)
                            if (token) yield token
                        } catch {}
                    }
                }
            } finally {
                reader.releaseLock()
            }
        }
    }
}

// ─── Context Cleaning ───────────────────────────────────────────────

function buildContext(messages, maxMessages = 20) {
    return messages
        .filter(m => {
            if (m.role !== 'assistant') return true
            const t = (m.content || '').toLowerCase()
            const isRefusal =
                t.includes('as of my last update') ||
                t.includes('october 2023') ||
                t.includes('no real-time') ||
                t.includes('cannot provide') ||
                t.includes('unable to provide') ||
                t.includes('please check') ||
                t.includes('not available')
            return !isRefusal
        })
        .slice(-maxMessages)
        .map(m => ({
            role: m.role,
            content: m.content || ''
        }))
}

// ─── Helpers ────────────────────────────────────────────────────────

function safeParse(str) {
    try { return JSON.parse(str) }
    catch { return {} }
}

function truncateResult(str, maxLen) {
    if (str.length <= maxLen) return str
    return str.slice(0, maxLen) + '\n\n[Result truncated — too large to include in full]'
}

export { approveExecution, rejectExecution, pendingApprovals }
