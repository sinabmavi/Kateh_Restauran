// A short two-tone chime for new orders, synthesised with the Web Audio API so no audio file is needed.
let context: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  context ??= new Ctor()
  return context
}

/** Browsers only allow audio after a user gesture; call this from a click to unlock it. */
export async function unlockSound(): Promise<boolean> {
  const audio = getContext()
  if (!audio) return false
  if (audio.state === 'suspended') await audio.resume().catch(() => undefined)
  return audio.state === 'running'
}

export function playNewOrderChime(): void {
  const audio = getContext()
  if (!audio || audio.state !== 'running') return
  const now = audio.currentTime
  ;[
    { frequency: 880, offset: 0 },
    { frequency: 1174.66, offset: 0.22 },
    { frequency: 880, offset: 0.6 },
    { frequency: 1174.66, offset: 0.82 },
  ].forEach(({ frequency, offset }) => {
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, now + offset)
    gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.45)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(now + offset)
    oscillator.stop(now + offset + 0.5)
  })
}
