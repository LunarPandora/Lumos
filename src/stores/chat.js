import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
    getChat,
    saveLastActiveConversation,
    deleteConversation as storageDeleteConversation,
    deleteAllConversations as storageDeleteAll,
} from '../services/storage'

export const useChatStore = defineStore('chat', () => {
    const conversations = ref([])
    const activeConversationId = ref(null)
    const messagesByChat = ref({})
    const isSwitchingConversation = ref(false)
    const webMemoryByChat = ref({})

    const delay = (ms) => new Promise(r => setTimeout(r, ms))

    const activeMessages = computed(() =>
        messagesByChat.value[activeConversationId.value] || []
    )

    const activeWebMemory = computed(() =>
        webMemoryByChat.value[activeConversationId.value] || null
    )

    function setWebMemory(chatId, webData) {
        if (!chatId) return

        if (!webData?.results?.length) {
            webMemoryByChat.value[chatId] = null
            return
        }

        const existing = webMemoryByChat.value[chatId]
        webMemoryByChat.value[chatId] = mergeWebContext(existing, webData)
    }

    function mergeWebContext(oldCtx, newCtx) {
        if (!oldCtx) return newCtx
        if (!newCtx) return oldCtx

        const mergedResults = [
            ...(oldCtx.results || []),
            ...(newCtx.results || [])
        ]

        const unique = Array.from(
            new Map(mergedResults.map(r => [r.url, r])).values()
        )

        return {
            query: newCtx.query || oldCtx.query,
            results: unique.slice(0, 15)
        }
    }

    function setConversations(data) {
        conversations.value = data
    }

    async function switchConversation(id) {
        isSwitchingConversation.value = true

        const start = performance.now()

        const chat = await getChat(id)
        messagesByChat.value[id] = chat.messages || []

        activeConversationId.value = id
        saveLastActiveConversation(id)

        const elapsed = performance.now() - start
        const minTime = 200

        if (elapsed < minTime) {
            await delay(minTime - elapsed)
        }

        isSwitchingConversation.value = false
    }

    function setActiveConversation(id) {
        activeConversationId.value = id

        saveLastActiveConversation(id)
    }

    function addConversation(conv) {
        conversations.value.unshift(conv)
    }

    function addMessage(message) {
        const id = activeConversationId.value
        if (!messagesByChat.value[id]) messagesByChat.value[id] = []
        messagesByChat.value[id].push(message)
    }

    function createAssistantMessage() {
        const id = activeConversationId.value
        if (!messagesByChat.value[id]) messagesByChat.value[id] = []

        const msg = {
            cid: crypto.randomUUID(),
            role: 'assistant',
            content: '',
            created_at: Date.now()
        }

        messagesByChat.value[id].push(msg)
        return msg
    }

    function appendToMessage(cid, chunk) {
        const msgs = messagesByChat.value[activeConversationId.value] || []
        const msg = msgs.find(m => m.cid === cid)
        if (msg) msg.content += chunk
    }

    function loadMessages(chatId, messages) {
        messagesByChat.value[chatId] = messages
    }

    function getMessageByCid(cid) {
        return activeMessages.value.find(m => m.cid === cid)
    }

    function updateConversationTitle(id, title) {
        const conv = conversations.value.find(c => c.id === id)
        if (conv) {
            conv.title = title
        }
    }

    async function deleteConversation(id) {
        const updated = await storageDeleteConversation(id)

        conversations.value = updated
        delete messagesByChat.value[id]
        delete webMemoryByChat.value[id]

        if (activeConversationId.value === id) {
            if (updated.length > 0) {
                await switchConversation(updated[0].id)
            } else {
                activeConversationId.value = null
            }
        }
    }

    async function deleteAllConversations() {
        await storageDeleteAll()

        conversations.value = []
        messagesByChat.value = {}
        webMemoryByChat.value = {}
        activeConversationId.value = null
    }

    async function clearChatMessages(id) {
        messagesByChat.value[id] = []
        webMemoryByChat.value[id] = null
    }

    return {
        conversations,
        activeConversationId,
        messagesByChat,
        activeMessages,
        activeWebMemory,
        webMemoryByChat,

        setWebMemory,
        setConversations,
        setActiveConversation,
        switchConversation,
        addConversation,
        addMessage,
        createAssistantMessage,
        appendToMessage,
        loadMessages,
        getMessageByCid,
        updateConversationTitle,
        deleteConversation,
        deleteAllConversations,
        clearChatMessages,
    }
})
