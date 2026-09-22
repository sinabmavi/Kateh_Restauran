import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

interface SectionHeaderProps {
  title: string
  eyebrow?: string
  action?: { label: string; to: string }
}

export function SectionHeader({ title, eyebrow, action }: SectionHeaderProps) {
  return (
    <header className="section-head">
      <div>
        {eyebrow && <p className="section-head__eyebrow">{eyebrow}</p>}
        <h2 className="section-head__title">{title}</h2>
      </div>
      {action && (
        <Link to={action.to} className="section-head__action">
          {action.label}
          <ArrowRight size={16} />
        </Link>
      )}
    </header>
  )
}
