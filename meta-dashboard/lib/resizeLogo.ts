/** Prepara o arquivo de logo no navegador: reduz para caber em 256 px e devolve uma imagem pequena (PNG ou WebP). */
const OK_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const MAX_FILE = 8 * 1024 * 1024
const MAX_CHARS = 200_000

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não consegui abrir essa imagem.'))
    img.src = src
  })
}

export async function fileToLogoDataUrl(file: File): Promise<string> {
  if (!OK_TYPES.includes(file.type)) throw new Error('Use uma imagem PNG, JPG, WebP ou SVG.')
  if (file.size > MAX_FILE) throw new Error('O arquivo é grande demais (máximo 8 MB).')

  const url = URL.createObjectURL(file)
  try {
    const img = await load(url)
    const w0 = img.naturalWidth || 256, h0 = img.naturalHeight || 256
    const isSvg = file.type === 'image/svg+xml'
    for (const max of [256, 192, 128]) {
      // Imagens comuns não são ampliadas; SVG é vetorial e pode ser desenhado no tamanho máximo.
      const scale = isSvg ? max / Math.max(w0, h0) : Math.min(1, max / Math.max(w0, h0))
      const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Não consegui preparar a imagem.')
      ctx.drawImage(img, 0, 0, w, h)
      for (const [type, q] of [['image/png', undefined], ['image/webp', 0.9]] as const) {
        const out = canvas.toDataURL(type, q)
        if (out.startsWith(`data:${type}`) && out.length <= MAX_CHARS) return out
      }
    }
    throw new Error('A imagem ficou pesada demais. Tente uma versão mais simples.')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Versão quadrada (padrão 64 px) para o ícone da aba do navegador: a imagem inteira, centralizada, sem cortar nem esticar. */
export async function fileToIconDataUrl(file: File, size = 64): Promise<string> {
  if (!OK_TYPES.includes(file.type)) throw new Error('Use uma imagem PNG, JPG, WebP ou SVG.')
  const url = URL.createObjectURL(file)
  try {
    const img = await load(url)
    const w0 = img.naturalWidth || size, h0 = img.naturalHeight || size
    const scale = Math.min(size / w0, size / h0)
    const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale))
    const canvas = document.createElement('canvas')
    canvas.width = size; canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não consegui preparar a imagem.')
    ctx.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
