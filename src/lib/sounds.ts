import { withBase } from './paths'

type SoundId = 'nuevo' | 'listo'

const FILES: Record<SoundId, string> = {
  nuevo: 'sounds/nuevopedido.mp3',
  listo: 'sounds/ordenlista.mp3',
}

const players = new Map<SoundId, HTMLAudioElement>()

function getPlayer(id: SoundId) {
  let audio = players.get(id)
  if (!audio) {
    audio = new Audio(withBase(FILES[id]))
    audio.preload = 'auto'
    players.set(id, audio)
  }
  return audio
}

/** Desbloquea audio tras un gesto del usuario (requerido por el navegador). */
export function unlockSounds() {
  ;(['nuevo', 'listo'] as SoundId[]).forEach((id) => {
    const a = getPlayer(id)
    a.muted = true
    void a.play().then(() => {
      a.pause()
      a.currentTime = 0
      a.muted = false
    }).catch(() => {
      a.muted = false
    })
  })
}

export function playSound(id: SoundId) {
  try {
    const a = getPlayer(id)
    a.currentTime = 0
    void a.play().catch(() => {
      /* autoplay bloqueado hasta gesto */
    })
  } catch {
    /* ignore */
  }
}
