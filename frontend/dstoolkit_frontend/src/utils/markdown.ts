import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import katex from 'katex'
import katexPlugin from '@traptitech/markdown-it-katex'
import 'katex/dist/katex.min.css'

function highlight(str: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`
    } catch {
      /* fall through */
    }
  }
  return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight,
})

md.use(katexPlugin, { katex })

export function renderMarkdown(text: string): string {
  return md.render(text || '')
}
