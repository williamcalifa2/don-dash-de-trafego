/**
 * Tipo de resultado do cliente. Detectado sozinho pelo que a conta realmente gera:
 *  - form:     leads de formulário instantâneo (têm nome/telefone e entram no CRM do painel)
 *  - site:     leads do site (evento Lead do pixel), sem identificação individual
 *  - conversa: conversas iniciadas (WhatsApp/Instagram/Messenger), sem identificação individual
 *  - misto:    mais de um tipo relevante ao mesmo tempo
 */
export type ResultKind = 'form' | 'site' | 'conversa' | 'custom' | 'misto'

export interface KindLabels {
  /** singular e plural do resultado */
  one: string
  many: string
  /** rótulo curto do custo (cabeçalho de coluna) e completo */
  cost: string
  costFull: string
  /** "Clique → X" no funil */
  clickTo: string
  /** nome da etapa no funil */
  stage: string
}

export const KIND_LABELS: Record<ResultKind, KindLabels> = {
  form:     { one: 'lead',     many: 'Leads',            cost: 'CPL',           costFull: 'Custo por lead',            clickTo: 'Clique → Lead',     stage: 'Leads Gerados' },
  site:     { one: 'lead do site', many: 'Leads do site', cost: 'CPL',           costFull: 'Custo por lead do site',    clickTo: 'Clique → Lead',     stage: 'Leads do Site' },
  conversa: { one: 'conversa', many: 'Conversas',        cost: 'Custo/Conversa', costFull: 'Custo por conversa iniciada', clickTo: 'Clique → Conversa', stage: 'Conversas Iniciadas' },
  custom:   { one: 'conversão', many: 'Conversões',  cost: 'Custo/Conversão', costFull: 'Custo por conversão',    clickTo: 'Clique → Conversão', stage: 'Conversões' },
  misto:    { one: 'resultado', many: 'Resultados',      cost: 'Custo/Resultado', costFull: 'Custo por resultado',      clickTo: 'Clique → Resultado', stage: 'Resultados' },
}

export interface ResultCounts { form_leads: number; site_leads: number; conversations: number; /** conversões personalizadas da conta */ custom_conversions?: number }

/** Se um tipo concentra pelo menos 75% dos resultados, é ele; sem resultados, mantém o padrão histórico (formulário). */
export function detectKind(c: ResultCounts): ResultKind {
  const custom = c.custom_conversions ?? 0
  const total = c.form_leads + c.site_leads + c.conversations + custom
  if (total <= 0) return 'form'
  const share = (n: number) => n / total
  if (share(c.form_leads) >= 0.75) return 'form'
  if (share(c.site_leads) >= 0.75) return 'site'
  if (share(c.conversations) >= 0.75) return 'conversa'
  if (share(custom) >= 0.75) return 'custom'
  return 'misto'
}
