# Integração com a Meta: como funciona e como operar

Regra de ouro: **na dúvida, não chama a Meta.** O painel só lê o banco; um worker lento e limitado é o único que fala com a Meta, sempre por um cliente central somente-leitura.

## Peças (todas em `lib/meta/`)

| Arquivo | Papel |
|---|---|
| `client.ts` | ÚNICO ponto de saída para a Graph API. Só GET (POST só em `/batch` com GETs). Token no cabeçalho. Timeout. Retry só de rede/5xx (máx. 2, backoff+jitter), nunca de limite/permissão/token. Lê e grava os headers de uso. Single-flight. DRY_RUN. |
| `allowlist.ts` | Endpoints, campos e parâmetros permitidos. Qualquer coisa fora dá erro antes de sair da aplicação e fica registrada. |
| `limits.ts` | Gate antes de cada chamada + leitura da resposta depois: breaker por conta, escalonamento 1x/2x/3x em 24 h, kill switch global com retomada gradual, tetos por conta/hora e por app/hora, orçamento interno, pausa por conta/geral, alertas. |
| `tokenCheck.ts` | `debug_token` diário: token válido? escopo de escrita? expira em quantos dias? versão da API perto do fim? |
| `queue.ts` / `queueStore.ts` | Fila no Postgres: dedupe, 1 job rodando por conta, concorrência global, lease, tentativas, dead-letter (nunca reprocessa sozinha). |
| `orchestrator.ts` | Ciclo do cron: trava, token, worker, enfileiramento por TTL com estagger e teto por ciclo, frequência adaptativa, fases. |
| `collectors.ts` | Coletores incrementais no nível da CONTA (nunca laço por campanha/anúncio). |
| `read.ts` / `snapshots.ts` | O painel lê daqui (tabela `meta_snapshots`). |
| `webhook.ts` | Leads em tempo real: assinatura, guarda só IDs, responde 200, processa depois, idempotente. |
| `status.ts` | Estado agregado (health e painel admin). |
| `retention.ts` | Higiene de dados / LGPD. |
| `legacy.ts` | Ponte temporária dos caminhos antigos (painel chamando ao vivo). Some no corte final. |

## Piloto automático (sem ligar nem pausar nada)

O sistema conduz sozinho o rollout. Ninguém liga conta, muda fase nem troca variável.

1. **Fase 0 (simulação):** nada é chamado de verdade no pipeline; grava o volume previsto. O painel dos clientes segue no modo antigo.
2. **Avanço:** depois de `META_AUTOPILOT_STAGE_HOURS` (48 h) de observação LIMPA (zero erros de limite, uso abaixo de `META_ADVANCE_PEAK_PCT`=30%, token válido, sem kill switch nem conta suspensa, com dados), passa para a fase 1 (1 conta), depois 2 (até 5) e 3 (todas). Toda conta com anúncios entra sozinha, na ordem estável.
3. **Corte final:** na fase 3 estável, com dados frescos em todas as contas, o painel passa a ler só do banco.
4. **Recuo:** qualquer erro de limite, kill switch, conta suspensa ou uso no limiar recua uma etapa (ou desfaz o corte) e recomeça a observação. Avisa por `ALERT_WEBHOOK_URL`.
5. **Conta suspensa** (3 bloqueios em 24 h) volta sozinha, em observação, após `META_SUSPEND_AUTO_RELEASE_HOURS` (24 h; 0 = só manual).
6. Tempo total do zero ao corte: cerca de 8 dias (4 etapas de 48 h).

`META_AUTOPILOT=false` desliga tudo isso e devolve o controle às variáveis `META_DRY_RUN`, `META_SYNC_PHASE` e `META_LEGACY_LIVE`.

Pré-requisito único: o token sem escopo de escrita, ou os escopos aceitos em `META_ACCEPTED_WRITE_SCOPES`.

