#!/usr/bin/env node
/**
 * Troca o token curto do Graph API Explorer por um token de 60 dias (anúncios, leads e orgânico usam o mesmo, da sua conta).
 * Rode no seu terminal:  node scripts/generate-organic-token.mjs
 *
 * Nada é gravado em arquivo e o token novo não aparece por inteiro: vai direto para a área de transferência (Cmd+V no Vercel).
 */
import { execSync } from 'node:child_process'

const APP_ID = '4605822536338411' // Dashboard Agência
const VERSION = 'v26.0'
// Só leitura de Página e Instagram. O Explorer deve ter SÓ estas marcadas (sem ads_management, pages_manage_*, business_management).
const NEEDED = ['pages_show_list', 'pages_read_engagement', 'read_insights', 'instagram_basic', 'instagram_manage_insights']
const FORBIDDEN = /^(ads_management|business_management|pages_manage_|pages_messaging|instagram_content_publish|instagram_manage_comments|instagram_manage_messages|publish_)/

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

const mask = t => `${t.slice(0, 6)}…${t.slice(-4)} (${t.length} caracteres)`
const get = async (path, params) => {
  const res = await fetch(`https://graph.facebook.com/${VERSION}/${path}?${new URLSearchParams(params)}`)
  return { ok: res.ok, json: await res.json().catch(() => ({})) }
}

console.log('\nToken de 60 dias (anúncios, leads e orgânico)\n')
console.log('Antes: no Graph API Explorer (https://developers.facebook.com/tools/explorer), app "Dashboard Agência", Token de usuário,')
console.log(`marque: ${NEEDED.join(', ')} e MANTENHA as que já usamos (ads_management, ads_read, business_management, leads_retrieval, pages_manage_ads).`)
console.log('Clique em "Generate Access Token". Na janela do Facebook NÃO desligue nenhuma permissão e escolha TODAS as Páginas e contas do Instagram:')
console.log('o acesso é da sua conta e vale para todos os tokens do app; desligar algo ali derruba a coleta de leads e anúncios.\n')

const short = await ask('Cole o token do Explorer (não aparece): ')
const secret = await ask('Cole a chave secreta do app (Configurações do app → Básico → Mostrar): ')
if (!short || !secret) { console.error('Faltou o token ou a chave secreta.'); process.exit(1) }

const ex = await get('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: APP_ID, client_secret: secret, fb_exchange_token: short })
const token = ex.json?.access_token
if (!ex.ok || !token) {
  console.error(`\nNão gerou: ${ex.json?.error?.message ?? 'resposta sem token'}\nMe mande só esta mensagem (nunca os tokens).`)
  process.exit(1)
}

// Confere as permissões do token novo antes de copiar.
const dbg = await get('debug_token', { input_token: token, access_token: `${APP_ID}|${secret}` })
const scopes = dbg.json?.data?.scopes ?? []
const missing = NEEDED.filter(s => !scopes.includes(s))
const extra = scopes.filter(s => FORBIDDEN.test(s))
if (extra.length) console.warn(`\nAviso: a sua conta concedeu ao app também permissões de escrita (${extra.join(', ')}). O sistema só usa leitura neste token; isso é do acesso da conta e é esperado.`)
if (missing.length) console.warn(`\nAtenção: faltam estas permissões no token: ${missing.join(', ')}. Gere de novo marcando-as.`)

const days = ex.json?.expires_in ? Math.round(ex.json.expires_in / 86400) : null
try {
  execSync('pbcopy', { input: token })
  console.log(`\nToken gerado: ${mask(token)}\nJá está copiado. Cole no Vercel em META_ACCESS_TOKEN (Cmd+V) e APAGUE META_ORGANIC_TOKEN, se existir. Mantenha META_ACCEPTED_WRITE_SCOPES.`)
} catch {
  console.log(`\nToken gerado: ${mask(token)}\nNão consegui copiar sozinho.`)
}
console.log(`Permissões: ${scopes.join(', ') || '(não consegui ler)'}`)
console.log(days ? `Validade: cerca de ${days} dias. Anote a data para gerar outro.` : 'Validade: não informada pela Meta.')
