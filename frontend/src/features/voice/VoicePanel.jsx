import useVoiceSession from './useVoiceSession.js'

const stateCopy = {
  idle: ['Ready when you are', 'Start a session to speak with the assistant.'],
  connecting: ['Connecting', 'Preparing a secure voice connection…'],
  listening: ['Listening', 'Speak naturally. The assistant is listening.'],
  processing: ['Thinking', 'The assistant is preparing a reply.'],
  speaking: ['Speaking', 'The assistant is responding now.'],
  disconnected: ['Session ended', 'Your microphone is off. Start again whenever you like.'],
  error: ['Connection interrupted', 'Review the message below and try again.'],
}

export default function VoicePanel() {
  const { status, error, audioNotice, lastHeard, lastReply, audioContainerRef, start, stop, enableAudio } = useVoiceSession()
  const active = ['connecting', 'listening', 'processing', 'speaking'].includes(status)
  const [title, description] = stateCopy[status]

  return (
    <section className="feature-panel voice-panel" aria-label="Voice workspace">
      <div className="panel-topline">
        <div><span className="panel-kicker">REAL-TIME CONVERSATION</span><h2>Voice agent</h2></div>
        <span className={`voice-state-pill ${status}`}><span aria-hidden="true" />{status}</span>
      </div>

      <div className="voice-stage">
        <div className={`voice-orb ${status}`} aria-hidden="true"><span className="orb-core" /><span className="orb-ring one" /><span className="orb-ring two" /></div>
        <div className="voice-state-copy" role="status" aria-live="polite"><h3>{title}</h3><p>{description}</p></div>
        {active ? (
          <button className="end-button" type="button" onClick={() => void stop()}>End session</button>
        ) : (
          <button className="primary-button voice-start" type="button" onClick={() => void start()}>Start voice session <span aria-hidden="true">↗</span></button>
        )}
        {error && <p className="voice-error" role="alert">{error}</p>}
        {audioNotice && <div className="audio-notice" role="alert"><span>Sound is paused by your browser.</span><button type="button" onClick={() => void enableAudio()}>Enable audio</button></div>}
      </div>

      <div className="voice-transcript">
        <div><span>YOU SAID</span><p>{lastHeard || 'Your words will appear here during the session.'}</p></div>
        <div><span>ASSISTANT</span><p>{lastReply || 'The assistant’s reply will appear here when available.'}</p></div>
      </div>
      <p className="voice-footnote">Your browser will ask for microphone access when the session starts. Ending a session stops the microphone.</p>
      <div ref={audioContainerRef} className="remote-audio" aria-hidden="true" />
    </section>
  )
}
