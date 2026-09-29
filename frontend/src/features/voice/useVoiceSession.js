import { useCallback, useEffect, useRef, useState } from 'react'
import { ConnectionError, ConnectionErrorReason, Room, RoomEvent, Track } from 'livekit-client'

import { createVoiceSession, endVoiceSession } from '../../services/api.js'

function connectionMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
    return 'Microphone access was blocked. Allow it in your browser and try again.'
  }
  if (error?.name === 'NotFoundError' || error?.name === 'NotReadableError') {
    return 'No usable microphone was found. Check your device and try again.'
  }
  if (error instanceof ConnectionError && error.reason === ConnectionErrorReason.NotAllowed) {
    return 'The voice session expired or was refused. Start a new session.'
  }
  if (error?.name === 'ApiError') return error.message
  return 'Could not start the voice connection. Please try again.'
}

export default function useVoiceSession() {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [audioNotice, setAudioNotice] = useState(false)
  const [lastHeard, setLastHeard] = useState('')
  const [lastReply, setLastReply] = useState('')
  const statusRef = useRef('idle')
  const mountedRef = useRef(false)
  const stopRequestedRef = useRef(false)
  const busyRef = useRef(false)
  const roomRef = useRef(null)
  const sessionIdRef = useRef(null)
  const removeListenersRef = useRef(null)
  const cleanupPromiseRef = useRef(null)
  const audioContainerRef = useRef(null)
  const audioTracksRef = useRef(new Map())

  const updateStatus = useCallback((next) => {
    statusRef.current = next
    if (mountedRef.current) setStatus(next)
  }, [])

  const cleanup = useCallback(async () => {
    if (cleanupPromiseRef.current) return cleanupPromiseRef.current

    const task = (async () => {
      const room = roomRef.current
      const sessionId = sessionIdRef.current
      roomRef.current = null
      sessionIdRef.current = null
      removeListenersRef.current?.()
      removeListenersRef.current = null

      if (room) {
        try { await room.localParticipant.setMicrophoneEnabled(false) } catch { /* Continue cleanup. */ }
        try { await room.disconnect(true) } catch { /* Continue cleanup. */ }
      }
      for (const [track, element] of audioTracksRef.current) {
        try { track.detach(element) } catch { /* Remove the element anyway. */ }
        element.remove()
      }
      audioTracksRef.current.clear()

      if (!sessionId) return true
      try {
        await endVoiceSession(sessionId)
        return true
      } catch {
        return false
      }
    })()

    cleanupPromiseRef.current = task
    try {
      return await task
    } finally {
      if (cleanupPromiseRef.current === task) cleanupPromiseRef.current = null
    }
  }, [])

  const failSession = useCallback(async (message) => {
    if (stopRequestedRef.current) return
    stopRequestedRef.current = true
    const ended = await cleanup()
    if (mountedRef.current) {
      setError(ended ? message : `${message} We could not confirm the session ended.`)
      updateStatus('error')
    }
  }, [cleanup, updateStatus])

  const start = useCallback(async () => {
    if (busyRef.current || sessionIdRef.current || roomRef.current) return
    stopRequestedRef.current = false
    busyRef.current = true
    setError('')
    setAudioNotice(false)
    setLastHeard('')
    setLastReply('')
    updateStatus('connecting')

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      busyRef.current = false
      setError('Voice needs a secure page and a browser with microphone support.')
      updateStatus('error')
      return
    }

    try {
      const session = await createVoiceSession()
      sessionIdRef.current = session.session_id
      if (stopRequestedRef.current || !mountedRef.current) {
        const ended = await cleanup()
        if (!ended && mountedRef.current) {
          setError('We could not confirm the voice session ended.')
          updateStatus('error')
        }
        return
      }

      const room = new Room()
      roomRef.current = room
      const listeners = []
      const on = (event, handler) => {
        room.on(event, handler)
        listeners.push([event, handler])
      }
      removeListenersRef.current = () => {
        for (const [event, handler] of listeners) room.off(event, handler)
      }

      on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio || !audioContainerRef.current) return
        const element = track.attach()
        element.autoplay = true
        element.playsInline = true
        audioTracksRef.current.set(track, element)
        audioContainerRef.current.appendChild(element)
      })
      on(RoomEvent.TrackUnsubscribed, (track) => {
        const element = audioTracksRef.current.get(track)
        if (!element) return
        track.detach(element)
        element.remove()
        audioTracksRef.current.delete(track)
      })
      on(RoomEvent.TranscriptionReceived, (segments, participant) => {
        const finalText = segments.filter((segment) => segment.final).map((segment) => segment.text).join(' ').trim()
        if (!finalText || !mountedRef.current) return
        if (participant?.isLocal) {
          setLastHeard(finalText)
          updateStatus('processing')
        } else {
          setLastReply(finalText)
        }
      })
      on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        if (speakers.some((participant) => !participant.isLocal)) updateStatus('speaking')
        else if (statusRef.current === 'speaking') updateStatus('listening')
      })
      on(RoomEvent.Reconnecting, () => updateStatus('connecting'))
      on(RoomEvent.Reconnected, () => updateStatus('listening'))
      on(RoomEvent.AudioPlaybackStatusChanged, (playing) => {
        if (mountedRef.current) setAudioNotice(!playing)
      })
      on(RoomEvent.MediaDevicesError, () => {
        void failSession('The microphone stopped working. Check your device and try again.')
      })
      on(RoomEvent.Disconnected, () => {
        void failSession('The voice connection ended. Start a new session to continue.')
      })

      await room.connect(session.ws_url, session.token)
      if (stopRequestedRef.current) {
        try { await room.disconnect(true) } catch { /* Cleanup continues below. */ }
        await cleanup()
        return
      }
      await room.localParticipant.setMicrophoneEnabled(true)
      if (stopRequestedRef.current) {
        try { await room.localParticipant.setMicrophoneEnabled(false) } catch { /* Cleanup continues below. */ }
        try { await room.disconnect(true) } catch { /* Cleanup continues below. */ }
        await cleanup()
        return
      }
      updateStatus('listening')
    } catch (requestError) {
      const wasStopped = stopRequestedRef.current
      stopRequestedRef.current = true
      const ended = await cleanup()
      if (mountedRef.current && (!wasStopped || !ended)) {
        const message = wasStopped ? 'We could not confirm the voice session ended.' : connectionMessage(requestError)
        setError(ended ? message : wasStopped ? message : `${message} We could not confirm the session ended.`)
        updateStatus('error')
      }
    } finally {
      busyRef.current = false
    }
  }, [cleanup, failSession, updateStatus])

  const stop = useCallback(async () => {
    stopRequestedRef.current = true
    const ended = await cleanup()
    if (mountedRef.current) {
      setAudioNotice(false)
      if (ended) {
        setError('')
        updateStatus('disconnected')
      } else {
        setError('We could not confirm the voice session ended. It will expire automatically.')
        updateStatus('error')
      }
    }
  }, [cleanup, updateStatus])

  const enableAudio = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    try {
      await room.startAudio()
      if (mountedRef.current) setAudioNotice(false)
    } catch {
      if (mountedRef.current) setError('Audio playback is blocked. Check your browser sound settings.')
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopRequestedRef.current = true
      void cleanup()
    }
  }, [cleanup])

  return { status, error, audioNotice, lastHeard, lastReply, audioContainerRef, start, stop, enableAudio }
}
