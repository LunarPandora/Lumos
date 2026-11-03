<script setup>
import { computed, ref, watch } from 'vue'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import { PROVIDERS, getModelsForProvider, saveApiKey, getApiKey } from '../services/providers'

const chatStore = useChatStore()
const settings = useSettingsStore()
const showSettings = ref(false)

const activeTitle = computed(() => {
    if (!chatStore.activeConversationId) return 'New Chat'
    return chatStore.conversations.find(
        c => c.id === chatStore.activeConversationId
    )?.title ?? 'New Chat'
})

const currentProvider = computed(() => PROVIDERS[settings.providerId])
const currentModelName = computed(() => {
    const models = settings.isConnected
        ? settings.fetchedModels
        : getModelsForProvider(settings.providerId)
    const model = models.find(m => m.id === settings.modelId)
    return model?.name || settings.modelId
})

const apiKeyInput = ref(getApiKey(settings.providerId))
const apiKeyVisible = ref(false)
const modelSearch = ref('')

const allModels = computed(() => {
    if (settings.isConnected) return settings.fetchedModels
    return getModelsForProvider(settings.providerId)
})

const filteredModels = computed(() => {
    const q = modelSearch.value.toLowerCase().trim()
    if (!q) return allModels.value
    return allModels.value.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
    )
})

watch(() => settings.providerId, (id) => {
    apiKeyInput.value = getApiKey(id)
    modelSearch.value = ''
})

watch(showSettings, (visible) => {
    if (visible) {
        apiKeyInput.value = getApiKey(settings.providerId)
        modelSearch.value = ''
    }
})

async function connect() {
    if (currentProvider.value.requiresKey) {
        if (!apiKeyInput.value?.trim()) {
            settings.fetchError = 'API key is required'
            return
        }
        saveApiKey(settings.providerId, apiKeyInput.value.trim())
    }

    await settings.connectProvider()

    if (!settings.isConnected && currentProvider.value.requiresKey) {
        // Connection failed - remove the invalid key
        // so it doesn't persist as a broken credential
    }
}

function disconnect() {
    settings.isConnected = false
    settings.fetchedModels = []
}

function selectProvider(providerId) {
    settings.setProvider(providerId)
    apiKeyInput.value = getApiKey(providerId)
    apiKeyVisible.value = false
}

function formatTokens(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
    return n.toString()
}
</script>

