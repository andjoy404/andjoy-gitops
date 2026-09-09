import { useState, useEffect } from 'react'
import { Modal, Form, Input, Button, Tag, Alert, Spin, message } from 'antd'
import { UserOutlined, MailOutlined, LockOutlined } from '@ant-design/icons'
import { api } from '../services/api'
import type { UserProfileDTO } from '../types'
import '../styles/profile-modal.css'

interface Props {
  open: boolean
  onClose: () => void
  onProfileUpdated?: () => void
}

function getInitials(profile: UserProfileDTO | null): string {
  if (!profile) return 'U'
  const source = profile.display_name?.trim() || profile.username || 'U'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

export default function ProfileModal({ open, onClose, onProfileUpdated }: Props) {
  const [form] = Form.useForm()
  const [profile, setProfile] = useState<UserProfileDTO | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!open) {
      form.resetFields()
      setError(null)
      setSuccess(false)
      return
    }

    let isMounted = true
    setLoading(true)
    setError(null)
    setSuccess(false)

    api.getProfile()
      .then((data) => {
        if (!isMounted) return
        setProfile(data)
        form.setFieldsValue({
          display_name: data.display_name || '',
          email: data.email || '',
          current_password: '',
          new_password: '',
          confirm_password: '',
        })
      })
      .catch((err) => {
        if (!isMounted) return
        setError(err instanceof Error ? err.message : 'Failed to load profile')
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [open, form])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      setError(null)

      const payload = {
        display_name: values.display_name?.trim() || '',
        email: values.email?.trim() || '',
        ...(values.new_password
          ? {
              current_password: values.current_password,
              new_password: values.new_password,
            }
          : {}),
      }

      await api.updateProfile(payload)
      setSuccess(true)
      message.success('Profile updated successfully')

      // Clear password fields
      form.setFieldsValue({
        current_password: '',
        new_password: '',
        confirm_password: '',
      })

      if (onProfileUpdated) {
        onProfileUpdated()
      }

      setTimeout(() => {
        onClose()
      }, 1000)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else if (typeof err === 'object' && err !== null && 'errorFields' in err) {
        // Ant Form validation failure, don't set api error
      } else {
        setError('Failed to update profile')
      }
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return null
  }

  return (
    <Modal
      open={open}
      title={(
        <div className="profile-modal-title">
          <span className="profile-modal-title-icon">
            <UserOutlined />
          </span>
          <span>Edit Profile</span>
        </div>
      )}
      centered
      onCancel={onClose}
      rootClassName="profile-modal"
      footer={[
        <Button key="cancel" onClick={onClose} disabled={saving}>
          Cancel
        </Button>,
        <Button key="save" type="primary" onClick={handleSubmit} loading={saving} disabled={loading}>
          Save Changes
        </Button>,
      ]}
      width={460}
    >
      <Spin spinning={loading}>
        <div style={{ marginTop: 2 }}>
          {error && (
            <Alert
              type="error"
              message={error}
              showIcon
              closable
              onClose={() => setError(null)}
              style={{ marginBottom: 14 }}
            />
          )}

          {success && (
            <Alert
              type="success"
              message="Profile updated successfully"
              showIcon
              style={{ marginBottom: 14 }}
            />
          )}

          <div className="profile-account-card">
            <div className="profile-account-info">
              <span className="profile-avatar">{getInitials(profile)}</span>
              <div>
                <div className="profile-account-username">
                  {profile?.username || '—'}
                </div>
                <div className="profile-account-display-name">
                  {profile?.display_name || 'GitLab dashboard account'}
                </div>
              </div>
            </div>
            <div>
              <Tag className={`profile-role-badge ${profile?.role === 'admin' ? 'admin' : 'editor'}`}>
                {profile?.role || 'editor'}
              </Tag>
            </div>
          </div>

          <Form form={form} layout="vertical" requiredMark={false}>
            <Form.Item
              label="Display Name"
              name="display_name"
              rules={[{ max: 100, message: 'Display name cannot exceed 100 characters' }]}
            >
              <Input
                prefix={<UserOutlined className="profile-input-icon profile-input-icon-user" />}
                placeholder="Enter your display name"
              />
            </Form.Item>

            <Form.Item
              label="Email"
              name="email"
              rules={[
                { type: 'email', message: 'Please enter a valid email address' },
                { max: 200, message: 'Email cannot exceed 200 characters' },
              ]}
            >
              <Input
                prefix={<MailOutlined className="profile-input-icon profile-input-icon-mail" />}
                placeholder="Enter your email address"
              />
            </Form.Item>

            <div className="profile-section-header">
              <div className="profile-section-badge">
                <LockOutlined />
              </div>
              <div>
                <strong className="profile-section-title">Change Password</strong>
                <span className="profile-section-sub">
                  Leave blank to keep your current password
                </span>
              </div>
            </div>

            <Form.Item
              label="Current Password"
              name="current_password"
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (getFieldValue('new_password') && (!value || !value.trim())) {
                      return Promise.reject(new Error('Current password is required to set a new password'))
                    }
                    return Promise.resolve()
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="profile-input-icon profile-input-icon-lock" />}
                placeholder="Enter current password"
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item
              label="New Password"
              name="new_password"
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (value && value.length < 8) {
                      return Promise.reject(new Error('New password must be at least 8 characters'))
                    }
                    return Promise.resolve()
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="profile-input-icon profile-input-icon-lock" />}
                placeholder="Enter new password (min 8 characters)"
                autoComplete="new-password"
              />
            </Form.Item>

            <Form.Item
              label="Confirm New Password"
              name="confirm_password"
              dependencies={['new_password']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (getFieldValue('new_password') && value !== getFieldValue('new_password')) {
                      return Promise.reject(new Error('The passwords do not match'))
                    }
                    return Promise.resolve()
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="profile-input-icon profile-input-icon-lock" />}
                placeholder="Re-enter new password"
                autoComplete="new-password"
              />
            </Form.Item>
          </Form>
        </div>
      </Spin>
    </Modal>
  )
}
