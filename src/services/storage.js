import {
    BaseDirectory,
    mkdir,
    writeTextFile,
    readTextFile,
    exists,
    remove,
} from '@tauri-apps/plugin-fs'

/* -----------------------------
   INIT
------------------------------*/
export async function initializeStorage() {
    await mkdir('chats', {
        baseDir: BaseDirectory.AppData,
        recursive: true,
    }).catch(() => {})

    const hasConversationFile = await exists('conversations.json', {
        baseDir: BaseDirectory.AppData,
    })

    if (!hasConversationFile) {
        await writeTextFile(
            'conversations.json',
            '[]',
            { baseDir: BaseDirectory.AppData }
        )
    }
}

/* -----------------------------
   CONVERSATIONS
------------------------------*/
export async function getConversations() {
    const content = await readTextFile('conversations.json', {
        baseDir: BaseDirectory.AppData,
    })

    return JSON.parse(content)
}

export async function saveConversations(conversations) {
    await writeTextFile(
        'conversations.json',
        JSON.stringify(conversations, null, 2),
        { baseDir: BaseDirectory.AppData }
    )
}

export async function createConversation(title = 'New Chat') {
    const conversations = await getConversations()

    const conversation = {
        id: crypto.randomUUID(),
        title,
        created_at: Date.now(),
        updated_at: Date.now(),
    }

    conversations.push(conversation)

    await saveConversations(conversations)

    await writeTextFile(
        `chats/${conversation.id}.json`,
        JSON.stringify({ messages: [] }, null, 2),
        { baseDir: BaseDirectory.AppData }
    )

    return conversation
}

export async function deleteConversation(id) {
    const conversations = await getConversations()
    const filtered = conversations.filter(c => c.id !== id)
    await saveConversations(filtered)

    const chatPath = `chats/${id}.json`
    const fileExists = await exists(chatPath, {
        baseDir: BaseDirectory.AppData,
    })

    if (fileExists) {
        await remove(chatPath, {
            baseDir: BaseDirectory.AppData,
        })
    }

    return filtered
}

export async function deleteAllConversations() {
    const conversations = await getConversations()

    for (const conv of conversations) {
        const chatPath = `chats/${conv.id}.json`
        const fileExists = await exists(chatPath, {
            baseDir: BaseDirectory.AppData,
        })

        if (fileExists) {
            await remove(chatPath, {
                baseDir: BaseDirectory.AppData,
            }).catch(() => {})
        }
    }

    await saveConversations([])
}

/* -----------------------------
   CHAT
------------------------------*/
export async function getChat(id) {
    const content = await readTextFile(`chats/${id}.json`, {
        baseDir: BaseDirectory.AppData,
    })

    return JSON.parse(content)
}

export async function saveChat(id, messages) {
    await writeTextFile(
        `chats/${id}.json`,
        JSON.stringify({ messages }, null, 2),
        { baseDir: BaseDirectory.AppData }
    )
}

/* -----------------------------
   LAST ACTIVE CHAT
------------------------------*/
export async function saveLastActiveConversation(id) {
    await writeTextFile(
        'last_active.json',
        JSON.stringify({ id }),
        { baseDir: BaseDirectory.AppData }
    )
}

export async function getLastActiveConversation() {
    const fileExists = await exists('last_active.json', {
        baseDir: BaseDirectory.AppData,
    })

    if (!fileExists) return null

    const content = await readTextFile('last_active.json', {
        baseDir: BaseDirectory.AppData,
    })

    return JSON.parse(content).id
}
