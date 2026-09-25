import type { ReactNode } from 'react'
import { AdminPageHead } from '../../../components/admin'

export default function ComingSoonPage({ title, text, icon }: { title: string; text: string; icon: ReactNode }) {
  return (
    <>
      <AdminPageHead title={title} />
      <div className="coming-soon card">
        <span className="coming-soon__icon">{icon}</span>
        <p className="coming-soon__badge">Coming soon</p>
        <h3 className="coming-soon__title">{title}</h3>
        <p className="muted-note">{text}</p>
      </div>
    </>
  )
}
