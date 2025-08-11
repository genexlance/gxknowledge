// Accept XML/PDF/DOCX via multipart/form-data and ingest to Pinecone
// Fields: file (single), category?, tags?, url?, slug?, title? (title optional; derived when possible)
const { requireAdmin } = require('./lib/adminAuth.js')
const { embedText } = require('./lib/deepseek.js')
const { upsertVector } = require('./lib/pinecone.js')
const { chunkTextSentenceAware, stripHtml } = require('./lib/chunk.js')
const Busboy = require('busboy')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { parseStringPromise } = require('xml2js')

// Lazy require heavy libs only if used
async function loadPdfParser() { return await import('pdf-parse/lib/pdf-parse.js') }
async function loadDocx() { return await import('mammoth') }

if (process.env.NETLIFY_DEV) {
  require('dotenv').config()
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } }) }
  }
  try {
    requireAdmin(event)
  } catch (err) {
    return { statusCode: 401, body: JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }) }
  }

  try {
    const contentType = event.headers['content-type'] || event.headers['Content-Type']
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: { code: 'BAD_REQUEST', message: 'Expect multipart/form-data' } }) }
    }

    const fields = {}
    const tmpFiles = []
    const fileWrites = []
    const busboy = Busboy({ headers: { 'content-type': contentType } })
    const parsePromise = new Promise((resolve, reject) => {
      busboy.on('file', (name, file, info) => {
        const { filename } = info
        const saveTo = path.join(os.tmpdir(), `${Date.now()}-${Math.random().toString(36).slice(2)}-${filename}`)
        const writeStream = fs.createWriteStream(saveTo)
        const writeFinished = new Promise((res, rej) => {
          writeStream.on('finish', res)
          writeStream.on('close', res)
          writeStream.on('error', rej)
        })
        file.pipe(writeStream)
        tmpFiles.push({ path: saveTo, filename })
        fileWrites.push(writeFinished)
      })
      busboy.on('field', (name, val) => { fields[name] = val })
      busboy.on('error', reject)
      busboy.on('finish', async () => {
        try {
          await Promise.all(fileWrites)
          resolve()
        } catch (e) { reject(e) }
      })
      busboy.end(Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8'))
    })

    await parsePromise
    if (tmpFiles.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing file' } }) }
    }

    const file = tmpFiles[0]
    const ext = path.extname(file.filename).toLowerCase()
    let title = fields.title || path.basename(file.filename, ext)
    let category = fields.category || 'Knowledge Base'
    let tags = fields.tags ? String(fields.tags).split(',').map(s => s.trim()).filter(Boolean) : []
    let url = fields.url || ''
    let slug = fields.slug || ''
    const parentId = String(fields.parentId || randomId())

    let rawText = ''
    if (ext === '.xml') {
      const xml = fs.readFileSync(file.path, 'utf-8')
      const parsed = await parseStringPromise(xml, { explicitArray: false, mergeAttrs: true, trim: true })
      // ingest all items as a single document text
      let items = parsed?.rss?.channel?.item
      items = Array.isArray(items) ? items : (items ? [items] : [])
      const pieces = []
      for (const it of items) {
        const t = (it.title?._ || it.title || '').toString()
        const c = (it['content:encoded']?._ || it['content:encoded'] || '').toString()
        pieces.push(`${t}\n\n${stripHtml(c)}`)
      }
      rawText = pieces.filter(Boolean).join('\n\n-----\n\n')
    } else if (ext === '.pdf') {
      const pdfParse = (await loadPdfParser()).default
      const data = await pdfParse(fs.readFileSync(file.path))
      rawText = String(data.text || '').trim()
    } else if (ext === '.docx') {
      const mammoth = await loadDocx()
      const result = await mammoth.extractRawText({ buffer: fs.readFileSync(file.path) })
      rawText = String(result.value || '').trim()
    } else {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: { code: 'UNSUPPORTED', message: 'Only XML, PDF, DOCX' } }) }
    }

    if (!rawText || rawText.length < 10) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: { code: 'EMPTY', message: 'No readable text found' } }) }
    }

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
          source: `admin-upload:${ext.slice(1)}`,
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

    // cleanup
    try { for (const f of tmpFiles) fs.unlinkSync(f.path) } catch {}

    return { statusCode: 200, body: JSON.stringify({ success: true, data: { parentId, upserted, totalChunks } }) }
  } catch (err) {
    const message = err?.message || 'UPLOAD_ERROR'
    return { statusCode: 500, body: JSON.stringify({ success: false, error: { code: 'UPLOAD_ERROR', message } }) }
  }
}

function randomId() { return Math.random().toString(36).slice(2) }


