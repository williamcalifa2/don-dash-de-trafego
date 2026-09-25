import { describe, expect, it } from 'vitest'
import {
  cleanLabel,
  deviceOf,
  fmtDuration,
  topElements,
  heatBins,
  isOnline,
  normalizeBeat,
  summarizeUsage,
  usageSince,
  viewLabel,
  focusClient,
  buildVisits,
  MAX_DELTA_SEC,
  ONLINE_MS,
  type SessionRow,
  type ViewRow,
  type Beat,
} from '@/lib/usage'

const BASE_TIME = Date.parse('2026-09-24T18:00:00.000Z')
const secAgo = (s: number) => new Date(BASE_TIME - s * 1000).toISOString()

describe('Test Master — Privacy & Sanitization (cleanLabel)', () => {
  it('permite rótulos textuais legítimos de botões e abas', () => {
    expect(cleanLabel('Salvar alterações')).toBe('Salvar alterações')
    expect(cleanLabel('Novo lead')).toBe('Novo lead')
    expect(cleanLabel('Exportar CSV')).toBe('Exportar CSV')
    expect(cleanLabel('Filtrar')).toBe('Filtrar')
  })

  it('normaliza múltiplos espaços e quebras de linha em espaço simples', () => {
    expect(cleanLabel('  Salvar \n\t  dados   ')).toBe('Salvar dados')
  })

  it('rejeita rigorosamente qualquer string que contenha e-mail (evita vazamento de PII)', () => {
    expect(cleanLabel('joao@empresa.com')).toBeNull()
    expect(cleanLabel('Contato: admin@don.digital')).toBeNull()
    expect(cleanLabel('email@test')).toBeNull()
  })

  it('rejeita números longos com 5 ou mais dígitos consecutivos (telefones, CPFs, cartões)', () => {
    expect(cleanLabel('12345')).toBeNull()
    expect(cleanLabel('Tel 99887766')).toBeNull()
    expect(cleanLabel('Cliente 12345678900')).toBeNull()
    // Mas aceita números curtos normais em rótulos (como "Aba 1", "Passo 2")
    expect(cleanLabel('Passo 2')).toBe('Passo 2')
    expect(cleanLabel('Top 10')).toBe('Top 10')
  })

  it('rejeita strings com mais de 40 caracteres para não poluir o banco', () => {
    const exactly40 = 'a'.repeat(40)
    const exactly41 = 'a'.repeat(41)
    expect(cleanLabel(exactly40)).toBe(exactly40)
    expect(cleanLabel(exactly41)).toBeNull()
  })

  it('rejeita tipos inválidos (null, undefined, boolean, objetos, números)', () => {
    expect(cleanLabel(null)).toBeNull()
    expect(cleanLabel(undefined)).toBeNull()
    expect(cleanLabel(12345)).toBeNull()
    expect(cleanLabel({})).toBeNull()
    expect(cleanLabel([])).toBeNull()
    expect(cleanLabel('')).toBeNull()
    expect(cleanLabel('   ')).toBeNull()
  })
})

describe('Test Master — Device Classification (deviceOf)', () => {
  it('classifica limites exatos de largura de tela de acordo com os breakpoints', () => {
    // Desktop >= 1024
    expect(deviceOf(1920)).toBe('desktop')
    expect(deviceOf(1280)).toBe('desktop')
    expect(deviceOf(1024)).toBe('desktop')

    // Tablet >= 640 e < 1024
    expect(deviceOf(1023)).toBe('tablet')
    expect(deviceOf(820)).toBe('tablet')
    expect(deviceOf(768)).toBe('tablet')
    expect(deviceOf(640)).toBe('tablet')

    // Mobile < 640
    expect(deviceOf(639)).toBe('mobile')
    expect(deviceOf(390)).toBe('mobile')
    expect(deviceOf(320)).toBe('mobile')
    expect(deviceOf(0)).toBe('mobile')
  })
})

