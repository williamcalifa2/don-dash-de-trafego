export type LeadStatus = 'Novo' | 'Em andamento' | 'Convertido' | 'Perdido'

export interface Lead {
  id: string
  client_id: string
  date: string
  nome: string | null
  telefone: string | null
  email: string | null
  status: LeadStatus
  valor_pedido: number | null
  ad_name: string | null
  campanha: string | null
  conjunto: string | null
  notas: string | null
  motivo_perda: string | null
  ultimo_contato: string | null
  /** quem do time atendeu o lead */
  atendido_por?: string | null
  meta_lead_id?: string | null
  /** cadastrado à mão pelo painel (não veio do Meta) */
  manual?: boolean
  /** canal de entrada: meta, shopify_checkout, crm, webhook, manual */
  origem?: string | null
  /** data/hora exata do primeiro contato com o lead */
  primeiro_contato?: string | null
  /** tempo decorrido até o 1º contato (em segundos) */
  tempo_primeiro_contato_seg?: number | null
  /** true se o tempo até o primeiro contato ultrapassou o SLA da conta */
  sla_violado?: boolean | null
  created_at: string
}

export const LOSS_REASONS = [
  'Sem resposta', 'Preço', 'Sem estoque', 'Comprou do concorrente',
  'Sem interesse', 'Fora da região', 'Outro',
] as const
export type LossReason = typeof LOSS_REASONS[number]

export type LeadUpdate = Partial<Pick<Lead, 'status' | 'valor_pedido' | 'notas' | 'motivo_perda' | 'ultimo_contato' | 'atendido_por'>>
export type LeadUpdate = Partial<Pick<Lead, 'status' | 'valor_pedido' | 'notas' | 'motivo_perda' | 'ultimo_contato' | 'atendido_por' | 'primeiro_contato' | 'tempo_primeiro_contato_seg' | 'sla_violado'>>

export interface Fechamento {
  id: string
  client_id: string
  date: string
  count: number
  revenue: number
  notes?: string
}
