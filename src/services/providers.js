import { invoke } from '@tauri-apps/api/core'

export const PROVIDERS = {
    ollama: {
        id: 'ollama',
        name: 'Ollama (Local)',
        baseURL: 'http://localhost:11434',
        type: 'ollama',
        requiresKey: false,
        models: [
            { id: 'qwen2.5-coder:7b-instruct', name: 'Qwen 2.5 Coder 7B' },
            { id: 'llama3.1:8b', name: 'Llama 3.1 8B' },
            { id: 'mistral:7b', name: 'Mistral 7B' },
            { id: 'codellama:7b', name: 'CodeLlama 7B' },
            { id: 'deepseek-coder:6.7b', name: 'DeepSeek Coder 6.7B' },
            { id: 'phi3:mini', name: 'Phi-3 Mini' },
            { id: 'gemma2:9b', name: 'Gemma 2 9B' },
        ]
    },
    openai: {
        id: 'openai',
        name: 'OpenAI',
        baseURL: 'https://api.openai.com/v1',
        type: 'openai',
        requiresKey: true,
        envKey: 'OPENAI_API_KEY',
        models: []
    },
    anthropic: {
        id: 'anthropic',
        name: 'Anthropic',
        baseURL: 'https://api.anthropic.com/v1',
        type: 'anthropic',
        requiresKey: true,
        envKey: 'ANTHROPIC_API_KEY',
        models: []
    },
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter',
        baseURL: 'https://openrouter.ai/api/v1',
        type: 'openai',
        requiresKey: true,
        envKey: 'OPENROUTER_API_KEY',
        models: []
    },
    opencode: {
        id: 'opencode',
        name: 'OpenCode Zen',
        baseURL: 'https://opencode.ai/zen/v1',
        type: 'openai',
        requiresKey: true,
        envKey: 'OPENCODE_API_KEY',
        models: []
    },
    custom: {
        id: 'custom',
        name: 'Custom (OpenAI-Compatible)',
        baseURL: 'http://localhost:8080/v1',
        type: 'openai',
        requiresKey: false,
        models: []
    }
}

export function getProvider(id) {
    return PROVIDERS[id] || PROVIDERS.ollama
}

export function getModelsForProvider(providerId) {
    const provider = getProvider(providerId)
    return provider.models
}

export function saveApiKey(providerId, key) {
    localStorage.setItem(`asteria_api_key_${providerId}`, key)
}

export function getApiKey(providerId) {
    return localStorage.getItem(`asteria_api_key_${providerId}`) || ''
}

export function removeApiKey(providerId) {
    localStorage.removeItem(`asteria_api_key_${providerId}`)
}

// Use Tauri Rust proxy to bypass CORS
async function proxyFetch(url, headers = {}, method = 'GET') {
    return await invoke('proxy_fetch', { url, headers, method })
}

export async function fetchModelsFromProvider(providerId) {
    const provider = getProvider(providerId)

    if (provider.type === 'ollama') {
        return await fetchOllamaModels(provider)
    }

    const apiKey = getApiKey(providerId)
    if (!apiKey && provider.requiresKey) {
        throw new Error(`API key is required for ${provider.name}`)
    }

    if (provider.type === 'anthropic') {
        return await fetchAnthropicModels(provider, apiKey)
    }

    return await fetchOpenAICompatibleModels(provider, apiKey)
}

async function fetchOllamaModels(provider) {
    let body
    try {
        body = await proxyFetch(`${provider.baseURL}/api/tags`)
    } catch (err) {
        throw new Error('Cannot reach Ollama. Make sure it\'s running on localhost:11434.')
    }

    const data = JSON.parse(body)
    return (data.models || []).map(m => ({
        id: m.name,
        name: m.name,
        size: m.size ? formatSize(m.size) : null,
    }))
}

async function fetchAnthropicModels(provider, apiKey) {
    try {
        const body = await proxyFetch(`${provider.baseURL}/models`, {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        })

        const data = JSON.parse(body)
        if (data.data?.length) {
            return data.data.map(m => ({ id: m.id, name: m.id }))
        }
    } catch {
        // Endpoint not available, use fallback
    }

    return [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    ]
}

async function fetchOpenAICompatibleModels(provider, apiKey) {
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    let body
    try {
        body = await proxyFetch(`${provider.baseURL}/models`, headers)
    } catch (err) {
        throw new Error(`Cannot reach ${provider.name}: ${err}`)
    }

    let data
    try {
        data = JSON.parse(body)
    } catch {
        console.error(`[${provider.id}] Raw response:`, body?.slice(0, 500))
        throw new Error(`Invalid response from ${provider.name}`)
    }

    if (data.error) {
        throw new Error(data.error.message || `API error: ${data.error.code || 'unknown'}`)
    }

    const models = (data.data || [])
        .filter(m => {
            const id = m.id.toLowerCase()
            return !id.includes('embedding') &&
                   !id.includes('rerank') &&
                   !id.includes('whisper') &&
                   !id.includes('tts') &&
                   !id.includes('dall-e') &&
                   !id.includes('moderation')
        })
        .map(m => ({
            id: m.id,
            name: m.name || m.id,
            ownedBy: m.owned_by || null,
        }))

    models.sort((a, b) => {
        if (a.ownedBy && !a.ownedBy.includes(provider.id)) return 1
        if (b.ownedBy && !b.ownedBy.includes(provider.id)) return -1
        return a.name.localeCompare(b.name)
    })

    return models
}

function formatSize(bytes) {
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}
