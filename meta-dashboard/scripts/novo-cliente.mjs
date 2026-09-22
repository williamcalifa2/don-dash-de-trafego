#!/usr/bin/env node
// Gera o token de acesso de um cliente e o SQL para cadastrá-lo no Supabase.
// Uso:  node scripts/novo-cliente.mjs "Nome do Cliente" slug-do-cliente act_123456789 [id-da-pagina-facebook]
// Rodar de novo com o mesmo slug gera um token novo (o antigo deixa de funcionar).
import crypto from 'node:crypto'

const [name, slug, adAccount, pageId] = process.argv.slice(2)
if (!name || !slug || !adAccount) {
  console.error('Uso: node scripts/novo-cliente.mjs "Nome do Cliente" slug act_123456789 [id-da-pagina]')
  process.exit(1)
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error('O slug deve ter só letras minúsculas, números e hífen.')
  process.exit(1)
}

const token = crypto.randomBytes(24).toString('hex')
const hash = crypto.createHash('sha256').update(token).digest('hex')
const q = v => `'${String(v).replace(/'/g, "''")}'`
const account = adAccount.startsWith('act_') ? adAccount : `act_${adAccount.replace(/\D/g, '')}`

console.log(`
=== ${name} (${slug}) ===

TOKEN (mostrado só agora, guarde e envie ao cliente por canal seguro):
${token}

Link de acesso:
https://SEU-DOMINIO/?token=${token}
Link para a TV:
https://SEU-DOMINIO/?token=${token}&tv=1

SQL (rode no Supabase > SQL Editor):

insert into public.clients (slug)
select ${q(slug)} where not exists (select 1 from public.clients where slug = ${q(slug)});

update public.clients set
  display_name      = ${q(name)},
  ad_account_id     = ${q(account)},
  page_id           = ${pageId ? q(pageId) : 'null'},
  access_token_hash = ${q(hash)}
where slug = ${q(slug)};
`)
