type TextCellProps = {
  value: string
  onChange: (value: string) => void
  readOnly: boolean
  placeholder?: string
}

export function TextCell({
  value,
  onChange,
  readOnly,
  placeholder = '',
}: TextCellProps) {
  return (
    <input
      className="cell-input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      readOnly={readOnly}
      placeholder={placeholder}
      spellCheck={false}
    />
  )
}
