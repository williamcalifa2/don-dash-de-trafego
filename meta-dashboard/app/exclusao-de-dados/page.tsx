import type { Metadata } from 'next'
import { contactEmail, H2, LegalPage, P, UL } from '@/components/LegalPage'

export const metadata: Metadata = { title: 'Exclusão de dados · Don Comunicação Digital' }
export const dynamic = 'force-dynamic'

export default function Page() {
  const email = contactEmail()
  return (
    <LegalPage title="Exclusão de dados" updated="21/09/2026">
      <section>
        <H2>Como pedir a exclusão dos seus dados</H2>
        <P>Se você deixou seus dados em um formulário de anúncio de um cliente da Don, ou quer encerrar o uso dos seus dados no nosso Painel de controle, envie o pedido{email ? <> para <a href={`mailto:${email}`} style={{ color: 'var(--accent)' }}>{email}</a></> : ' pelos canais de atendimento da Don Comunicação Digital'} com:</P>
        <UL items={[
          'O assunto “Exclusão de dados”.',
          'O seu nome e o telefone ou e-mail que você informou no formulário, para localizarmos o registro.',
          'Se for um cliente da Don pedindo a exclusão de toda a conta, o nome da empresa.',
        ]} />
      </section>
      <section>
        <H2>O que acontece depois</H2>
        <UL items={[
          'Confirmamos o recebimento e a sua identidade.',
          'Apagamos os seus dados pessoais (nome, telefone, e-mail, notas) do painel e do banco de dados em até 30 dias.',
          'Avisamos quando a exclusão estiver concluída.',
        ]} />
        <P>Alguns dados podem ser mantidos apenas pelo tempo exigido por lei. Números de desempenho de anúncios não identificam pessoas.</P>
      </section>
      <section>
        <H2>Sobre a Meta</H2>
        <P>Os dados que ficam na Meta (Facebook e Instagram) seguem as regras e ferramentas dela. Para revogar o acesso deste aplicativo à sua conta, abra as configurações do Facebook ou do Instagram, em Aplicativos e sites, e remova o aplicativo “Dashboard Agência”.</P>
      </section>
      <section>
        <H2>In English</H2>
        <P>To request deletion of your personal data, email us with the subject “Data deletion”, your name and the phone or email you submitted in a lead form. We will verify your identity and delete your personal data from our dashboard and database within 30 days, and confirm when it is done. To revoke this app’s access to your Meta account, remove “Dashboard Agência” under Apps and Websites in your Facebook or Instagram settings.</P>
      </section>
    </LegalPage>
  )
}
