/**
 * Dicionário didático de métricas para clientes leigos.
 * Explica em português claro e acessível o que cada indicador significa,
 * como é calculado e como interpretá-lo na prática.
 */

export interface MetricTooltip {
  title: string
  description: string
  formula?: string
  hint?: string
}

export const METRIC_TOOLTIPS: Record<string, MetricTooltip> = {
  // === Financeiro / Custo ===
  spend: {
    title: 'Investimento (Gasto em Anúncios)',
    description: 'Valor total pago diretamente às plataformas de anúncios (Meta / Google) para exibir suas campanhas no período selecionado.',
    hint: 'É o dinheiro real que saiu do seu orçamento para veicular os anúncios.',
  },
  cpc: {
    title: 'CPC (Custo por Clique)',
    description: 'Valor médio que você paga cada vez que uma pessoa clica em um anúncio seu.',
    formula: 'Investimento ÷ Total de Cliques',
    hint: 'Quanto menor, melhor: você atrai mais visitas para seu site ou WhatsApp com o mesmo orçamento.',
  },
  cpm: {
    title: 'CPM (Custo por Mil Impressões)',
    description: 'Quanto custa para o seu anúncio aparecer 1.000 vezes na tela dos usuários.',
    formula: '(Investimento ÷ Impressões) × 1.000',
    hint: 'Indica a concorrência pelo público. CPM mais baixo significa que está mais barato aparecer para as pessoas.',
  },
  cpl: {
    title: 'CPL (Custo por Lead / Contato)',
    description: 'Valor médio investido para conquistar cada novo contato ou cadastro de pessoa interessada.',
    formula: 'Investimento ÷ Total de Leads',
    hint: 'Quanto menor, melhor: mostra quanto custa colocar um potencial cliente na mesa do seu time de vendas.',
  },
  cpa: {
    title: 'CPA (Custo por Aquisição / Venda)',
    description: 'Valor médio investido em anúncios para realizar cada venda concluída.',
    formula: 'Investimento ÷ Total de Vendas',
    hint: 'Para ter lucro real, o CPA deve ser sempre menor do que a sua margem de lucro por produto.',
  },
  roas: {
    title: 'ROAS (Retorno sobre Investimento em Anúncios)',
    description: 'Quantos reais de faturamento entraram para cada R$ 1,00 que você investiu em anúncios.',
    formula: 'Receita das Vendas ÷ Investimento em Anúncios',
    hint: 'Exemplo: ROAS de 4,0x significa que para cada R$ 100 investidos, retornaram R$ 400 em vendas.',
  },
  cost_per_engagement: {
    title: 'Custo por Engajamento',
    description: 'Valor médio pago por cada interação das pessoas com o seu anúncio (curtidas, comentários, compartilhamentos ou cliques).',
    formula: 'Investimento ÷ Total de Engajamentos',
    hint: 'Útil em campanhas focadas em gerar autoridade e movimento nas redes sociais.',
  },
  cost_per_link_click: {
    title: 'Custo por Clique no Link',
    description: 'Valor médio investido para cada clique dado especificamente no botão ou link que leva para o seu site ou página.',
    formula: 'Investimento ÷ Cliques no Link',
    hint: 'Descarta quem só curtiu ou abriu a foto e foca em quem tentou ir para a sua página.',
  },
  cost_per_conversation: {
    title: 'Custo por Conversa Iniciada',
    description: 'Valor médio investido para gerar uma nova conversa de um cliente com a sua empresa no WhatsApp ou Direct.',
    formula: 'Investimento ÷ Conversas Iniciadas',
    hint: 'Excelente para quem vende pelo WhatsApp: mostra o custo real de cada pessoa que te chamou.',
  },

  // === Alcance e Entrega ===
  impressions: {
    title: 'Impressões (Exibições Totais)',
    description: 'Número total de vezes que os seus anúncios apareceram na tela dos usuários.',
    hint: 'Uma mesma pessoa pode ver o anúncio 2 ou 3 vezes, somando 2 ou 3 impressões.',
  },
  reach: {
    title: 'Alcance (Pessoas Únicas)',
    description: 'Quantidade de pessoas diferentes e únicas que viram seus anúncios pelo menos uma vez no período.',
    hint: 'Ao contrário das impressões, cada pessoa é contada apenas uma única vez.',
  },
  frequency: {
    title: 'Frequência (Exibições por Pessoa)',
    description: 'Média de vezes que cada pessoa alcançada viu o mesmo anúncio.',
    formula: 'Impressões ÷ Alcance',
    hint: 'Se passar de 3 a 5x, o público pode estar saturado e pode ser hora de trocar o criativo.',
  },

  // === Engajamento e Cliques ===
  clicks: {
    title: 'Cliques Totais',
    description: 'Soma de todos os cliques realizados no anúncio: no link, na imagem, no botão de curtir, em "ver mais" ou no perfil.',
    hint: 'Mede o nível de curiosidade e ação que o anúncio provocou nas pessoas.',
  },
  unique_clicks: {
    title: 'Cliques Únicos',
    description: 'Número de pessoas diferentes que clicaram no seu anúncio pelo menos uma vez.',
    hint: 'Se uma mesma pessoa clicar várias vezes, aqui conta apenas como 1 clique único.',
  },
  ctr: {
    title: 'CTR (Taxa de Cliques)',
    description: 'Porcentagem de pessoas que viram o anúncio e resolveram clicar nele.',
    formula: '(Cliques ÷ Impressões) × 100',
    hint: 'Mede a atratividade do anúncio. Acima de 1,5% já é considerado um anúncio atrativo.',
  },
  link_clicks: {
    title: 'Cliques no Link',
    description: 'Quantidade de cliques que tinham como destino o seu site, página de captura ou WhatsApp.',
    hint: 'Mede o tráfego efetivamente direcionado para fora da rede social.',
  },
  post_engagement: {
    title: 'Engajamento com o Post',
    description: 'Total de ações que as pessoas fizeram na publicação do anúncio: curtidas, comentários, compartilhamentos e salvamentos.',
    hint: 'Anúncios com alto engajamento costumam ter menor custo de distribuição.',
  },
  reactions: {
    title: 'Reações',
    description: 'Curtidas e reações com emojis deixadas pelas pessoas no seu anúncio.',
    hint: 'Demonstra a aprovação e o sentimento do público com a mensagem.',
  },
  comments: {
    title: 'Comentários',
    description: 'Quantidade de comentários feitos por pessoas na publicação do anúncio.',
    hint: 'Comentários positivos aumentam a prova social e incentivam outros a comprar.',
  },
  video_views: {
    title: 'Visualizações de Vídeo (ThruPlay)',
    description: 'Pessoas que assistiram ao seu anúncio em vídeo por pelo menos 15 segundos ou quase até o fim.',
    hint: 'Mostra quem realmente se interessou pelo conteúdo do vídeo e não apenas rolou o feed.',
  },

  // === Conversões e Negócios ===
  leads: {
    title: 'Leads (Cadastros / Oportunidades)',
    description: 'Pessoas interessadas que preencheram o formulário ou deixaram seus dados de contato através do anúncio.',
    hint: 'São potenciais clientes reais com nome, telefone ou e-mail prontos para contato.',
  },
  purchases: {
    title: 'Compras Realizadas',
    description: 'Total de pedidos ou compras concluídas geradas a partir dos anúncios.',
    hint: 'Vendas confirmadas rastreadas pelo pixel ou pela loja virtual.',
  },
  purchase_value: {
    title: 'Valor Total em Compras (Receita)',
    description: 'Soma do faturamento em reais gerado pelas vendas que vieram dos anúncios.',
    hint: 'É o valor bruto em vendas gerado pelas campanhas.',
  },
  landing_page_views: {
    title: 'Visualizações da Página (Site)',
    description: 'Pessoas que clicaram no anúncio e aguardaram a página de vendas carregar por completo.',
    hint: 'Mais preciso que cliques no link, pois elimina quem desistiu antes do site carregar.',
  },
  messaging_conversations: {
    title: 'Conversas Iniciadas (WhatsApp / Direct)',
    description: 'Novas conversas abertas por clientes com a sua empresa após clicarem no anúncio.',
    hint: 'Representa pessoas que deram o primeiro passo para falar com você.',
  },

  // === Google Ads & Google Analytics ===
  conversions: {
    title: 'Conversões',
    description: 'Ações valiosas que os visitantes realizaram após o anúncio (como compras, formulários preenchidos, ligações ou botões de WhatsApp).',
    hint: 'Representa o objetivo principal alcançado pelas campanhas no Google.',
  },
  cost_per_conversion: {
    title: 'Custo por Conversão',
    description: 'Valor médio investido no Google Ads para gerar cada conversão concluída.',
    formula: 'Investimento ÷ Total de Conversões',
    hint: 'Quanto menor, mais eficiente está sendo a sua campanha no Google.',
  },
  sessions: {
    title: 'Sessões (Visitas no Site)',
    description: 'Período contínuo em que uma pessoa navega pelas páginas do seu site. Uma mesma pessoa pode fazer várias sessões em dias diferentes.',
    hint: 'Mede o fluxo total de visitas recebidas no site.',
  },
  users: {
    title: 'Usuários Únicos (Visitantes)',
    description: 'Quantidade de pessoas físicas diferentes que acessaram o seu site no período.',
    hint: 'Conta cada visitante apenas uma vez, mesmo que ele tenha visitado o site várias vezes.',
  },
  new_users: {
    title: 'Novos Visitantes',
    description: 'Pessoas que entraram no seu site pela primeira vez na história.',
    hint: 'Mostra a capacidade do seu tráfego em atrair um público totalmente novo.',
  },
  engagement_rate: {
    title: 'Taxa de Engajamento do Site',
    description: 'Porcentagem de visitas que duraram mais de 10 segundos, visitaram mais de uma página ou geraram uma conversão.',
    hint: 'Indica se os visitantes acharam o conteúdo do site interessante ou se saíram imediatamente.',
  },
  avg_session_duration: {
    title: 'Tempo Médio na Sessão',
    description: 'Tempo médio que os visitantes permanecem navegando no seu site antes de fechar a aba.',
    hint: 'Mais tempo no site geralmente indica maior interesse na sua oferta ou conteúdo.',
  },
  conversion_rate: {
    title: 'Taxa de Conversão do Site',
    description: 'Porcentagem de visitantes que realizaram a ação desejada (compra ou cadastro) em relação ao total de visitas.',
    formula: '(Conversões ÷ Sessões) × 100',
    hint: 'Uma taxa de conversão saudável em e-commerce costuma ficar entre 1% e 3%.',
  },

  // === E-commerce ===
  approved_revenue: {
    title: 'Faturamento Aprovado',
    description: 'Total em reais das vendas que foram devidamente pagas e aprovadas no e-commerce.',
    hint: 'Dinheiro real que entrou no caixa, excluindo boletos ou Pix não pagos.',
  },
  average_ticket: {
    title: 'Ticket Médio',
    description: 'Valor médio gasto pelos clientes em cada compra aprovada na loja.',
    formula: 'Faturamento Aprovado ÷ Pedidos Pagos',
    hint: 'Aumentar o ticket médio (com combos e kits) eleva o faturamento sem precisar gastar mais em anúncios.',
  },
  abandoned_carts: {
    title: 'Carrinhos Abandonados',
    description: 'Clientes que adicionaram produtos na sacola mas fecharam a loja antes de finalizar o pagamento.',
    hint: 'Excelente oportunidade para envio de mensagens automáticas de recuperação.',
  },
  abandoned_value: {
    title: 'Valor em Aberto (Carrinhos Abandonados)',
    description: 'Soma dos valores dos produtos que foram deixados nos carrinhos sem conclusão da compra.',
    hint: 'Mostra o tamanho da receita potencial que pode ser recuperada.',
  },
  checkout_completion_rate: {
    title: 'Taxa de Conclusão do Checkout',
    description: 'Porcentagem de clientes que iniciaram o processo de pagamento e conseguiram finalizar a compra com sucesso.',
    formula: '(Pedidos Pagos ÷ Inícios de Checkout) × 100',
    hint: 'Se estiver muito baixa, pode indicar frete caro, falta de meios de pagamento ou problemas no formulário.',
  },

  // === Redes Sociais Orgânicas ===
  interactions: {
    title: 'Interações no Perfil',
    description: 'Soma de todas as ações que os seguidores fizeram nos posts orgânicos: curtidas, comentários, compartilhamentos e salvamentos.',
    hint: 'Mede o engajamento natural da sua comunidade com o conteúdo.',
  },
  followers: {
    title: 'Seguidores',
    description: 'Quantidade total de pessoas que seguem o perfil da empresa na rede social.',
    hint: 'Sua base orgânica pronta para receber seus conteúdos.',
  },
  posts: {
    title: 'Publicações Realizadas',
    description: 'Número de fotos, vídeos, carrosséis ou reels publicados na página ou perfil no período selecionado.',
    hint: 'Mede a constância e o volume de postagens da sua marca.',
  },

  // === Gestão e Campanhas ===
  active_campaigns: {
    title: 'Campanhas Ativas',
    description: 'Número de campanhas ligadas e aptas a veicular anúncios no momento.',
    hint: 'Mostra quantas estratégias diferentes estão rodando simultaneamente.',
  },
  attention_creatives: {
    title: 'Criativos em Atenção',
    description: 'Anúncios que tiveram muito gasto ou frequência elevada e podem precisar de substituição.',
    hint: 'Renovar anúncios desgastados ajuda a manter os custos baixos e o público atento.',
  },
}