describe('Test Master — Beat Normalization & Security (normalizeBeat)', () => {
  const validBase = {
    sid: 'session123456',
    view: 'campaigns',
    client: 'cliente-alfa',
    w: 1280,
    entries: [{ client: 'cliente-alfa', view: 'campaigns', delta: 15 }],
    clicks: [{ sel: 'button#save', rx: 0.5, ry: 0.5, label: 'Salvar' }],
  }

  it('valida payload perfeito', () => {
    const res = normalizeBeat(validBase)
    expect(res).not.toBeNull()
    expect(res?.sid).toBe('session123456')
    expect(res?.device).toBe('desktop')
    expect(res?.entries).toHaveLength(1)
    expect(res?.clicks).toHaveLength(1)
    expect(res?.clicks[0]).toEqual({
      sel: 'button#save',
      rx: 0.5,
      ry: 0.5,
      view: null,
      client: null,
      label: 'Salvar',
    })
  })

  it('impõe teto máximo de delta por batimento (MAX_DELTA_SEC)', () => {
    const payload = {
      ...validBase,
      entries: [{ client: 'cliente-alfa', view: 'campaigns', delta: 9999 }],
    }
    const res = normalizeBeat(payload)
    expect(res?.entries[0].delta).toBe(MAX_DELTA_SEC)
  })

  it('descarta entradas com deltas negativos ou não numéricos', () => {
    const payload = {
      ...validBase,
      entries: [
        { client: 'cliente-alfa', view: 'campaigns', delta: -10 },
        { client: 'cliente-alfa', view: 'campaigns', delta: 0 },
        { client: 'cliente-alfa', view: 'campaigns', delta: 'dez' },
        { client: 'cliente-alfa', view: 'campaigns', delta: 12 },
      ],
    }
    const res = normalizeBeat(payload)
    expect(res?.entries).toHaveLength(1)
    expect(res?.entries[0].delta).toBe(12)
  })

  it('limita máximo de 6 entradas por batimento para evitar DoS de inserts', () => {
    const payload = {
      ...validBase,
      entries: Array.from({ length: 15 }, (_, i) => ({
        client: 'cliente-alfa',
        view: `view-${i}`,
        delta: 1,
      })),
    }
    const res = normalizeBeat(payload)
    expect(res?.entries).toHaveLength(6)
  })

  it('limita máximo de 100 cliques por batimento', () => {
    const payload = {
      ...validBase,
      clicks: Array.from({ length: 150 }, () => ({
        sel: 'div',
        rx: 0.5,
        ry: 0.5,
      })),
    }
    const res = normalizeBeat(payload)
    expect(res?.clicks).toHaveLength(100)
  })

  it('rejeita sid com caracteres ilegais ou tamanho fora dos limites (8 a 40 chars)', () => {
    expect(normalizeBeat({ ...validBase, sid: 'curto' })).toBeNull() // < 8
    expect(normalizeBeat({ ...validBase, sid: 'a'.repeat(41) })).toBeNull() // > 40
    expect(normalizeBeat({ ...validBase, sid: 'sid com espaço' })).toBeNull()
    expect(normalizeBeat({ ...validBase, sid: 'sid$invalido!' })).toBeNull()
  })

  it('trunca coordenadas relativas fora do intervalo [0, 1] para os limites', () => {
    const payload = {
      ...validBase,
      clicks: [
        { sel: 'div.header', rx: -0.5, ry: 1.8 },
        { sel: 'div.footer', rx: 0.123456, ry: 0.987654 },
      ],
    }
    const res = normalizeBeat(payload)
    expect(res?.clicks[0].rx).toBe(0)
    expect(res?.clicks[0].ry).toBe(1)
    expect(res?.clicks[1].rx).toBe(0.123) // arredonda para 3 casas decimais
    expect(res?.clicks[1].ry).toBe(0.988)
  })

  it('descarta cliques com seletor maior que 300 caracteres', () => {
    const payload = {
      ...validBase,
      clicks: [{ sel: 'div>' + 'span>'.repeat(100), rx: 0.5, ry: 0.5 }],
    }
    const res = normalizeBeat(payload)
    expect(res?.clicks).toHaveLength(0)
  })
})

