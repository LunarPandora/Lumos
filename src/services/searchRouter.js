import { searchWeb } from './webSearch'

export async function maybeSearch(message) {
    const text = message.toLowerCase()

    const triggers = [
        'what is',
        'who is',
        'who won',
        'latest',
        'news',
        'today',
        'current',
        'now',
        'update',
        'standing',
        'rank',
        'result',
        'score',
        'how to',
        'documentation',
        'docs',
        '2026',
        '2025',
    ]

    const shouldSearch = triggers.some(trigger => text.includes(trigger))

    if (!shouldSearch) {
        return null
    }

    return await searchWeb(message)
}

export function shouldSearchWeb(query, chatStore) {
    const q = query.toLowerCase()

    const triggers = [
        'who won', 'latest', 'current', 'now', 'update',
        'standing', 'rank', 'result', 'score', 'news',
        'today', '2026', '2025', 'what is', 'who is',
        'how to', 'documentation', 'docs',
    ]

    if (triggers.some(t => q.includes(t))) return true

    const mem = chatStore.webMemoryByChat?.[chatStore.activeConversationId]
    if (!mem?.results?.length) return true

    if (q.length < 6) return true

    return false
}
