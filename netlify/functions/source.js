const fs = require('fs')
const path = require('path')
const { parseStringPromise } = require('xml2js')
const { queryVector } = require('./lib/pinecone.js')

if (process.env.NETLIFY_DEV) {
  require('dotenv').config()
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } }) }
  }
  try {
    const { parentId = null, slug = null } = JSON.parse(event.body || '{}')
    if (!parentId && !slug) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: { code: 'BAD_REQUEST', message: 'Provide parentId or slug' } }) }
    }

    // Try XML first (supports both project root and function-relative location)
    const xmlResult = await tryLoadFromXml({ parentId, slug })
    if (xmlResult) {
      return respondHtml(xmlResult.title, xmlResult.html)
    }

    // Fallback to Pinecone assembly
    const pineResult = await tryLoadFromPinecone({ parentId, slug })
    if (pineResult) {
      return respondHtml(pineResult.title, pineResult.html)
    }

    return { statusCode: 404, body: JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } }) }
  } catch (err) {
    const message = err?.message || 'SOURCE_ERROR'
    return { statusCode: 500, body: JSON.stringify({ success: false, error: { code: 'SOURCE_ERROR', message } }) }
  }
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function tryLoadFromXml({ parentId, slug }) {
  try {
    let xmlPath = path.resolve(process.cwd(), 'originalDATA.xml')
    if (!fs.existsSync(xmlPath)) {
      xmlPath = path.resolve(__dirname, '../../originalDATA.xml')
      if (!fs.existsSync(xmlPath)) return null
    }
    const xml = fs.readFileSync(xmlPath, 'utf-8')
    const parsed = await parseStringPromise(xml, { explicitArray: false, mergeAttrs: true, trim: true })
    let items = parsed?.rss?.channel?.item
    items = Array.isArray(items) ? items : (items ? [items] : [])
    const match = items.find((it) => {
      const id = (it['wp:post_id'] || it.guid?._ || it.guid || '').toString()
      const name = (it['wp:post_name']?._ || it['wp:post_name'] || '').toString()
      return (parentId && id === String(parentId)) || (slug && name === String(slug))
    })
    if (!match) return null
    const title = (match.title?._ || match.title || '').toString()
    let html = (match['content:encoded']?._ || match['content:encoded'] || '').toString()
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    return { title, html: wrapArticle(title, html) }
  } catch {
    return null
  }
}

async function tryLoadFromPinecone({ parentId, slug }) {
  try {
    const dim = parseInt(process.env.PINECONE_INDEX_DIM || process.env.PINECONE_DIM || '1024', 10) || 1024
    const zero = new Array(dim).fill(0)
    const filter = {
      docType: { $eq: 'chunk' },
      ...(parentId ? { parentId: { $eq: String(parentId) } } : {}),
      ...(slug ? { slug: { $eq: String(slug) } } : {}),
    }
    const matches = await queryVector({ values: zero, topK: 200, filter })
    if (!matches || matches.length === 0) return null
    const pid = parentId || matches[0]?.metadata?.parentId
    const group = matches.filter(m => (m.metadata?.parentId || pid) === pid)
    group.sort((a,b)=> (a.metadata?.chunkIndex||0) - (b.metadata?.chunkIndex||0))
    const title = group[0]?.metadata?.title || 'Untitled'
    const htmlBody = group.map(m => escapeHtmlBlock(m.metadata?.content || '')).join('\n\n')
    return { title, html: wrapArticle(title, `<pre>${htmlBody}</pre>`) }
  } catch {
    return null
  }
}

function wrapArticle(title, innerHtml) {
  return `<!doctype html><html><head><meta charset=\"utf-8\"><title>${escapeHtml(title)}</title></head><body><article>${innerHtml}</article></body></html>`
}

function escapeHtmlBlock(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function respondHtml(title, html) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, data: { title, html } })
  }
}


