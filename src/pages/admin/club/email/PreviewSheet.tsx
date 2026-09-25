import { useState } from 'react'
import { Monitor, Smartphone } from 'lucide-react'
import { Sheet } from '../../../../components/ui/Sheet'
import { useRequiredSettings } from '../../../../context/SettingsContext'
import type { EmailMessage } from '../../../../lib/marketing'
import { renderEmail } from '../../../../../supabase/functions/_shared/marketing.ts'

interface PreviewSheetProps {
  message: EmailMessage | null
  sampleName?: string | null
  senderName?: string | null
  onClose: () => void
}

/** Shows the email exactly as customers will receive it (same renderer as the real send). */
export function PreviewSheet({ message, sampleName, senderName, onClose }: PreviewSheetProps) {
  const settings = useRequiredSettings()
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile')
  const rendered = message
    ? renderEmail(message, { fullName: sampleName || 'Sara Ahmadi', email: 'sara@example.com' }, {
        restaurantName: settings.restaurant_name,
        siteUrl: 'https://kateh.io',
        address: settings.restaurant_address,
        phone: settings.restaurant_phone,
        unsubscribeUrl: 'https://kateh.io/unsubscribe',
      })
    : null

  return (
    <Sheet open={Boolean(message)} onClose={onClose} title="Preview" placement="bottom" wide flush>
      {rendered && (
        <div className="mk-preview">
          <div className="mk-preview__bar">
            <div className="mk-inbox">
              <span className="mk-inbox__from">{senderName || settings.restaurant_name}</span>
              <strong>{rendered.subject || 'Your subject line'}</strong>
              <span className="mk-inbox__pre">{rendered.preheader || 'Preview text'}</span>
            </div>
            <div className="segmented mk-device" role="group" aria-label="Preview size">
              <button type="button" className="segmented__option" aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}>
                <Smartphone size={14} /> Phone
              </button>
              <button type="button" className="segmented__option" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>
                <Monitor size={14} /> Desktop
              </button>
            </div>
          </div>
          <div className={`mk-preview__stage mk-preview__stage--${device}`}>
            <iframe title="Email preview" sandbox="" srcDoc={rendered.html} />
          </div>
          <p className="muted-note mk-preview__note">Shown for a sample customer, “{sampleName || 'Sara Ahmadi'}”. Each customer sees their own name.</p>
        </div>
      )}
    </Sheet>
  )
}
