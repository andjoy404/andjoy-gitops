import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Form, Input, Button, Tooltip, Switch, type InputRef } from 'antd'
import {
  SettingOutlined,
  UnlockOutlined,
  TeamOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import { api } from '../services/api'
import AdminOnly from '../components/AdminOnly'
import PageHeader from '../components/PageHeader'
import Toast, { type ToastNotice } from '../components/Toast'
import type { GlobalConfigDTO } from '../types'
import styles from '../styles/global-config.module.css'

export default function AuthenticationsPage() {
  const queryClient = useQueryClient()
  const [form] = Form.useForm<{
    sso_enabled: boolean
    local_login_enabled: boolean
    oidc_issuer_uri: string
    oidc_client_id: string
    oidc_client_secret: string
    oidc_admin_group_claim: string
    oidc_admin_group_value: string
  }>()

  const [formError, setFormError] = useState<string>('')
  const [notice, setNotice] = useState<ToastNotice | null>(null)
  const noticeId = useRef(0)
  const [authConfig, setAuthConfig] = useState<{ sso_enabled: boolean } | null>(null)

  const notify = useCallback((type: ToastNotice['type'], message: string) => {
    noticeId.current += 1
    setNotice({ id: noticeId.current, type, message })
  }, [])
  const dismissNotice = useCallback(() => setNotice(null), [])

  const { data: config, isLoading } = useQuery({
    queryKey: ['global-config'],
    queryFn: api.getGlobalConfig,
  })

  // Also fetch auth config for SSO state awareness
  useEffect(() => {
    api.getAuthConfig().then((data) => setAuthConfig(data)).catch(() => {})
  }, [])

  const updateMutation = useMutation({
    mutationFn: api.updateGlobalConfig,
    onSuccess: (_data, variables) => {
      queryClient.setQueryData<GlobalConfigDTO>(['global-config'], (current) => ({
        ...(current ?? {
          company_name: '',
          company_logo: '',
          pipeline_view: 'latest',
          sso_enabled: false,
          local_login_enabled: true,
          oidc_issuer_uri: null,
          oidc_client_id: null,
          oidc_client_secret: null,
          oidc_admin_group_claim: null,
          oidc_admin_group_value: null,
        }),
        ...variables,
      } as GlobalConfigDTO))
      void queryClient.invalidateQueries({ queryKey: ['global-config'] })
      setFormError('')
      notify('success', 'Authentication settings saved')
    },
    onError: (err: unknown) => {
      setNotice(null)
      setFormError(err instanceof Error && err.message ? err.message : 'Failed to save settings')
    },
  })

  useEffect(() => {
    if (config) {
      form.setFieldsValue({
        sso_enabled: config.sso_enabled ?? false,
        local_login_enabled: config.local_login_enabled ?? true,
        oidc_issuer_uri: config.oidc_issuer_uri || '',
        oidc_client_id: config.oidc_client_id || '',
        oidc_client_secret: config.oidc_client_secret || '',
        oidc_admin_group_claim: config.oidc_admin_group_claim || 'groups',
        oidc_admin_group_value: config.oidc_admin_group_value || 'admin',
      })
    }
  }, [config, form])

  const handleSubmit = async (values: any) => {
    setFormError('')
    try {
      await updateMutation.mutateAsync({
        company_name: config?.company_name || '',
        pipeline_view: config?.pipeline_view || 'latest',
        sso_enabled: values.sso_enabled,
        local_login_enabled: values.local_login_enabled,
        oidc_issuer_uri: values.oidc_issuer_uri || null,
        oidc_client_id: values.oidc_client_id || null,
        oidc_client_secret: values.oidc_client_secret || null,
        oidc_admin_group_claim: values.oidc_admin_group_claim || null,
        oidc_admin_group_value: values.oidc_admin_group_value || null,
      })
    } catch {
      // handled by onError
    }
  }

  if (isLoading) return <div className="app-loading" />

  return (
    <AdminOnly>
      <div className={styles.configPage}>
        {/* ── Heading ── */}
        <PageHeader
          icon={<UnlockOutlined aria-hidden className="page-header-icon" />}
          title="Authentications"
          subtitle="Manage Single Sign-On (SSO) identity providers and login policies"
        />

        <div className={styles.configLayout}>
          <div className={styles.configCard}>
            {formError && (
              <div className={styles.formError} role="alert">
                <span>{formError}</span>
                <button
                  type="button"
                  className={styles.errorClose}
                  onClick={() => setFormError('')}
                  aria-label="Dismiss error"
                >
                  ×
                </button>
              </div>
            )}
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              initialValues={{
                sso_enabled: false,
                local_login_enabled: true,
                oidc_admin_group_claim: 'groups',
                oidc_admin_group_value: 'admin',
              }}
            >
              {/* Authentication Methods Section */}
              <div className={styles.sectionHeader}>
                <span className={styles.sectionBadge}>
                  <UnlockOutlined />
                </span>
                <span className={styles.sectionTitle}>Authentication Methods</span>
              </div>

              <Form.Item
                name="sso_enabled"
                label="Enable SSO"
                valuePropName="checked"
                tooltip="When enabled, users can sign in via OIDC. Requires IdP configuration below."
                layout="vertical"
              >
                <Switch checkedChildren="On" unCheckedChildren="Off" />
              </Form.Item>

              <Form.Item
                name="local_login_enabled"
                label="Enable Local Login"
                valuePropName="checked"
                tooltip="Allow username/password login alongside SSO. Disable to enforce SSO-only authentication."
                layout="vertical"
              >
                <Switch checkedChildren="On" unCheckedChildren="Off" />
              </Form.Item>

              {/* OIDC Configuration Section */}
              <div className={styles.sectionHeader} style={{ marginTop: '1.25rem' }}>
                <span className={styles.sectionBadge}>
                  <LinkOutlined />
                </span>
                <span className={styles.sectionTitle}>OIDC Identity Provider</span>
              </div>

              <Form.Item
                name="oidc_issuer_uri"
                label="Issuer URI"
                tooltip="The issuer URL of your OIDC identity provider. For example: https://accounts.google.com or https://idp.example.com/.well-known/openid-configuration"
              >
                <Input
                  prefix={<LinkOutlined className={styles.inputIconUrl} />}
                  placeholder="https://idp.example.com/.well-known/openid-configuration"
                />
              </Form.Item>

              <Form.Item
                name="oidc_client_id"
                label="Client ID"
                tooltip="OAuth 2.0 Client ID issued by your OIDC provider."
              >
                <Input
                  prefix={<TeamOutlined className={styles.inputIconCompany} />}
                  placeholder="Client ID"
                />
              </Form.Item>

              <Form.Item
                name="oidc_client_secret"
                label="Client Secret"
                tooltip="OAuth 2.0 Client Secret issued by your OIDC provider. Kept encrypted in the database."
              >
                <Input.Password placeholder="Client Secret" />
              </Form.Item>

              {/* Admin Groups Section */}
              <div className={styles.sectionHeader} style={{ marginTop: '1.25rem' }}>
                <span className={styles.sectionBadge}>
                  <TeamOutlined />
                </span>
                <span className={styles.sectionTitle}>Admin Group Mapping</span>
              </div>

              <Form.Item
                name="oidc_admin_group_claim"
                label="Group Claim Name"
                tooltip="Name of the OAuth 2.0 / ID token claim that contains group information. Default: 'groups'."
              >
                <Input placeholder="groups" />
              </Form.Item>

              <Form.Item
                name="oidc_admin_group_value"
                label="Admin Group Value"
                tooltip="Value of the group claim that grants admin role within the application. Default: 'admin'."
              >
                <Input placeholder="admin" />
              </Form.Item>

              <div className={styles.formFooter}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={updateMutation.isPending}
                >
                  Save settings
                </Button>
              </div>
            </Form>
          </div>
        </div>
      </div>
      <Toast notice={notice} onDismiss={dismissNotice} />
    </AdminOnly>
  )
}
