const fs = require('fs')
const path = require('path')
const { parseStringPromise } = require('xml2js')

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

    const xmlPath = path.resolve(process.cwd(), 'originalDATA.xml')
    if (!fs.existsSync(xmlPath)) {
      return { statusCode: 404, body: JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'originalDATA.xml not found' } }) }
    }
    const xml = fs.readFileSync(xmlPath, 'utf-8')
    const parsed = await parseStringPromise(xml, { explicitArray: false, mergeAttrs: true, trim: true })

    let items = parsed?.rss?.channel?.item
    if (!items) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: { code: 'BAD_XML', message: 'No items found in rss.channel.item' } }) }
    }
    items = Array.isArray(items) ? items : [items]

    const match = items.find((it) => {
      const id = (it['wp:post_id'] || it.guid?._ || it.guid || '').toString()
      const name = (it['wp:post_name']?._ || it['wp:post_name'] || '').toString()
      return (parentId && id === String(parentId)) || (slug && name === String(slug))
    })
    if (!match) {
      return { statusCode: 404, body: JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } }) }
    }

    const title = (match.title?._ || match.title || '').toString()
    let html = (match['content:encoded']?._ || match['content:encoded'] || '').toString()
    // safety: strip scripts
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')

    const articleHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><article>${html}</article></body></html>`

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, data: { title, html: articleHtml } })
    }
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


