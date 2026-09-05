import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, Modal, message } from 'antd'
import { api, queryClient } from '../services/api'
import '../styles/password-change.css'

interface Props {
  open: boolean
  onClose: () => void
}

export default function PasswordChangeModal({ open, onClose }: Props) {
  const navigate = useNavigate()
  const [form] = Form.useForm<{ new_password: string; confirm_password: string }>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = useCallback(async (values: { new_password: string; confirm_password: string }) => {
    setError('')
    setLoading(true)

    try {
      await api.changePassword({ newPassword: values.new_password })
      // Invalidate all cached queries so the fresh session + new auth status
      // are picked up on the next navigation/render cycle
      await queryClient.invalidateQueries()
      message.success('Password changed successfully')
      onClose()
      navigate('/', { replace: true })
    } catch (err: any) {
      setError(err.message || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }, [navigate, onClose])

  const handleFinish = useCallback((values: { new_password: string; confirm_password: string }) => {
    if (values.new_password !== values.confirm_password) {
      form.setFieldsValue({ confirm_password: '' })
      message.warning('Passwords do not match')
      return
    }
    if (values.new_password.length < 8) {
      message.warning('Password must be at least 8 characters')
      return
    }
    handleSubmit(values)
  }, [form, handleSubmit])

  return (
    <Modal
      open={open}
      title="Change Password Required"
      centered
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={null}
      destroyOnClose
      width={300}
      rootClassName="password-change-modal"
    >
      <p className="password-change-intro">
        Your password must be changed before you can continue.
      </p>

      {error && (
        <div className="password-change-error" role="alert">
          {error}
        </div>
      )}

      <Form form={form} onFinish={handleFinish} layout="vertical">
        <Form.Item
          label="New Password"
          name="new_password"
          rules={[
            { required: true, message: 'Password is required' },
            { min: 8, message: 'Password must be at least 8 characters' },
          ]}
        >
          <Input.Password placeholder="Enter new password" autoComplete="new-password" />
        </Form.Item>

        <Form.Item
          label="Confirm Password"
          name="confirm_password"
          dependencies={['new_password']}
          rules={[
            { required: true, message: 'Please confirm your password' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('new_password') === value) {
                  return Promise.resolve()
                }
                return Promise.reject(new Error('Passwords do not match'))
              },
            }),
          ]}
        >
          <Input.Password placeholder="Confirm new password" autoComplete="new-password" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Change Password
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  )
}
