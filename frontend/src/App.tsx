import { useEffect, useMemo, useRef, useState } from 'react'

// Typing speeds
const TYPING_INTERVAL_MS = 8
const TYPING_CHARS_PER_TICK = 4
const SOURCE_REVEAL_INTERVAL_MS = 70
const VIEWER_REVEAL_INTERVAL_MS = 15
import type { KeyboardEvent } from 'react'

type Message = {
  id: string
  role: 'user' | 'ai'
  content: string
  relevance?: number
  sources?: Array<{ title: string; id: string; score?: number; url?: string; snippet?: string }>
}

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const sessionIdRef = useRef<string | null>(null)
  const typingIntervalRef = useRef<any>(null)
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null)
  const [typedText, setTypedText] = useState<string>('')
  const sourceIntervalsRef = useRef<Record<string, any>>({})
  const [sourceRevealCount, setSourceRevealCount] = useState<Record<string, number>>({})
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerTitle, setViewerTitle] = useState<string>('')
  const [viewerHtml, setViewerHtml] = useState<string>('')
  const [viewerIsTyping, setViewerIsTyping] = useState<boolean>(false)
  const [viewerPartialHtml, setViewerPartialHtml] = useState<string>('')
  const viewerTypingIntervalRef = useRef<any>(null)
  const viewerPendingHtmlRef = useRef<string | null>(null)
  const viewerBlocksRef = useRef<string[]>([])
  const viewerBlockIndexRef = useRef<number>(0)

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading])

  async function handleSend() {
    const text = input.trim()
    if (!text) return
    setInput('')
    const userMessage: Message = { id: cryptoRandomId(), role: 'user', content: text }
    setMessages(prev => [...prev, userMessage])
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, sessionId: sessionIdRef.current })
      })
      const json = await res.json()
      if (json?.success && json?.data) {
        const { answer, sources, relevance, sessionId } = json.data
        if (sessionId && !sessionIdRef.current) sessionIdRef.current = sessionId
        const aiId = cryptoRandomId()
        const aiMessage: Message = { id: aiId, role: 'ai', content: answer, relevance, sources }
        setMessages(prev => [...prev, aiMessage])
        startTyping(answer, aiId, (sources?.length || 0))
      } else {
        const aiMessage: Message = { id: cryptoRandomId(), role: 'ai', content: 'Sorry, something went wrong.' }
        setMessages(prev => [...prev, aiMessage])
      }
    } catch (e) {
      const aiMessage: Message = { id: cryptoRandomId(), role: 'ai', content: 'Network error. Please try again.' }
      setMessages(prev => [...prev, aiMessage])
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSend()
    }
  }

  function startTyping(fullText: string, messageId: string, numSources: number) {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current)
      typingIntervalRef.current = null
    }
    setTypingMessageId(messageId)
    setTypedText('')
    // reset source reveal for this message
    setSourceRevealCount(prev => ({ ...prev, [messageId]: 0 }))
    let index = 0
    typingIntervalRef.current = setInterval(() => {
      index += TYPING_CHARS_PER_TICK
      setTypedText(fullText.slice(0, index))
      if (index >= fullText.length) {
        clearInterval(typingIntervalRef.current)
        typingIntervalRef.current = null
        setTypingMessageId(null)
        // begin revealing sources gradually
        if (numSources > 0) {
          if (sourceIntervalsRef.current[messageId]) {
            clearInterval(sourceIntervalsRef.current[messageId])
          }
          sourceIntervalsRef.current[messageId] = setInterval(() => {
            setSourceRevealCount(prev => {
              const current = prev[messageId] || 0
              const next = Math.min(current + 1, numSources)
              const updated = { ...prev, [messageId]: next }
              if (next >= numSources) {
                clearInterval(sourceIntervalsRef.current[messageId])
                delete sourceIntervalsRef.current[messageId]
              }
              return updated
            })
          }, SOURCE_REVEAL_INTERVAL_MS)
        }
      }
    }, TYPING_INTERVAL_MS)
  }

  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current)
      Object.values(sourceIntervalsRef.current).forEach((intId) => clearInterval(intId as any))
      if (viewerTypingIntervalRef.current) clearInterval(viewerTypingIntervalRef.current)
    }
  }, [])

  async function openViewerFromSource(source?: { url?: string; title?: string; parentId?: string; slug?: string }) {
    if (!source) return
    const { url, title, parentId, slug } = source
    setViewerTitle(title || '')
    setViewerOpen(true)
    setViewerHtml('')
    try {
      // Prefer internal content fetch; if it fails, fallback to proxy URL if present
      const res = await fetch('/api/source', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId, slug }) })
      const json = await res.json()
      if (json?.success && json?.data?.html) {
        startViewerTyping(json.data.html)
        return
      }
    } catch (e) {
      // swallow and try proxy next
    }
    if (url) {
      try {
        const res2 = await fetch('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
        const json2 = await res2.json()
        if (json2?.success && json2?.data?.html) {
          startViewerTyping(json2.data.html)
        } else {
          setViewerHtml('<p style="padding:12px">Unable to load content. </p>')
        }
      } catch (e2) {
        setViewerHtml('<p style="padding:12px">Failed to load content. </p>')
      }
    } else {
      setViewerHtml('<p style="padding:12px">Content unavailable.</p>')
    }
  }

  function startViewerTyping(fullHtml: string) {
    if (viewerTypingIntervalRef.current) {
      clearInterval(viewerTypingIntervalRef.current)
      viewerTypingIntervalRef.current = null
    }
    viewerPendingHtmlRef.current = fullHtml
    setViewerIsTyping(true)
    setViewerPartialHtml('')
    const blocks = extractBlocksFromHtml(fullHtml)
    viewerBlocksRef.current = blocks
    viewerBlockIndexRef.current = 0
    viewerTypingIntervalRef.current = setInterval(() => {
      const idx = viewerBlockIndexRef.current
      const total = viewerBlocksRef.current.length
      if (idx >= total) {
        clearInterval(viewerTypingIntervalRef.current)
        viewerTypingIntervalRef.current = null
        setViewerIsTyping(false)
        const pending = viewerPendingHtmlRef.current || ''
        setViewerHtml(pending)
        viewerPendingHtmlRef.current = null
        return
      }
      const nextIdx = idx + 1
      viewerBlockIndexRef.current = nextIdx
      const partial = viewerBlocksRef.current.slice(0, nextIdx).join('')
      setViewerPartialHtml(`<article>${partial}</article>`)
    }, VIEWER_REVEAL_INTERVAL_MS)
  }
  function extractBlocksFromHtml(html: string): string[] {
    const safe = String(html).replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    const container = document.createElement('div')
    container.innerHTML = safe
    const article = container.querySelector('article') as HTMLElement | null
    const root = article || container
    const blocks: string[] = []
    root.childNodes.forEach((node) => {
      const el = node as any
      if (el && typeof el.outerHTML === 'string') {
        blocks.push(el.outerHTML)
      } else if (node.textContent) {
        const txt = String(node.textContent).trim()
        if (txt) blocks.push(`<span>${escapeHtmlInline(txt)}</span>`)
      }
    })
    return blocks
  }
  function escapeHtmlInline(text: string): string {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function closeViewer() {
    setViewerOpen(false)
    setViewerTitle('')
    setViewerHtml('')
    setViewerIsTyping(false)
    setViewerPartialHtml('')
    viewerPendingHtmlRef.current = null
    if (viewerTypingIntervalRef.current) {
      clearInterval(viewerTypingIntervalRef.current)
      viewerTypingIntervalRef.current = null
    }
  }

  return (
    <>
    <div className="chat-container">
      <div className="chat-header">
        <img src="/logo.svg" className="chat-logo" alt="Genex logo" />
        <div>
          <div className="h2"><strong>GENEX</strong>marketing</div>
          <div className="body-regular" style={{ color: 'var(--text-secondary)' }}>KNOWLEDGE BASE</div>
        </div>
      </div>

      <div className="messages">
        {messages.map(m => (
          <div key={m.id} className={m.role === 'user' ? 'user-message' : 'ai-response'}>
            {m.role === 'ai' ? (
              <AiContent
                text={m.id === typingMessageId ? typedText : m.content}
                showCaret={m.id === typingMessageId}
                onOpenUrl={(url) => openViewerFromSource({ url })}
              />
            ) : (
              <div className="body-regular" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
            )}
            {m.role === 'ai' && m.sources && m.sources.length > 0 && (() => {
              const revealCount = m.id === typingMessageId ? (sourceRevealCount[m.id] || 0) : (m.sources?.length || 0)
              if (revealCount <= 0) return null
              const isTypingSources = (revealCount < (m.sources?.length || 0))
              return (
              <div className="meta">
                <div style={{ marginTop: 6 }}><strong>Sources</strong>{isTypingSources && <span className="typing-caret" />}:</div>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {m.sources.slice(0, revealCount).map((s) => (
                    <li key={s.id}>
                      <a href={s.url || '#'} onClick={(e) => { e.preventDefault(); openViewerFromSource({ url: s.url, title: s.title, parentId: (s as any).parentId, slug: (s as any).slug }) }}>
                        {s.title}
                      </a>
                      {typeof s.score === 'number' && (
                        <span> — relevance {(s.score * 100).toFixed(0)}%</span>
                      )}
                      {s.snippet && (
                        <div style={{ color: 'var(--text-secondary)' }}>{s.snippet}{s.snippet.length === 160 ? '…' : ''}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              )
            })()}
          </div>
        ))}
        {messages.length === 0 && (
          <div className="ai-response">
            <div className="body-regular">🙋‍♂️ Hi! What would you like to know?</div>
          </div>
        )}
      </div>

      <div className="input-row">
        <input
          className="chat-input"
          placeholder={loading ? 'Retrieving Data' : 'Type your query...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={loading}
        />
        <button className="send-button" onClick={handleSend} disabled={!canSend}>{loading ? '...' : 'SUBMIT'}</button>
      </div>
    </div>
    {viewerOpen && (
      <div className="modal-overlay" onClick={closeViewer}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" aria-label="Close" onClick={closeViewer}>×</button>
          <div className="modal-header">
            <div className="modal-title">{viewerTitle}</div>
            <div className="modal-actions">
            
            </div>
          </div>
          <div className="modal-body">
            {viewerIsTyping ? (
              <div className="modal-html" dangerouslySetInnerHTML={{ __html: viewerPartialHtml }} />
            ) : viewerHtml ? (
              <div className="modal-html" dangerouslySetInnerHTML={{ __html: viewerHtml }} />
            ) : (
              <div style={{ padding: 12, color: 'var(--text-secondary)' }}>Retrieving Data…</div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

export default App

function AiContent({ text, showCaret, onOpenUrl }: { text: string; showCaret: boolean; onOpenUrl: (url: string) => void }) {
  // Bold the first line as a heading
  const [firstLine, ...rest] = text.split(/\n/)
  const remaining = rest.join('\n')
  return (
    <div className="body-regular" style={{ whiteSpace: 'pre-wrap' }}>
      <div className="title">
        <strong><LinkifiedText text={firstLine} onOpenUrl={onOpenUrl} /></strong>
        {showCaret && <span className="typing-caret" />}
      </div>
      {remaining && (
        <div>
          <LinkifiedText text={remaining} onOpenUrl={onOpenUrl} />
        </div>
      )}
    </div>
  )
}

function LinkifiedText({ text, onOpenUrl }: { text: string; onOpenUrl: (url: string) => void }) {
  const urlRegex = /(https?:\/\/[^\s)]+)(?![^<]*?>)/g
  const parts: Array<string | { url: string }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push({ url: match[1] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return (
    <>
      {parts.map((part, idx) =>
        typeof part === 'string' ? (
          <span key={idx}>{part}</span>
        ) : (
          <a
            key={idx}
            href={part.url}
            onClick={(e) => {
              e.preventDefault()
              onOpenUrl(part.url)
            }}
          >
            {part.url}
          </a>
        )
      )}
    </>
  )
}
