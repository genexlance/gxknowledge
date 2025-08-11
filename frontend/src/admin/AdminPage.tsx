import { useState } from 'react'

export default function AdminPage() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [slug, setSlug] = useState('')
  const [category, setCategory] = useState('Knowledge Base')
  const [tags, setTags] = useState('')
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<string>('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setStatus('')
    try {
      const payload = {
        title,
        content,
        slug: slug || undefined,
        category: category || undefined,
        tags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : [],
        url: url || undefined,
      }
      const res = await fetch('/api/admin-upsert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json()
      if (!json?.success) throw new Error(json?.error?.message || 'Upsert failed')
      setStatus(`Saved parentId ${json.data.parentId} with ${json.data.upserted} chunks`)
      setTitle(''); setContent(''); setSlug(''); setTags(''); setUrl('')
    } catch (err: any) {
      setStatus(`Error: ${err?.message || 'Failed'}`)
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await fetch('/api/admin-logout', { method: 'POST' })
    window.location.reload()
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Admin Dashboard</div>
        <button onClick={logout} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)' }}>Logout</button>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 8 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)' }} />
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Content" rows={10} style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="Slug (optional)" style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)' }} />
          <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category" style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="Tags (comma-separated)" style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)' }} />
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Canonical URL (optional)" style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)' }} />
        </div>
        <button type="submit" disabled={loading} style={{ padding: '10px 12px', borderRadius: 6, background: 'black', color: 'white' }}>{loading ? 'Saving…' : 'Save to KB'}</button>
      </form>
      {status && <div style={{ marginTop: 10 }}>{status}</div>}
    </div>
  )
}