describe('Test Master — Heatmap Clustering Engine (heatBins)', () => {
  it('agrupa cliques próximos no mesmo bloco de 5% (20x20 grid)', () => {
    const clicks = [
      { sel: 'button#cta', rx: 0.01, ry: 0.02 }, // bin x=0, y=0
      { sel: 'button#cta', rx: 0.04, ry: 0.03 }, // bin x=0, y=0 (mesmo bin)
      { sel: 'button#cta', rx: 0.95, ry: 0.95 }, // bin x=19, y=19
      { sel: 'input#search', rx: 0.01, ry: 0.02 }, // seletor diferente
    ]
    const bins = heatBins(clicks)
    expect(bins).toHaveLength(3)

    // O mais clicado deve vir primeiro
    expect(bins[0].sel).toBe('button#cta')
    expect(bins[0].n).toBe(2)
    expect(bins[0].rx).toBe(0.025) // centro do bin: (0 + 0.5) / 20
    expect(bins[0].ry).toBe(0.025)
  })

  it('lida perfeitamente com valores extremos de coordenadas (0 e 1)', () => {
    const clicks = [
      { sel: 'box', rx: 0, ry: 0 },
      { sel: 'box', rx: 1, ry: 1 },
    ]
    const bins = heatBins(clicks)
    expect(bins).toHaveLength(2)
    // Coordenada 1.0 cai no bin 19 (último bin da grade de 20)
    expect(bins.find(b => b.rx > 0.9)?.rx).toBe(0.975)
  })

  it('respeita o teto de pontos limite', () => {
    const clicks = Array.from({ length: 50 }, (_, i) => ({
      sel: `elem-${i}`,
      rx: 0.5,
      ry: 0.5,
    }))
    const bins = heatBins(clicks, 10)
    expect(bins).toHaveLength(10)
  })
})

describe('Test Master — Top Elements Extraction (topElements)', () => {
  it('consolida elementos mais clicados agrupando seletor e rótulo', () => {
    const items = [
      { sel: 'button.save', label: 'Salvar' },
      { sel: 'button.save', label: 'Salvar' },
      { sel: 'button.save', label: 'Salvar' },
      { sel: 'button.cancel', label: 'Cancelar' },
      { sel: 'tr.row', label: null },
    ]
    const top = topElements(items)
    expect(top).toHaveLength(3)
    expect(top[0]).toEqual({ sel: 'button.save', label: 'Salvar', n: 3 })
    expect(top[1].n).toBe(1)
  })

  it('ordena por frequência decrescente e limita o resultado', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      sel: `btn-${i}`,
      label: `Botão ${i}`,
    }))
    const top = topElements(items, 5)
    expect(top).toHaveLength(5)
  })
})

