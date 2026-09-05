import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Form, Input, Select, Button, Tooltip, type InputRef } from 'antd'
import { SettingOutlined, UploadOutlined, LinkOutlined, PictureOutlined, DeleteOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons'
import { api } from '../services/api'
import AdminOnly from '../components/AdminOnly'
import PageHeader from '../components/PageHeader'
import Toast, { type ToastNotice } from '../components/Toast'
import { applyThemeClass, clearThemePreview, getTheme, setTheme, setThemePreview, useTheme, type Theme } from '../hooks/useTheme'
import type { GlobalConfigDTO } from '../types'
import styles from '../styles/global-config.module.css'

const PIPELINE_VIEWS = [
  { value: 'latest', label: 'Latest' },
  { value: 'all', label: 'All' },
]

const MAX_LOGO_BYTES = 512 * 1024 // 512 KB

export default function GlobalConfigPage() {
  const queryClient = useQueryClient()
  const theme = useTheme()
  const [form] = Form.useForm<{
    company_name: string
    company_logo?: string
    pipeline_view: string
  }>()

  // Logo state: either a data-URL (uploaded file) or a remote URL typed in
  const [logoPreview, setLogoPreview] = useState<string>('')
  const [logoTab, setLogoTab] = useState<'url' | 'upload'>('url')
  const [logoError, setLogoError] = useState<string>('')
  const [formError, setFormError] = useState<string>('')
  const [notice, setNotice] = useState<ToastNotice | null>(null)
  const noticeId = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const urlInputRef = useRef<InputRef>(null)

  // The Theme selection is a live preview: picking Light/Dark updates the
  // appearance immediately but is NOT persisted until the user clicks Save.
  // A preview override (see hooks/useTheme) makes every useTheme() consumer
  // follow the preview, so the whole UI restyles while we hold the draft.
  const mountThemeRef = useRef<Theme>(getTheme())
  useEffect(() => {
    // Dropping the preview override on unmount reverts the whole UI to the
    // stored theme (the draft was never written to localStorage, so this is a
    // no-op if the user already saved it).
    return () => {
      clearThemePreview()
      applyThemeClass(mountThemeRef.current)
    }
  }, [])

  // Single-slot notice: a new notification replaces the previous one, so
  // repeated saves never stack duplicate toasts.
  const notify = useCallback((type: ToastNotice['type'], message: string) => {
    noticeId.current += 1
    setNotice({ id: noticeId.current, type, message })
  }, [])
  const dismissNotice = useCallback(() => setNotice(null), [])

  const { data: config, isLoading } = useQuery({
    queryKey: ['global-config'],
    queryFn: api.getGlobalConfig,
  })

  const updateMutation = useMutation({
    mutationFn: api.updateGlobalConfig,
    onSuccess: (_data, variables) => {
      // Optimistic cache update so the header/sidebar logo refreshes
      // immediately, then invalidate so the server value wins.
      queryClient.setQueryData<GlobalConfigDTO>(['global-config'], (current) => ({
        ...(current ?? { company_name: '', company_logo: '', pipeline_view: 'latest' }),
        ...variables,
        company_logo: variables.company_logo ?? '',
      }))
      void queryClient.invalidateQueries({ queryKey: ['global-config'] })
      setFormError('')
      notify('success', 'Settings saved')
    },
    onError: (err: unknown) => {
      setNotice(null)
      setFormError(err instanceof Error && err.message ? err.message : 'Failed to save settings')
    },
  })

  useEffect(() => {
    if (config) {
      form.setFieldsValue({
        company_name: config.company_name,
        company_logo: config.company_logo,
        pipeline_view: config.pipeline_view,
      })
      setLogoPreview(config.company_logo || '')
    }
  }, [config, form])

  // Keep preview in sync when user types a URL
  const handleLogoUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLogoPreview(value)
    form.setFieldValue('company_logo', value)
    setLogoError('')
  }

  // Removal is local only: it clears the preview, the form field (covering
  // both an uploaded and a URL logo) and both file/URL inputs. Nothing is
  // sent to the backend until the user saves the form.
  const handleLogoRemove = () => {
    setLogoPreview('')
    form.setFieldValue('company_logo', '')
    setLogoError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (urlInputRef.current?.input) urlInputRef.current.input.value = ''
  }

  // Handle file upload: read as data-URL, enforce size limit
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoError('')

    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(`File too large (${(file.size / 1024).toFixed(0)} KB). Maximum allowed: 512 KB.`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setLogoPreview(dataUrl)
      form.setFieldValue('company_logo', dataUrl)
    }
    reader.readAsDataURL(file)
  }

  // Fixed submit: use mutateAsync so errors are properly caught, no redundant saving state.
  // The rejection is caught here (antd Form ignores async onFinish errors); the
  // failure is surfaced in the form via the mutation's onError → formError.
  const handleSubmit = async (values: any) => {
    setFormError('')
    const previewTheme = theme
    try {
      await updateMutation.mutateAsync({
        company_name: values.company_name,
        company_logo: values.company_logo ?? '',
        pipeline_view: values.pipeline_view,
      })
      // Persist the previewed theme now that the save succeeded (no change =
      // no-op) and record it so an unmount doesn't revert it.
      setTheme(previewTheme)
      mountThemeRef.current = previewTheme
    } catch {
      // The save failed: revert the preview to the last persisted theme.
      setTheme(mountThemeRef.current)
      // already handled by onError
    }
  }

  if (isLoading) return <div className="app-loading" />

  return (
    <AdminOnly>
      <div className={styles.configPage}>
        {/* ── Heading ── */}
        <PageHeader
          icon={<SettingOutlined aria-hidden className="page-header-icon" />}
          title="Application settings"
          subtitle="Manage shared dashboard settings used across all connected GitLab environments"
        />

        {/* ── Settings card + logo preview side-by-side ── */}
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
              initialValues={{ pipeline_view: 'latest' }}
            >
              {/* Company name */}
              <Form.Item
                name="company_name"
                label={
                  <span>
                    Company name <span style={{ color: 'var(--dashboard-danger)' }}>*</span>
                  </span>
                }
                rules={[{ required: true, message: 'Company name is required' }]}
                tooltip="Display name shown in the dashboard header and app chrome."
              >
                <Input placeholder="Your company" />
              </Form.Item>

              {/* Company logo */}
              <Form.Item
                name="company_logo"
                label="Company logo"
                tooltip="Square image recommended (128×128 px). Maximum file size: 512 KB."
                extra={
                  <span className={styles.logoHint}>
                    Accepted formats: PNG, JPG, SVG, GIF · Max 512 KB · Recommended 128×128 px
                  </span>
                }
              >
                {/* Tab switcher: URL vs Upload */}
                <div className={styles.logoTabs}>
                  <button
                    type="button"
                    className={`${styles.logoTab} ${logoTab === 'url' ? styles.logoTabActive : ''}`}
                    onClick={() => setLogoTab('url')}
                  >
                    <LinkOutlined /> URL
                  </button>
                  <button
                    type="button"
                    className={`${styles.logoTab} ${logoTab === 'upload' ? styles.logoTabActive : ''}`}
                    onClick={() => setLogoTab('upload')}
                  >
                    <UploadOutlined /> Upload file
                  </button>
                </div>

                {logoTab === 'url' ? (
                  <Input
                    ref={urlInputRef}
                    placeholder="https://example.com/logo.svg"
                    onChange={handleLogoUrlChange}
                  />
                ) : (
                  <div className={styles.uploadArea}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/gif"
                      className={styles.fileInput}
                      id="logo-file-input"
                      onChange={handleFileChange}
                    />
                    <label htmlFor="logo-file-input" className={styles.uploadLabel}>
                      <UploadOutlined />
                      <span>Click to choose a file</span>
                      <small>PNG, JPG, SVG, GIF — max 512 KB</small>
                    </label>
                    {logoError && <p className={styles.uploadError}>{logoError}</p>}
                  </div>
                )}
              </Form.Item>

              {/* Pipeline view */}
              <Form.Item
                name="pipeline_view"
                label="Pipeline view"
                tooltip="Show only the latest pipeline per project, or all pipelines."
              >
                <Select
                  popupClassName="pipeline-view-dropdown"
                  options={PIPELINE_VIEWS}
                />
              </Form.Item>

              {/* Theme: client-side only. Picking a theme is a live preview —
                  it restyles the UI immediately but is NOT persisted until the
                  user clicks Save. If they leave without saving it reverts. */}
              <Form.Item
                label="Theme"
                tooltip="Appearance for this browser. A live preview until you click Save; stored locally, not sent to the server."
              >
                <div className={styles.themeSwitch} role="group" aria-label="Theme">
                  <button
                    type="button"
                    className={`${styles.themeSwitchBtn} ${theme === 'light' ? styles.themeSwitchBtnActive : ''}`}
                    aria-pressed={theme === 'light'}
                    aria-label="Light theme"
                    onClick={() => setThemePreview('light')}
                  >
                    <SunOutlined aria-hidden />
                    <span>Light</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.themeSwitchBtn} ${theme === 'dark' ? styles.themeSwitchBtnActive : ''}`}
                    aria-pressed={theme === 'dark'}
                    aria-label="Dark theme"
                    onClick={() => setThemePreview('dark')}
                  >
                    <MoonOutlined aria-hidden />
                    <span>Dark</span>
                  </button>
                </div>
              </Form.Item>

              <Form.Item style={{ marginBottom: 0 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={updateMutation.isPending}
                >
                  Save settings
                </Button>
              </Form.Item>
            </Form>
          </div>

          {/* ── Logo preview box ── */}
          <div className={styles.logoPreviewBox}>
            <p className={styles.logoPreviewLabel}>Logo preview</p>
            {logoPreview ? (
              <div className={styles.logoPreviewWrap}>
                <img
                  src={logoPreview}
                  alt="Company logo preview"
                  className={styles.logoPreviewImg}
                  onError={() => setLogoPreview('')}
                />
                <Tooltip title="Remove logo" placement="left">
                  <button
                    type="button"
                    className={styles.logoRemoveBtn}
                    aria-label="Remove company logo"
                    onClick={handleLogoRemove}
                  >
                    <DeleteOutlined />
                  </button>
                </Tooltip>
              </div>
            ) : (
              <div className={styles.logoPreviewEmpty}>
                <PictureOutlined />
                <small>No logo set</small>
              </div>
            )}
          </div>
        </div>
      </div>
      <Toast notice={notice} onDismiss={dismissNotice} />
    </AdminOnly>
  )
}
