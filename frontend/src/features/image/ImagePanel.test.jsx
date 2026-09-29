import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { generateImage } from '../../services/api.js'
import ImagePanel from './ImagePanel.jsx'

vi.mock('../../services/api.js', () => ({ generateImage: vi.fn() }))

describe('ImagePanel', () => {
  it('shows the generated image with its prompt', async () => {
    generateImage.mockResolvedValue({ image_data_url: 'data:image/png;base64,aGVsbG8=' })
    const user = userEvent.setup()
    render(<ImagePanel />)

    await user.type(screen.getByRole('textbox', { name: 'Describe your image' }), 'Blue mountain')
    await user.click(screen.getByRole('button', { name: /Generate image/ }))

    const image = await screen.findByRole('img', { name: 'AI generated image for: Blue mountain' })
    expect(image).toHaveAttribute('src', 'data:image/png;base64,aGVsbG8=')
    expect(generateImage).toHaveBeenCalledWith('Blue mountain')
  })

  it('offers a retry after a failed generation', async () => {
    generateImage.mockRejectedValueOnce(new Error('Try later')).mockResolvedValueOnce({ image_data_url: 'data:image/png;base64,aGVsbG8=' })
    const user = userEvent.setup()
    render(<ImagePanel />)

    await user.type(screen.getByRole('textbox', { name: 'Describe your image' }), 'Blue mountain')
    await user.click(screen.getByRole('button', { name: /Generate image/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Try later')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('img')).toBeInTheDocument()
    expect(generateImage).toHaveBeenCalledTimes(2)
  })

  it('shows progress and blocks another generation while pending', async () => {
    let finish
    generateImage.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const user = userEvent.setup()
    render(<ImagePanel />)

    await user.type(screen.getByRole('textbox', { name: 'Describe your image' }), 'Green forest')
    await user.click(screen.getByRole('button', { name: /Generate image/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Creating your image')
    expect(screen.getByRole('button', { name: /Generating/ })).toBeDisabled()
    finish({ image_data_url: 'data:image/png;base64,aGVsbG8=' })
    expect(await screen.findByRole('img')).toBeInTheDocument()
    expect(generateImage).toHaveBeenCalledTimes(1)
  })
})
