import type { Metadata } from 'next'
import { contactEmail, H2, LegalPage, P, UL } from '@/components/LegalPage'

export const metadata: Metadata = { title: 'Política de privacidade · Don Comunicação Digital' }
export const dynamic = 'force-dynamic'

export default function Page() {
  const email = contactEmail()
  return (
    <LegalPage title="Política de privacidade" updated="21/09/2026">
      <section>
        <H2>Quem somos</H2>
        <P>A Don Comunicação Digital (“Don”, “nós”) é uma agência de marketing digital. Este aplicativo, o Painel de controle, é uma ferramenta interna que mostra aos nossos clientes e à nossa equipe os resultados das campanhas de anúncios que gerenciamos para eles.</P>
      </section>
      <section>
        <H2>Quais dados usamos</H2>
        <UL items={[
          'Métricas de anúncios das contas de anúncios dos nossos clientes na Meta (Facebook e Instagram): investimento, impressões, cliques, conversões e resultados.',
          'Contatos de leads: nome, telefone e e-mail que as pessoas informam voluntariamente em formulários de anúncios dos nossos clientes, e os que a equipe cadastra manualmente.',
          'Métricas orgânicas agregadas das Páginas do Facebook e das contas profissionais do Instagram dos clientes (alcance, seguidores, engajamento), quando o cliente autoriza.',
          'Dados de acesso da equipe e dos clientes ao painel (e-mail e código de acesso).',
        ]} />
        <P>Acessamos esses dados pelas APIs oficiais da Meta, <strong>somente para leitura</strong>. O aplicativo não publica, não edita, não pausa nem cria anúncios, posts ou mensagens.</P>
      </section>
      <section>
        <H2>Para que usamos</H2>
        <UL items={[
          'Mostrar ao cliente, e só a ele, o desempenho das próprias campanhas.',
          'Permitir que a equipe da Don acompanhe os leads e o retorno dos anúncios.',
          'Gerar relatórios de desempenho para o cliente.',
        ]} />
        <P>Não vendemos dados, não os compartilhamos com terceiros para publicidade e não criamos perfis de pessoas.</P>
      </section>
      <section>
        <H2>Quem pode ver</H2>
        <P>Cada cliente vê apenas os dados da própria conta, mediante código de acesso individual. A equipe da Don acessa com e-mail cadastrado e token pessoal. Os dados ficam em provedores de infraestrutura (hospedagem e banco de dados) que os processam em nosso nome, com acesso restrito.</P>
      </section>
      <section>
        <H2>Por quanto tempo guardamos</H2>
        <P>Guardamos os dados enquanto o cliente for atendido pela Don e pelo prazo necessário para prestar o serviço. Quando o cliente encerra o contrato ou pede a exclusão, apagamos os dados dele, incluindo os leads, conforme a página de exclusão de dados.</P>
      </section>
      <section>
        <H2>Seus direitos (LGPD)</H2>
        <P>Você pode pedir acesso, correção, anonimização ou exclusão dos seus dados pessoais, e informações sobre o uso deles. Veja como em <a href="/exclusao-de-dados" style={{ color: 'var(--accent)' }}>Exclusão de dados</a>.</P>
      </section>
      <section>
        <H2>Contato</H2>
        <P>{email ? <>Fale conosco pelo e-mail <a href={`mailto:${email}`} style={{ color: 'var(--accent)' }}>{email}</a>.</> : 'Fale conosco pelos canais de atendimento da Don Comunicação Digital.'}</P>
      </section>
      <section>
        <H2>In English (summary)</H2>
        <P>Don Comunicação Digital is a digital marketing agency. This internal dashboard reads, through Meta’s official APIs and with read-only permissions, advertising performance metrics, lead contact details submitted through our clients’ lead ads, and aggregated organic Page and Instagram insights. The data is shown only to the client it belongs to and to our team. We do not sell data, share it for advertising or build profiles. Requests for access or deletion follow the process on the data deletion page.</P>
      </section>
    </LegalPage>
  )
}
