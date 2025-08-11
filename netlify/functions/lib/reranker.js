// Pluggable reranker interface.
// If RERANKER_PROVIDER is set in env, this module can call out to an external API.
// For now, default to a no-op that preserves order.

async function rerank({ query, candidates }) {
  // candidates: Array<{ id, score, metadata, values? }>
  // Return same shape, reordered with updated score if needed
  const provider = process.env.RERANKER_PROVIDER
  if (!provider) {
    return candidates
  }
  // Placeholder: extend with providers like 'cohere', 'bge', etc.
  switch (provider) {
    default:
      return candidates
  }
}

module.exports = { rerank }


