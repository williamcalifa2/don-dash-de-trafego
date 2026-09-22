#!/usr/bin/env node
/**
 * Confere um token da Meta sem mostrar o token: é válido? de qual app? quando expira? quais permissões?
 * Testa também as duas versões da API (a do painel e a mais nova), para descobrir se a versão antiga parou de funcionar.
 * Rode no seu terminal:  node scripts/check-token.mjs   (cole o token quando pedir; ele não aparece na tela)
 */
const VERSIONS = ['v20.0', 'v26.0']

/** Lê uma linha do terminal sem mostrar o que é digitado. */
function ask(question) {
  return new Promise(resolve => {
    process.stdout.write(question)
    const stdin = process.stdin
    if (!stdin.isTTY) { stdin.setEncoding('utf8'); stdin.resume(); stdin.once('data', d => { stdin.pause(); resolve(String(d).trim()) }); return }
    let value = ''
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8')
    const onData = ch => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData); process.stdout.write('\n'); return resolve(value.trim()) }
        if (c === '') { process.stdout.write('\n'); process.exit(130) }
        if (c === '' || c === '\b') value = value.slice(0, -1)
        else value += c
      }
    }
    stdin.on('data', onData)
  })
}

const token = await ask('Cole o token (não aparece): ')
if (!token) { console.error('Faltou o token.'); process.exit(1) }
console.log(`\nTamanho: ${token.length} caracteres${/\s/.test(token) ? ' (ATENÇÃO: tem espaço ou quebra de linha dentro)' : ''}. Começa com "${token.slice(0, 3)}".\n`)

for (const v of VERSIONS) {
  const res = await fetch(`https://graph.facebook.com/${v}/debug_token?${new URLSearchParams({ input_token: token })}`, { headers: { Authorization: `Bearer ${token}` } })
  const json = await res.json().catch(() => ({}))
  console.log(`── API ${v} ──`)
  if (json.error) { console.log(`Erro da Meta: ${json.error.message} (código ${json.error.code}${json.error.error_subcode ? `/${json.error.error_subcode}` : ''})\n`); continue }
  const d = json.data ?? {}
  console.log(`Válido: ${d.is_valid ? 'sim' : 'NÃO'}${d.error?.message ? ` — ${d.error.message}` : ''}`)
  console.log(`Tipo: ${d.type ?? '?'} · App: ${d.app_id ?? '?'} · Usuário: ${d.user_id ?? '?'}`)
  console.log(`Expira: ${d.expires_at ? new Date(d.expires_at * 1000).toLocaleString('pt-BR') : d.expires_at === 0 ? 'não expira' : '?'}`)
  console.log(`Permissões: ${(d.scopes ?? []).join(', ') || '(nenhuma)'}\n`)
}
