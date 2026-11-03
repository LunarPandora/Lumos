<script setup>
import { computed } from 'vue'

const props = defineProps({
    request: { type: Object, required: true },
})

const emit = defineEmits(['approve', 'reject'])

const riskColors = {
    low: 'text-green-400 bg-green-500/10 border-green-500/20',
    medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    high: 'text-red-400 bg-red-500/10 border-red-500/20',
    critical: 'text-red-500 bg-red-600/10 border-red-600/20',
}

const riskColor = computed(() => riskColors[props.request.risk] || riskColors.low)

const diffStats = computed(() => {
    if (!props.request.preview?.diff) return null
    const added = props.request.preview.diff.filter(d => d.type === 'added').length
    const removed = props.request.preview.diff.filter(d => d.type === 'removed').length
    return { added, removed }
})

function formatLine(line) {
    return line
        .replace(/\+/g, '<span class="text-green-400">+</span>')
        .replace(/^-/, '<span class="text-red-400">-</span>')
}
</script>

<template>
    <div class="flex flex-col gap-3 p-4 rounded-xl border border-white/10 bg-zinc-900/80 backdrop-blur-sm max-w-lg">
        <!-- Header -->
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
                <span class="text-white/90 font-medium text-sm">{{ request.title }}</span>
                <span
                    class="text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide"
                    :class="riskColor"
                >
                    {{ request.risk }}
                </span>
            </div>
        </div>

        <!-- Description -->
        <div class="text-white/60 text-xs">{{ request.description }}</div>

        <!-- File path -->
        <div v-if="request.preview?.filePath" class="flex items-center gap-1.5 text-xs text-white/40">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span class="font-mono">{{ request.preview.filePath }}</span>
        </div>

        <!-- Diff preview -->
        <div v-if="request.preview?.type === 'diff' && diffStats" class="rounded-lg overflow-hidden border border-white/5">
            <div class="flex items-center gap-3 px-3 py-1.5 bg-zinc-800/50 text-[10px] text-white/40">
                <span class="text-green-400">+{{ diffStats.added }} added</span>
                <span class="text-red-400">-{{ diffStats.removed }} removed</span>
            </div>
            <div class="max-h-48 overflow-y-auto p-2 bg-black/30 font-mono text-xs leading-5">
                <div
                    v-for="(line, i) in request.preview.diff"
                    :key="i"
                    :class="{
                        'text-green-400/80': line.type === 'added',
                        'text-red-400/80': line.type === 'removed',
                        'text-white/30': line.type === 'context',
                    }"
                    v-html="formatLine(line.line)"
                />
            </div>
        </div>

        <!-- Content preview for write_file -->
        <div v-if="request.preview?.type === 'content'" class="rounded-lg overflow-hidden border border-white/5">
            <div class="max-h-48 overflow-y-auto p-2 bg-black/30 font-mono text-xs leading-5 text-white/50">
                {{ request.preview.content }}
            </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-2 pt-1">
            <button
                @click="emit('reject')"
                class="px-3 py-1.5 text-xs text-white/50 hover:text-white/80 hover:bg-white/5 rounded-lg transition-colors"
            >
                Reject
            </button>
            <button
                @click="emit('approve')"
                class="px-3 py-1.5 text-xs text-white bg-indigo-500/80 hover:bg-indigo-500 rounded-lg transition-colors font-medium"
            >
                Approve
            </button>
        </div>
    </div>
</template>
