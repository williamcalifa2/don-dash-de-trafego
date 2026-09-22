/** Nomes em português das ações que a Meta devolve. Nada fica de fora: o que não conhecemos ganha um nome legível. */

const LABELS: Record<string, string> = {
  // captação
  'onsite_conversion.lead_grouped': 'Leads de formulário',
  lead: 'Leads (total)',
  'offsite_conversion.fb_pixel_lead': 'Leads do site (pixel)',
  'onsite_conversion.messaging_conversation_started_7d': 'Conversas iniciadas',
  messaging_conversation_started_7d: 'Conversas iniciadas',
  'onsite_conversion.total_messaging_connection': 'Conexões de mensagem',
  'onsite_conversion.messaging_first_reply': 'Primeiras respostas (mensagem)',
  'onsite_conversion.messaging_welcome_message_view': 'Mensagens de boas-vindas vistas',
  'onsite_conversion.messaging_user_depth_2_message_send': 'Conversas com 2 mensagens',
  'onsite_conversion.messaging_user_depth_3_message_send': 'Conversas com 3 mensagens',
  contact_total: 'Contatos',
  contact_website: 'Contatos no site',
  // conversões do pixel
  purchase: 'Compras',
  'offsite_conversion.fb_pixel_purchase': 'Compras (pixel)',
  omni_purchase: 'Compras (todas as fontes)',
  complete_registration: 'Cadastros concluídos',
  'offsite_conversion.fb_pixel_complete_registration': 'Cadastros concluídos (pixel)',
  add_to_cart: 'Adições ao carrinho',
  'offsite_conversion.fb_pixel_add_to_cart': 'Adições ao carrinho (pixel)',
  initiate_checkout: 'Checkouts iniciados',
  'offsite_conversion.fb_pixel_initiate_checkout': 'Checkouts iniciados (pixel)',
  add_payment_info: 'Dados de pagamento adicionados',
  'offsite_conversion.fb_pixel_add_payment_info': 'Dados de pagamento adicionados (pixel)',
  add_to_wishlist: 'Lista de desejos',
  'offsite_conversion.fb_pixel_add_to_wishlist': 'Lista de desejos (pixel)',
  view_content: 'Visualizações de conteúdo',
  'offsite_conversion.fb_pixel_view_content': 'Visualizações de conteúdo (pixel)',
  search: 'Pesquisas',
  'offsite_conversion.fb_pixel_search': 'Pesquisas (pixel)',
  subscribe: 'Assinaturas',
  'offsite_conversion.fb_pixel_subscribe': 'Assinaturas (pixel)',
  schedule: 'Agendamentos',
  'offsite_conversion.fb_pixel_schedule': 'Agendamentos (pixel)',
  submit_application: 'Candidaturas enviadas',
  'offsite_conversion.fb_pixel_submit_application': 'Candidaturas enviadas (pixel)',
  start_trial: 'Testes iniciados',
  contact: 'Contatos (pixel)',
  'offsite_conversion.fb_pixel_contact': 'Contatos (pixel)',
  customize_product: 'Produtos personalizados',
  donate: 'Doações',
  find_location: 'Buscas de localização',
  'offsite_conversion.fb_pixel_custom': 'Eventos personalizados (pixel)',
  // tráfego e engajamento
  link_click: 'Cliques no link',
  outbound_click: 'Cliques de saída',
  landing_page_view: 'Visitas à página de destino',
  page_engagement: 'Engajamento com a página',
  post_engagement: 'Engajamento com a publicação',
  post: 'Publicações compartilhadas',
  post_reaction: 'Reações',
  comment: 'Comentários',
  share: 'Compartilhamentos',
  like: 'Curtidas na página',
  'onsite_conversion.post_save': 'Publicações salvas',
  photo_view: 'Visualizações de foto',
  video_view: 'Visualizações de vídeo',
  'onsite_conversion.flow_complete': 'Fluxos concluídos',
}

const CUSTOM_PREFIX = 'offsite_conversion.custom.'

/** Nome legível de uma ação. Conversões personalizadas usam o nome dado na Meta, quando conhecido. */
export function labelAction(type: string, customNames: Record<string, string> = {}): string {
  if (type.startsWith(CUSTOM_PREFIX)) {
    const id = type.slice(CUSTOM_PREFIX.length)
    return customNames[id] ? `${customNames[id]} (personalizada)` : `Conversão personalizada ${id}`
  }
  if (LABELS[type]) return LABELS[type]
  const t = type.replace(/^(onsite_conversion|offsite_conversion|omni)\./, '').replace(/^fb_pixel_/, '').replace(/_/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : type
}

/** Ação que é conversão personalizada (definida pelo cliente na Meta). */
export const isCustomConversion = (type: string) => type.startsWith(CUSTOM_PREFIX)
export const customConversionId = (type: string) => (isCustomConversion(type) ? type.slice(CUSTOM_PREFIX.length) : null)
