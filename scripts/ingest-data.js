#!/usr/bin/env node
/**
 * XML ingestion helper invoking Netlify function `/api/ingest` in batches.
 */
const fs = require('node:fs')
const path = require('node:path')
const { parseStringPromise } = require('xml2js')
const axios = require('axios')

const xmlPath = path.resolve(process.cwd(), 'originalDATA.xml')
if (!fs.existsSync(xmlPath)) {
  console.error('originalDATA.xml not found at', xmlPath)
  process.exit(1)
}

;(async () => {
  const xml = fs.readFileSync(xmlPath, 'utf-8')
  const parsed = await parseStringPromise(xml, { explicitArray: false, mergeAttrs: true, trim: true })
  const entries = parsed?.knowledge_base?.entry
  const items = Array.isArray(entries) ? entries : [entries]
  console.log('Found entries:', items.length)

  async function call(fn, payload) {
    const url = 'http://localhost:8888/.netlify/functions/' + fn
    const { data } = await axios.post(url, payload)
    return data
  }

  const batchSize = 25
  let total = items.length
  let offset = 0
  while (offset < total) {
    try {
      const res = await call('ingest', { limit: batchSize, offset })
      total = res?.data?.total || total
      console.log('Upserted batch', offset, res?.data?.upserted)
      offset += batchSize
      await new Promise(r => setTimeout(r, 250))
    } catch (err) {
      console.error('Batch failed, stepping down', { offset, err: err?.response?.data || err?.message })
      let small = 10
      let recovered = false
      while (small >= 1) {
        try {
          const r2 = await call('ingest', { limit: small, offset })
          console.log('Recovered with', small, r2?.data?.upserted)
          offset += small
          recovered = true
          await new Promise(r => setTimeout(r, 250))
          break
        } catch (e2) {
          small = Math.floor(small / 2)
        }
      }
      if (!recovered) {
        console.error('Could not recover at offset', offset, 'skipping one and continuing')
        offset += 1
      }
    }
  }
})().catch((err) => {
  console.error('Ingestion failed:', err?.response?.data || err)
  process.exit(1)
})


