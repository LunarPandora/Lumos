import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

export const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    highlight(str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                const highlighted = hljs.highlight(str, { language: lang }).value
                return `<div class="code-block"><div class="code-header"><span class="code-lang">${lang}</span><button class="code-copy" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(str)}')).then(()=>this.textContent='Copied!').then(()=>setTimeout(()=>this.textContent='Copy',1500))">Copy</button></div><pre><code class="hljs language-${lang}">${highlighted}</code></pre></div>`
            } catch {}
        }

        return `<div class="code-block"><pre><code class="hljs">${md.utils.escapeHtml(str)}</code></pre></div>`
    }
})
