// ─── Tool System Initialization ─────────────────────────────────────
// Import this once at app startup to register all tools.

import { updateToolCount } from './registry'

// Import tool definitions (each file self-registers via registerTool)
import './definitions/filesystem'

// Update reactive tool count
updateToolCount()

console.log(`[Tools] Initialized with ${updateToolCount() || 'all'} tools`)
