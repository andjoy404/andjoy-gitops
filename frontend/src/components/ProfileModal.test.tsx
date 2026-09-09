import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react'
import { stubMatchMedia, stubGetComputedStyle } from '../test-utils/test-helpers'
import { api } from '../services/api'
import ProfileModal from './ProfileModal'

vi.mock('../services/api', () => ({
  api: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
  },
}))

describe('ProfileModal component', () => {
  beforeEach(() => {
    stubMatchMedia()
    stubGetComputedStyle()
    cleanup()
    vi.clearAllMocks()
  })

  it('loads and displays user profile data', async () => {
    vi.mocked(api.getProfile).mockResolvedValue({
      id: 1,
      username: 'andjoy',
      display_name: 'AndJoy Admin',
      email: 'andjoy@example.com',
      role: 'editor',
    })

    render(<ProfileModal open={true} onClose={vi.fn()} />)

    expect(await screen.findByText('andjoy')).toBeInTheDocument()
    expect(screen.getByText('editor')).toBeInTheDocument()
    expect(screen.getByDisplayValue('AndJoy Admin')).toBeInTheDocument()
    expect(screen.getByDisplayValue('andjoy@example.com')).toBeInTheDocument()
  })

  it('updates profile display name and email without password change', async () => {
    vi.mocked(api.getProfile).mockResolvedValue({
      id: 2,
      username: 'johndoe',
      display_name: 'John Doe',
      email: 'john@example.com',
      role: 'editor',
    })
    vi.mocked(api.updateProfile).mockResolvedValue({ message: 'Profile updated successfully' })

    const onClose = vi.fn()
    const onUpdated = vi.fn()

    render(<ProfileModal open={true} onClose={onClose} onProfileUpdated={onUpdated} />)

    await screen.findByDisplayValue('John Doe')

    const displayNameInput = screen.getByDisplayValue('John Doe')
    fireEvent.change(displayNameInput, { target: { value: 'John Updated' } })

    const emailInput = screen.getByDisplayValue('john@example.com')
    fireEvent.change(emailInput, { target: { value: 'john.updated@example.com' } })

    const saveButton = screen.getByRole('button', { name: /save changes/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(api.updateProfile).toHaveBeenCalledWith({
        display_name: 'John Updated',
        email: 'john.updated@example.com',
      })
    })

    expect(onUpdated).toHaveBeenCalled()
  })

  it('requires current password when new password is typed', async () => {
    vi.mocked(api.getProfile).mockResolvedValue({
      id: 2,
      username: 'johndoe',
      display_name: 'John Doe',
      email: 'john@example.com',
      role: 'editor',
    })

    render(<ProfileModal open={true} onClose={vi.fn()} />)

    await screen.findByDisplayValue('John Doe')

    const newPassInput = screen.getByPlaceholderText('Enter new password (min 8 characters)')
    fireEvent.change(newPassInput, { target: { value: 'brandNewPassword123' } })

    const confirmPassInput = screen.getByPlaceholderText('Re-enter new password')
    fireEvent.change(confirmPassInput, { target: { value: 'brandNewPassword123' } })

    const saveButton = screen.getByRole('button', { name: /save changes/i })
    fireEvent.click(saveButton)

    expect(await screen.findByText(/current password is required/i)).toBeInTheDocument()
    expect(api.updateProfile).not.toHaveBeenCalled()
  })

  it('validates matching passwords and submits with password payload', async () => {
    vi.mocked(api.getProfile).mockResolvedValue({
      id: 2,
      username: 'johndoe',
      display_name: 'John Doe',
      email: 'john@example.com',
      role: 'editor',
    })
    vi.mocked(api.updateProfile).mockResolvedValue({ message: 'Profile updated successfully' })

    render(<ProfileModal open={true} onClose={vi.fn()} />)

    await screen.findByDisplayValue('John Doe')

    const currentPassInput = screen.getByPlaceholderText('Enter current password')
    fireEvent.change(currentPassInput, { target: { value: 'oldSecretPassword123' } })

    const newPassInput = screen.getByPlaceholderText('Enter new password (min 8 characters)')
    fireEvent.change(newPassInput, { target: { value: 'brandNewPassword123' } })

    const confirmPassInput = screen.getByPlaceholderText('Re-enter new password')
    fireEvent.change(confirmPassInput, { target: { value: 'mismatchPassword' } })

    const saveButton = screen.getByRole('button', { name: /save changes/i })
    fireEvent.click(saveButton)

    expect(await screen.findByText(/the passwords do not match/i)).toBeInTheDocument()
    expect(api.updateProfile).not.toHaveBeenCalled()

    // Now fix matching password
    fireEvent.change(confirmPassInput, { target: { value: 'brandNewPassword123' } })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(api.updateProfile).toHaveBeenCalledWith({
        display_name: 'John Doe',
        email: 'john@example.com',
        current_password: 'oldSecretPassword123',
        new_password: 'brandNewPassword123',
      })
    })
  })
})
