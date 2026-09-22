import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { EmptyState } from '../components/ui/primitives'
import { useDocumentMeta } from '../hooks/useDocumentMeta'

export default function NotFoundPage() {
  useDocumentMeta('Page not found')
  return (
    <div className="container page">
      <EmptyState
        icon={<Compass size={30} />}
        title="This table does not exist"
        text="The page you are looking for has moved or never was. Let us get you back to something delicious."
        action={
          <div className="result__actions">
            <Link to="/" className="btn btn--gold">
              Back home
            </Link>
            <Link to="/menu" className="btn btn--ghost">
              See the menu
            </Link>
          </div>
        }
      />
    </div>
  )
}
