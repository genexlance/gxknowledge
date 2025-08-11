const { Pinecone } = require('@pinecone-database/pinecone')

function getIndex() {
  const apiKey = process.env.PINECONE_API_KEY
  const indexName = process.env.PINECONE_INDEX_NAME
  if (!apiKey) throw new Error('PINECONE_API_KEY is not set')
  if (!indexName) throw new Error('PINECONE_INDEX_NAME is not set')

  const pinecone = new Pinecone({ apiKey })
  const index = pinecone.index(indexName)
  return index
}

async function upsertVector({ id, values, metadata }) {
  const index = getIndex()
  await index.upsert([{ id, values, metadata }])
}

async function queryVector({ values, topK = 5, filter }) {
  const index = getIndex()
  const res = await index.query({ topK, vector: values, includeMetadata: true, includeValues: true, filter })
  const matches = res.matches || []
  return matches.map(m => ({ id: m.id, values: m.values, metadata: m.metadata, score: m.score }))
}

module.exports = { upsertVector, queryVector }


