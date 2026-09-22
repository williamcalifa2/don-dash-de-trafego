export const METRIC_DEFS = [
  { key: 'spend', label: 'Investimento', group: 'Financeiro' },
  { key: 'cpc', label: 'CPC', group: 'Financeiro' },
  { key: 'cpm', label: 'CPM', group: 'Financeiro' },
  { key: 'cpl', label: 'CPL', group: 'Financeiro' },
  { key: 'cpa', label: 'CPA', group: 'Financeiro' },
  { key: 'roas', label: 'ROAS', group: 'Financeiro' },
  { key: 'cost_per_engagement', label: 'Custo por Engajamento', group: 'Financeiro' },
  { key: 'cost_per_link_click', label: 'Custo por Clique no Link', group: 'Financeiro' },
  { key: 'cost_per_conversation', label: 'Custo por Conversa', group: 'Financeiro' },
  { key: 'impressions', label: 'Impressões', group: 'Alcance' },
  { key: 'reach', label: 'Alcance', group: 'Alcance' },
  { key: 'frequency', label: 'Frequência', group: 'Alcance' },
  { key: 'clicks', label: 'Cliques', group: 'Engajamento' },
  { key: 'unique_clicks', label: 'Cliques Únicos', group: 'Engajamento' },
  { key: 'ctr', label: 'CTR', group: 'Engajamento' },
  { key: 'link_clicks', label: 'Cliques no Link', group: 'Engajamento' },
  { key: 'post_engagement', label: 'Engajamento', group: 'Engajamento' },
  { key: 'reactions', label: 'Reações', group: 'Engajamento' },
  { key: 'comments', label: 'Comentários', group: 'Engajamento' },
  { key: 'video_views', label: 'Visualizações de Vídeo', group: 'Vídeo' },
  { key: 'leads', label: 'Leads', group: 'Conversões' },
  { key: 'purchases', label: 'Compras', group: 'Conversões' },
  { key: 'purchase_value', label: 'Valor das Compras', group: 'Conversões' },
  { key: 'landing_page_views', label: 'Visitas à Página', group: 'Conversões' },
  { key: 'messaging_conversations', label: 'Conversas Iniciadas', group: 'Mensagens' },
] as const

export type MetricKey = typeof METRIC_DEFS[number]['key']

export const DEFAULT_METRICS: MetricKey[] = [
  'spend', 'leads', 'cpl', 'roas', 'impressions', 'ctr', 'cpm', 'frequency',
]

