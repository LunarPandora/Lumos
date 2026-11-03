import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { fetchModelsFromProvider, getApiKey } from '../services/providers'

const STORAGE_KEY = 'asteria_settings'

function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

function saveSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export const useSettingsStore = defineStore('settings', () => {
    const saved = loadSettings()

    const providerId = ref(saved?.providerId || 'ollama')
    const modelId = ref(saved?.modelId || 'qwen2.5-coder:7b-instruct')
    const customBaseURL = ref(saved?.customBaseURL || 'http://localhost:8080/v1')
    const customModelId = ref(saved?.customModelId || '')
    const temperature = ref(saved?.temperature ?? 0.7)
    const maxTokens = ref(saved?.maxTokens ?? 2048)
    const showReasoning = ref(saved?.showReasoning ?? true)

    // Fetched models state
    const fetchedModels = ref([])
    const isFetchingModels = ref(false)
    const fetchError = ref('')
    const isConnected = ref(false)

    // Token usage tracking
    const totalInputTokens = ref(0)
    const totalOutputTokens = ref(0)
    const totalRequests = ref(0)
    const sessionInputTokens = ref(0)
    const sessionOutputTokens = ref(0)
    const sessionRequests = ref(0)

    const currentProviderId = computed(() => providerId.value)
    const currentModelId = computed(() => {
        if (providerId.value === 'custom') return customModelId.value
        return modelId.value
    })

    function setProvider(id) {
        providerId.value = id
        fetchedModels.value = []
        isConnected.value = false
        fetchError.value = ''
    }

    function setModel(id) {
        modelId.value = id
    }

    function setCustomBaseURL(url) {
        customBaseURL.value = url
    }

    function setCustomModelId(id) {
        customModelId.value = id
    }

    function setTemperature(val) {
        temperature.value = Math.max(0, Math.min(2, val))
    }

    function setMaxTokens(val) {
        maxTokens.value = Math.max(1, Math.min(32768, val))
    }

    async function connectProvider() {
        isFetchingModels.value = true
        fetchError.value = ''

        try {
            const models = await fetchModelsFromProvider(providerId.value)
            fetchedModels.value = models
            isConnected.value = true

            if (models.length > 0 && !models.find(m => m.id === modelId.value)) {
                modelId.value = models[0].id
            }
        } catch (err) {
            fetchError.value = err.message || 'Failed to connect'
            isConnected.value = false
            fetchedModels.value = []
            console.error(`[${providerId.value}] Connect failed:`, err)
        } finally {
            isFetchingModels.value = false
        }
    }

    function recordUsage(inputTokens, outputTokens) {
        totalInputTokens.value += inputTokens
        totalOutputTokens.value += outputTokens
        totalRequests.value += 1
        sessionInputTokens.value += inputTokens
        sessionOutputTokens.value += outputTokens
        sessionRequests.value += 1
    }

    function resetSessionUsage() {
        sessionInputTokens.value = 0
        sessionOutputTokens.value = 0
        sessionRequests.value = 0
    }

    watch(
        [providerId, modelId, customBaseURL, customModelId, temperature, maxTokens, showReasoning],
        () => {
            saveSettings({
                providerId: providerId.value,
                modelId: modelId.value,
                customBaseURL: customBaseURL.value,
                customModelId: customModelId.value,
                temperature: temperature.value,
                maxTokens: maxTokens.value,
                showReasoning: showReasoning.value,
            })
        },
        { deep: true }
    )

    return {
        providerId,
        modelId,
        customBaseURL,
        customModelId,
        temperature,
        maxTokens,
        showReasoning,
        currentProviderId,
        currentModelId,

        fetchedModels,
        isFetchingModels,
        fetchError,
        isConnected,

        totalInputTokens,
        totalOutputTokens,
        totalRequests,
        sessionInputTokens,
        sessionOutputTokens,
        sessionRequests,

        setProvider,
        setModel,
        setCustomBaseURL,
        setCustomModelId,
        setTemperature,
        setMaxTokens,
        connectProvider,
        recordUsage,
        resetSessionUsage,
    }
})
