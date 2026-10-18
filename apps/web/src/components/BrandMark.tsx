type BrandMarkProps = {
  className?: string
}

export function BrandMark({ className = '' }: BrandMarkProps) {
  return (
    <span className={`brand-mark ${className}`.trim()} aria-hidden="true">
      <svg viewBox="116 112 1020 1020" focusable="false" role="presentation">
        <path
          fill="currentColor"
          d="M847 247 L250 248 L251 856 L394 719 L391 385 L707 384 Z"
        />
        <path
          fill="currentColor"
          d="M1003 372 L858 517 L859 854 L528 855 L382 996 L1003 995 Z"
        />
      </svg>
    </span>
  )
}
