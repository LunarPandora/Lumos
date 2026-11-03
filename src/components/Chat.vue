<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'

import { maybeSearch } from '../services/searchRouter'
import { saveChat, saveConversations } from '../services/storage'
import { agentLoop, abortGeneration } from '../services/ai'
import { shouldSearchWeb } from '../services/shouldSearchWeb.js'
import { pendingApprovals, approveExecution, rejectExecution, executionHistory } from '../tools/executor'

import ChatBubble from './ChatBubble.vue'
import HeaderBar from './HeaderBar.vue'
import ToolApproval from './tools/ToolApproval.vue'
import ToolActivity from './tools/ToolActivity.vue'

const chatStore = useChatStore()
const settings = useSettingsStore()
const chatContainer = ref(null)
const fileInput = ref(null)

const isSearching = ref(false)
const isGenerating = ref(false)
const streamingCid = ref(null)
const errorMessage = ref('')
const failedCids = ref(new Set())

const chat = computed(() => chatStore.activeMessages)
const prompt = ref('')
const attachedFile = ref(null)
const attachedPreview = ref('')

const currentApproval = computed(() => {
    const first = pendingApprovals.values().next().value
    return first || null
})

const recentExecutions = computed(() => {
    return executionHistory.slice(-8).reverse()
})

const thinkingText = ref('')
const reasoningHistory = ref([])
const isThinking = ref(false)

let saveTimer = null

function updateContainer() {
    if (chatContainer.value) {
        chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
}

function generateTitle(text) {
    const cleaned = text.trim().replace(/\s+/g, ' ')
    if (cleaned.length <= 40) return cleaned
    return cleaned.slice(0, 40).trim() + '...'
}

async function generateResponse() {
    const userMessage = prompt.value.trim()
    if (!userMessage && !attachedFile.value) return

    errorMessage.value = ''
    isGenerating.value = true

    try {
        const messageData = {
            cid: crypto.randomUUID(),
            role: 'user',
            content: userMessage,
            created_at: Date.now()
        }

        if (attachedFile.value) {
            messageData.file = {
                name: attachedFile.value.name,
                type: attachedFile.value.type,
                preview: attachedPreview.value
            }
        }

        chatStore.addMessage(messageData)

        const activeId = chatStore.activeConversationId
        const activeMessages = chatStore.activeMessages

        const userMessages = activeMessages.filter(m => m.role === 'user')
        if (userMessages.length === 1) {
            const title = generateTitle(userMessage || 'Image')
            chatStore.updateConversationTitle(activeId, title)
            await saveConversations(chatStore.conversations)
        }

        prompt.value = ''
        await nextTick()
        updateContainer()

        isSearching.value = true

        const shouldRefresh =
            shouldSearchWeb(userMessage, chatStore) ||
            !chatStore.webMemoryByChat?.[activeId]?.results?.length

        if (shouldRefresh) {
            chatStore.setWebMemory(activeId, null)
            try {
                const newWebData = await maybeSearch(userMessage)
                if (newWebData?.results?.length) {
                    chatStore.setWebMemory(activeId, newWebData)
                }
            } catch {}
        }

        isSearching.value = false

        const rawWeb = chatStore.webMemoryByChat[activeId]
        const webData = rawWeb?.results?.length > 0 ? rawWeb : null

        const fileData = attachedFile.value ? {
            name: attachedFile.value.name,
            type: attachedFile.value.type,
            preview: attachedPreview.value
        } : null

        removeAttachment()

        // Use agent loop for tool-aware generation
        thinkingText.value = ''
        reasoningHistory.value = []
        isThinking.value = true
        await agentLoop(userMessage, webData, fileData, {
            onText(text) {
                isThinking.value = false
                // Final text response (no tool calls) — create assistant message
                const botMsg = chatStore.createAssistantMessage()
                streamingCid.value = botMsg.cid
                const msg = chatStore.getMessageByCid(botMsg.cid)
                if (msg) {
                    msg.content = text
                    scheduleSave()
                    nextTick(() => updateContainer())
                }
            },
            onThinking(text) {
                // Intermediate reasoning — show in tools area
                thinkingText.value = text
                reasoningHistory.value.push({ text, timestamp: Date.now() })
                nextTick(() => updateContainer())
            },
            onToolCall(toolCall) {
                console.log('[Chat] Tool call:', toolCall.name, toolCall.arguments)
                thinkingText.value = ''
                isThinking.value = true
                nextTick(() => updateContainer())
            },
            onToolResult(result) {
                console.log('[Chat] Tool result:', result.toolName, result.status)
                isThinking.value = true
                scheduleSave()
                nextTick(() => updateContainer())
            },
            onComplete() {
                isThinking.value = false
                thinkingText.value = ''
                streamingCid.value = null
                scheduleSave()
            },
            onError(err) {
                isThinking.value = false
                thinkingText.value = ''
                streamingCid.value = null
                if (err.message === 'GENERATION_ABORTED') {
                    errorMessage.value = ''
                } else {
                    errorMessage.value = getErrorMessage(err)
                    console.error('Generation error:', err)
                }
                const msgs = chatStore.activeMessages
                const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user')
                if (lastUserMsg) failedCids.value.add(lastUserMsg.cid)
            },
        })

    } catch (err) {
        isSearching.value = false
        streamingCid.value = null

        const msgs = chatStore.activeMessages
        const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user')
        if (lastUserMsg) failedCids.value.add(lastUserMsg.cid)

        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg?.role === 'assistant' && !lastMsg.content) {
            msgs.pop()
        }

        if (err.message === 'GENERATION_ABORTED') {
            errorMessage.value = ''
        } else {
            errorMessage.value = getErrorMessage(err)
            console.error('Generation error:', err)
        }
    } finally {
        isGenerating.value = false
    }
}