<template>
    <div class="absolute z-20 w-full h-16 backdrop-blur-xl transform-gpu bg-zinc-900/50 rounded-2xl rounded-b-none border-b border-white/5">
        <div class="relative flex items-center justify-between h-full px-4">
            <span class="text-white/90 text-sm font-medium">{{ activeTitle }}</span>

            <div class="flex items-center gap-3">
                <!-- Usage badge (when connected) -->
                <div
                    v-if="settings.isConnected && settings.sessionRequests > 0"
                    class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] text-white/40"
                >
                    <span class="text-white/25">{{ settings.sessionRequests }} req</span>
                    <span class="text-white/15">|</span>
                    <span>{{ formatTokens(settings.sessionInputTokens + settings.sessionOutputTokens) }} tokens</span>
                </div>

                <button
                    @click="showSettings = !showSettings"
                    class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-white/60 hover:text-white/90 hover:bg-white/5 transition-all duration-200"
                >
                    <div
                        :class="[
                            'w-1.5 h-1.5 rounded-full',
                            settings.isConnected ? 'bg-emerald-400' : 'bg-white/20'
                        ]"
                    />
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>{{ currentProvider?.name }}</span>
                    <span class="text-white/30">/</span>
                    <span class="text-white/50">{{ currentModelName }}</span>
                </button>
            </div>
        </div>

        <Transition name="fade">
            <div
                v-if="showSettings"
                class="absolute top-full right-0 mt-2 w-[440px] z-50"
            >
                <div class="liquid-panel rounded-2xl p-5 shadow-2xl">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-sm font-semibold text-white/90">Model Settings</h3>
                        <button
                            @click="showSettings = false"
                            class="text-white/30 hover:text-white/70 transition-colors"
                        >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <!-- Provider Selection -->
                    <div class="mb-4">
                        <label class="block text-xs text-white/40 mb-2 uppercase tracking-wider">Provider</label>
                        <div class="grid grid-cols-3 gap-1.5">
                            <button
                                v-for="(provider, id) in PROVIDERS"
                                :key="id"
                                @click="selectProvider(id)"
                                :class="[
                                    'px-2 py-2 rounded-xl text-[11px] font-medium transition-all duration-200 text-left',
                                    settings.providerId === id
                                        ? 'bg-white/15 text-white border border-white/20'
                                        : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70 border border-transparent'
                                ]"
                            >
                                {{ provider.name }}
                            </button>
                        </div>
                    </div>

                    <!-- API Key (for providers that need it) -->
                    <div v-if="currentProvider?.requiresKey" class="mb-4">
                        <label class="block text-xs text-white/40 mb-2 uppercase tracking-wider">API Key</label>
                        <div class="flex gap-2">
                            <div class="relative flex-1">
                                <input
                                    v-model="apiKeyInput"
                                    :type="apiKeyVisible ? 'text' : 'password'"
                                    :placeholder="`Enter ${currentProvider.name} API key`"
                                    class="liquid-input-sm w-full px-3 py-2 pr-9 rounded-xl text-xs"
                                />
                                <button
                                    @click="apiKeyVisible = !apiKeyVisible"
                                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
                                >
                                    <svg v-if="!apiKeyVisible" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Connect Button -->
                    <div class="mb-4">
                        <button
                            @click="connect"
                            :disabled="settings.isFetchingModels"
                            class="w-full px-4 py-2.5 rounded-xl text-xs font-medium transition-all duration-200"
                            :class="settings.isFetchingModels
                                ? 'bg-white/5 text-white/30 cursor-wait'
                                : settings.isConnected
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                                    : 'bg-white/10 text-white/80 border border-white/10 hover:bg-white/15'"
                        >
                            <span v-if="settings.isFetchingModels" class="flex items-center justify-center gap-2">
                                <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Connecting...
                            </span>
                            <span v-else-if="settings.isConnected" class="flex items-center justify-center gap-2">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                                </svg>
                                Connected — {{ settings.fetchedModels.length }} models available
                            </span>
                            <span v-else>
                                {{ currentProvider?.requiresKey ? 'Connect' : 'Fetch Models' }}
                            </span>
                        </button>

                        <p v-if="settings.fetchError" class="mt-2 text-[11px] text-red-400/80">
                            {{ settings.fetchError }}
                        </p>
                    </div>

                    <!-- Model Selection (from fetched or fallback) -->
                    <div class="mb-4">
                        <div class="flex items-center justify-between mb-2">
                            <label class="text-xs text-white/40 uppercase tracking-wider">Model</label>
                            <span v-if="settings.isConnected" class="text-[10px] text-white/25">
                                {{ filteredModels.length }}{{ modelSearch ? ` / ${allModels.length}` : '' }} available
                            </span>
                        </div>

                        <!-- Custom provider inputs -->
                        <div v-if="settings.providerId === 'custom'" class="space-y-2">
                            <input
                                v-model="settings.customBaseURL"
                                placeholder="Base URL (e.g. http://localhost:8080/v1)"
                                class="liquid-input-sm w-full px-3 py-2 rounded-xl text-xs"
                            />
                            <input
                                v-model="settings.customModelId"
                                placeholder="Model ID"
                                class="liquid-input-sm w-full px-3 py-2 rounded-xl text-xs"
                            />
                        </div>

                        <!-- Fetched models list -->
                        <div v-else>
                            <!-- Search bar -->
                            <div v-if="allModels.length > 0" class="relative mb-2">
                                <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    v-model="modelSearch"
                                    type="text"
                                    placeholder="Search models..."
                                    class="liquid-input-sm w-full pl-8 pr-3 py-2 rounded-xl text-xs"
                                />
                                <button
                                    v-if="modelSearch"
                                    @click="modelSearch = ''"
                                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
                                >
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div class="flex flex-col gap-1 max-h-48 overflow-y-auto scrollbar-thin">
                                <div
                                    v-if="settings.isFetchingModels"
                                    class="text-center py-6 text-xs text-white/25"
                                >
                                    Loading models...
                                </div>

                                <div
                                    v-else-if="allModels.length === 0 && !settings.isConnected"
                                    class="text-center py-6 text-xs text-white/25"
                                >
                                    {{ currentProvider?.requiresKey ? 'Enter API key and connect to see models' : 'Click connect to fetch models' }}
                                </div>

                                <div
                                    v-else-if="filteredModels.length === 0 && modelSearch"
                                    class="text-center py-6 text-xs text-white/25"
                                >
                                    No models matching "{{ modelSearch }}"
                                </div>

                                <button
                                    v-for="model in filteredModels"
                                    :key="model.id"
                                    @click="settings.setModel(model.id)"
                                    :class="[
                                        'px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 text-left flex items-center justify-between',
                                        settings.modelId === model.id
                                            ? 'bg-white/15 text-white'
                                            : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                                    ]"
                                >
                                    <span class="truncate">{{ model.name }}</span>
                                    <span v-if="model.size" class="text-[10px] text-white/25 shrink-0 ml-2">{{ model.size }}</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Temperature -->
                    <div class="mb-3">
                        <div class="flex items-center justify-between mb-1.5">
                            <label class="text-xs text-white/40 uppercase tracking-wider">Temperature</label>
                            <span class="text-xs text-white/50 font-mono">{{ settings.temperature.toFixed(1) }}</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.1"
                            :value="settings.temperature"
                            @input="settings.setTemperature(parseFloat($event.target.value))"
                            class="w-full accent-white/50 h-1"
                        />
                    </div>

                    <!-- Show Reasoning Toggle -->
                    <div class="mb-3">
                        <div class="flex items-center justify-between">
                            <label class="text-xs text-white/40 uppercase tracking-wider">Show Reasoning</label>
                            <button
                                @click="settings.showReasoning = !settings.showReasoning"
                                class="relative w-9 h-5 rounded-full transition-colors"
                                :class="settings.showReasoning ? 'bg-indigo-500/60' : 'bg-white/10'"
                            >
                                <span
                                    class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                                    :class="settings.showReasoning ? 'translate-x-4' : ''"
                                />
                            </button>
                        </div>
                    </div>

                    <!-- Session Usage -->
                    <div v-if="settings.totalRequests > 0" class="pt-3 border-t border-white/5">
                        <div class="flex items-center justify-between mb-2">
                            <label class="text-xs text-white/40 uppercase tracking-wider">Usage</label>
                            <button
                                @click="settings.resetSessionUsage()"
                                class="text-[10px] text-white/25 hover:text-white/50 transition-colors"
                            >
                                Reset session
                            </button>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="text-center p-2 rounded-lg bg-white/3">
                                <div class="text-sm font-semibold text-white/70">{{ settings.totalRequests }}</div>
                                <div class="text-[10px] text-white/30 mt-0.5">Requests</div>
                            </div>
                            <div class="text-center p-2 rounded-lg bg-white/3">
                                <div class="text-sm font-semibold text-white/70">{{ formatTokens(settings.totalInputTokens) }}</div>
                                <div class="text-[10px] text-white/30 mt-0.5">Input</div>
                            </div>
                            <div class="text-center p-2 rounded-lg bg-white/3">
                                <div class="text-sm font-semibold text-white/70">{{ formatTokens(settings.totalOutputTokens) }}</div>
                                <div class="text-[10px] text-white/30 mt-0.5">Output</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>
