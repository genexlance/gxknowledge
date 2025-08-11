const { embedText } = require('./lib/deepseek.js')
const { queryVector } = require('./lib/pinecone.js')
const { searchLexical } = require('./lib/lexical.js')
const { rerank } = require('./lib/reranker.js')
const { rewriteForRetrieval, shouldRewrite } = require('./lib/rewrite.js')
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

    // 0) Optional LLM rewrite for retrieval only (keep original for display)
    const originalQuery = String(query)
    let retrievalQuery = originalQuery
    if (shouldRewrite()) {
      try {
        const candidate = await rewriteForRetrieval({ query: originalQuery })
        if (candidate && typeof candidate === 'string' && candidate.trim().length >= 3) {
          retrievalQuery = candidate.trim()
        }
      } catch (_err) {
        retrievalQuery = originalQuery
      }
    }

    // 1) Query expansion (lightweight): expand with synonyms from categories/tags heuristics
    const expanded = expandQuery(retrievalQuery)

    // 1) Lexical pre-filter: find likely parent documents
    const lexical = await searchLexical(expanded, 50)
    const candidateParentIds = lexical.slice(0, 25).map(x => x.parentId)
    const lexicalScoreByParent = new Map(lexical.map(l => [l.parentId, l.score]))
    const maxLexicalScore = Math.max(1e-6, ...lexical.map(l => l.score))

    // 2) Vector search scoped to candidates when possible
    const queryVectorValues = await getCachedEmbedding(expanded)
    const filter = {
      docType: { $eq: 'chunk' },
      postType: { $ne: 'attachment' },
      $or: [
        { isKB: { $eq: true } },
        { categorySlugs: { $in: ['kb','knowledge-base'] } }
      ],
      ...(candidateParentIds.length > 0 ? { parentId: { $in: candidateParentIds } } : {})
    }
    const topK = dynamicTopK(expanded)
    const matchesRaw = await queryVector({ values: queryVectorValues, topK, filter })
    // Hybrid scoring: combine vector score with lexical parent score and term coverage
    const queryTerms = tokenize(originalQuery)
    const phrase = String(originalQuery).toLowerCase().trim()
    const rescoredBase = matchesRaw.map((m) => {
      const meta = m.metadata || {}
      const haystack = [
        (meta.title || ''),
        (meta.category || ''),
        ...((meta.tags || [])),
        ...((meta.categorySlugs || [])),
        ...((meta.tagSlugs || [])),
        (meta.slug || ''),
        (meta.content || '')
      ].join(' ').toLowerCase()
      const coverageCount = queryTerms.reduce((acc, t) => acc + (haystack.includes(t) ? 1 : 0), 0)
      const coverageRatio = queryTerms.length > 0 ? (coverageCount / queryTerms.length) : 0
      const normalizedLex = (lexicalScoreByParent.get(meta.parentId) || 0) / maxLexicalScore
      const phraseHit = phrase.length >= 3 && (haystack.includes(phrase) ? 1 : 0)
      // weights tuned for balance: vector 0.6, coverage 0.25, lexical 0.12, phrase 0.08
      const combined = (
        (m.score || 0) * 0.6 +
        coverageRatio * 0.25 +
        normalizedLex * 0.12 +
        phraseHit * 0.08
      )
      // small bonus if the parent was shortlisted lexically
      const shortlistBonus = candidateParentIds.includes(meta.parentId) ? 0.03 : 0
      return {
        ...m,
        score: Math.max(0, Math.min(1, combined + shortlistBonus)),
        _coverageRatio: coverageRatio
      }
    })

    // 3) MMR diversification at chunk level to improve coverage
    const diverse = maxMarginalRelevance({
      queryVector: queryVectorValues,
      candidates: rescoredBase,
      k: 30,
      lambda: 0.5,
    })

    // Optional: cross-encoder rerank on the top N
    const reranked = await rerank({ query: expanded, candidates: diverse.slice(0, 30) })

    // Parent-level diversity: cap chunks per parent to avoid redundancy
    const byParent = new Map()
    for (const m of reranked) {
      const pid = m.metadata?.parentId || m.id
      if (!byParent.has(pid)) byParent.set(pid, [])
      byParent.get(pid).push(m)
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => (b.score || 0) - (a.score || 0))
    }
    const flattened = [...byParent.values()].flatMap(arr => arr.slice(0, 3))
    const threshold = dynamicThreshold(expanded)
    const matches = flattened
      .filter(m => (m.score || 0) >= threshold)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 12)
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

    const answer = buildAnswerFromMatches(originalQuery, matches)

    // telemetry (fire-and-forget)
    logRetrieval({ query: originalQuery, rewritten: retrievalQuery !== originalQuery ? retrievalQuery : null, expanded, topK, threshold, matches: matches.map(m => ({ id: m.id, score: m.score, pid: m.metadata?.parentId })) })

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
    return `Here’s what I looked for in your question — "${query}" — but I couldn’t find anything reliable in the knowledge base. Try rephrasing or asking about a related concept.`
  }

  const byParent = new Map()
  for (const m of matches) {
    const pid = m.metadata?.parentId || m.id
    if (!byParent.has(pid)) byParent.set(pid, [])
    byParent.get(pid).push(m)
  }
  const groups = [...byParent.values()].sort((a, b) => (b[0].score || 0) - (a[0].score || 0))
  const topGroups = groups.slice(0, 3)

  // Title line (the UI bolds the first line)
  const lines = []
  lines.push(`Here’s how our sources address "${query}" and why they’re relevant:`)

  // Brief synthesis from the most relevant group
  const primary = topGroups[0]
  if (primary) {
    const joined = primary.map(g => (g.metadata?.content || '')).join(' ')
    const synthesis = joined.slice(0, 480)
    const title = primary[0]?.metadata?.title || 'Top source'
    lines.push(`${title}: ${synthesis}${synthesis.length === 480 ? '…' : ''}`)
  }

  // Explain relevance of each top source
  if (topGroups.length > 0) {
    lines.push('\nWhy these sources are relevant:')
    let idx = 1
    for (const grp of topGroups) {
      const top = grp[0]
      const meta = top?.metadata || {}
      const haystack = [
        (meta.title || ''),
        (meta.category || ''),
        ...((meta.tags || [])),
        ...((meta.categorySlugs || [])),
        ...((meta.tagSlugs || [])),
        (meta.slug || ''),
        (meta.content || '')
      ].join(' ').toLowerCase()
      const qTerms = tokenize(query)
      const overlaps = qTerms.filter(t => haystack.includes(t)).slice(0, 6)
      const overlapText = overlaps.length > 0 ? `mentions ${overlaps.map(t => `“${t}”`).join(', ')}` : 'covers closely related topics'
      const scorePct = typeof top.score === 'number' ? ` — relevance ${(top.score * 100).toFixed(0)}%` : ''
      const title = meta.title || `Source ${idx}`
      lines.push(`- ${title}${scorePct}: this source ${overlapText} that align with your question.`)
      idx += 1
    }
  }

  lines.push('\nSee Sources below for links to the documents.')
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

