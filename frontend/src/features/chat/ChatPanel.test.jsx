import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { sendChat } from '../../services/api.js'
import ChatPanel from './ChatPanel.jsx'

vi.mock('../../services/api.js', () => ({ sendChat: vi.fn() }))

describe('ChatPanel', () => {
  it('sends a message and shows the assistant reply', async () => {
    sendChat.mockResolvedValue({ message: 'A useful answer' })
    const user = userEvent.setup()
    render(<ChatPanel />)

    await user.type(screen.getByRole('textbox', { name: 'Your message' }), 'Hello{enter}')

    expect(await screen.findByText('A useful answer')).toBeInTheDocument()
    expect(sendChat).toHaveBeenCalledWith('Hello')
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('renders an assistant Markdown table with formatted cells', async () => {
    sendChat.mockResolvedValue({ message: '**ChatGPT overview**\n\n| Aspect | What it means |\n| --- | --- |\n| **Full name** | Chat Generative Pre-trained Transformer |\n| Capabilities | Answer questions<br>Write prose |' })
    const user = userEvent.setup()
    render(<ChatPanel />)

    await user.type(screen.getByRole('textbox', { name: 'Your message' }), 'What is ChatGPT?{enter}')

    const table = await screen.findByRole('table')
    expect(table).toHaveTextContent('Full name')
    expect(screen.getByRole('columnheader', { name: 'Aspect' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'What it means' })).toBeInTheDocument()
    expect(screen.getByText('ChatGPT overview').tagName).toBe('STRONG')
    expect(screen.getByText('Full name').tagName).toBe('STRONG')
    expect(table.querySelector('br')).toBeInTheDocument()
    expect(screen.queryByText('| --- | --- |')).not.toBeInTheDocument()
  })

  it('retries a failed message without duplicating it', async () => {
    sendChat.mockRejectedValueOnce(new Error('Service unavailable')).mockResolvedValueOnce({ message: 'Recovered' })
    const user = userEvent.setup()
    render(<ChatPanel />)

    await user.type(screen.getByRole('textbox', { name: 'Your message' }), 'Retry me')
    await user.click(screen.getByRole('button', { name: /Send/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable')
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Recovered')).toBeInTheDocument()
    expect(sendChat).toHaveBeenCalledTimes(2)
    expect(sendChat).toHaveBeenLastCalledWith('Retry me')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getAllByText('Retry me')).toHaveLength(1)
  })

  it('shows pending feedback and blocks a duplicate send', async () => {
    let finish
    sendChat.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const user = userEvent.setup()
    render(<ChatPanel />)

    await user.type(screen.getByRole('textbox', { name: 'Your message' }), 'Wait for it')
    await user.click(screen.getByRole('button', { name: /Send/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Thinking')
    expect(screen.getByRole('button', { name: /Send/ })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Your message' })).toBeDisabled()
    finish({ message: 'Ready' })
    expect(await screen.findByText('Ready')).toBeInTheDocument()
    expect(sendChat).toHaveBeenCalledTimes(1)
  })
})
