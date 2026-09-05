import { AutoComplete, Input } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useMemo, useState } from 'react'

interface SearchSuggestInputProps {
  value: string
  suggestions: string[]
  placeholder: string
  onChange: (value: string) => void
  className?: string
  style?: React.CSSProperties
  notFoundContent?: React.ReactNode
  inputName?: string
}

export default function SearchSuggestInput({
  value,
  suggestions,
  placeholder,
  onChange,
  className,
  style,
  notFoundContent,
  inputName,
}: SearchSuggestInputProps) {
  const [open, setOpen] = useState(false)
  const options = useMemo(() => {
    const seen = new Set<string>()
    const items: string[] = []
    for (const suggestion of suggestions) {
      const item = String(suggestion ?? '').trim()
      if (!item) continue
      const key = item.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      items.push(item)
    }
    return items.sort((a, b) => a.localeCompare(b)).map((item) => ({ value: item, label: item }))
  }, [suggestions])

  return (
    <AutoComplete
      value={value}
      options={options}
      open={open && options.length > 0}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onSelect={() => setOpen(false)}
      onOpenChange={setOpen}
      onChange={(nextValue) => {
        onChange(nextValue)
        setOpen(true)
      }}
      filterOption={(input, option) =>
        String(option?.value ?? '').toLowerCase().includes(String(input).toLowerCase())
      }
      notFoundContent={notFoundContent}
      className={`search-suggest ${className ?? ''}`.trim()}
      classNames={{ popup: { root: 'search-suggest-dropdown' } }}
      style={style}
    >
      <Input
        allowClear
        autoComplete="off"
        name={inputName}
        prefix={<SearchOutlined />}
        placeholder={placeholder}
      />
    </AutoComplete>
  )
}
