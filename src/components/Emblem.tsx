/** Small cloche emblem: a serving dome inside a fine ring. */
export function Emblem({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden className="emblem">
      <circle cx="20" cy="20" r="18.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9.5 25.5h21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11.5 25.5a8.5 8.5 0 0 1 17 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="20" cy="14" r="1.6" fill="currentColor" />
      <path d="M8 29.5h24" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
    </svg>
  )
}
