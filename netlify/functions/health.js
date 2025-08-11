const { embedText } = require('./lib/deepseek.js')
const { queryVector } = require('./lib/pinecone.js')
if (process.env.NETLIFY_DEV) {
  require('dotenv').config()
}

exports.handler = async () => {
  const env = {
    hasDeepseekKey: Boolean(process.env.DEEPSEEK_API_KEY),
    deepseekBase: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    deepseekModel: process.env.DEEPSEEK_EMBED_MODEL || 'deepseek-embedding-v1',
    hasPineconeKey: Boolean(process.env.PINECONE_API_KEY),
    pineconeIndex: process.env.PINECONE_INDEX_NAME || null,
  }

  const result = { env, deepseek: {}, pinecone: {} }
  try {
    const v = await embedText('health-check')
    result.deepseek = { ok: true, dimension: Array.isArray(v) ? v.length : null }
    // Try a lightweight Pinecone query with the same dimension
    try {
      const q = await queryVector({ values: v, topK: 1 })
      result.pinecone = { ok: true, matches: q?.length ?? 0 }
    } catch (e) {
      result.pinecone = { ok: false, error: serializeError(e) }
    }
  } catch (e) {
    result.deepseek = { ok: false, error: serializeError(e) }
  }

  return { statusCode: 200, body: JSON.stringify({ success: true, data: result }) }
}

function serializeError(err) {
  if (!err) return {}
  const out = { message: err.message, stack: err.stack }
  const anyErr = err
  if (anyErr.response) {
    out.response = {
      status: anyErr.response.status,
      statusText: anyErr.response.statusText,
      data: anyErr.response.data,
      headers: anyErr.response.headers,
    }
  }
  if (anyErr.request) {
    out.request = { method: anyErr.request?.method, path: anyErr.request?.path, host: anyErr.request?.host }
  }
  return out
}


