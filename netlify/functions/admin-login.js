const { getAdminPassword, signToken, buildSessionCookie } = require('./lib/adminAuth.js')

if (process.env.NETLIFY_DEV) {
  require('dotenv').config()
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } }) }
  }
  try {
    const { password = '' } = JSON.parse(event.body || '{}')
    const expected = getAdminPassword()
    if (!password || String(password) !== String(expected)) {
      return { statusCode: 401, body: JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid password' } }) }
    }
    const token = signToken({ role: 'admin' })
    const cookie = buildSessionCookie(token)
    return {
      statusCode: 200,
      headers: { 'Set-Cookie': cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, data: { token } })
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ success: false, error: { code: 'LOGIN_ERROR', message: err.message } }) }
  }
}


