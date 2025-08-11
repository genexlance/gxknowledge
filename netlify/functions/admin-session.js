const { requireAdmin } = require('./lib/adminAuth.js')

if (process.env.NETLIFY_DEV) {
  require('dotenv').config()
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } }) }
  }
  try {
    const payload = requireAdmin(event)
    return { statusCode: 200, body: JSON.stringify({ success: true, data: { role: payload.role || 'admin' } }) }
  } catch (err) {
    const status = err?.statusCode || 401
    return { statusCode: status, body: JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }) }
  }
}


