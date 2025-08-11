function stripHtml(html = '') {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function chunkText(text, maxLen, overlap) {
  const chunks = []
  if (!text) return chunks
  const len = text.length
  const step = Math.max(1, maxLen - overlap)
  for (let start = 0; start < len; start += step) {
    const end = Math.min(len, start + maxLen)
    const slice = text.slice(start, end)
    if (slice.trim().length > 0) chunks.push(slice)
    if (end >= len) break
  }
  return chunks
}

function splitIntoSentences(text) {
  const normalized = String(text).replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  const abbrev = '(?:(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\\.g|i\\.e)\.)'
  const regex = new RegExp(`(?!${abbrev})[.!?]+\\s+`, 'g')
  const parts = normalized.split(regex)
  const sentences = []
  let idx = 0
  for (const part of parts) {
    const start = normalized.indexOf(part, idx)
    if (start === -1) continue
    const end = start + part.length
    const nextChar = normalized[end] || ''
    let punct = ''
    if (/[.!?]/.test(nextChar)) { punct = nextChar; idx = end + 1 } else { idx = end }
    sentences.push((part + punct).trim())
  }
  return sentences.filter(Boolean)
}

function chunkTextSentenceAware(text, maxChars, overlapSentences) {
  if (!text) return []
  const sentences = splitIntoSentences(text)
  const chunks = []
  let current = ''
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i]
    if ((current + ' ' + s).trim().length <= maxChars) {
      current = (current ? current + ' ' : '') + s
    } else {
      if (current.trim()) chunks.push(current.trim())
      const back = Math.max(0, i - overlapSentences)
      const overlap = sentences.slice(back, i).join(' ')
      current = overlap ? (overlap + ' ' + s) : s
      if (current.length > maxChars) {
        const hard = chunkText(current, maxChars, Math.floor(maxChars * 0.15))
        chunks.push(...hard)
        current = ''
      }
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

module.exports = { stripHtml, chunkTextSentenceAware }


