#!/usr/bin/env node
// Transforma o token curto do Graph API Explorer em um token de longa duração (~60 dias),
// confere as permissões e copia o resultado para a área de transferência (sem mostrar o token).
// Uso: node scripts/token-longo.mjs
import fs from 'node:fs'
import readline from 'node:readline'
import { execSync } from 'node:child_process'

const env = fs.existsSync('.env.local')
  ? Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
  : {}
const secret = env.META_APP_SECRET
if (!secret) { console.error('META_APP_SECRET não encontrado no .env.local'); process.exit(1) }

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const short = await new Promise(r => rl.question('Cole o token curto do Graph API Explorer e aperte Enter: ', r))
rl.close()

const G = async (path) => { const r = await fetch(`https://graph.facebook.com/v20.0/${path}`); return r.json() }
const dbgShort = await G(`debug_token?input_token=${short.trim()}&access_token=${short.trim()}`)
const appId = dbgShort.data?.app_id
if (!appId) { console.error('Token curto inválido:', dbgShort.error?.message ?? 'não consegui ler o app'); process.exit(1) }

const ex = await G(`oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${secret}&fb_exchange_token=${short.trim()}`)
if (!ex.access_token) { console.error('Não consegui gerar o token longo:', ex.error?.message); process.exit(1) }

const dbg = await G(`debug_token?input_token=${ex.access_token}&access_token=${ex.access_token}`)
const scopes = dbg.data?.scopes ?? []
const need = ['leads_retrieval', 'pages_manage_ads', 'pages_manage_metadata', 'pages_show_list', 'pages_read_engagement', 'ads_read', 'ads_management']
console.log('\nApp:', dbg.data?.application, '| válido:', dbg.data?.is_valid, '| expira em:', dbg.data?.expires_at ? new Date(dbg.data.expires_at * 1000).toLocaleDateString('pt-BR') : 'nunca')
for (const s of need) console.log(scopes.includes(s) ? '  OK      ' : '  FALTA   ', s)

try { execSync('pbcopy', { input: ex.access_token }); console.log('\nToken longo COPIADO. Cole no Vercel em META_ACCESS_TOKEN (Cmd + V). Ele não foi mostrado na tela.') }
catch { console.error('\nNão consegui copiar automaticamente (pbcopy indisponível).') }
if (need.some(s => !scopes.includes(s))) console.log('\nAtenção: há permissões faltando. Volte ao Graph API Explorer, adicione as que faltam e gere de novo.')
