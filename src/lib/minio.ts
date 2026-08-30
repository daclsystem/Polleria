import { API_URL, apiUrl } from './api'

export type MediaFolder = 'products' | 'audio' | 'media' | 'branding' | 'docs' | 'deliveries'

/** Preferir token staff; si no, token conductor (foto de entrega) */
function authToken(): string | null {
  try {
    return (
      localStorage.getItem('polleria-token-staff') ||
      localStorage.getItem('polleria-api-token') ||
      localStorage.getItem('chifa-lopez-token') ||
      localStorage.getItem('polleria-token') ||
      localStorage.getItem('polleria-token-driver')
    )
  } catch {
    return null
  }
}

/**
 * Sube multimedia a MinIO vía API Polleria (bucket independiente `pollerialopez`).
 * No usa el bucket chaskidriver.
 */
export async function uploadToMinio(
  file: File,
  options?: {
    folder?: MediaFolder
    onProgress?: (percent: number) => void
    publicUpload?: boolean
  },
): Promise<string> {
  if (!import.meta.env.DEV && !API_URL) {
    throw new Error('VITE_API_URL no configurada — no se puede subir a MinIO')
  }

  const form = new FormData()
  form.append('file', file)
  form.append('folder', options?.folder || 'media')

  const token = authToken()
  const path = options?.publicUpload || !token ? '/api/media/upload-public' : '/api/media/upload'

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', apiUrl(path))
    if (token && !options?.publicUpload) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    }
    if (options?.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) options.onProgress!(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}') as { url?: string; error?: string }
        if (xhr.status >= 200 && xhr.status < 300 && data.url) {
          options?.onProgress?.(100)
          resolve(data.url)
        } else {
          reject(new Error(data.error || `Upload falló HTTP ${xhr.status}`))
        }
      } catch {
        reject(new Error(`Upload falló HTTP ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error('Error de red al subir'))
    xhr.send(form)
  })
}

export function uploadProductImage(file: File, onProgress?: (n: number) => void) {
  return uploadToMinio(file, { folder: 'products', onProgress, publicUpload: true })
}

export function uploadAudio(file: File, onProgress?: (n: number) => void) {
  return uploadToMinio(file, { folder: 'audio', onProgress, publicUpload: true })
}

export function uploadDeliveryPhoto(file: File, onProgress?: (n: number) => void) {
  return uploadToMinio(file, { folder: 'deliveries', onProgress })
}

export function uploadAvatar(file: File, onProgress?: (n: number) => void) {
  return uploadToMinio(file, { folder: 'media', onProgress, publicUpload: true })
}
