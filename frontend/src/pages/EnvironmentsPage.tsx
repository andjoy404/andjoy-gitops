import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Popconfirm,
  Tag,
  message,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  StarOutlined,
  StarFilled,
  CloudServerOutlined,
} from '@ant-design/icons'
import { api } from '../services/api'
import EnvironmentFormModal from '../components/EnvironmentFormModal'
import PageHeader from '../components/PageHeader'
import type { EnvironmentDTO } from '../types'
import styles from '../styles/environments.module.css'

export default function EnvironmentsPage() {
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [editingEnv, setEditingEnv] = useState<EnvironmentDTO | null>(null)
  const [highlightedEnv, setHighlightedEnv] = useState('')
  const queryClient = useQueryClient()

  const { data: environments = [], isLoading } = useQuery({
    queryKey: ['environments'],
    queryFn: api.getEnvironments,
  })

  /* ── Set-default mutation ── */
  const setDefaultMutation = useMutation({
    mutationFn: (id: number) => api.setDefaultEnvironment(id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<EnvironmentDTO[]>(['environments'], (current = []) =>
        current.map((environment) => ({ ...environment, is_default: environment.id === id })),
      )
      localStorage.setItem('gcd_selected_env_id', String(id))
      void queryClient.invalidateQueries({ queryKey: ['environments'] })
      message.success('Default environment set')
    },
    onError: (err: any) => {
      message.error(err.message || 'Failed to set default')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteEnvironment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['environments'] })
      void queryClient.invalidateQueries({ queryKey: ['groups'] })
      message.success('Environment deleted')
    },
    onError: (err: any) => {
      message.error(err.message || 'Failed to delete environment')
    },
  })

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id)
  }

  const handleEdit = (env: EnvironmentDTO) => {
    setEditingEnv(env)
    setFormModalOpen(true)
  }

  const handleAdd = () => {
    setEditingEnv(null)
    setFormModalOpen(true)
  }

  const handleSetDefault = async (id: number) => {
    if (setDefaultMutation.isPending) return
    await setDefaultMutation.mutateAsync(id)
  }

  const handleSaved = (name: string) => {
    setHighlightedEnv(name)
    window.setTimeout(() => {
      setHighlightedEnv((current) => (current === name ? '' : current))
    }, 2600)
  }

  /* ── Empty first-run state (mirrors original: show when array is empty) ── */
  if (environments.length === 0) {
    return (
      <div className={styles.envPage}>
        <div className="first-environment-empty-state">
          <CloudServerOutlined />
          <h2>Connect your first GitLab environment</h2>
          <p>
            No GitLab environment is configured yet. Add an instance and select
            its groups to begin collecting pipeline and runner analytics.
          </p>
          <ol>
            <li>Enter the GitLab URL and a read-capable access token.</li>
            <li>Add one or more group IDs, separated by commas.</li>
            <li>Save the environment; synchronization starts automatically.</li>
          </ol>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size="large">
            Configure GitLab environment
          </Button>
        </div>

        
        <EnvironmentFormModal
                  open={formModalOpen}
                  onClose={() => setFormModalOpen(false)}
                  editingEnv={editingEnv}
                  onSaved={handleSaved}
                />
      </div>
    )
  }

  return (
    <div className={styles.envPage}>
      {/* ── Heading ── */}
      <PageHeader
        icon={<CloudServerOutlined aria-hidden className="page-header-icon" />}
        title="Environments"
        subtitle="Manage GitLab instances and monitored groups"
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            Add environment
          </Button>
        }
      />

      {/* ── Table card ── */}
      <div className={styles.envTableCard}>
        <div className={styles.envToolbar}>
          <span className={styles.envCount}>
            {environments.length} environment{environments.length !== 1 ? 's' : ''}
          </span>
        </div>

        {isLoading ? (
          <div className={styles.loadingContainer}>Loading environments…</div>
        ) : (
          <table className={`${styles.envTable} gitops-data-table`}>
            <thead>
              <tr>
                <th>ENVIRONMENT</th>
                <th>GITLAB URL</th>
                <th>GROUPS</th>
                <th>STATUS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {environments.map((env) => (
                <tr
                  key={env.id}
                  className={env.name === highlightedEnv ? styles.newEnvHighlight : ''}
                >
                  {/* Name */}
                  <td>
                    <div className={styles.nameCell}>
                      <CloudServerOutlined style={{ color: 'var(--dashboard-accent)', flexShrink: 0 }} />
                      <strong>{env.name}</strong>
                      {env.is_default && (
                        <Tag className={`${styles.badge} ${styles.badgeDefault}`} icon={<StarOutlined />}>
                          Default
                        </Tag>
                      )}
                    </div>
                  </td>

                  {/* URL */}
                  <td>{env.base_url}</td>

                  {/* Groups */}
                  <td>
                    {env.group_ids.length > 0 ? env.group_ids.join(', ') : 'All accessible'}
                  </td>

                  {/* Status */}
                  <td>
                    <Tag
                      className={`${styles.badge} ${env.enabled ? styles.badgeEnabled : styles.badgeDisabled}`}
                    >
                      {env.enabled ? 'Enabled' : 'Disabled'}
                    </Tag>
                  </td>

                  {/* Actions */}
                  <td>
                    <div className={styles.actionsCell}>
                      <Button
                        type="text"
                        size="small"
                        icon={
                          env.is_default
                            ? <StarFilled style={{ color: '#f5b301', filter: 'drop-shadow(0 0 4px rgba(245,179,1,.55))' }} />
                            : <StarOutlined />
                        }
                        loading={setDefaultMutation.isPending && setDefaultMutation.variables === env.id}
                        disabled={env.is_default || setDefaultMutation.isPending}
                        onClick={() => handleSetDefault(env.id)}
                        aria-label={env.is_default ? `${env.name} is the default environment` : `Set ${env.name} as default environment`}
                        title="Set as default"
                      />
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(env)}
                        title="Edit"
                      />
                      <Popconfirm
                        title="Delete environment"
                        description="This action cannot be undone."
                        okText="Delete"
                        cancelText="Cancel"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleDelete(env.id)}
                        overlayClassName="env-delete-confirm"
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          loading={deleteMutation.isPending && deleteMutation.variables === env.id}
                          title="Delete"
                        />
                      </Popconfirm>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      
      <EnvironmentFormModal
                open={formModalOpen}
                onClose={() => setFormModalOpen(false)}
                editingEnv={editingEnv}
                onSaved={handleSaved}
              />
    </div>
  )
}