Sem tela de administração. Para emergência existem `GET /api/internal/health` (com `Authorization: Bearer <CRON_SECRET>`) e `POST /api/admin/meta` (pausar tudo, liberar kill switch, pausar/liberar conta, reabrir job morto).

Cron externo: `GET /api/cron/sync` a cada 10 min, preferindo o cabeçalho `Authorization: Bearer <CRON_SECRET>`.

## Variáveis de ambiente (padrão conservador)

**Modo e segurança**
`META_AUTOPILOT=true` · `META_AUTOPILOT_STAGE_HOURS=48` · `META_AUTOPILOT_CHECK_MIN=60` · `META_ADVANCE_PEAK_PCT=30` · `META_SUSPEND_AUTO_RELEASE_HOURS=24` · (pontos de partida, valem só com o piloto desligado:) `META_DRY_RUN=true` · `META_SYNC_PHASE=0` · `META_PHASE1_MAX_ACCOUNTS=1` · `META_PHASE2_MAX_ACCOUNTS=5` · `META_PHASE3_MAX_ACCOUNTS=10000` · `META_LEGACY_LIVE=true` · `META_WRITE_SCOPES=ads_management,business_management,pages_manage_ads,pages_manage_metadata,pages_manage_posts,pages_manage_engagement,manage_pages,publish_pages` · `META_ACCEPTED_WRITE_SCOPES=` (vazio)

**API**
`META_API_VERSION=v20.0` · `META_API_DEPRECATION_DATE=` (defina a data oficial de desativação) · `META_API_DEPRECATION_WARN_DAYS=60` · `META_GRAPH_URL=https://graph.facebook.com`

**HTTP**
`META_HTTP_TIMEOUT_MS=15000` · `META_NET_RETRIES=2` (teto 2) · `META_BACKOFF_BASE_MS=500` · `META_BACKOFF_MAX_MS=8000` · `META_RETRY_STATUSES=502,503,504` · `META_PAGE_SIZE=100` · `META_MAX_PAGES_PER_JOB=8` · `META_BATCH_MAX=25`

**Limites**
`META_RATE_LIMIT_CODES=4,17,613,80000,80004,80005` · `META_USAGE_THRESHOLD_PCT=60` · `META_APP_USAGE_THRESHOLD_PCT=60` · `META_BLOCK_MARGIN_SEC=120` · `META_BLOCK_DEFAULT_WAIT_SEC=900` · `META_BLOCK_WINDOW_HOURS=24` · `META_BLOCK_MAX_PER_WINDOW=3` · `META_BLOCK_REPEAT_MULTIPLIER=2` · `META_BLOCK_MAX_WAIT_SEC=21600` · `META_FREQ_MULTIPLIER_MAX=8` · `META_KILL_SWITCH_MINUTES=30` · `META_RESUME_STEP_SEC=120`

**Tetos e orçamento**
`META_MAX_CALLS_PER_ACCOUNT_HOUR=60` · `META_MAX_CALLS_PER_APP_HOUR=300` · `META_INTERNAL_BUDGET_PCT=40` · `META_BUDGET_BASE=300` · `META_BUDGET_PER_ACTIVE_AD=40` (estimativa provisória: confirme na documentação da Meta para o seu nível de acesso)

**TTLs e janelas**
`META_TTL_INSIGHTS_MIN=45` · `META_TTL_STRUCTURE_MIN=480` · `META_TTL_LEADS_RECONCILE_MIN=10` · `META_COLD_PRESET_TTL_MULT=4` · `META_INSIGHTS_WINDOW_DAYS=3` (3 ou 7) · `META_LEADS_OVERLAP_MIN=10` · `META_IDLE_ACCOUNT_CHECK_HOURS=24` · `META_OFF_HOURS_INTERVAL_MULTIPLIER=4` · `META_BUSINESS_HOURS_START=7` · `META_BUSINESS_HOURS_END=22` · `META_BUSINESS_TIMEZONE=America/Sao_Paulo`

