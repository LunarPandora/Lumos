<script setup>
import { ref, useAttrs } from 'vue'
import { useChatStore } from '../stores/chat'
import { createConversation } from '../services/storage'

defineOptions({ inheritAttrs: false })
const attrs = useAttrs()

const chatStore = useChatStore()

const showClearConfirm = ref(false)
const deleteTarget = ref(null)

async function select(id) {
    if (deleteTarget.value) return
    await chatStore.switchConversation(id)
}

async function newChat() {
    const conv = await createConversation()
    chatStore.addConversation(conv)
    chatStore.loadMessages(conv.id, [])
    await chatStore.switchConversation(conv.id)
}

function requestDelete(id, event) {
    event.stopPropagation()
    deleteTarget.value = id
}

function confirmDelete() {
    if (!deleteTarget.value) return
    chatStore.deleteConversation(deleteTarget.value)
    deleteTarget.value = null
}

function cancelDelete() {
    deleteTarget.value = null
}

function requestClearAll() {
    showClearConfirm.value = true
}

function confirmClearAll() {
    chatStore.deleteAllConversations()
    showClearConfirm.value = false
}

function cancelClearAll() {
    showClearConfirm.value = false
}

function formatDate(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const diff = now - d

    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

<template>
    <div :class="attrs.class" class="h-full rounded-2xl liquid-glass-border shadow-2xl overflow-hidden flex flex-col">
        <div class="rounded-2xl bg-zinc-900/60 backdrop-blur-xl h-full w-full flex flex-col p-3 text-white border border-white/5">
            <!-- Logo / Title -->
            <div class="shrink-0 flex items-center gap-2.5 px-2 pt-2 pb-4">
                <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-white/10 flex items-center justify-center">
                    <svg class="w-4 h-4 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                </div>
                <p class="text-lg font-semibold tracking-tight">
                    Asteria
                </p>
            </div>

            <!-- New Chat Button -->
            <button
                @click="newChat"
                class="shrink-0 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-white/60 hover:text-white/90 hover:bg-white/5 border border-dashed border-white/10 hover:border-white/20 transition-all duration-200 mb-2"
            >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                New Chat
            </button>

            <!-- Clear All Button -->
            <button
                v-if="chatStore.conversations.length > 0"
                @click="requestClearAll"
                class="shrink-0 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-red-400/50 hover:text-red-400 hover:bg-red-400/5 border border-transparent hover:border-red-400/10 transition-all duration-200 mb-4"
            >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear All History
            </button>

            <!-- Conversations List -->
            <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                <p class="text-[10px] text-white/25 uppercase tracking-widest font-semibold px-2 mb-2">Recent</p>

                <div class="flex flex-col gap-0.5">
                    <div
                        v-for="conversation in chatStore.conversations"
                        :key="conversation.id"
                        @click="select(conversation.id)"
                        :class="[
                            'group relative px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer',
                            conversation.id === chatStore.activeConversationId
                                ? 'bg-white/10 border border-white/10'
                                : 'hover:bg-white/5 border border-transparent'
                        ]"
                    >
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0 flex-1">
                                <p class="text-xs line-clamp-1 text-white/80">
                                    {{ conversation.title }}
                                </p>
                                <p class="text-[10px] text-white/25 mt-0.5">
                                    {{ formatDate(conversation.updated_at || conversation.created_at) }}
                                </p>
                            </div>

                            <button
                                @click="requestDelete(conversation.id, $event)"
                                class="shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center rounded-md text-white/0 group-hover:text-white/30 hover:!text-red-400 hover:bg-red-400/10 transition-all duration-150"
                                title="Delete conversation"
                            >
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div
                        v-if="!chatStore.conversations.length"
                        class="text-center py-8"
                    >
                        <p class="text-xs text-white/20">No conversations yet</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Delete Single Confirmation -->
    <Teleport to="body">
        <Transition name="fade">
            <div
                v-if="deleteTarget"
                class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
                @click.self="cancelDelete"
            >
                <div class="liquid-panel rounded-2xl p-6 w-80 shadow-2xl">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-9 h-9 rounded-xl bg-red-400/10 border border-red-400/20 flex items-center justify-center shrink-0">
                            <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </div>
                        <div>
                            <h3 class="text-sm font-semibold text-white/90">Delete Conversation</h3>
                            <p class="text-xs text-white/40 mt-0.5">This action cannot be undone.</p>
                        </div>
                    </div>

                    <div class="flex gap-2">
                        <button
                            @click="cancelDelete"
                            class="flex-1 px-3 py-2 rounded-xl text-xs font-medium text-white/50 bg-white/5 hover:bg-white/10 border border-white/5 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            @click="confirmDelete"
                            class="flex-1 px-3 py-2 rounded-xl text-xs font-medium text-white bg-red-500/80 hover:bg-red-500 border border-red-500/50 transition-all"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>

    <!-- Clear All Confirmation -->
    <Teleport to="body">
        <Transition name="fade">
            <div
                v-if="showClearConfirm"
                class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
                @click.self="cancelClearAll"
            >
                <div class="liquid-panel rounded-2xl p-6 w-80 shadow-2xl">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-9 h-9 rounded-xl bg-red-400/10 border border-red-400/20 flex items-center justify-center shrink-0">
                            <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                        </div>
                        <div>
                            <h3 class="text-sm font-semibold text-white/90">Clear All History</h3>
                            <p class="text-xs text-white/40 mt-0.5">Delete all {{ chatStore.conversations.length }} conversations permanently.</p>
                        </div>
                    </div>

                    <div class="flex gap-2">
                        <button
                            @click="cancelClearAll"
                            class="flex-1 px-3 py-2 rounded-xl text-xs font-medium text-white/50 bg-white/5 hover:bg-white/10 border border-white/5 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            @click="confirmClearAll"
                            class="flex-1 px-3 py-2 rounded-xl text-xs font-medium text-white bg-red-500/80 hover:bg-red-500 border border-red-500/50 transition-all"
                        >
                            Delete All
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>
