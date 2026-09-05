import { useEffect, useState } from 'react'
import { Button, Drawer, Form, Input, Tag, Switch, Select } from 'antd'
import { CloseOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import { useGroupContext } from '../contexts/GroupContext'
import type { EnvironmentDTO } from '../types'
import styles from '../styles/environments.module.css'

interface Props {
  open: boolean
  onClose: () => void
  editingEnv?: EnvironmentDTO | null
  onSaved?: (name: string) => void
}

export default function EnvironmentFormModal({ open, onClose, editingEnv, onSaved }: Props) {
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const { selectEnvironment } = useGroupContext()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isEdit = !!editingEnv
  const isPending = saving

  const createMutation = useMutation({
    mutationFn: api.createEnvironment,
    onSuccess: (created: { id: number } | undefined) => {
      queryClient.invalidateQueries({ queryKey: ['environments'] })
      void queryClient.invalidateQueries({ queryKey: ['groups'] })
      if (created && typeof created.id === 'number') {
        selectEnvironment?.(created.id)
      }
      onSaved?.(form.getFieldValue('name') as string)
      onClose()
      setSaving(false)
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Unable to create environment. Please check the form and try again.')
      setSaving(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, any> }) =>
      api.updateEnvironment(id, data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['environments'] })
      void queryClient.invalidateQueries({ queryKey: ['groups'] })
      onSaved?.(form.getFieldValue('name') as string)
      onClose()
      setSaving(false)
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Unable to update environment. Please check the form and try again.')
      setSaving(false)
    },
  })

  useEffect(() => {
    if (!open) return

    setErrorMessage(null)
    setSaving(false)

    if (editingEnv) {
      form.setFieldsValue({
        name: editingEnv.name,
        base_url: editingEnv.base_url,
        token: '',
        group_ids: Array.isArray(editingEnv.group_ids) ? editingEnv.group_ids.map(String) : [],
        enabled: editingEnv.enabled,
        only_top_level: editingEnv.only_top_level,
        include_subgroups: editingEnv.include_subgroups,
      })
    } else {
      form.resetFields()
      form.setFieldsValue({
        base_url: 'https://gitlab.com',
        enabled: true,
        only_top_level: false,
        include_subgroups: false,
      })
    }
  }, [open, editingEnv, form])

  const handleSubmit = async () => {
    if (createMutation.isPending || updateMutation.isPending) return
    try {
      const values = await form.validateFields()
      setSaving(true)
      setErrorMessage(null)

      const envPayload = {
        name: values.name,
        base_url: values.base_url,
        token: values.token ?? '',
        group_ids: Array.isArray(values.group_ids)
          ? values.group_ids.map((s: string) => Number(s)).filter((n: number) => !isNaN(n) && n > 0)
          : [],
        enabled: values.enabled,
        only_top_level: values.only_top_level,
        include_subgroups: values.include_subgroups,
      }

      if (isEdit) {
        updateMutation.mutate({ id: editingEnv!.id, data: envPayload })
      } else {
        createMutation.mutate(envPayload)
      }
    } catch {
      // validation error
    }
  }

  const handleClose = () => {
    if (!open) return
    onClose()
    form.resetFields()
  }

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      width="min(560px, 50vw)"
      closable={false}
      destroyOnClose={false}
      rootClassName={styles.envDrawer}
      title={
        <div className={styles.drawerHeading}>
          <strong>{isEdit ? 'Edit Environment' : 'Add Environment'}</strong>
          <small>
            {isEdit
              ? 'Update environment details and access settings'
              : 'Connect a new GitLab instance to start collecting analytics'}
          </small>
        </div>
      }
      extra={
        <Button
          type="text"
          icon={<CloseOutlined />}
          onClick={handleClose}
          aria-label="Close environment form"
        />
      }
    >
      <div className={styles.envForm}>
        <Form form={form} layout="vertical">
          {errorMessage && (
            <div className={styles.envFormError}>
              <span>
                {errorMessage}
                <button
                  className={styles.errorClose}
                  onClick={() => setErrorMessage(null)}
                  aria-label="Dismiss error"
                >
                  ×
                </button>
              </span>
            </div>
          )}

          <Form.Item
            name="name"
            label="Environment name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="Production GitLab" />
          </Form.Item>

          <Form.Item
            name="base_url"
            label="GitLab URL"
            rules={[{ required: true, message: 'URL is required' }]}
          >
            <Input placeholder="https://gitlab.example.com" />
          </Form.Item>

          <Form.Item
            name="token"
            label={
              <span>
                Access token
                {!isEdit && <span style={{ color: 'var(--dashboard-danger)' }}> *</span>}
              </span>
            }
            rules={isEdit ? [] : [{ required: true, message: 'Token is required for new environments' }]}
            extra={
              <span style={{ color: 'var(--dashboard-muted)', fontSize: '0.75rem' }}>
                {isEdit
                  ? 'Leave empty to keep the existing token'
                  : 'Encrypted before storage in PostgreSQL'}
              </span>
            }
          >
            <Input.Password placeholder="glpat-xxxxxxxx" autoComplete="new-password" />
          </Form.Item>

          <Form.Item
            name="group_ids"
            label="Group IDs"
            className={styles.groupIdsItem}
            rules={[
              {
                validator: (_, values?: string[]) => {
                  const invalid = (values ?? []).some((value) => !/^\d+$/.test(String(value)) || Number(value) <= 0)
                  return invalid
                    ? Promise.reject(new Error('Group IDs must be positive numbers'))
                    : Promise.resolve()
                },
              },
            ]}
            tooltip={{
              title: 'Type an ID and press Enter or comma to add',
              rootClassName: 'environment-help-tooltip',
            }}
          >
            <Select
              mode="tags"
              tokenSeparators={[',', ';']}
              placeholder="Type a group ID, then press Enter"
              className={styles.groupIdsSelect}
              classNames={{ popup: { root: 'environment-group-id-dropdown' } }}
              showSearch
              notFoundContent={null}
              tagRender={({ label, closable, onClose }) => (
                <Tag
                  className={styles.groupIdTag}
                  closable={closable}
                  onClose={onClose}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                >
                  #{label}
                </Tag>
              )}
            />
          </Form.Item>

          <Form.Item name="enabled" label="Enabled" valuePropName="checked" className={styles.statusForm}>
            <Switch />
          </Form.Item>

          <Form.Item name="only_top_level" label="Only top-level pipelines" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item name="include_subgroups" label="Include subgroups" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </div>

      <div className={styles.formFooter}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button type="primary" loading={isPending} onClick={handleSubmit}>
          {isEdit ? 'Save environment' : 'Create'}
        </Button>
      </div>
    </Drawer>
  )
}