**Orquestração**
`META_WORKER_CONCURRENCY=2` · `META_WORKER_BUDGET_SEC=30` · `META_JOB_MAX_ATTEMPTS=3` · `META_JOB_RETRY_BASE_SEC=300` · `META_JOB_RETRY_MAX_SEC=3600` · `META_JOB_LEASE_SEC=120` · `META_JOB_STAGGER_MAX_SEC=240` · `META_MAX_ENQUEUE_PER_CYCLE=4` · `META_CRON_LOCK_SEC=240` · `META_MANUAL_REFRESH_COOLDOWN_SEC=600`

**Observabilidade e dados**
`ALERT_WEBHOOK_URL=` (Slack/Discord/n8n) · `META_ALERT_DEDUPE_MIN=60` · `META_BUDGET_ALERT_PCT=50` · `META_TOKEN_EXPIRY_ALERT_DAYS=10` · `META_TOKEN_CHECK_MAX_AGE_HOURS=36` · `META_USAGE_RETENTION_DAYS=30` · `META_LEADS_RETENTION_DAYS=0` (0 = nunca apaga leads; só apague se decidir a política LGPD)

(Os nomes exatos e demais chaves estão em `lib/meta/config.ts`.)

## Testes
`npm test` (sem rede real: qualquer `fetch` não simulado falha o teste). Cobre allowlist, bloqueio de escrita, redação de segredos, retry/backoff, timeout, DRY_RUN, single-flight, breaker/escalonamento/kill switch/retomada, tetos, TTL, trava do cron, reinício sem rajada, dead-letter, webhook (assinatura/idempotência), leitura do banco e pipeline ponta a ponta com a Meta simulada. Um teste falha se `graph.facebook.com` aparecer fora de `lib/meta/`.

## Tipos de cliente (formulário, site e conversas)
O painel detecta sozinho o que cada conta gera, sem configuração: `lib/resultKind.ts`.
- **Formulário** (padrão): leads com nome/telefone, CRM, Retorno, Leads.
- **Site**: evento Lead do pixel (`offsite_conversion.fb_pixel_lead`).
- **Conversas**: `onsite_conversion.messaging_conversation_started_7d`.
- **Misto**: mais de um tipo relevante (nenhum com 75% dos resultados).

Para site/conversas a Meta não entrega quem é a pessoa, então não existe lead individual. O painel troca os rótulos ("Conversas", "Custo/Conversa"), usa o resultado real na tabela de campanhas, no funil, no gráfico diário, no relatório e no modo TV, e esconde as abas Leads e Retorno se o cliente não tem leads no CRM. Vendas desses clientes seguem pelo "Conversões manuais" do Funil.
O coletor de leads não gasta chamadas nem falha para cliente sem página/formulário: reconfere 1x por dia.

## Aba "Público" (origem e perfil dos resultados)
Recortes (breakdowns) de insights no nível da conta, somente leitura: plataforma (Facebook, Instagram...), dispositivo, hora, idade+gênero e região, para 7, 14 e 30 dias. Coletados pelo mesmo job de insights, a cada `META_TTL_AUDIENCE_MIN` (180 min), 5 consultas por período. Guardados em `meta_snapshots` (kind `audience`). Antes do corte automático, se o banco ainda não tem o cliente, a rota `/api/meta/audience` faz 5 consultas e guarda 30 min em memória. "Resultados por plataforma" usa as ações da própria Meta (formulário, site ou conversas).

## Ajustes da rodada de QA (2026-09-21)
- SQL novo: `supabase/2026-09-manual-leads.sql` (coluna `leads.manual`). Sem ele tudo funciona; "Todos os leads" usa o critério antigo (sem `meta_lead_id`).
- Login do admin agora bloqueia por IP (8 falhas) e no total (40) em 15 min, guardado em `meta_settings` (`admin_login_fails`).
- Cabeçalhos de segurança em `next.config.ts` (não embutir em iframe, nosniff, referrer, HSTS).
- Prévia de anúncio: só o iframe da Meta (facebook/instagram, https) é aceito (`lib/adPreview.ts`).
- Telefone manual vira `+55DDD...`; aviso de telefone repetido ao cadastrar lead.
- ESLint: `npm run lint`.

