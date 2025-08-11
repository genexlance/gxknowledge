const crypto = require('crypto')

function getAdminPassword() {
  const pw = process.env.ADMIN_PASSWORD
  if (!pw) throw new Error('ADMIN_PASSWORD is not set')
  return String(pw)
}

function getHmacSecret() {
  // Derive a key from ADMIN_PASSWORD; if ADMIN_SECRET is set, prefer that
  const secret = process.env.ADMIN_SECRET || getAdminPassword()
  return crypto.createHash('sha256').update(String(secret)).digest()
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function signToken(payload, expiresInSeconds = 60 * 60 * 12) {
  const now = Math.floor(Date.now() / 1000)
  const body = { ...payload, iat: now, exp: now + expiresInSeconds }
  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(body))
  const data = `${encodedHeader}.${encodedPayload}`
  const sig = crypto.createHmac('sha256', getHmacSecret()).update(data).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${data}.${sig}`
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, signature] = parts
  const data = `${header}.${payload}`
  const expected = crypto.createHmac('sha256', getHmacSecret()).update(data).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  if (signature !== expected) return null
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
    const now = Math.floor(Date.now() / 1000)
    if (typeof json.exp === 'number' && now > json.exp) return null
    return json
  } catch {
    return null
  }
}

function parseCookies(headerValue = '') {
  const out = {}
  if (!headerValue) return out
  const parts = headerValue.split(/;\s*/)
  for (const p of parts) {
    const idx = p.indexOf('=')
    if (idx === -1) continue
    const k = p.slice(0, idx).trim()
    const v = p.slice(idx + 1).trim()
    if (k) out[k] = decodeURIComponent(v)
  }
  return out
}

function requireAdmin(event) {
  const headers = event.headers || {}
  const auth = headers['authorization'] || headers['Authorization']
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length)
    const ok = verifyToken(token)
    if (ok) return ok
  }
  const cookieHeader = headers['cookie'] || headers['Cookie']
  const cookies = parseCookies(cookieHeader)
  const token = cookies['admin_session']
  const payload = verifyToken(token)
  if (!payload) {
    const err = new Error('UNAUTHORIZED')
    err.statusCode = 401
    throw err
  }
  return payload
}

function buildSessionCookie(token, maxAgeSeconds = 60 * 60 * 12) {
  const secure = process.env.NETLIFY_DEV ? false : true
  const attrs = [
    `admin_session=${encodeURIComponent(token)}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAgeSeconds}`,
  ]
  if (secure) attrs.push('Secure')
  return attrs.join('; ')
}

module.exports = { getAdminPassword, signToken, verifyToken, requireAdmin, buildSessionCookie }