async function retryMessage(msg) {
    if (isGenerating.value) return

    failedCids.value.delete(msg.cid)

    const msgs = chatStore.activeMessages
    const idx = msgs.indexOf(msg)
    if (idx !== -1) msgs.splice(idx, 1)

    if (msg.file) {
        attachedFile.value = { name: msg.file.name, type: msg.file.type }
        attachedPreview.value = msg.file.preview || ''
    }

    prompt.value = msg.content
    await nextTick()
    generateResponse()
}

function getErrorMessage(err) {
    const msg = err.message || ''

    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        return 'Cannot connect to the AI provider. Make sure it\'s running.'
    }
    if (msg.includes('ECONNREFUSED')) {
        return 'Connection refused. Check if the service is running on the expected port.'
    }
    if (msg.includes('401') || msg.includes('API key')) {
        return 'Authentication failed. Check your API key in Settings.'
    }
    if (msg.includes('429')) {
        return 'Rate limited. Please wait a moment and try again.'
    }
    if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
        return 'Server error. The AI provider may be temporarily unavailable.'
    }

    return `Error: ${msg.slice(0, 120)}`
}

function cancelGeneration() {
    abortGeneration()
}

function handleKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        generateResponse()
    }
}

function autoResize(event) {
    const el = event.target
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
}

function scheduleSave() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
        saveChat(
            chatStore.activeConversationId,
            chatStore.activeMessages
        )
    }, 500)
}

function triggerFileInput() {
    fileInput.value?.click()
}

function handleFileSelect(event) {
    const file = event.target.files?.[0]
    if (file) attachFile(file)
    event.target.value = ''
}

function attachFile(file) {
    attachedFile.value = file
    if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (e) => { attachedPreview.value = e.target.result }
        reader.readAsDataURL(file)
    } else {
        attachedPreview.value = ''
    }
}

function removeAttachment() {
    attachedFile.value = null
    attachedPreview.value = ''
}

function handlePaste(event) {
    const items = event.clipboardData?.items
    if (!items) return
    for (const item of items) {
        if (item.kind === 'file') {
            event.preventDefault()
            const file = item.getAsFile()
            if (file) attachFile(file)
            break
        }
    }
}
</script>

