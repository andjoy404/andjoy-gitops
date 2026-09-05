import { useEffect, useRef, useState } from 'react'
import { Select } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import styles from '../styles/field-search-box.module.css'

export interface FieldSearchBoxField {
  value: string
  label: string
}

export interface FieldSearchBoxSuggestion {
  value: string
  label: string
  /** Optional per-item accent color (e.g. pipeline status color). */
  color?: string
}

export interface FieldSearchBoxFilterChip {
  key: string
  field: string
  fieldLabel: string
  valueLabel: string
  /** Optional active color used for suggestion item indicators and chip tint. */
  color?: string
}

export interface FieldSearchBoxProps {
  fields: FieldSearchBoxField[]
  selectedField: string
  onFieldChange: (field: string) => void
  /** Suggestion options for each known field value. */
  suggestions: Record<string, FieldSearchBoxSuggestion[]>
  /** Currently selected values shown as chips (any field). */
  filters: FieldSearchBoxFilterChip[]
  onRemoveFilter: (index: number) => void
  onClearAll?: () => void
  onPickSuggestion: (field: string, suggestion: FieldSearchBoxSuggestion) => void
  onPickFreeText?: (field: string, text: string) => void
  /** Called when a quick-action dot is clicked. */
  onQuickAction?: (field: string) => void
  /** Whether the quick-action dot should be visible for the selected field. */
  showQuickActionFor?: (field: string) => boolean
  /** Optional active color for the quick-action dot. */
  quickActionColorFor?: (field: string) => string | undefined
  /** Optional function returning the active color for the given field's suggestions. */
  activeColorFor?: (field: string) => string | undefined
  listboxId?: string
  ariaSearchLabel?: string
  className?: string
  placeholderFor?: (field: string) => string
  style?: React.CSSProperties
}

export function FieldSearchBox({
  fields,
  selectedField,
  onFieldChange,
  suggestions,
  filters,
  onRemoveFilter,
  onClearAll,
  onPickSuggestion,
  onPickFreeText,
  placeholderFor,
  onQuickAction,
  quickActionColorFor,
  activeColorFor,
  listboxId = 'field-search-listbox',
  ariaSearchLabel = 'Search',
  className,
  style,
}: FieldSearchBoxProps) {
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const [closedBySelection, setClosedBySelection] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState<number>(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedFieldLabel =
    fields.find((f) => f.value === selectedField)?.label ??
    fields[0]?.label ??
    'Search'

  const existingValues = new Set<string>()
  filters.forEach((f) => {
    if (f.field === selectedField) existingValues.add(f.valueLabel)
  })
  // Also hide values whose raw key matches; chip keys are `${field}:${value}`.
  filters.forEach((f) => {
    if (f.field === selectedField) existingValues.add(f.key.split('::')[1] ?? f.valueLabel)
  })

  const rawSuggestions = suggestions[selectedField] ?? []
  const q = draft.trim().toLowerCase()
  const visible = rawSuggestions.filter((s) => {
    if (existingValues.has(s.value) || existingValues.has(s.label)) return false
    return !q || s.label.toLowerCase().includes(q) || s.value.toLowerCase().includes(q)
  })

  const open = focused && !closedBySelection && visible.length > 0
  const activeColor = activeColorFor?.(selectedField)
  const quickActionColor = quickActionColorFor?.(selectedField)
  const showQuickAction = onQuickAction && selectedField === 'favorites'

  useEffect(() => {
    setDraft('')
    setHighlightIndex(-1)
    setClosedBySelection(false)
  }, [selectedField])

  useEffect(() => {
    if (!open && focused && visible.length > 0) {
      // reopen dropdown if it closed but we're still focused and have visible suggestions
    }
  }, [visible.length, draft, open, focused])

  const pick = (s: FieldSearchBoxSuggestion) => {
    onPickSuggestion(selectedField, s)
    setDraft('')
    setHighlightIndex(-1)
    setClosedBySelection(true)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && open) {
      event.preventDefault()
      setHighlightIndex((i) => (i + 1) % visible.length)
    } else if (event.key === 'ArrowUp' && open) {
      event.preventDefault()
      setHighlightIndex((i) => (i - 1 + visible.length) % visible.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (open && highlightIndex >= 0 && visible[highlightIndex]) {
        pick(visible[highlightIndex])
      } else if (onPickFreeText && draft.trim()) {
        onPickFreeText(selectedField, draft.trim())
        setDraft('')
        setClosedBySelection(true)
      }
    } else if (event.key === 'Escape') {
      setDraft('')
      setFocused(false)
      setClosedBySelection(false)
      setHighlightIndex(-1)
    } else if (event.key === 'Backspace' && !draft && filters.length > 0 && onRemoveFilter) {
      onRemoveFilter(filters.length - 1)
    }
  }

  return (
    <div
      className={[styles.root, className].filter(Boolean).join(' ')}
      style={style}
    >
      <div className={styles.row}>
        <div className={`${styles.fieldSelect} searchFieldSelect`} data-testid="field-search-field-select">
          <Select
            value={selectedField}
            onChange={onFieldChange}
            options={fields}
            virtual={false}
            classNames={{ popup: { root: 'field-search-field-dropdown' } }}
          />
        </div>
        <input
          ref={inputRef}
          type="text"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={
            open && highlightIndex >= 0 ? `${listboxId}-option-${highlightIndex}` : undefined
          }
          className={styles.input}
          placeholder={placeholderFor?.(selectedField) ?? `Filter ${selectedFieldLabel.toLowerCase()}...`}
          value={draft}
          autoComplete="off"
          spellCheck={false}
          aria-label={ariaSearchLabel}
          onFocus={() => { setFocused(true); setClosedBySelection(false); setHighlightIndex(-1) }}
          onClick={() => { setFocused(true); setClosedBySelection(false); setHighlightIndex(-1) }}
          onBlur={() => { setFocused(false); setClosedBySelection(false) }}
          onChange={(event) => {
            setDraft(event.target.value)
            setFocused(true)
            setClosedBySelection(false)
            setHighlightIndex(-1)
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      {open && (
        <ul id={listboxId} className={styles.suggestList} role="listbox" aria-label="Search suggestions">
          {visible.map((s, index) => {
            const itemColor = s.color ?? activeColor
            return (
            <li
              key={s.value}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === highlightIndex}
              className={
                `${styles.suggestItem}` +
                `${itemColor ? ` ${styles.suggestItemColored}` : ''}` +
                `${index === highlightIndex ? ` ${styles.suggestItemActive}` : ''}`
              }
              style={itemColor ? ({ '--field-search-color': itemColor } as React.CSSProperties) : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(s)}
              onMouseEnter={() => setHighlightIndex(index)}
            >
              {s.label}
            </li>
            )
          })}
        </ul>
      )}

      {filters.length > 0 && (
        <div className={styles.chips}>
          {filters.map((c, index) => (
            <span
              key={c.key}
              className={
                `${styles.chip} filterChip` +
                `${c.color ? ` ${styles.chipColored}` : ''}`
              }
              style={c.color ? ({ '--field-search-color': c.color } as React.CSSProperties) : undefined}
            >
              <i>{c.fieldLabel}</i>
              {c.valueLabel}
              <button
                type="button"
                aria-label={`Remove filter ${c.valueLabel}`}
                onClick={() => onRemoveFilter(index)}
              >
                <CloseOutlined />
              </button>
            </span>
          ))}
          {onClearAll && (
            <button type="button" className={styles.clearAll} onClick={onClearAll}>
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default FieldSearchBox
