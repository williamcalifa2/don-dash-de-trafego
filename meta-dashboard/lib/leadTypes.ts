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
  created_at: string
}

export const LOSS_REASONS = [
  'Sem resposta', 'Preço', 'Sem estoque', 'Comprou do concorrente',
  'Sem interesse', 'Fora da região', 'Outro',
] as const
export type LossReason = typeof LOSS_REASONS[number]

export type LeadUpdate = Partial<Pick<Lead, 'status' | 'valor_pedido' | 'notas' | 'motivo_perda' | 'ultimo_contato' | 'atendido_por'>>

export interface Fechamento {
  id: string
  client_id: string
  date: string
  count: number
  revenue: number
  notes?: string
}
