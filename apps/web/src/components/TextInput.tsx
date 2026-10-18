import type { InputHTMLAttributes } from 'react'

type TextInputProps = {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  autoFocus?: boolean
  error?: string | null
  className?: string
  inputProps?: InputHTMLAttributes<HTMLInputElement>
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoFocus,
  error,
  className = '',
  inputProps,
}: TextInputProps) {
  return (
    <label className={`field ${className}`}>
      {label ? <span className="field-label">{label}</span> : null}
      <input
        {...inputProps}
        className={`field-input ${error ? 'has-error' : ''}`}
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  )
}
