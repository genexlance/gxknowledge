const fs = require('fs')
const path = require('path')
const { parseStringPromise } = require('xml2js')
const { queryVector } = require('./lib/pinecone.js')

if (process.env.NETLIFY_DEV) {
  require('dotenv').config()
}

let __xmlIndex = null

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
      return respondHtml(xmlResult.title, xmlResult.html, xmlResult.url)
    }

    // Fallback to Pinecone assembly
    const pineResult = await tryLoadFromPinecone({ parentId, slug })
    if (pineResult) {
      return respondHtml(pineResult.title, pineResult.html, pineResult.url)
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
    const index = await ensureXmlIndex()
    if (!index) return null
    const keyId = parentId ? String(parentId) : null
    const keySlug = slug ? String(slug) : null
    const entry = (keyId && index.byId.get(keyId)) || (keySlug && index.bySlug.get(keySlug))
    if (!entry) return null
    const { title, html, url } = entry
    return { title, html, url }
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
    // Use a high topK with a neutral vector to retrieve as many chunks as possible for the parent
    const matches = await queryVector({ values: zero, topK: 1000, filter })
    if (!matches || matches.length === 0) return null
    const pid = String(parentId || matches[0]?.metadata?.parentId || '')
    const group = matches.filter(m => String(m.metadata?.parentId || pid) === pid)
    group.sort((a,b)=> (a.metadata?.chunkIndex||0) - (b.metadata?.chunkIndex||0))
    const title = group[0]?.metadata?.title || 'Untitled'

    // If we can resolve this parent in XML after discovering pid/slug, prefer XML for full formatting
    try {
      const xml = await tryLoadFromXml({ parentId: pid, slug: group[0]?.metadata?.slug })
      if (xml) return xml
    } catch {}

    // Fallback: stitch text chunks while trimming overlaps to reduce duplication and mid-word cuts
    const stitched = stitchChunksText(group.map(m => String(m.metadata?.content || '')))
    const safe = escapeHtmlBlock(stitched)
    const paragraphs = paragraphize(safe)
    const htmlBody = paragraphs.map(p => `<p>${p}</p>`).join('\n')
    return { title, html: `<article>${htmlBody}</article>` }
  } catch {
    return null
  }
}

function wrapArticle(title, innerHtml) {
  return `<!doctype html><html><head><meta charset=\"utf-8\"><title>${escapeHtml(title)}</title></head><body><article>${innerHtml}</article></body></html>`
}

function rewriteRelativeUrls(html, base) {
  if (!base) return html
  let origin
  try { origin = new URL(base) } catch { return html }
  const replacer = (full, attr, url) => {
    const trimmed = (url || '').trim()
    if (!trimmed) return full
    const lower = trimmed.toLowerCase()
    if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('data:') || lower.startsWith('mailto:') || lower.startsWith('tel:') || lower.startsWith('#')) {
      return full
    }
    try {
      const abs = new URL(trimmed, origin.href).href
      return `${attr}="${abs}"`
    } catch {
      return full
    }
  }
  return html.replace(/\b(href|src)=["']([^"']+)["']/gi, replacer)
}

function escapeHtmlBlock(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function respondHtml(title, html, url) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, data: { title, html, url: url || null } })
  }
}

async function ensureXmlIndex() {
  if (__xmlIndex) return __xmlIndex
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
    const siteBase = (parsed?.rss?.channel?.link?._ || parsed?.rss?.channel?.link || '').toString()
    const byId = new Map()
    const bySlug = new Map()
    for (const it of items) {
      const id = (it['wp:post_id'] || it.guid?._ || it.guid || '').toString()
      const name = (it['wp:post_name']?._ || it['wp:post_name'] || '').toString()
      const title = (it.title?._ || it.title || '').toString()
      let html = (it['content:encoded']?._ || it['content:encoded'] || '').toString()
      if (!id && !name) continue
      // strip scripts for safety
      html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      const pageLink = (it.link?._ || it.link || '').toString()
      const base = pageLink || siteBase
      const rewritten = rewriteRelativeUrls(html, base)
      const wrapped = `<article>${rewritten}</article>`
      const entry = { title, html: wrapped, url: pageLink || null }
      if (id) byId.set(String(id), entry)
      if (name) bySlug.set(String(name), entry)
    }
    __xmlIndex = { byId, bySlug }
    return __xmlIndex
  } catch {
    __xmlIndex = null
    return null
  }
}

function stitchChunksText(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) return ''
  let out = ''
  for (let i = 0; i < chunks.length; i++) {
    const part = String(chunks[i] || '')
    if (i === 0) { out = part; continue }
    // Prefer normalized overlap to remove duplicated overlap sentences
    let overlap = longestOverlapSuffixPrefixNormalized(out, part)
    if (overlap === 0) overlap = longestOverlapSuffixPrefix(out, part)
    let toAppend = part.slice(overlap)
    // Smooth boundary to avoid mid-word concatenation
    if (out && toAppend) {
      const last = out[out.length - 1]
      const first = toAppend[0]
      if (/[A-Za-z\u00C0-\u017F’']/.test(last) && /[A-Za-z\u00C0-\u017F]/.test(first)) {
        toAppend = ' ' + toAppend
      }
    }
    out += toAppend
  }
  return out
}

function longestOverlapSuffixPrefix(a, b) {
  const max = Math.min(400, a.length, b.length)
  for (let len = max; len > 0; len--) {
    if (a.slice(-len) === b.slice(0, len)) return len
  }
  return 0
}

function longestOverlapSuffixPrefixNormalized(a, b) {
  // Compare on lowercased, collapsed-whitespace versions but return overlap length in original b
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const aNorm = norm(a)
  const bNorm = norm(b)
  const max = Math.min(400, aNorm.length, bNorm.length)
  for (let len = max; len > 20; len--) { // ignore tiny overlaps to reduce false positives
    if (aNorm.slice(-len) === bNorm.slice(0, len)) {
      // Map the normalized overlap to original start index in b by searching the normalized slice
      const target = bNorm.slice(0, len)
      // Find corresponding raw index in b by expanding whitespace greedily
      let rawIdx = 0, normIdx = 0
      while (rawIdx < b.length && normIdx < len) {
        const ch = b[rawIdx]
        if (/\s/.test(ch)) {
          // collapse consecutive whitespace to one
          while (rawIdx < b.length && /\s/.test(b[rawIdx])) rawIdx++
          // only advance normIdx if this whitespace contributes (avoid leading)
          if (normIdx > 0 && target[normIdx] === ' ') normIdx++
        } else {
          if (target[normIdx] === ch.toLowerCase()) normIdx++
          rawIdx++
        }
      }
      return Math.max(0, rawIdx)
    }
  }
  return 0
}

function paragraphize(text) {
  // Split into paragraphs by two or more newlines, or fall back to splitting on sentence boundaries
  const blocks = String(text).split(/\n\n+/).map(s => s.trim()).filter(Boolean)
  if (blocks.length > 1) return blocks
  // sentence-level grouping
  const sentences = String(text).split(/(?<=[.!?])\s+(?=[A-Z(\[])/)
  const grouped = []
  let current = ''
  for (const s of sentences) {
    if ((current + ' ' + s).trim().length <= 800) {
      current = (current ? current + ' ' : '') + s
    } else {
      if (current) grouped.push(current)
      current = s
    }
  }
  if (current) grouped.push(current)
  return grouped.length > 0 ? grouped : [text]
}


