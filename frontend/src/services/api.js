const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

const errorMessages = {
  INVALID_REQUEST: 'Check your input and try again.',
  AI_NOT_CONFIGURED: 'This tool is not available right now.',
  AI_RATE_LIMITED: 'The service is busy. Please try again shortly.',
  AI_SERVICE_TIMEOUT: 'The request timed out. Please try again.',
  AI_SERVICE_UNAVAILABLE: 'The AI service is unavailable. Please try again.',
  VOICE_SESSION_NOT_FOUND: 'This voice session has ended.',
  NETWORK_ERROR: 'Cannot reach the application server. Check your connection and try again.',
  INVALID_RESPONSE: 'The server returned an unexpected response. Please try again.',
}

export class ApiError extends Error {
  constructor(code, status) {
    super(errorMessages[code] || 'Something went wrong. Please try again.')
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new ApiError('NETWORK_ERROR', 0)
  }

  if (response.status === 204) return null

  let body
  try {
    body = await response.json()
  } catch {
    throw new ApiError('INVALID_RESPONSE', response.status)
  }

  if (!response.ok) {
    throw new ApiError(body?.error?.code || 'REQUEST_FAILED', response.status)
  }
  return body
}

export function sendChat(message) {
  return request('/api/v1/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

export function generateImage(prompt) {
  return request('/api/v1/images/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  })
}

export function createVoiceSession() {
  return request('/api/v1/voice/sessions', { method: 'POST' })
}

export function endVoiceSession(sessionId) {
  return request(`/api/v1/voice/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
}
