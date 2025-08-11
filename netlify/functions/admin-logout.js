exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } }) }
  }
  const secure = process.env.NETLIFY_DEV ? false : true
  const cookie = [
    'admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    secure ? 'Secure' : null,
  ].filter(Boolean).join('; ')
  return {
    statusCode: 200,
    headers: { 'Set-Cookie': cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true })
  }
}


