import { useEffect, useState } from 'react'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/admin-session', { method: 'POST' })
        const json = await res.json()
        setAuthed(Boolean(json?.success))
      } catch {
        setAuthed(false)
      }
    }
    check()
  }, [])

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      const json = await res.json()
      if (!json?.success) {
        setError(json?.error?.message || 'Login failed')
        setAuthed(false)
        return
      }
      setAuthed(true)
      setPassword('')
    } catch (err: any) {
      setError(err?.message || 'Login failed')
      setAuthed(false)
    }
  }

  if (authed) return <>{children}</>

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
      <form onSubmit={submit} style={{ width: 320, background: 'var(--panel)', padding: 16, borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Admin Login</div>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 8 }}
        />
        {error && <div style={{ color: '#d33', marginBottom: 8 }}>{error}</div>}
        <button type="submit" style={{ width: '100%', padding: '10px 12px', borderRadius: 6, background: 'var(--lime-bright)', color: 'black' }}>Sign in</button>
      </form>
    </div>
  )
}


