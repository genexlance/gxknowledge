// Netlify function to batch-ingest XML into Pinecone using DeepSeek embeddings
// Trigger via POST /api/ingest { limit?: number }
const fs = require('fs')
const path = require('path')
const { parseStringPromise } = require('xml2js')
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
    const { limit = 100, offset = 0 } = JSON.parse(event.body || '{}')
    const xmlPath = path.resolve(process.cwd(), 'originalDATA.xml')
    if (!fs.existsSync(xmlPath)) {
      return { statusCode: 404, body: JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'originalDATA.xml not found' } }) }
    }
    const xml = fs.readFileSync(xmlPath, 'utf-8')
    const parsed = await parseStringPromise(xml, { explicitArray: false, mergeAttrs: true, trim: true })
    const baseUrl = (parsed?.rss?.channel?.link?._ || parsed?.rss?.channel?.link || '').toString()
    // Handle WordPress WXR structure: rss > channel > item
    let items = parsed?.rss?.channel?.item
    if (!items) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: { code: 'BAD_XML', message: 'No items found in rss.channel.item' } }) }
    }
    items = Array.isArray(items) ? items : [items]
    const total = items.length
    const slice = items.slice(offset, offset + limit)

    let upserted = 0
    for (const it of slice) {
      // Map WXR fields
      const id = String(it['wp:post_id'] || it.guid?._ || randomId())
      const title = (it.title?._ || it.title || '').toString()
      const content = (it['content:encoded']?._ || it['content:encoded'] || '').toString()
      const author = (it['dc:creator']?._ || it['dc:creator'] || '').toString()
      const date = (it['wp:post_date']?._ || it['wp:post_date'] || it.pubDate || '').toString()
      const postType = (it['wp:post_type']?._ || it['wp:post_type'] || '').toString()
      const status = (it['wp:status']?._ || it['wp:status'] || '').toString()
      const urlFromLink = (it.link?._ || it.link || '').toString()
      const slug = (it['wp:post_name']?._ || it['wp:post_name'] || '').toString()

      // Categories/tags: <category domain="category"> and domain="post_tag"
      let categories = []
      let categorySlugs = []
      let tags = []
      let tagSlugs = []
      const cats = it.category
      if (cats) {
        const arr = Array.isArray(cats) ? cats : [cats]
        for (const c of arr) {
          const domain = c?.domain || c?.$?.domain
          const value = (c?._ || c || '').toString()
          const slug = (c?.nicename || c?.$?.nicename || '').toString().toLowerCase()
          if (domain === 'category') { categories.push(value); if (slug) categorySlugs.push(slug) }
          else if (domain === 'post_tag') { tags.push(value); if (slug) tagSlugs.push(slug) }
        }
      }

      // Skip non-content entries and WooCommerce/order/product types
      const skipTypes = new Set(['attachment', 'revision', 'nav_menu_item', 'shop_order', 'shop_order_refund', 'shop_coupon', 'product', 'product_variation'])
      if (skipTypes.has(postType) || status === 'trash' || status === 'draft' || status === 'auto-draft') {
        continue
      }

      const category = categories[0] || ''
      const isKB = categorySlugs.includes('kb') || tagSlugs.includes('kb') || category.toLowerCase() === 'knowledge base'
      const clean = stripHtml(content)
      const baseText = `${title}\n\n${clean}`.trim()
      if (baseText.length < 200) {
        // too short to be useful
        continue
      }

      // Sentence-aware chunking with overlap to improve factual coherence
      const chunks = chunkTextSentenceAware(baseText, 1200, 3)
      const totalChunks = chunks.length
      for (let idx = 0; idx < totalChunks; idx++) {
        const chunk = chunks[idx]
        const values = await embedText(chunk)
        const url = urlFromLink || (slug && baseUrl ? `${baseUrl.replace(/\/$/, '')}/${slug}/` : '')
        await upsertVector({
          id: `${id}#${idx}`,
          values,
          metadata: {
            parentId: id,
            title,
            content: chunk.slice(0, 1200),
            category,
            tags,
            categorySlugs,
            tagSlugs,
            author,
            dateCreated: date,
            source: 'originalDATA.xml',
            docType: 'chunk',
            postType,
            chunkIndex: idx,
            totalChunks,
            contentLength: chunk.length,
            url,
            slug,
            isKB,
          }
        })
        upserted++
      }
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, data: { upserted, offset, limit, total } }) }
  } catch (err) {
    const details = serializeError(err)
    console.error('INGEST_ERROR', details)
    return { statusCode: 500, body: JSON.stringify({ success: false, error: { code: 'INGEST_ERROR', message: err.message, details } }) }
  }
}

function randomId() { return Math.random().toString(36).slice(2) }

function stripHtml(html = '') {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
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

// Split long text into overlapping chunks to improve semantic recall
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

// Split by sentences and build chunks up to ~maxChars, overlapping by N sentences
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
      // start next with overlap
      const back = Math.max(0, i - overlapSentences)
      const overlap = sentences.slice(back, i).join(' ')
      current = overlap ? (overlap + ' ' + s) : s
      if (current.length > maxChars) {
        // fall back to hard split if a single sentence is huge
        const hard = chunkText(current, maxChars, Math.floor(maxChars * 0.15))
        chunks.push(...hard)
        current = ''
      }
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

function splitIntoSentences(text) {
  const normalized = String(text).replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  // Basic sentence splitter that respects common punctuation and abbreviations
  const abbrev = '(?:(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e)\.)'
  const regex = new RegExp(`(?!${abbrev})[.!?]+\s+`, 'g')
  const parts = normalized.split(regex)
  // Re-attach punctuation heuristically
  const sentences = []
  let idx = 0
  for (const part of parts) {
    const start = normalized.indexOf(part, idx)
    if (start === -1) continue
    const end = start + part.length
    const nextChar = normalized[end] || ''
    let punct = ''
    if (/[.!?]/.test(nextChar)) {
      punct = nextChar
      idx = end + 1
    } else {
      idx = end
    }
    sentences.push((part + punct).trim())
  }
  return sentences.filter(Boolean)
}


