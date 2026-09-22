#!/usr/bin/env node
/**
 * Gera o token do usuário do sistema "dashboard-leitura" pela API da Meta (quando a tela do Business Manager não deixa).
 * Rode no seu terminal:  node scripts/generate-system-token.mjs
 *
 * Nada é gravado em arquivo e nada é mostrado por inteiro: o token novo vai direto para a área de transferência (Cmd+V no Vercel).
 * O token de administrador e o segredo do app são digitados aqui, sem aparecer na tela.
 */
import crypto from 'node:crypto'
import { execSync } from 'node:child_process'

const APP_ID = '4605822536338411' // Dashboard Agência
const SYSTEM_USER_ID = '61594600261804' // dashboard-leitura
const VERSION = 'v26.0'
// Só leitura. Sem ads_management, business_management ou pages_manage_*.
const SCOPES = ['ads_read', 'leads_retrieval', 'pages_show_list', 'pages_read_engagement', 'read_insights', 'instagram_basic', 'instagram_manage_insights']

/** Lê uma linha do terminal sem mostrar o que é digitado. */
function ask(question, { hidden = false } = {}) {
  return new Promise(resolve => {
    process.stdout.write(question)
    const stdin = process.stdin
    if (!hidden || !stdin.isTTY) {
      stdin.setEncoding('utf8'); stdin.resume()
      stdin.once('data', d => { stdin.pause(); resolve(String(d).trim()) })
      return
    }
    let value = ''
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8')
    const onData = ch => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData); process.stdout.write('\n'); return resolve(value.trim()) }
        if (c === '\u0003') { process.stdout.write('\n'); process.exit(130) }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1)
        else value += c
      }
    }
    stdin.on('data', onData)
  })
}

const mask = t => `${t.slice(0, 6)}…${t.slice(-4)} (${t.length} caracteres)`

async function post(path, params) {
  const res = await fetch(`https://graph.facebook.com/${VERSION}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, json }
}

console.log('\nGerar token do usuário do sistema\n')
console.log('Antes: no Graph API Explorer (https://developers.facebook.com/tools/explorer), escolha o app "Dashboard Agência",')
console.log('tipo "Token de usuário", adicione a permissão business_management, clique em "Gerar token de acesso" e copie.\n')

const adminToken = await ask('Cole o token do Explorer (não aparece): ', { hidden: true })
const secret = await ask('Cole a chave secreta do app (Configurações do app → Básico → Mostrar): ', { hidden: true })
if (!adminToken || !secret) { console.error('Faltou o token ou a chave secreta.'); process.exit(1) }
const sixty = (await ask('O token expira em 60 dias (recomendado pela Meta)? [S/n]: ')).toLowerCase() !== 'n'

const proof = crypto.createHmac('sha256', secret).update(adminToken).digest('hex')

// 1) Instala o app no usuário do sistema (se já estiver instalado, a Meta responde sem problema).
const inst = await post(`${SYSTEM_USER_ID}/applications`, { business_app: APP_ID, access_token: adminToken, appsecret_proof: proof })
console.log(inst.ok ? 'App instalado no usuário do sistema.' : `Instalação do app: ${inst.json?.error?.message ?? 'sem resposta'} (pode já estar instalado; seguindo)`)

// 2) Gera o token com as permissões de leitura.
const params = { business_app: APP_ID, scope: SCOPES.join(','), access_token: adminToken, appsecret_proof: proof }
if (sixty) params.set_token_expires_in_60_days = 'true'
const gen = await post(`${SYSTEM_USER_ID}/access_tokens`, params)
const token = gen.json?.access_token
if (!gen.ok || !token) {
  console.error(`\nNão gerou: ${gen.json?.error?.message ?? 'resposta sem token'}`)
  console.error('Me mande só esta mensagem de erro (nunca os tokens).')
  process.exit(1)
}

try { execSync('pbcopy', { input: token }); console.log(`\nToken gerado: ${mask(token)}\nJá está copiado. Cole no Vercel em META_ACCESS_TOKEN (Cmd+V).`) }
catch { console.log(`\nToken gerado: ${mask(token)}\nNão consegui copiar sozinho. Rode o script de novo num Mac, ou peça ajuda.`) }
console.log(`Permissões: ${SCOPES.join(', ')}`)
console.log(sixty ? 'Validade: 60 dias. Anote a data para gerar outro.' : 'Validade: sem expiração.')
