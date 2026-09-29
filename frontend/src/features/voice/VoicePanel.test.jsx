import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createVoiceSession, endVoiceSession } from '../../services/api.js'
import VoicePanel from './VoicePanel.jsx'

const { rooms, microphone, connection } = vi.hoisted(() => ({ rooms: [], microphone: { failure: null }, connection: { pending: null } }))

vi.mock('../../services/api.js', () => ({
  createVoiceSession: vi.fn(),
  endVoiceSession: vi.fn(),
}))

vi.mock('livekit-client', () => ({
  Room: class {
    constructor() {
      this.handlers = new Map()
      this.localParticipant = { setMicrophoneEnabled: vi.fn(async (enabled) => {
        if (enabled && microphone.failure) throw microphone.failure
      }) }
      this.connect = vi.fn(() => connection.pending || Promise.resolve())
      this.disconnect = vi.fn().mockResolvedValue(undefined)
      this.startAudio = vi.fn().mockResolvedValue(undefined)
      rooms.push(this)
    }
    on(event, handler) { this.handlers.set(event, handler) }
    off(event) { this.handlers.delete(event) }
  },
  RoomEvent: {
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    TranscriptionReceived: 'transcriptionReceived',
    ActiveSpeakersChanged: 'activeSpeakersChanged',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
    AudioPlaybackStatusChanged: 'audioPlaybackStatusChanged',
    MediaDevicesError: 'mediaDevicesError',
    Disconnected: 'disconnected',
  },
  Track: { Kind: { Audio: 'audio' } },
  ConnectionError: class extends Error {},
  ConnectionErrorReason: { NotAllowed: 0 },
}))

beforeEach(() => {
  rooms.length = 0
  microphone.failure = null
  connection.pending = null
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } })
  createVoiceSession.mockResolvedValue({ session_id: 'session-id', ws_url: 'wss://example.test', token: 'test-token' })
  endVoiceSession.mockResolvedValue(null)
})

describe('VoicePanel', () => {
  it('connects, enables the microphone, and ends the server session', async () => {
    const user = userEvent.setup()
    render(<VoicePanel />)

    await user.click(screen.getByRole('button', { name: /Start voice session/ }))
    await screen.findByText('Listening')
    expect(rooms[0].connect).toHaveBeenCalledWith('wss://example.test', 'test-token')
    expect(rooms[0].localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true)

    await user.click(screen.getByRole('button', { name: 'End session' }))
    await screen.findByText('Session ended')
    expect(rooms[0].localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false)
    expect(rooms[0].disconnect).toHaveBeenCalledWith(true)
    expect(endVoiceSession).toHaveBeenCalledWith('session-id')
  })

  it('releases the server session when microphone access fails', async () => {
    const user = userEvent.setup()
    render(<VoicePanel />)
    const denied = new Error('Denied')
    denied.name = 'NotAllowedError'
    microphone.failure = denied

    await user.click(screen.getByRole('button', { name: /Start voice session/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Microphone access was blocked')
    await waitFor(() => expect(endVoiceSession).toHaveBeenCalledWith('session-id'))
    expect(rooms[0].disconnect).toHaveBeenCalledWith(true)
  })

  it('cleans up when the voice workspace unmounts', async () => {
    const user = userEvent.setup()
    const view = render(<VoicePanel />)
    await user.click(screen.getByRole('button', { name: /Start voice session/ }))
    await screen.findByText('Listening')

    view.unmount()
    await waitFor(() => expect(endVoiceSession).toHaveBeenCalledWith('session-id'))
    expect(rooms[0].disconnect).toHaveBeenCalledWith(true)
  })

  it('closes a connection that finishes after End was pressed', async () => {
    let finishConnect
    connection.pending = new Promise((resolve) => { finishConnect = resolve })
    const user = userEvent.setup()
    render(<VoicePanel />)

    await user.click(screen.getByRole('button', { name: /Start voice session/ }))
    await waitFor(() => expect(rooms[0]?.connect).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'End session' }))
    await screen.findByText('Session ended')
    finishConnect()

    await waitFor(() => expect(rooms[0].disconnect).toHaveBeenCalledTimes(2))
    expect(endVoiceSession).toHaveBeenCalledTimes(1)
  })
})
