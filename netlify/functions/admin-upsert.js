// Authenticated admin endpoint to upsert arbitrary text entries into Pinecone
// POST /api/admin/upsert { parentId?, slug?, title, content, tags?, category?, url? }
const { requireAdmin } = require('./lib/adminAuth.js')
const { embedText } = require('./lib/deepseek.js')
const { upsertVector } = require('./lib/pinecone.js')

if (process.env.NETLIFY_DEV) {
  require('dotenv').config()
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } }) }
  }
  try {
    requireAdmin(event)
    const body = JSON.parse(event.body || '{}')
    const title = String(body.title || '').trim()
    const content = String(body.content || '').trim()
    const parentId = String(body.parentId || randomId())
    const slug = body.slug ? String(body.slug) : null
    const tags = Array.isArray(body.tags) ? body.tags.map(String) : []
    const category = body.category ? String(body.category) : ''
    const url = body.url ? String(body.url) : ''
    if (!title || !content) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing title or content' } }) }
    }

    // Chunk and embed similar to ingest.js
    const chunks = chunkTextSentenceAware(`${title}\n\n${content}`.trim(), 1200, 3)
    const totalChunks = chunks.length
    let upserted = 0
    for (let idx = 0; idx < totalChunks; idx++) {
      const chunk = chunks[idx]
      const values = await embedText(chunk)
      await upsertVector({
        id: `${parentId}#${idx}`,
        values,
        metadata: {
          parentId,
          title,
          content: chunk.slice(0, 1200),
          category,
          tags,
          categorySlugs: [],
          tagSlugs: [],
          author: 'admin',
          dateCreated: new Date().toISOString(),
          source: 'admin',
          docType: 'chunk',
          postType: 'post',
          chunkIndex: idx,
          totalChunks,
          contentLength: chunk.length,
          url,
          slug,
          isKB: true,
        }
      })
      upserted++
    }
    return { statusCode: 200, body: JSON.stringify({ success: true, data: { parentId, slug, upserted, totalChunks } }) }
  } catch (err) {
    const status = err?.statusCode || 500
    return { statusCode: status, body: JSON.stringify({ success: false, error: { code: 'UPSERT_ERROR', message: err.message } }) }
  }
}

function randomId() { return Math.random().toString(36).slice(2) }

function chunkText(text, maxLen, overlap) {
  const chunks = []
  if (!text) return chunks
  const len = text.length
  const step = Math.max(1, maxLen - overlap)
  for (let start = 0; start < len; start += step) {
    const end = Math.min(len, start + maxLen)
    const slice = text.slice(start, end)
    if (slice.trim().length > 0) chunks.push(slice)
    if (end >= len) break
  }
  return chunks
}

function splitIntoSentences(text) {
  const normalized = String(text).replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  const abbrev = '(?:(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\\.g|i\\.e)\.)'
  const regex = new RegExp(`(?!${abbrev})[.!?]+\\s+`, 'g')
  const parts = normalized.split(regex)
  const sentences = []
  let idx = 0
  for (const part of parts) {
    const start = normalized.indexOf(part, idx)
    if (start === -1) continue
    const end = start + part.length
    const nextChar = normalized[end] || ''
    let punct = ''
    if (/[.!?]/.test(nextChar)) { punct = nextChar; idx = end + 1 } else { idx = end }
    sentences.push((part + punct).trim())
  }
  return sentences.filter(Boolean)
}

function chunkTextSentenceAware(text, maxChars, overlapSentences) {
  if (!text) return []
  const sentences = splitIntoSentences(text)
  const chunks = []
  let current = ''
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i]
    if ((current + ' ' + s).trim().length <= maxChars) {
      current = (current ? current + ' ' : '') + s
    } else {
      if (current.trim()) chunks.push(current.trim())
      const back = Math.max(0, i - overlapSentences)
      const overlap = sentences.slice(back, i).join(' ')
      current = overlap ? (overlap + ' ' + s) : s
      if (current.length > maxChars) {
        const hard = chunkText(current, maxChars, Math.floor(maxChars * 0.15))
        chunks.push(...hard)
        current = ''
      }
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}


