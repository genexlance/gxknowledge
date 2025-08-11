// Fetch a URL (HTML or PDF/DOCX link) and ingest its text
const { requireAdmin } = require('./lib/adminAuth.js')
const { embedText } = require('./lib/deepseek.js')
const { upsertVector } = require('./lib/pinecone.js')
const { chunkTextSentenceAware, stripHtml } = require('./lib/chunk.js')
const axios = require('axios')
const { parseStringPromise } = require('xml2js')

async function loadPdfParser() { return await import('pdf-parse/lib/pdf-parse.js') }
async function loadDocx() { return await import('mammoth') }

if (process.env.NETLIFY_DEV) { require('dotenv').config() }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } }) }
  }
  try { requireAdmin(event) } catch { return { statusCode: 401, body: JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED' } }) } }

  try {
    const { url, title: customTitle, category = 'Knowledge Base', tags: tagsRaw = '', slug } = JSON.parse(event.body || '{}')
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid url' } }) }
    }
    const tags = Array.isArray(tagsRaw) ? tagsRaw : String(tagsRaw || '').split(',').map(s => s.trim()).filter(Boolean)

    // Download
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 })
    const contentType = (res.headers['content-type'] || '').toLowerCase()
    const buf = Buffer.from(res.data)

    let title = customTitle || url
    let rawText = ''
    if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
      const pdfParse = (await loadPdfParser()).default
      const data = await pdfParse(buf)
      rawText = String(data.text || '').trim()
    } else if (contentType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') || url.toLowerCase().endsWith('.docx')) {
      const mammoth = await loadDocx()
      const result = await mammoth.extractRawText({ buffer: buf })
      rawText = String(result.value || '').trim()
    } else if (contentType.includes('text/xml') || contentType.includes('application/xml') || url.toLowerCase().endsWith('.xml')) {
      const parsed = await parseStringPromise(buf.toString('utf8'), { explicitArray: false, mergeAttrs: true, trim: true })
      let items = parsed?.rss?.channel?.item
      items = Array.isArray(items) ? items : (items ? [items] : [])
      const pieces = []
      for (const it of items) {
        const t = (it.title?._ || it.title || '').toString()
        const c = (it['content:encoded']?._ || it['content:encoded'] || '').toString()
        pieces.push(`${t}\n\n${stripHtml(c)}`)
      }
      rawText = pieces.filter(Boolean).join('\n\n-----\n\n')
      title = customTitle || (parsed?.rss?.channel?.title || url)
    } else {
      // assume HTML
      const text = buf.toString('utf8')
      // heuristically extract main content by stripping scripts and tags;
      // optionally could integrate Readability later
      const cleaned = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      rawText = stripHtml(cleaned)
      const m = cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      if (m) title = customTitle || m[1].trim()
    }

    if (!rawText || rawText.length < 10) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: { code: 'EMPTY', message: 'No readable text found' } }) }
    }

    const parentId = randomId()
    const text = `${title}\n\n${rawText}`.trim()
    const chunks = chunkTextSentenceAware(text, 1200, 3)
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
          source: 'admin-url',
          docType: 'chunk',
          postType: 'post',
          chunkIndex: idx,
          totalChunks,
          contentLength: chunk.length,
          url,
          slug: slug || undefined,
          isKB: true,
        }
      })
      upserted++
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, data: { parentId, title, upserted, totalChunks } }) }
  } catch (err) {
    const message = err?.message || 'IMPORT_URL_ERROR'
    return { statusCode: 500, body: JSON.stringify({ success: false, error: { code: 'IMPORT_URL_ERROR', message } }) }
  }
}

function randomId() { return Math.random().toString(36).slice(2) }