<template>
    <div class="h-full rounded-2xl liquid-glass-border shadow-2xl overflow-hidden flex flex-col">
        <div class="relative rounded-2xl bg-zinc-900/80 backdrop-blur-xl h-full w-full flex flex-col text-white overflow-hidden border border-white/5">
            <HeaderBar />

            <Transition name="fade">
                <div
                    v-if="chatStore.isSwitchingConversation"
                    class="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                >
                    <div class="liquid-loader">
                        <div class="liquid-loader-bar"></div>
                    </div>
                </div>
            </Transition>

            <Transition name="fade">
                <div
                    v-if="isSearching"
                    class="absolute inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm"
                >
                    <div class="flex flex-col items-center gap-3">
                        <div class="liquid-loader w-40">
                            <div class="liquid-loader-bar"></div>
                        </div>
                        <p class="text-xs text-white/50 font-medium tracking-wide">
                            Searching the web...
                        </p>
                    </div>
                </div>
            </Transition>

            <div ref="chatContainer" class="flex-1 min-h-0 p-5 overflow-y-auto scrollbar-thin">
                <TransitionGroup
                    name="chat"
                    tag="div"
                    class="flex flex-col justify-start gap-4 pt-16"
                >
                    <ChatBubble
                        v-for="x in chat"
                        :chatdata="x"
                        :streaming="streamingCid === x.cid"
                        :failed="failedCids.has(x.cid)"
                        :key="x.cid"
                        @retry="retryMessage"
                    />
                </TransitionGroup>

                <!-- Tool Activity -->
                <Transition name="fade">
                    <div v-if="recentExecutions.length > 0 || thinkingText || isThinking" class="mt-3 mb-1">
                        <div class="text-[10px] text-white/30 uppercase tracking-wider px-3 mb-1 font-medium">Tools</div>
                        <div class="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
                            <!-- Current thinking text -->
                            <div v-if="thinkingText && settings.showReasoning" class="px-3 py-2 text-xs text-white/50 italic border-b border-white/5">
                                {{ thinkingText }}
                            </div>
                            <!-- Thinking indicator -->
                            <div v-else-if="isThinking" class="px-3 py-2 text-xs text-white/30 italic border-b border-white/5 flex items-center gap-2">
                                <span class="typing-dot"></span>
                                <span class="typing-dot"></span>
                                <span class="typing-dot"></span>
                                <span class="ml-1">Thinking...</span>
                            </div>
                            <!-- Execution history with reasoning (persists after completion) -->
                            <template v-for="(item, idx) in reasoningHistory" :key="idx">
                                <div v-if="settings.showReasoning && item.text" class="px-3 py-2 text-xs text-white/50 italic border-b border-white/5">
                                    {{ item.text }}
                                </div>
                            </template>
                            <template v-for="exec in recentExecutions" :key="exec.executionId">
                                <ToolActivity :execution="exec" />
                            </template>
                        </div>
                    </div>
                </Transition>

                <!-- Tool Approval -->
                <Transition name="fade">
                    <div v-if="currentApproval" class="mt-3 flex justify-center">
                        <ToolApproval
                            :request="currentApproval"
                            @approve="approveExecution(currentApproval.executionId)"
                            @reject="rejectExecution(currentApproval.executionId)"
                        />
                    </div>
                </Transition>

                <Transition name="fade">
                    <div v-if="errorMessage" class="sticky bottom-0 z-30 flex justify-center pb-2">
                        <div class="liquid-error px-4 py-2.5 rounded-xl text-sm flex items-center gap-3 max-w-[80%]">
                            <svg class="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                            <span class="text-white/80">{{ errorMessage }}</span>
                            <button
                                @click="errorMessage = ''"
                                class="text-white/40 hover:text-white/70 transition-colors ml-1"
                            >
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </Transition>
            </div>

            <div class="shrink-0 border-t border-white/5 bg-zinc-900/60 backdrop-blur-xl">
                <div class="px-4 py-3">
                    <!-- Attached file preview -->
                    <div v-if="attachedFile" class="mb-2 flex items-center gap-2">
                        <div v-if="attachedPreview" class="relative group">
                            <img :src="attachedPreview" class="h-16 w-16 object-cover rounded-lg border border-white/10" />
                            <button
                                @click="removeAttachment"
                                class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 border border-white/10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <svg class="w-3 h-3 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div v-else class="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                            <svg class="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span class="text-xs text-white/50 truncate max-w-[150px]">{{ attachedFile.name }}</span>
                        </div>
                        <button
                            @click="removeAttachment"
                            class="shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-white/30 hover:text-white/60 transition-colors"
                        >
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div class="flex items-center gap-2">
                        <input
                            ref="fileInput"
                            type="file"
                            class="hidden"
                            @change="handleFileSelect"
                        />

                        <button
                            @click="triggerFileInput"
                            class="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-white/25 hover:text-white/50 hover:bg-white/5 transition-all"
                            title="Attach file"
                        >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                        </button>

                        <textarea
                            class="flex-1 bg-transparent outline-none text-sm text-white/90 placeholder:text-white/25 resize-none py-2 leading-relaxed"
                            placeholder="Message Asteria..."
                            @input="autoResize"
                            @keydown="handleKeydown"
                            @paste="handlePaste"
                            v-model="prompt"
                            rows="1"
                        ></textarea>

                        <button
                            v-if="isGenerating"
                            @click="cancelGeneration"
                            class="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-red-400 hover:text-red-300 transition-all"
                            title="Stop generating"
                        >
                            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <rect x="6" y="6" width="12" height="12" rx="2" />
                            </svg>
                        </button>

                        <button
                            v-else
                            @click="generateResponse"
                            :disabled="!prompt.trim() && !attachedFile"
                            class="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                            :class="prompt.trim() || attachedFile
                                ? 'bg-white/10 hover:bg-white/15 text-white/80'
                                : 'text-white/15'"
                            title="Send message"
                        >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
