<script setup>
import { computed } from 'vue'
import { md } from '../utils/markdown'

const props = defineProps({
    chatdata: Object,
    streaming: Boolean,
    failed: Boolean
})

const emit = defineEmits(['retry'])

const isUser = computed(() => props.chatdata.role === 'user')
const isTyping = computed(() => !isUser.value && props.streaming && !props.chatdata.content)

const renderedMarkdown = computed(() =>
    md.render(props.chatdata.content || '')
)

const userAvatar = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100" rx="50"/><text x="50" y="55" text-anchor="middle" fill="%239CA3AF" font-size="36" font-family="sans-serif">Y</text></svg>`)
const botAvatar = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%231e1b4b" width="100" height="100" rx="50"/><text x="50" y="55" text-anchor="middle" fill="%23818cf8" font-size="36" font-family="sans-serif">A</text></svg>`)
</script>

<template>
    <div
        class="w-full flex flex-col gap-1.5"
        :class="isUser ? 'items-end' : 'items-start'"
    >
        <div class="text-[11px] text-white/30 px-2 font-medium tracking-wide">
            {{ isUser ? 'You' : 'Asteria' }}
        </div>

        <div
            class="flex gap-2.5 max-w-[85%]"
            :class="isUser ? 'flex-row-reverse' : ''"
        >
            <div class="w-8 h-8 rounded-full overflow-hidden border border-white/10 bg-zinc-800 shrink-0">
                <img
                    :src="isUser ? userAvatar : botAvatar"
                    class="w-full h-full object-cover"
                />
            </div>

            <div class="flex flex-col gap-1.5">
                <div
                    class="rounded-2xl px-4 py-3 text-white/90 text-sm leading-relaxed"
                    :class="[
                        isUser ? 'bg-white/10 border border-white/10' : 'liquid-bubble',
                        failed ? 'border-red-500/30' : ''
                    ]"
                >
                    <!-- Attached image -->
                    <img
                        v-if="chatdata.file?.preview"
                        :src="chatdata.file.preview"
                        class="rounded-lg mb-2 max-h-48 object-cover"
                    />

                    <!-- Typing indicator -->
                    <div v-if="isTyping" class="flex items-center gap-1.5 py-0.5">
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                    </div>

                    <!-- Message content -->
                    <div
                        v-else-if="chatdata.content"
                        class="prose prose-invert max-w-none text-sm
                        prose-code:text-indigo-300
                        prose-code:bg-white/5
                        prose-code:px-1.5
                        prose-code:py-0.5
                        prose-code:rounded
                        prose-code:text-[13px]
                        prose-a:text-indigo-400
                        prose-a:no-underline
                        hover:prose-a:underline
                        prose-strong:text-white
                        prose-headings:text-white/90
                        prose-hr:border-white/10"
                        v-html="renderedMarkdown"
                    />
                </div>

                <!-- Retry button -->
                <button
                    v-if="failed && isUser"
                    @click="emit('retry', chatdata)"
                    class="flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10 w-fit"
                >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Retry
                </button>
            </div>
        </div>
    </div>
</template>
