const axios = require('axios')

if (process.env.NETLIFY_DEV) {
  require('dotenv').config()
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } }) }
  }
  try {
    const { url } = JSON.parse(event.body || '{}')
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid url' } }) }
    }

    const allowed = (process.env.ALLOWED_PROXY_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean)
    if (allowed.length > 0) {
      const host = new URL(url).hostname
      if (!allowed.some(a => host === a || host.endsWith('.' + a))) {
        return { statusCode: 403, body: JSON.stringify({ success: false, error: { code: 'FORBIDDEN', message: 'Host not allowed' } }) }
      }
    }

    const res = await axios.get(url, {
      responseType: 'text',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (KnowledgeGarden)'
      }
    })

    let html = typeof res.data === 'string' ? res.data : ''
    // Strip script tags for safety in client render
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')

    // Inject a <base> tag so relative URLs resolve correctly in the modal
    try {
      const baseTag = `<base href="${url}">`
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (match) => `${match}\n${baseTag}`)
      } else if (/<html[^>]*>/i.test(html)) {
        html = html.replace(/<html[^>]*>/i, (match) => `${match}\n<head>${baseTag}</head>`)
      } else {
        html = `<head>${baseTag}</head>` + html
      }
    } catch (_) {}

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, data: { url, html } })
    }
  } catch (err) {
    const message = err?.message || 'Proxy error'
    return { statusCode: 500, body: JSON.stringify({ success: false, error: { code: 'PROXY_ERROR', message } }) }
  }
}


