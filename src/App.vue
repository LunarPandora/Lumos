<script setup>
import { onMounted } from 'vue'

import Channels from './components/Channels.vue'
import Chat from './components/Chat.vue'

import { useChatStore } from './stores/chat'
import { useSettingsStore } from './stores/settings'
import {
    initializeStorage,
    getConversations,
    getLastActiveConversation,
    getChat
} from './services/storage'

const chatStore = useChatStore()
const settings = useSettingsStore()

onMounted(async () => {
    await initializeStorage()

    const conversations = await getConversations()
    chatStore.setConversations(conversations)

    if (!conversations.length) return

    const lastActiveId = await getLastActiveConversation()

    const exists =
        lastActiveId &&
        conversations.some(c => c.id === lastActiveId)

    const activeId =
        exists
            ? lastActiveId
            : conversations[conversations.length - 1].id

    chatStore.setActiveConversation(activeId)

    const chat = await getChat(activeId)
    chatStore.loadMessages(activeId, chat.messages || [])
})
</script>

<template>
    <div class="w-full h-full grid grid-cols-12 gap-3 p-3 overflow-hidden">
        <Channels class="col-span-3 min-h-0" />
        <Chat class="col-span-9 min-h-0" />
    </div>
</template>
