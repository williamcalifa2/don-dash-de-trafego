# Painel de Capacitação — Fras-le

Dashboard interno para acompanhar os 3 pilares do programa de capacitação de mecânicos, distribuidores e varejistas:

- **EAD** — capacitação a distância
- **Assistência Técnica** — atendimento, garantia e suporte de campo
- **Eventos & Trade** — feiras, treinamentos presenciais e ativação de canal

Cada pilar tem dados, gráficos e ranking por estado próprios. A Visão Geral consolida os 3 num funil único (Alcançados → Engajados → Capacitados → Convertidos).

## Como funciona (fluxo)

```
client (React/Vite, porta 5173)  ──HTTP──>  server (Express, porta 4001)  ──lê/escreve──>  server/data/*.json
```

1. O **client** é uma SPA React. Cada página (Visão Geral, EAD, Assistência Técnica, Eventos & Trade) busca seus dados via `fetch` em `src/lib/api.js`, que chama a API.
2. O **server** é uma API Express simples. Cada pilar tem um *repository* (`server/repositories/jsonRepository.js`) que lê e escreve um arquivo JSON em `server/data/`.
3. **Cadastro é real**: os botões "+ Novo Curso" / "+ Novo Chamado" / "+ Novo Evento" abrem um formulário, enviam um `POST` pra API, e a API **grava no arquivo JSON em disco** — não é só uma simulação visual. Os dados persistem entre reinicializações do servidor.
4. O filtro de período (3/6/12 meses/Tudo) na topbar filtra as séries mensais no servidor antes de devolver pro client.

### Por que JSON em arquivo e não banco de dados (por agora)

Cada repository expõe o mesmo contrato (`getAll`, `mutate`) que uma implementação futura sobre banco real (Postgres, Supabase etc.) precisa seguir. Trocar de arquivo JSON pra banco é só reimplementar `server/repositories/jsonRepository.js` — nenhuma rota ou componente de tela precisa mudar. Isso foi decidido para entregar rápido pra apresentação sem casar com uma infraestrutura de banco antes de validar com a equipe Fras-le.

## Identidade visual

Cores extraídas do site oficial da Fras-le (`fras-le.com`): vermelho `#ed3237`, azul institucional `#0d4b8a`, cinza `#4a4a4a`. Cada pilar tem uma cor fixa usada em toda a UI (navegação, gráficos, cards):

| Pilar | Cor |
|---|---|
| EAD | Azul institucional |
| Assistência Técnica | Vermelho da marca |
| Eventos & Trade | Dourado |

Tipografia: Sora (títulos), IBM Plex Sans (texto), IBM Plex Mono (números — efeito "painel de instrumento" para reforçar precisão).

## Rodando localmente

```bash
# Terminal 1 — API
cd server
npm install
npm run dev      # http://localhost:4001

# Terminal 2 — Dashboard
cd client
npm install
npm run dev      # http://localhost:5173
```

## Estrutura

```
server/
  data/                  mock data realista (JSON), um arquivo por pilar
  repositories/          camada de acesso a dados (trocável por banco)
  routes/pillars.js      endpoints GET (consulta) e POST (cadastro)
  index.js               bootstrap do Express

client/
  src/components/        Sidebar, Topbar, KpiCard, Panel, RankingTable, Modal, Toast...
  src/pages/              Overview, Ead, AssistenciaTecnica, EventosTrade
  src/lib/                api.js (chamadas HTTP), pillars.js (cores/labels), chartTheme.js
  src/styles/theme.css    design tokens (cores, fontes, espaçamento)
```

## Próximos passos sugeridos

- Trocar os dados mock por integração real: LMS (EAD), sistema de chamados (Assistência Técnica), CRM/planilha de eventos (Trade).
- Quando o uso virar contínuo pela equipe, migrar `jsonRepository.js` para um repository sobre banco (ex: Supabase) — login/autenticação também entra nesse momento.
- Adicionar exportação de relatório em PDF (hoje o botão "Exportar" aciona impressão do navegador).