const ALIAS_MAP: Record<string, string> = {
  // Financeiro
  'investimento': 'spend',
  'investido': 'spend',
  'gasto': 'spend',
  'total investido': 'spend',
  'spend': 'spend',
  'cpc': 'cpc',
  'cpc médio': 'cpc',
  'cpc medio': 'cpc',
  'cpm': 'cpm',
  'cpl': 'cpl',
  'custo por lead': 'cpl',
  'custo por lead do site': 'cpl',
  'custo / res.': 'cpl',
  'custo / res': 'cpl',
  'custo/resultado': 'cpl',
  'custo por resultado': 'cpl',
  'custo/res.': 'cpl',
  'cpa': 'cpa',
  'custo por compra': 'cpa',
  'custo por aquisição': 'cpa',
  'custo por aquisicao': 'cpa',
  'custo por compra (cpa)': 'cpa',
  'custo por conversão': 'cost_per_conversion',
  'custo por conversao': 'cost_per_conversion',
  'roas': 'roas',
  'custo/eng.': 'cost_per_engagement',
  'custo por engajamento': 'cost_per_engagement',
  'custo/clique': 'cost_per_link_click',
  'custo por clique no link': 'cost_per_link_click',
  'custo/conv.': 'cost_per_conversation',
  'custo/conversa': 'cost_per_conversation',
  'custo por conversa': 'cost_per_conversation',
  'custo por conversa iniciada': 'cost_per_conversation',

  // Alcance
  'impressões': 'impressions',
  'impressoes': 'impressions',
  'impressions': 'impressions',
  'alcance': 'reach',
  'reach': 'reach',
  'frequência': 'frequency',
  'frequencia': 'frequency',
  'frequency': 'frequency',
  'freq.': 'frequency',
  'freq': 'frequency',
  'frequência média': 'frequency',

  // Cliques / Engajamento
  'cliques': 'clicks',
  'clicks': 'clicks',
  'cliques únicos': 'unique_clicks',
  'cliques unicos': 'unique_clicks',
  'unique_clicks': 'unique_clicks',
  'ctr': 'ctr',
  'ctr médio': 'ctr',
  'taxa de cliques': 'ctr',
  'cl. no link': 'link_clicks',
  'cliques no link': 'link_clicks',
  'link_clicks': 'link_clicks',
  'engajamento': 'post_engagement',
  'post_engagement': 'post_engagement',
  'reações': 'reactions',
  'reacoes': 'reactions',
  'reactions': 'reactions',
  'comentários': 'comments',
  'comentarios': 'comments',
  'comments': 'comments',
  'views de vídeo': 'video_views',
  'views de video': 'video_views',
  'visualizações de vídeo': 'video_views',
  'video_views': 'video_views',

  // Conversões
  'leads': 'leads',
  'leads do site': 'leads',
  'resultados / leads': 'leads',
  'resultados': 'leads',
  'compras': 'purchases',
  'purchases': 'purchases',
  'valor compras': 'purchase_value',
  'valor das compras': 'purchase_value',
  'purchase_value': 'purchase_value',
  'faturamento': 'purchase_value',
  'faturamento aprovado': 'approved_revenue',
  'visitas página': 'landing_page_views',
  'visitas à página': 'landing_page_views',
  'visitas pagina': 'landing_page_views',
  'landing_page_views': 'landing_page_views',
  'conversas': 'messaging_conversations',
  'conversas iniciadas': 'messaging_conversations',
  'messaging_conversations': 'messaging_conversations',
  'conversões': 'conversions',
  'conversoes': 'conversions',
  'conversions': 'conversions',

  // Analytics & Web
  'sessões': 'sessions',
  'sessoes': 'sessions',
  'sessions': 'sessions',
  'usuários': 'users',
  'usuarios': 'users',
  'users': 'users',
  'usuários novos': 'new_users',
  'usuarios novos': 'new_users',
  'new_users': 'new_users',
  'engajamento no site': 'engagement_rate',
  'tempo médio': 'avg_session_duration',
  'tempo medio': 'avg_session_duration',
  'taxa de conversão': 'conversion_rate',
  'taxa de conversao': 'conversion_rate',

  // E-commerce
  'ticket médio': 'average_ticket',
  'ticket medio': 'average_ticket',
  'carrinhos abandonados': 'abandoned_carts',
  'valor em aberto': 'abandoned_value',
  'taxa de conclusão': 'checkout_completion_rate',
  'taxa de conclusao': 'checkout_completion_rate',

  // Orgânico
  'interações': 'interactions',
  'interacoes': 'interactions',
  'interactions': 'interactions',
  'seguidores': 'followers',
  'followers': 'followers',
  'publicações': 'posts',
  'publicacoes': 'posts',
  'posts': 'posts',

  // Campanhas
  'campanhas ativas': 'active_campaigns',
  'anúncios com investimento': 'spend',
  'criativos em atenção': 'attention_creatives',
}

/**
 * Retorna o tooltip didático correspondente à métrica informada por chave ou rótulo.
 */
export function getMetricTooltip(labelOrKey: string | null | undefined): MetricTooltip | null {
  if (!labelOrKey) return null
  const clean = labelOrKey.toLowerCase().trim()

  // 1. Busca direta por chave
  if (METRIC_TOOLTIPS[clean]) return METRIC_TOOLTIPS[clean]

  // 2. Busca por alias
  const mappedKey = ALIAS_MAP[clean]
  if (mappedKey && METRIC_TOOLTIPS[mappedKey]) {
    return METRIC_TOOLTIPS[mappedKey]
  }

  // 3. Busca por correspondência parcial (ex: "CUSTO / RES.", "CPL (Custo por Lead)")
  for (const [alias, key] of Object.entries(ALIAS_MAP)) {
    if (alias.length >= 3 && clean.includes(alias) && METRIC_TOOLTIPS[key]) {
      return METRIC_TOOLTIPS[key]
    }
  }

  return null
}
