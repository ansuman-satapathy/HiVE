import Prism from 'prismjs'

// Import core languages
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-java'

const LANGUAGE_ALIASES = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  golang: 'go',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  'c++': 'cpp',
  rs: 'rust',
}

export function highlightCode(code, language = 'text') {
  if (!code) return ''
  const langKey = (language || 'text').toLowerCase().trim()
  const resolvedLang = LANGUAGE_ALIASES[langKey] || langKey
  const grammar = Prism.languages[resolvedLang]

  if (grammar) {
    try {
      return Prism.highlight(code, grammar, resolvedLang)
    } catch {
      return escapeHtml(code)
    }
  }

  return escapeHtml(code)
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

