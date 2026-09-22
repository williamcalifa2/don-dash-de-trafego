# Textos para a análise do app na Meta (Dashboard Agência)

Cole cada bloco no campo correspondente. Estão em inglês porque os revisores da Meta trabalham em inglês.
Antes de enviar: criar um cliente de teste no painel (com uma conta de anúncios real de teste) e gerar o código de acesso dele; trocar `{TEST_CODE}` abaixo.

## URLs do app (Configurações do app → Básico)
- Privacy policy URL: `https://dashboard.dondigital.com.br/privacidade`
- User data deletion (instructions URL): `https://dashboard.dondigital.com.br/exclusao-de-dados`
- Category: Business and Pages (ou "Ferramentas de negócios")
- No Vercel, definir `PRIVACY_EMAIL` com o e-mail de contato de privacidade (aparece nas duas páginas).

## App description (uma vez)
Dashboard Agência is an internal reporting tool of Don Comunicação Digital, a digital marketing agency in Brazil. It reads (read-only) advertising performance, lead form contacts and organic Page/Instagram insights of the ad accounts, Pages and Instagram professional accounts that our clients have shared with our Business Manager, and shows each client only their own data in a private dashboard. The app never creates, edits, pauses or deletes ads, posts, comments or messages.

## Instructions for the reviewer
1. Open https://dashboard.dondigital.com.br/login?c=teste and enter the access code `{TEST_CODE}`.
2. "Métricas" tab: ad performance (spend, impressions, clicks, results) read from the Marketing API for the client's ad account. Use the period selector (Today, 7, 14, 30 days, This month).
3. "Leads" tab: contacts of people who submitted the client's lead ad forms (Lead Ads Retrieval).
4. All access is read-only. There is no button that publishes, edits or deletes anything on Meta.

## Permission justifications
- **ads_read** — Read ad account insights (spend, impressions, clicks, conversions) to show each client the performance of their own campaigns in the dashboard.
- **leads_retrieval** — Read the contact details submitted through the client's lead ad forms so the client's sales team can follow up. Data is shown only to that client.
- **pages_show_list** — List the Pages the system user can access, to link each client's Page to their dashboard.
- **pages_read_engagement** — Read Page content and engagement needed to retrieve lead forms and to show Page engagement metrics to the Page's owner.
- **read_insights** — Read Page insights (reach, views, followers, engagement) to show organic performance next to paid performance in the client's dashboard.
- **instagram_basic** — Read basic profile information and media of the client's linked Instagram professional account.
- **instagram_manage_insights** — Read Instagram account and media insights (reach, followers, interactions) to show organic performance. We do not publish or manage content.
- **public_profile** — Default permission, used only to identify the app admin.
- **Marketing API Access Tier (Standard)** — The app reads insights for around ten client ad accounts every 10–15 minutes. The development tier rate limit is too low for this legitimate reporting use. All calls are read-only, deduplicated and cached, with client-side rate limiting and a circuit breaker.

## Screencast script (2–3 min, no audio needed; add captions)
1. Show the login page and enter the test client code.
2. Métricas tab: point out spend/impressions/clicks and switch the period.
3. Leads tab: show a lead (name/phone) coming from a lead ad.
5. Show that no screen allows publishing/editing on Meta (read-only).
6. Show the privacy policy and data deletion pages.

## Enviar em duas etapas (recomendado)
A Meta exige ver, na gravação de tela, cada permissão em uso. O orgânico (read_insights, instagram_basic, instagram_manage_insights) ainda não tem tela no painel, então seria recusado.
- **Envio 1 (agora):** só o que já é usado (anúncios e leads) + Marketing API Access Tier. É o que sobe os limites de uso.
- **Envio 2 (depois de construir a aba Orgânico):** as três permissões de orgânico, com a gravação mostrando a aba. Para o envio 2, use o item "Orgânico" das instruções (acrescentar: 4. "Orgânico" tab: Page and Instagram insights) e o passo 4 do roteiro.

## O que remover do envio 1 (ícone de lixeira na tela "Envios de análise do app")
Remove só do envio, sem apagar do app:
- `read_insights`, `instagram_basic`, `instagram_manage_insights` (vão no envio 2)
- `instagram_business_manage_insights` e `instagram_business_basic` (versão "login do Instagram", que não usamos)
- `pages_manage_ads` e `ads_management` (escrita; o app só lê)
Manter no envio 1: ads_read, leads_retrieval, pages_show_list, pages_read_engagement, public_profile e Marketing API Access Tier.
Se a Meta recusar o "Marketing API Access Tier" por falta de ads_management, adicionar de volta e reenviar.