// Lightweight query expander using heuristic boosts for common knowledge-base terms
function expandQuery(query) {
  const base = String(query || '').trim()
  if (!base) return base
  const lower = base.toLowerCase()
  const expansions = []
  if (/install|setup|configure/.test(lower)) expansions.push('installation setup configuration')
  if (/error|issue|fail|bug/.test(lower)) expansions.push('troubleshooting fix resolution')
  if (/price|billing|subscription/.test(lower)) expansions.push('billing pricing subscription plan')
  if (/api|endpoint|token/.test(lower)) expansions.push('API REST endpoint authentication token key')
  const expanded = [base, ...expansions].join(' ')
  return expanded
}

// Adjust topK based on query length/complexity
function dynamicTopK(q) {
  const len = tokenize(q).length
  if (len <= 3) return 80
  if (len <= 8) return 60
  return 40
}

function dynamicThreshold(q) {
  const len = tokenize(q).length
  if (len <= 3) return 0.24
  if (len <= 8) return 0.28
  return 0.30
}

// Simple in-memory embedding cache for hot queries (per function instance)
const __embedCache = new Map()
async function getCachedEmbedding(text) {
  const key = text.slice(0, 256)
  const hit = __embedCache.get(key)
  if (hit) return hit
  const v = await embedText(text)
  // bound cache size
  if (__embedCache.size > 200) {
    const firstKey = __embedCache.keys().next().value
    if (firstKey) __embedCache.delete(firstKey)
  }
  __embedCache.set(key, v)
  return v
}

// Max Marginal Relevance using cosine similarity on returned vectors
function maxMarginalRelevance({ queryVector, candidates, k = 20, lambda = 0.5 }) {
  const picked = []
  const remaining = candidates.slice().sort((a, b) => (b.score || 0) - (a.score || 0))
  while (picked.length < k && remaining.length > 0) {
    let bestIdx = 0
    let bestVal = -Infinity
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i]
      const simToQuery = cosineSimilarity(queryVector, c.values || [])
      let maxSimToPicked = 0
      for (const p of picked) {
        const sim = cosineSimilarity(c.values || [], p.values || [])
        if (sim > maxSimToPicked) maxSimToPicked = sim
      }
      const mmr = lambda * simToQuery - (1 - lambda) * maxSimToPicked
      if (mmr > bestVal) { bestVal = mmr; bestIdx = i }
    }
    picked.push(remaining.splice(bestIdx, 1)[0])
  }
  return picked
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) return 0
  let dot = 0, na = 0, nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0
    const y = b[i] || 0
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function logRetrieval(payload) {
  try {
    if (process.env.LOG_RETRIEVAL !== '1') return
    // keep lightweight; logs go to function logs
    console.log('RETRIEVAL_LOG', JSON.stringify(payload))
  } catch (e) {}
}


