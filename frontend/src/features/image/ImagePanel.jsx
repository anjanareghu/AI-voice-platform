import { useRef, useState } from 'react'

import { generateImage } from '../../services/api.js'

export default function ImagePanel() {
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const lastPrompt = useRef('')

  async function submit(text) {
    const cleaned = text.trim()
    if (!cleaned || busy.current) return
    busy.current = true
    lastPrompt.current = cleaned
    setPending(true)
    setError('')
    try {
      const image = await generateImage(cleaned)
      if (typeof image?.image_data_url !== 'string' || !image.image_data_url.startsWith('data:image/')) {
        throw new Error('The image could not be displayed. Please try again.')
      }
      setResult({ src: image.image_data_url, prompt: cleaned })
    } catch (requestError) {
      setError(requestError?.message || 'Image generation failed. Please try again.')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return (
    <section className="feature-panel image-panel" aria-label="Image generation workspace">
      <div className="panel-topline">
        <div><span className="panel-kicker">CREATE VISUALLY</span><h2>Image generation</h2></div>
        <span className="panel-meta">Prompt · Create · Refine</span>
      </div>

      <div className="image-workspace">
        <form className="image-controls" onSubmit={(event) => { event.preventDefault(); void submit(prompt) }}>
          <label htmlFor="image-prompt">Describe your image</label>
          <p>Include the subject, setting, mood, or style you want to see.</p>
          <textarea id="image-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="A futuristic Kerala city during monsoon, soft evening light…" rows={5} maxLength={4000} disabled={pending} />
          <button className="primary-button wide" type="submit" disabled={pending || !prompt.trim()}>{pending ? 'Generating…' : result ? 'Generate again' : 'Generate image'} <span aria-hidden="true">✦</span></button>
          {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" disabled={pending} onClick={() => void submit(lastPrompt.current)}>Retry</button></div>}
          <div className="image-tip"><span aria-hidden="true">✧</span> A more specific prompt usually gives a more useful result.</div>
        </form>

        <div className={`image-result ${result ? 'has-image' : ''}`} aria-live="polite">
          {pending && <div className="image-loading" role="status"><div className="loading-orbit" aria-hidden="true"><span /></div><strong>Creating your image</strong><p>This may take a little while.</p></div>}
          {!pending && result && <figure><img src={result.src} alt={`AI generated image for: ${result.prompt}`} /><figcaption>{result.prompt}</figcaption></figure>}
          {!pending && !result && <div className="image-placeholder"><div className="placeholder-art" aria-hidden="true"><span className="art-sun" /><span className="art-hill one" /><span className="art-hill two" /></div><strong>Your image appears here</strong><p>Describe a scene to get started.</p></div>}
        </div>
      </div>
    </section>
  )
}
