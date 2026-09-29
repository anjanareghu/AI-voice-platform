import { useEffect, useRef, useState } from 'react'

import { sendChat } from '../../services/api.js'

const suggestions = [
  'Explain a complex idea simply',
  'Help me brainstorm a project',
  'Draft a thoughtful message',
]

export default function ChatPanel() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const failedMessage = useRef('')
  const busy = useRef(false)
  const nextId = useRef(0)
  const bottom = useRef(null)
  const composer = useRef(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, pending, error])

  async function submit(text, retry = false) {
    const message = text.trim()
    if (!message || busy.current) return

    busy.current = true
    setPending(true)
    setError('')
    failedMessage.current = ''
    if (!retry) {
      setMessages((current) => [...current, { id: ++nextId.current, role: 'user', content: message }])
      setInput('')
    }

    try {
      const answer = await sendChat(message)
      if (typeof answer?.message !== 'string' || !answer.message.trim()) throw new Error('Invalid answer')
      setMessages((current) => [...current, { id: ++nextId.current, role: 'assistant', content: answer.message }])
    } catch (requestError) {
      failedMessage.current = message
      setError(requestError?.message || 'The response could not be loaded. Please try again.')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit(input)
    }
  }

  function chooseSuggestion(suggestion) {
    setInput(suggestion)
    composer.current?.focus()
  }

  return (
    <section className="feature-panel chat-panel" aria-label="Chat workspace">
      <div className="panel-topline">
        <div><span className="panel-kicker">CONVERSATION</span><h2>Chat</h2></div>
        <span className="panel-meta">Text · AI assistant</span>
      </div>

      <div className="chat-scroll" role="log" aria-label="Conversation" aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="empty-emblem" aria-hidden="true">✦</div>
            <h3>What’s on your mind?</h3>
            <p>Start with a question or a rough idea. Your conversation stays in this browser session.</p>
            <div className="suggestions">
              {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => chooseSuggestion(suggestion)}>{suggestion}<span aria-hidden="true">↗</span></button>)}
            </div>
          </div>
        )}
        {messages.map((message) => (
          <div className={`message-row ${message.role}`} key={message.id}>
            <span className="message-avatar" aria-hidden="true">{message.role === 'user' ? 'Y' : '✦'}</span>
            <div className="message-body"><span className="message-author">{message.role === 'user' ? 'You' : 'Assistant'}</span><p>{message.content}</p></div>
          </div>
        ))}
        {pending && <div className="message-row assistant"><span className="message-avatar" aria-hidden="true">✦</span><div className="message-body"><span className="message-author">Assistant</span><div className="thinking" role="status">Thinking<span className="thinking-dots" aria-hidden="true">...</span></div></div></div>}
        {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => void submit(failedMessage.current, true)} disabled={pending}>Retry</button></div>}
        <div ref={bottom} />
      </div>

      <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void submit(input) }}>
        <label htmlFor="chat-message" className="sr-only">Your message</label>
        <textarea id="chat-message" ref={composer} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} placeholder="Ask anything…" rows={2} maxLength={4000} disabled={pending} />
        <div className="composer-footer"><span>Enter to send · Shift + Enter for a new line</span><button className="primary-button" type="submit" disabled={pending || !input.trim()}>Send <span aria-hidden="true">↗</span></button></div>
      </form>
    </section>
  )
}
