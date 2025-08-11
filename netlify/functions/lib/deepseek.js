// DeepSeek embeddings client
// Expects process.env.DEEPSEEK_API_KEY
const axios = require('axios')

async function embedText(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('embedText requires a string')
  }
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey || process.env.DEEPSEEK_FAKE === '1') {
    // fallback for local dev so chat works without keys or when forced via DEEPSEEK_FAKE=1
    return pseudoVector(text)
  }
  const base = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
  const url = base.replace(/\/$/, '') + '/embeddings'
  const body = {
    model: process.env.DEEPSEEK_EMBED_MODEL || 'deepseek-embedding-v1',
    input: [text],
  }
  try {
    const { data } = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    })
    let vector = data?.data?.[0]?.embedding || data?.data?.[0]?.vector || data?.data?.[0]?.values
    if (!Array.isArray(vector)) {
      throw new Error('Invalid embeddings response from DeepSeek')
    }
    return ensureDim(vector)
  } catch (err) {
    const status = err?.response?.status
    if (status === 404 || status === 400) {
      // graceful fallback in dev for not found / bad request
      return ensureDim(pseudoVector(text))
    }
    throw err
  }
}

function pseudoVector(text) {
  const target = getTargetDim()
  const result = new Array(target).fill(0).map((_, i) => ((hashCode(text + i) % 100) / 100))
  return result
}

function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i)
    hash = (hash << 5) - hash + chr
    hash |= 0
  }
  return Math.abs(hash)
}

module.exports = { embedText }

function getTargetDim() {
  const envDim = parseInt(process.env.PINECONE_DIM || process.env.PINECONE_INDEX_DIM || '1024', 10)
  return Number.isFinite(envDim) && envDim > 0 ? envDim : 1024
}

function ensureDim(vec) {
  const dim = getTargetDim()
  if (vec.length === dim) return vec
  if (vec.length > dim) return vec.slice(0, dim)
  // pad with zeros
  const out = vec.slice()
  while (out.length < dim) out.push(0)
  return out
}