describe('Test Master — Multi-tenant Usage Aggregation & Isolation (focusClient, summarizeUsage, buildVisits)', () => {
  const sessions: SessionRow[] = [
    {
      sid: 's-admin-1',
      user_key: 'william@don.digital',
      role: 'admin',
      started_at: secAgo(1800),
      last_seen: secAgo(20),
      active_sec: 1200,
      last_view: 'leads',
      last_client: 'magtag',
      device: 'desktop',
    },
    {
      sid: 's-client-1',
      user_key: 'cliente:magtag',
      role: 'client',
      started_at: secAgo(900),
      last_seen: secAgo(10),
      active_sec: 600,
      last_view: 'ecommerce',
      last_client: 'magtag',
      device: 'mobile',
    },
    {
      sid: 's-other-1',
      user_key: 'cliente:becker',
      role: 'client',
      started_at: secAgo(400),
      last_seen: secAgo(300), // > 50s ago -> offline
      active_sec: 250,
      last_view: 'metrics',
      last_client: 'becker',
      device: 'desktop',
    },
  ]

  const views: ViewRow[] = [
    { sid: 's-admin-1', client_slug: 'magtag', view: 'leads', seconds: 800 },
    { sid: 's-admin-1', client_slug: 'magtag', view: 'ecommerce', seconds: 400 },
    { sid: 's-client-1', client_slug: 'magtag', view: 'ecommerce', seconds: 600 },
    { sid: 's-other-1', client_slug: 'becker', view: 'metrics', seconds: 250 },
  ]

  it('summarizeUsage calcula KPIs globais com precisão', () => {
    const summary = summarizeUsage(sessions, views, BASE_TIME)
    // Dois usuários com sinal há <= 50s (william e cliente:magtag)
    expect(summary.kpis.online).toBe(2)
    expect(summary.kpis.sessions).toBe(3)
    expect(summary.kpis.users).toBe(3)
    expect(summary.kpis.activeSec).toBe(2050)

    // Agrupamento por cliente
    expect(summary.byClient[0].slug).toBe('magtag')
    expect(summary.byClient[0].sec).toBe(1800)
    expect(summary.byClient[0].users).toBe(2)

    // Agrupamento por tela
    expect(summary.byView.find(v => v.view === 'ecommerce')?.sec).toBe(1000)
  })

  it('focusClient isola estritamente dados para um único cliente', () => {
    const focused = focusClient(sessions, views, 'magtag')
    // A sessão de becker deve ser totalmente eliminada
    expect(focused.sessions.some(s => s.sid === 's-other-1')).toBe(false)
    expect(focused.sessions).toHaveLength(2)
    expect(focused.views.every(v => v.client_slug === 'magtag')).toBe(true)

    // Resumo focado
    const focusedSummary = summarizeUsage(focused.sessions, focused.views, BASE_TIME)
    expect(focusedSummary.byClient).toHaveLength(1)
    expect(focusedSummary.byClient[0].slug).toBe('magtag')
  })

  it('buildVisits constrói histórico detalhado com telas navegadas e status online', () => {
    const visits = buildVisits(sessions, views, 10, BASE_TIME)
    expect(visits).toHaveLength(3)

    const v1 = visits.find(v => v.sid === 's-admin-1')
    expect(v1).toBeDefined()
    expect(v1?.online).toBe(true)
    expect(v1?.topView).toBe('leads')
    expect(v1?.views).toEqual([
      { view: 'leads', sec: 800 },
      { view: 'ecommerce', sec: 400 },
    ])

    const v3 = visits.find(v => v.sid === 's-other-1')
    expect(v3?.online).toBe(false)
  })
})

describe('Test Master — Time & Duration Formatting (fmtDuration & isOnline)', () => {
  it('formata segundos com precisão em linguagem clara', () => {
    expect(fmtDuration(0)).toBe('0s')
    expect(fmtDuration(45)).toBe('45s')
    expect(fmtDuration(59)).toBe('59s')
    expect(fmtDuration(60)).toBe('1 min')
    expect(fmtDuration(3599)).toBe('59 min')
    expect(fmtDuration(3600)).toBe('1 h 00 min')
    expect(fmtDuration(3665)).toBe('1 h 01 min')
    expect(fmtDuration(7325)).toBe('2 h 02 min')
  })

  it('isOnline valida presença dentro da janela ONLINE_MS (50 segundos)', () => {
    expect(isOnline(secAgo(10), BASE_TIME)).toBe(true)
    expect(isOnline(secAgo(49), BASE_TIME)).toBe(true)
    expect(isOnline(secAgo(50), BASE_TIME)).toBe(true)
    expect(isOnline(secAgo(51), BASE_TIME)).toBe(false)
    expect(isOnline(secAgo(300), BASE_TIME)).toBe(false)
  })
})

describe('Test Master — View Labels & Hierarchical Breadcrumbs (viewLabel)', () => {
  it('mapeia telas conhecidas', () => {
    expect(viewLabel('metrics')).toBe('Geral')
    expect(viewLabel('campaigns')).toBe('Campanhas')
    expect(viewLabel('leads')).toBe('Leads')
    expect(viewLabel('ecommerce')).toBe('E-commerce')
    expect(viewLabel('ecommerce/live')).toBe('E-commerce › Live View')
    expect(viewLabel('admin/heatmap')).toBe('Heatmap')
    expect(viewLabel('admin/uso')).toBe('Uso do app')
  })

  it('formata hierarquia de janelas / gavetas modais por cima de telas base', () => {
    expect(viewLabel('leads/detalhe-do-lead')).toBe('Leads › Detalhe do lead')
    expect(viewLabel('ecommerce/novo-produto')).toBe('E-commerce › Novo produto')
    expect(viewLabel('admin/reports/apresentar')).toBe('Report Studio (equipe) › Apresentar')
  })

  it('retorna a própria string se for tela totalmente desconhecida', () => {
    expect(viewLabel('desconhecida')).toBe('desconhecida')
  })
})