## Várias telas abertas ao mesmo tempo (modo ao vivo)
- `lib/meta/legacy.ts`: a mesma consulta (mesmo cliente, conta e caminho) vira UMA chamada. Pedidos simultâneos compartilham a resposta em andamento e respostas boas ficam guardadas por `META_LEGACY_CACHE_SEC` (padrão 240 s; 0 desliga). Erros não são guardados; leads e webhooks não usam cache. O cache é por instância do servidor.
- "Atualizar" descarta o cache do cliente, no máximo 1 vez por minuto.
- Reconferência de leads (`/api/leads/sync`): no máximo 1 a cada 2 min por cliente, mesmo com várias abas.
- Tela: a atualização dos números (5 min) tem variação de ±10% e pausa com a aba escondida (`lib/usePoll.ts`).
- No modo final (leitura só do banco) nada disso é usado.

## Orgânico (Página do Facebook e Instagram)
- Token próprio: `META_ORGANIC_TOKEN` (usuário, só leitura: pages_show_list, pages_read_engagement, read_insights, instagram_basic, instagram_manage_insights). Vale 60 dias; gerar outro com `node scripts/generate-organic-token.mjs`.
- Fora da fila de anúncios (não precisa de SQL): uma vez por dia: a partir das `META_ORGANIC_HOUR` (4, horário de Brasília) o cron atualiza `META_ORGANIC_PER_CYCLE` (1) conta por ciclo de 10 min até todas terem o dado do dia anterior (~3h20 para 20 contas). Cliente novo entra no mesmo dia; o botão "Atualizar orgânico" do admin força na hora. Código em `lib/meta/organic.ts`; leitura em `lib/meta/organicRead.ts`; tela em `components/OrganicTab.tsx`; API `GET /api/meta/organic`.
- Página: a cadastrada no cliente ou, se a conta de anúncios promove só uma, essa. O Instagram vem da Página (instagram_business_account).
- Só leitura (allowlist): insights de Página/Instagram, published_posts, media, stories e insights de post/mídia.
- Admin e equipe têm o botão "Atualizar orgânico" na aba (no máximo 1 a cada 30 s por cliente).
- Guardado em `meta_snapshots` (tipo `organic`, chave `all`). O token da Página nunca é gravado.

## Níveis de acesso da equipe
- Dono (login por ADMIN_EMAIL) > **Administrador** > **Membro** > **Leitor**. Guardado em `admin_team` (meta_settings); convite sem nível vale "membro".
- Leitor: só vê painéis e números; nada de atualizar, editar leads ou cadastrar. Membro: atualiza (Atualizar tudo, Atualizar), trata leads e personaliza cards. Administrador: cria/edita clientes, tokens, marca, equipe (menos outros administradores). Só o dono cria, muda ou remove administradores.
- Enforçado no servidor (`requireRole` em `lib/admin.ts`, `denyReader` nas rotas de leads/atualização); a tela só esconde o que a pessoa não pode usar. Mudança de nível vale em até 15 s para sessões abertas.

## Erro de limite do app (código 4): isolado ou geral
- Um código 4 **isolado** (uso do app abaixo de `META_APP_ERROR_GLOBAL_PCT`=30%) só coloca a conta que errou em espera curta (`META_SOFT_BLOCK_MIN`=10 min). Não conta como bloqueio (não dobra espera, não suspende) e o resto do sistema segue.
- Vira **kill switch geral** se o uso do app estiver alto, se houver `META_APP_ERROR_REPEAT`=3 erros código 4 (de qualquer conta) em `META_APP_ERROR_WINDOW_MIN`=60 min, ou se o erro vier sem conta identificada.
- O alerta guarda código, subcódigo, mensagem, endpoint e uso (%) da Meta em `meta_alerts.data`, e o motivo também aparece no texto do alerta e em `lastError` da conta.
