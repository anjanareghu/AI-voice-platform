import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateImage, sendChat } from './api.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('API client', () => {
  it('sends the implemented chat request shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: 'Hello' }) })
    vi.stubGlobal('fetch', fetchMock)

    expect(await sendChat('Hi')).toEqual({ message: 'Hello' })
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/chat', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ message: 'Hi' }),
    }))
  })

  it('translates backend errors without displaying provider text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { code: 'AI_RATE_LIMITED', message: 'raw provider detail' } }),
    }))

    await expect(generateImage('A tree')).rejects.toThrow('The service is busy. Please try again shortly.')
  })

  it('rejects unexpected HTML safely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError('Unexpected <html>') },
    }))

    await expect(sendChat('Hi')).rejects.toThrow('The server returned an unexpected response. Please try again.')
  })
})
