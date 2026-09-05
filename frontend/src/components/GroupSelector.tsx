import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Modal, Space, Tag } from 'antd'
import { CloudServerOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useGroupContext } from '../contexts/GroupContext'
import type { GroupDTO } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  selectedGroupId: number | undefined
  onSelect: (id: number) => void
  /** When provided, list exactly these groups (the active environment's groups). */
  groups?: GroupDTO[]
}

const prefix = 'environment / '

function displayName(name: string): string {
  const idx = name.indexOf(prefix)
  if (idx !== -1) {
    return name.slice(idx + prefix.length)
  }
  return name
}

export default function GroupSelectorModal({ open, onClose, selectedGroupId, onSelect, groups }: Props) {
  const navigate = useNavigate()
  const { selectedEnvId } = useGroupContext()

  const { data: fetchedGroups = [], isLoading } = useQuery({
    queryKey: ['groups', selectedEnvId],
    queryFn: api.getGroups,
  })
  const scoped = groups !== undefined
  const visibleGroups = groups ?? fetchedGroups
  const loading = !scoped && isLoading

  const handleSelect = useCallback(
    (group: GroupDTO) => {
      onSelect(group.id)
    },
    [onSelect],
  )

  return (
    <Modal
      open={open}
      title="Select Group"
      centered
      onCancel={onClose}
      footer={null}
      width={480}
      rootClassName="theme-selector-modal"
    >
      <div className="theme-selector-description">
        Choose a GitLab group to view:
      </div>

      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {loading && <p className="theme-selector-message">Loading...</p>}

        {!loading && visibleGroups.length === 0 && (
          <p className="theme-selector-message theme-selector-empty">
            No groups found.
          </p>
        )}

        {!loading &&
          visibleGroups.map((group) => (
            <div
              key={group.id}
              onClick={() => handleSelect(group)}
              className={`theme-selector-option${selectedGroupId === group.id ? ' is-selected' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                marginBottom: '0.5rem',
                borderRadius: '8px',
              }}
            >
              <CloudServerOutlined style={{ color: 'var(--dashboard-accent)', fontSize: '1rem' }} />
              <Space direction="vertical" size={0} style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <strong style={{ fontSize: '0.9rem' }}>{displayName(group.name)}</strong>
                  {selectedGroupId === group.id && (
                    <Tag color="gold">Current</Tag>
                  )}
                </div>
                <small className="theme-selector-meta">Group ID {group.id}</small>
              </Space>
            </div>
          ))}
      </div>
    </Modal>
  )
}
