import { useRef, useState, type ChangeEvent } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import { errorMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

const BUCKET = 'site-images'
const MAX_BYTES = 10 * 1024 * 1024
const MAX_SIDE = 1920
const QUALITY = 0.85

function loadImage(file: File): Promise<{ image: HTMLImageElement; release: () => void }> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ image, release: () => URL.revokeObjectURL(url) })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This image could not be opened. Please use a JPG, PNG or WebP photo.'))
    }
    image.src = url
  })
}

function canvasBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY))
}

/** Scales the photo down to MAX_SIDE and re-encodes it (WebP, or JPEG where WebP encoding is unavailable). */
async function compress(file: File): Promise<Blob> {
  if (file.type === 'image/gif') return file
  const { image, release } = await loadImage(file)
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    let blob = await canvasBlob(canvas, 'image/webp')
    if (!blob || blob.type !== 'image/webp') {
      // JPEG has no transparency, so give transparent PNGs a white background instead of black.
      context.globalCompositeOperation = 'destination-over'
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      blob = await canvasBlob(canvas, 'image/jpeg')
    }
    return blob && blob.size < file.size ? blob : file
  } finally {
    release()
  }
}

function extension(type: string): string {
  if (type === 'image/webp') return 'webp'
  if (type === 'image/png') return 'png'
  if (type === 'image/gif') return 'gif'
  if (type === 'image/avif') return 'avif'
  return 'jpg'
}

interface ImageUploadProps {
  label?: string
  value: string
  onChange: (url: string) => void
  /** Folder inside the bucket, e.g. `menu` or `banners`. */
  folder: string
  hint: string
  onBusyChange?: (busy: boolean) => void
}

export function ImageUpload({ label = 'Image', value, onChange, folder, hint, onBusyChange }: ImageUploadProps) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const setWorking = (next: boolean) => {
    setBusy(next)
    onBusyChange?.(next)
  }

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file.')
    if (file.size > MAX_BYTES) return toast.error('That image is larger than 10 MB. Please choose a smaller one.')

    setWorking(true)
    try {
      const blob = await compress(file)
      const path = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension(blob.type)}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false })
      if (error) {
        if (/bucket not found/i.test(error.message)) throw new Error('Image uploads are not set up yet. Run 07_site_images_storage.sql in Supabase.')
        throw error
      }
      onChange(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl)
      toast.success('Image uploaded. Save to keep it.')
    } catch (failure) {
      toast.error(errorMessage(failure, 'The image could not be uploaded. Please try again.'))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="upload">
        <button type="button" className="btn btn--soft" disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlus size={17} /> {busy ? 'Uploading…' : value.trim() ? 'Change image' : 'Upload image'}
        </button>
        {value.trim() && (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => onChange('')}>
            <Trash2 size={16} /> Remove image
          </button>
        )}
        <input ref={input} type="file" accept="image/*" hidden onChange={(event) => void pick(event)} />
      </div>
      <p className="field__hint">{hint}</p>
    </div>
  )
}
