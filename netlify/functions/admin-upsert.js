// Authenticated admin endpoint to upsert arbitrary text entries into Pinecone
// POST /api/admin/upsert { parentId?, slug?, title, content, tags?, category?, url? }
const { requireAdmin } = require('./lib/adminAuth.js')
const { embedText } = require('./lib/deepseek.js')
const { upsertVector } = require('./lib/pinecone.js')
const { chunkTextSentenceAware } = require('./lib/chunk.js')

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

// moved chunk helpers to lib/chunk.js


