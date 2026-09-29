import { lazy, Suspense, useState } from 'react'

import ChatPanel from './features/chat/ChatPanel.jsx'
import ImagePanel from './features/image/ImagePanel.jsx'

const VoicePanel = lazy(() => import('./features/voice/VoicePanel.jsx'))

const sections = [
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'image', label: 'Generate', icon: 'image' },
  { id: 'voice', label: 'Voice', icon: 'voice' },
]

const pageCopy = {
  image: {
    eyebrow: 'IMAGE STUDIO',
    title: 'Imagine it. Then see it.',
    subtitle: 'Give your idea a shape, a setting, and a little atmosphere.',
  },
  voice: {
    eyebrow: 'VOICE STUDIO',
    title: 'Let’s talk it through.',
    subtitle: 'A natural conversation, one idea at a time.',
  },
}

function SectionIcon({ name }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  if (name === 'chat') return <svg {...common}><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z" /><path d="M7.5 10h9M7.5 13.5H14" /></svg>
  if (name === 'image') return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="8" cy="9" r="1.5" /><path d="m4 17 5-5 3 3 3-3 5 5" /></svg>
  return <svg {...common}><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21m-4 0h8" /></svg>
}

export default function App() {
  const [active, setActive] = useState('chat')
  const copy = pageCopy[active]

  return (
    <div className="app-shell">
      <div className="app-frame">
      <header className="topbar">
        <div className="brand" aria-label="AI Workspace">
          <span className="brand-mark" aria-hidden="true">✳</span>
          <span className="brand-name">aura<span className="brand-period">.</span></span>
        </div>
        <nav className="section-nav" aria-label="Workspaces">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`nav-item ${active === section.id ? 'active' : ''}`}
              onClick={() => setActive(section.id)}
              aria-current={active === section.id ? 'page' : undefined}
            >
              <span className="nav-icon"><SectionIcon name={section.icon} /></span>
              <span className="nav-copy"><strong>{section.label}</strong></span>
            </button>
          ))}
        </nav>

        <div className="topbar-status"><span className="status-spark" aria-hidden="true">✦</span><span>Made for curiosity</span></div>
      </header>

      <main className="main-area">
        <div className={`content-wrap ${active === 'chat' ? 'chat-content' : ''}`}>
          {active !== 'chat' && <div className="page-heading">
            <span className="eyebrow">{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
            <p>{copy.subtitle}</p>
          </div>}

          <div className="workspace-frame">
            <div hidden={active !== 'chat'} className="panel-holder"><ChatPanel /></div>
            <div hidden={active !== 'image'} className="panel-holder"><ImagePanel /></div>
            {active === 'voice' && <div className="panel-holder"><Suspense fallback={<div className="feature-panel panel-loading" role="status">Preparing voice workspace…</div>}><VoicePanel /></Suspense></div>}
          </div>
        </div>
      </main>
      <footer className="site-footer"><span>AI Workspace</span><span>Make room for what’s next.</span></footer>
      </div>
    </div>
  )
}
