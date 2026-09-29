import { lazy, Suspense, useState } from 'react'

import ChatPanel from './features/chat/ChatPanel.jsx'
import ImagePanel from './features/image/ImagePanel.jsx'

const VoicePanel = lazy(() => import('./features/voice/VoicePanel.jsx'))

const sections = [
  { id: 'chat', label: 'Chat', hint: 'Think together', icon: 'chat' },
  { id: 'image', label: 'Generate', hint: 'Make an image', icon: 'image' },
  { id: 'voice', label: 'Voice', hint: 'Speak naturally', icon: 'voice' },
]

const pageCopy = {
  chat: {
    eyebrow: 'TEXT WORKSPACE',
    title: 'A space to think out loud.',
    subtitle: 'Ask a question, explore an idea, or get a fresh perspective.',
  },
  image: {
    eyebrow: 'IMAGE STUDIO',
    title: 'Turn a thought into an image.',
    subtitle: 'Describe what you have in mind and see it take shape.',
  },
  voice: {
    eyebrow: 'VOICE SESSION',
    title: 'Have a conversation.',
    subtitle: 'Speak naturally and hear an answer in real time.',
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
      <aside className="sidebar">
        <div className="brand" aria-label="AI Workspace">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-name">AI Workspace</span>
        </div>

        <div className="sidebar-label">WORKSPACES</div>
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
              <span className="nav-copy"><strong>{section.label}</strong><small>{section.hint}</small></span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className="foot-dot" aria-hidden="true" />
          <span>One place for every idea</span>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-sep">/</span><strong>{sections.find((item) => item.id === active).label}</strong></div>
          <span className="topbar-tag">AI INTERACTION PLATFORM</span>
        </header>

        <div className="content-wrap">
          <div className="page-heading">
            <span className="eyebrow">{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
            <p>{copy.subtitle}</p>
          </div>

          <div className="workspace-frame">
            <div hidden={active !== 'chat'} className="panel-holder"><ChatPanel /></div>
            <div hidden={active !== 'image'} className="panel-holder"><ImagePanel /></div>
            {active === 'voice' && <div className="panel-holder"><Suspense fallback={<div className="feature-panel panel-loading" role="status">Preparing voice workspace…</div>}><VoicePanel /></Suspense></div>}
          </div>
        </div>
      </main>
    </div>
  )
}
