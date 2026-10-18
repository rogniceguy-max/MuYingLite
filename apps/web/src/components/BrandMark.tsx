type BrandMarkProps = {
  className?: string
}

export function BrandMark({ className = '' }: BrandMarkProps) {
  return (
    <span className={`brand-mark ${className}`.trim()} aria-hidden="true">
      <img
        src="/brand/aqua-mark-256.webp"
        alt=""
        width={256}
        height={256}
        draggable={false}
        decoding="async"
      />
    </span>
  )
}
