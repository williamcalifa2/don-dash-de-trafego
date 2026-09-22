/** Remove segredos de qualquer texto que vá para log, alerta ou resposta de erro. */

const PATTERNS: Array<[RegExp, string]> = [
  [/(access_token|client_secret|fb_exchange_token|input_token|app_secret)=([^&\s"']+)/gi, '$1=[REDACTED]'],
  [/(Bearer\s+)[A-Za-z0-9._\-|]+/gi, '$1[REDACTED]'],
  [/\bEAA[A-Za-z0-9]{20,}\b/g, '[REDACTED_TOKEN]'],
  [/"(access_token|client_secret)"\s*:\s*"[^"]*"/gi, '"$1":"[REDACTED]"'],
]

const SECRET_ENV = ['META_ACCESS_TOKEN', 'META_APP_SECRET', 'CRON_SECRET', 'DASHBOARD_SESSION_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_PASSWORD']

export function redact(text: string, extraSecrets: string[] = []): string {
  let out = String(text)
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep)
  const secrets = [...extraSecrets, ...SECRET_ENV.map(k => process.env[k] ?? '')].filter(s => s.length >= 8)
  for (const s of secrets) out = out.split(s).join('[REDACTED]')
  return out
}

/** Versão para dados pessoais (LGPD): nunca deixar nome, e-mail ou telefone em logs. */
export function redactPii(text: string): string {
  return String(text)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[TELEFONE]')
}
