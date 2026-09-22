/**
 * Logo do cliente. Pode ser um arquivo enviado (guardado como imagem pequena no próprio cadastro) ou, por compatibilidade, um link https.
 * O painel serve o arquivo por /api/logo/<cliente>, então nenhuma tela carrega a imagem inteira dentro de dados de cadastro.
 */
import crypto from 'node:crypto'

export const MAX_LOGO_CHARS = 250_000
const DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/

export type LogoInput = { ok: true; value: string | null; unchanged?: boolean } | { ok: false; error: string }

/** Valida o que chegou do formulário: vazio (remove), arquivo já reduzido, link https, ou "sem mudança". */
export function parseLogoInput(raw: unknown): LogoInput {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (!v) return { ok: true, value: null }
  if (v.startsWith('/api/logo/')) return { ok: true, value: null, unchanged: true } // o formulário devolveu o endereço do logo atual
  if (v.startsWith('data:')) {
    if (v.length > MAX_LOGO_CHARS) return { ok: false, error: 'A imagem ficou grande demais. Use uma menor.' }
    if (!DATA_URL.test(v)) return { ok: false, error: 'Formato de imagem não aceito. Use PNG, JPG ou WebP.' }
    return { ok: true, value: v }
  }
  if (/^https:\/\/\S+$/.test(v)) return { ok: true, value: v }
  return { ok: false, error: 'Envie uma imagem (PNG, JPG ou WebP).' }
}

/** Endereço público do logo para as telas: arquivo vira /api/logo/<cliente>?v=<versão>; link continua link. */
export function logoPublicUrl(slug: string, stored: string | null | undefined): string | null {
  if (!stored) return null
  if (!stored.startsWith('data:')) return stored
  const v = crypto.createHash('sha1').update(stored).digest('hex').slice(0, 8)
  return `/api/logo/${slug}?v=${v}`
}

export function decodeLogo(stored: string): { mime: string; bytes: Buffer } | null {
  const m = DATA_URL.exec(stored)
  return m ? { mime: `image/${m[1]}`, bytes: Buffer.from(m[2], 'base64') } : null
}
