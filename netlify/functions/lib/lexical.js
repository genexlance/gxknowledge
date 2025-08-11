const fs = require('fs')
const path = require('path')
const { parseStringPromise } = require('xml2js')

let cached = {
  loadedAt: 0,
  docs: [],
  df: new Map(),
  N: 0,
}

function stripHtml(html = '') {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function tokenize(text) {
  if (!text) return []
  const lower = String(text).toLowerCase()
  const parts = lower.replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean)
  const stop = new Set(['the','a','an','and','or','of','to','in','on','for','with','by','at','from','is','are','was','were','be'])
  const filtered = parts.filter(t => t.length >= 2 && !stop.has(t))
  const unique = []
  const seen = new Set()
  for (const t of filtered) { if (!seen.has(t)) { seen.add(t); unique.push(t) } }
  return unique
}

async function loadCorpus() {
  if (cached.docs.length > 0 && (Date.now() - cached.loadedAt) < 5 * 60 * 1000) {
    return cached
  }
  const xmlPath = path.resolve(process.cwd(), 'originalDATA.xml')
  if (!fs.existsSync(xmlPath)) {
    cached = { loadedAt: Date.now(), docs: [], df: new Map(), N: 0 }
    return cached
  }
  const xml = fs.readFileSync(xmlPath, 'utf-8')
  const parsed = await parseStringPromise(xml, { explicitArray: false, mergeAttrs: true, trim: true })
  let items = parsed?.rss?.channel?.item
  items = Array.isArray(items) ? items : (items ? [items] : [])
  const docs = []
  for (const it of items) {
    const id = String(it['wp:post_id'] || it.guid?._ || it.guid || '')
    const title = (it.title?._ || it.title || '').toString()
    const contentHtml = (it['content:encoded']?._ || it['content:encoded'] || '').toString()
    const content = stripHtml(contentHtml)
    const postType = (it['wp:post_type']?._ || it['wp:post_type'] || '').toString()
    const status = (it['wp:status']?._ || it['wp:status'] || '').toString()
    const slug = (it['wp:post_name']?._ || it['wp:post_name'] || '').toString()
    // categories/tags
    let categories = []
    let categorySlugs = []
    let tags = []
    let tagSlugs = []
    const cats = it.category
    if (cats) {
      const arr = Array.isArray(cats) ? cats : [cats]
      for (const c of arr) {
        const domain = c?.domain || c?.$?.domain
        const value = (c?._ || c || '').toString()
        const nicename = (c?.nicename || c?.$?.nicename || '').toString().toLowerCase()
        if (domain === 'category') { categories.push(value); if (nicename) categorySlugs.push(nicename) }
        else if (domain === 'post_tag') { tags.push(value); if (nicename) tagSlugs.push(nicename) }
      }
    }
    const category = categories[0] || ''
    const isKB = categorySlugs.includes('kb') || tagSlugs.includes('kb') || category.toLowerCase() === 'knowledge base'
    const skipTypes = new Set(['attachment','revision','nav_menu_item','shop_order','shop_order_refund','shop_coupon','product','product_variation'])
    if (skipTypes.has(postType) || status === 'trash' || status === 'draft' || status === 'auto-draft') continue
    if (!isKB) continue
    if ((title + content).trim().length < 50) continue
    docs.push({ id, title, content, slug, category, categories, categorySlugs, tags, tagSlugs })
  }
  // compute doc frequencies
  const df = new Map()
  for (const d of docs) {
    const fieldText = [d.title, d.slug, d.categorySlugs.join(' '), d.tagSlugs.join(' '), d.tags.join(' '), d.content].join(' ')
    const toks = new Set(tokenize(fieldText))
    for (const t of toks) df.set(t, (df.get(t) || 0) + 1)
  }
  cached = { loadedAt: Date.now(), docs, df, N: docs.length }
  return cached
}

function idf(term, N, df) {
  const n = df.get(term) || 0
  return Math.log(1 + (N - n + 0.5) / (n + 0.5))
}

async function searchLexical(query, limit = 50) {
  const { docs, df, N } = await loadCorpus()
  if (docs.length === 0) return []
  const terms = tokenize(query)
  const phrase = String(query).toLowerCase().trim()
  const scores = []
  for (const d of docs) {
    let score = 0
    const titleLower = d.title.toLowerCase()
    const slugLower = d.slug.toLowerCase()
    const catsLower = d.categorySlugs.join(' ').toLowerCase()
    const tagsLower = d.tagSlugs.join(' ').toLowerCase()
    const contentLower = d.content.toLowerCase()
    for (const t of terms) {
      const wTitle = titleLower.includes(t) ? 5 : 0
      const wSlug = slugLower.includes(t) ? 4 : 0
      const wCats = catsLower.includes(t) ? 3 : 0
      const wTags = tagsLower.includes(t) ? 3 : 0
      const wContent = contentLower.includes(t) ? 1 : 0
      const weight = wTitle + wSlug + wCats + wTags + wContent
      if (weight > 0) {
        score += weight * idf(t, N, df)
      }
    }
    if (phrase.length >= 3) {
      if (titleLower.includes(phrase)) score += 10
      else if (slugLower.includes(phrase)) score += 8
      else if (contentLower.includes(phrase)) score += 3
    }
    if (score > 0) {
      scores.push({ parentId: d.id, slug: d.slug, title: d.title, score })
    }
  }
  scores.sort((a,b)=> b.score - a.score)
  return scores.slice(0, limit)
}

module.exports = { searchLexical }


