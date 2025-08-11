// Netlify function to batch-ingest XML into Pinecone using DeepSeek embeddings
// Trigger via POST /api/ingest { limit?: number }
const fs = require('fs')
const path = require('path')
const { parseStringPromise } = require('xml2js')
const { embedText } = require('./lib/deepseek.js')
const { upsertVector } = require('./lib/pinecone.js')
const { stripHtml, chunkTextSentenceAware } = require('./lib/chunk.js')
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

// moved chunk helpers to lib/chunk.js


