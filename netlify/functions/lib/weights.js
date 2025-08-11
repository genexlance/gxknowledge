function parseWeight(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  if (n < 0) return 0
  return n
}

function getFieldWeights() {
  // Defaults mirror prior hardcoded weights in lexical ranking
  const weights = {
    title: parseWeight(process.env.FIELD_WEIGHT_TITLE, 5),
    slug: parseWeight(process.env.FIELD_WEIGHT_SLUG, 4),
    category: parseWeight(process.env.FIELD_WEIGHT_CATEGORY, 3),
    tags: parseWeight(process.env.FIELD_WEIGHT_TAGS, 3),
    content: parseWeight(process.env.FIELD_WEIGHT_CONTENT, 1),
  }
  return weights
}

module.exports = { getFieldWeights }


