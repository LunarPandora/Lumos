<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
    execution: { type: Object, required: true },
    reasoning: { type: String, default: '' },
})

const expanded = ref(false)

const icons = {
    read_file: '📄',
    list_files: '📁',
    search_code: '🔎',
    edit_file: '✏️',
    write_file: '📝',
}

const statusIcons = {
    queued: '⏳',
    awaiting_approval: '👤',
    executing: '⚙️',
    success: '✓',
    error: '✗',
    declined: '⊘',
    cancelled: '⊘',
    timeout: '⏱',
}

const statusColors = {
    queued: 'text-white/40',
    awaiting_approval: 'text-yellow-400',
    executing: 'text-blue-400',
    success: 'text-green-400',
    error: 'text-red-400',
    declined: 'text-white/40',
    cancelled: 'text-white/40',
    timeout: 'text-orange-400',
}

const toolIcon = computed(() => icons[props.execution.toolName] || '⚙️')
const statusIcon = computed(() => statusIcons[props.execution.state] || '...')
const statusColor = computed(() => statusColors[props.execution.state] || 'text-white/40')

const label = computed(() => {
    const name = props.execution.toolName
    const args = props.execution.toolCall?.arguments
    switch (name) {
        case 'read_file': return `Reading ${args?.path || 'file'}`
        case 'list_files': return `Listing ${args?.path || 'directory'}`
        case 'search_code': return `Searching for "${args?.query || ''}"`
        case 'edit_file': return `Editing ${args?.path || 'file'}`
        case 'write_file': return `Writing ${args?.path || 'file'}`
        default: return name
    }
})
</script>

<template>
    <div>
        <!-- Reasoning text (collapsible) -->
        <div v-if="reasoning" class="border-b border-white/5">
            <button
                @click="expanded = !expanded"
                class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-white/40 hover:text-white/60 transition-colors"
            >
                <svg
                    class="w-3 h-3 transition-transform"
                    :class="expanded ? 'rotate-90' : ''"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span class="flex-1 text-left truncate">{{ reasoning.slice(0, 60) }}{{ reasoning.length > 60 ? '...' : '' }}</span>
            </button>
            <div v-if="expanded" class="px-3 pb-2 text-xs text-white/50 leading-relaxed whitespace-pre-wrap">
                {{ reasoning }}
            </div>
        </div>

        <!-- Tool execution entry -->
        <div class="flex items-center gap-2 px-3 py-1.5 text-xs">
            <span>{{ toolIcon }}</span>
            <span class="text-white/60 flex-1 truncate">{{ label }}</span>
            <span :class="statusColor">{{ statusIcon }}</span>
        </div>
    </div>
</template>
