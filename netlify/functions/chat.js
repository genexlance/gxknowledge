const { embedText } = require('./lib/deepseek.js')
const { queryVector } = require('./lib/pinecone.js')
if (process.env.NETLIFY_DEV) {
  require('dotenv').config()
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } }) };
  }

  try {
    const { query = "", sessionId = null } = JSON.parse(event.body || "{}");
    if (!query || typeof query !== "string") {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: { code: "BAD_REQUEST", message: "Missing query" } }) };
    }

    // Placeholder vector search flow
    const queryVectorValues = await embedText(query)
    // Filter out attachments/orders by category/tag slugs if present
    const filter = {
      docType: { $eq: 'chunk' },
      postType: { $ne: 'attachment' },
      $or: [
        { isKB: { $eq: true } },
        { categorySlugs: { $in: ['kb','knowledge-base'] } }
      ]
    }
    // Add a score threshold client-side to reduce noise
    const matchesRaw = await queryVector({ values: queryVectorValues, topK: 20, filter })
    // Keyword boost: if metadata contains explicit keywords/tags that match the query terms, increase score
    const queryTerms = tokenize(query)
    const boosted = matchesRaw.map(m => {
      const meta = m.metadata || {}
      const haystack = [
        (meta.title||''),
        (meta.category||''),
        ...((meta.tags||[])),
        ...((meta.categorySlugs||[])),
        ...((meta.tagSlugs||[])),
        (meta.slug||''),
        (meta.content||'')
      ].join(' ').toLowerCase()
      const hits = queryTerms.reduce((acc, t) => acc + (haystack.includes(t) ? 1 : 0), 0)
      // up to +0.2 for multiple keyword hits
      const bonus = Math.min(0.2, hits * 0.05)
      return { ...m, score: Math.min(1, (m.score || 0) + bonus) }
    })
    const matches = boosted.filter(m => (m.score || 0) >= 0.35).sort((a,b)=> (b.score||0) - (a.score||0)).slice(0, 10)
    const best = matches[0]
    const relevance = best ? Math.max(0, Math.min(1, best.score)) : 0
    const fallbackBase = (process.env.FALLBACK_SOURCE_BASE_URL || '').replace(/\/$/, '')
    const sources = matches.map((m) => {
      const slug = m.metadata?.slug || null
      let url = m.metadata?.url || m.metadata?.link || null
      if ((!url || String(url).trim().length === 0) && slug && fallbackBase) {
        url = `${fallbackBase}/${slug}/`
      }
      return {
        title: m.metadata?.title || 'Untitled',
        id: m.id,
        score: m.score,
        url,
        parentId: m.metadata?.parentId || null,
        slug,
        snippet: (m.metadata?.content || '').slice(0, 160),
      }
    })

    const answer = buildAnswerFromMatches(query, matches)

    const response = {
      answer,
      sources,
      relevance,
      sessionId: sessionId || cryptoRandomId(),
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, data: response })
    };
  } catch (err) {
    const details = serializeError(err)
    console.error('CHAT_ERROR', details)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: { code: "INTERNAL_ERROR", message: err.message, details } })
    };
  }
};

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function serializeError(err) {
  if (!err) return {}
  const out = { message: err.message, stack: err.stack }
  const anyErr = err
  if (anyErr.response) {
    out.response = {
      status: anyErr.response.status,
      statusText: anyErr.response.statusText,
      data: anyErr.response.data,
      headers: anyErr.response.headers,
    }
  }
  if (anyErr.request) {
    out.request = { method: anyErr.request?.method, path: anyErr.request?.path, host: anyErr.request?.host }
  }
  return out
}

function buildAnswerFromMatches(query, matches) {
  if (!matches || matches.length === 0) {
    return `I couldn't find anything relevant for: ${query}`
  }
  // Extractive answer: summarize top chunks grouped by parent, then list sources
  const lines = []
  const byParent = new Map()
  for (const m of matches) {
    const pid = m.metadata?.parentId || m.id
    if (!byParent.has(pid)) byParent.set(pid, [])
    byParent.get(pid).push(m)
  }
  const groups = [...byParent.values()].sort((a,b)=> (b[0].score||0) - (a[0].score||0))
  const topGroup = groups[0]
  if (topGroup) {
    const top = topGroup[0]
    const title = top.metadata?.title || 'Untitled'
    const category = top.metadata?.category || ''
    const snippet = topGroup.map(g => (g.metadata?.content || '')).join(' ').slice(0, 500)
    lines.push(`${title}${category ? ` — ${category}` : ''}`)
    lines.push(snippet + (snippet.length === 500 ? '…' : ''))
  }

  // Additional supporting sources
  const others = groups.slice(1, 3)
  if (others.length > 0) {
    lines.push('\nRelated sources:')
    for (const group of others) {
      const top = group[0]
      const title = top.metadata?.title || 'Untitled'
      const score = typeof top.score === 'number' ? (top.score * 100).toFixed(0) : '—'
      lines.push(`- ${title} (relevance ${score}%)`)
    }
  }
  return lines.join('\n')
}

// Simple tokenizer for keyword boosting
function tokenize(input) {
  if (!input) return []
  const lower = String(input).toLowerCase()
  // Replace non-alphanumeric with space, then split
  const parts = lower.replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean)
  // Remove very short tokens that add noise
  const filtered = parts.filter(t => t.length >= 2)
  // Deduplicate while preserving order
  const seen = new Set()
  const unique = []
  for (const t of filtered) {
    if (!seen.has(t)) {
      seen.add(t)
      unique.push(t)
    }
  }
  return unique
}


