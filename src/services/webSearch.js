import { invoke } from '@tauri-apps/api/core'

export async function searchWeb(query) {
    try {
        const raw = await invoke('web_search', { query })
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw

        const results = (data?.results || []).slice(0, 5).map(r => ({
            title: r.title || '',
            snippet: r.content || r.snippet || '',
            url: r.url || ''
        }))

        return {
            query,
            results
        }

    } catch (err) {
        console.error(err)

        return {
            query,
            results: []
        }
    }
}