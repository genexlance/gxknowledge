const axios = require('axios')

function shouldRewrite() {
  return process.env.QUERY_REWRITE_ENABLED === '1'
}

async function rewriteForRetrieval({ query }) {
  const original = String(query || '').trim()
  if (!original) return original

  const provider = (process.env.QUERY_REWRITE_PROVIDER || '').toLowerCase()
  try {
    switch (provider) {
      case 'openai':
        return await rewriteWithOpenAI(original)
      case 'deepseek':
        return await rewriteWithDeepSeek(original)
      default:
        // Auto-pick DeepSeek if key exists, else OpenAI if key exists
        if (process.env.DEEPSEEK_API_KEY) return await rewriteWithDeepSeek(original)
        if (process.env.OPENAI_API_KEY) return await rewriteWithOpenAI(original)
        return heuristicRewrite(original)
    }
  } catch (_err) {
    return heuristicRewrite(original)
  }
}

function heuristicRewrite(input) {
  // Produce a concise keyword-style query to aid retrieval (keeps entities; removes stopwords)
  const tokens = tokenize(input)
  if (tokens.length === 0) return input
  // Cap length to avoid overly long queries
  const capped = tokens.slice(0, 24)
  return capped.join(' ')
}

async function rewriteWithDeepSeek(input) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return heuristicRewrite(input)
  const base = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
  const url = base.replace(/\/?$/, '') + '/chat/completions'
  const model = process.env.DEEPSEEK_REWRITE_MODEL || 'deepseek-chat'
  const body = {
    model,
    temperature: 0.2,
    max_tokens: 128,
    messages: [
      { role: 'system', content: 'You rewrite user questions into concise, retrieval-optimized search queries. Keep entities, add missing context only if implicit, avoid changing intent. Output a single line without quotes.' },
      { role: 'user', content: `Rewrite for retrieval only, preserve intent:\n${input}` }
    ]
  }
  const { data } = await axios.post(url, body, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 8000,
  })
  const text = data?.choices?.[0]?.message?.content?.trim()
  return validateRewrite(text, input)
}

async function rewriteWithOpenAI(input) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return heuristicRewrite(input)
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const url = base.replace(/\/?$/, '') + '/chat/completions'
  const model = process.env.OPENAI_REWRITE_MODEL || 'gpt-4o-mini'
  const body = {
    model,
    temperature: 0.2,
    max_tokens: 128,
    messages: [
      { role: 'system', content: 'You rewrite user questions into concise, retrieval-optimized search queries. Keep entities, add missing context only if implicit, avoid changing intent. Output a single line without quotes.' },
      { role: 'user', content: `Rewrite for retrieval only, preserve intent:\n${input}` }
    ]
  }
  const { data } = await axios.post(url, body, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 8000,
  })
  const text = data?.choices?.[0]?.message?.content?.trim()
  return validateRewrite(text, input)
}

function validateRewrite(candidate, original) {
  if (!candidate || typeof candidate !== 'string') return original
  const trimmed = candidate.trim().replace(/^"|"$/g, '')
  // Reject if too short, identical, or degenerate
  if (trimmed.length < 3) return original
  const same = normalized(trimmed) === normalized(original)
  if (same) return original
  // Ensure it shares at least one token with original to reduce intent drift
  const origTokens = new Set(tokenize(original))
  const rewTokens = new Set(tokenize(trimmed))
  const overlap = [...rewTokens].some(t => origTokens.has(t))
  if (!overlap) return original
  return trimmed
}

function tokenize(text) {
  if (!text) return []
  const lower = String(text).toLowerCase()
  const parts = lower.replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean)
  const stop = new Set(['the','a','an','and','or','of','to','in','on','for','with','by','at','from','is','are','was','were','be'])
  const filtered = parts.filter(t => t.length >= 2 && !stop.has(t))
  const unique = []
  const seen = new Set()
  for (const t of filtered) { if (!seen.has(t)) { seen.add(t); unique.push(t) } }
  return unique
}

function normalized(s) { return String(s).toLowerCase().replace(/\s+/g, ' ').trim() }

module.exports = { rewriteForRetrieval, shouldRewrite }


