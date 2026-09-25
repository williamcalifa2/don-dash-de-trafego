import { Layers } from 'lucide-react'
import { buildFunnel, type FunnelInput } from '@/lib/ecomFunnel'

const nf = new Intl.NumberFormat('pt-BR')
const pct = (v: number) => `${v.toFixed(1).replace('.', ',')}%`

/** Funil real da loja, em uma superfície só (sem card dentro de card, sem degradê). */
export function EcommerceFunnel({ funnel, pixel, conversion, periodLabel = 'últimos 30 dias' }: { funnel: FunnelInput; pixel: boolean; conversion?: number | null; periodLabel?: string }) {
  const steps = buildFunnel(funnel, pixel)
  return (
    <section className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Layers size={18} color="var(--accent)" strokeWidth={1.75} />
        </span>
        <div style={{ minWidth: 200, flex: 1 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Funil de conversão</h3>
          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 0' }}>Do primeiro acesso ao pagamento aprovado · {periodLabel}</p>
        </div>
        {conversion != null && (
          <span className="badge" title="Pedidos pagos ÷ visitas" style={{ background: 'var(--accent-soft)', color: 'var(--text-1)', fontSize: 12, fontWeight: 600, padding: '4px 12px', flexShrink: 0 }}>
            Conversão geral {pct(conversion)}
          </span>
        )}
      </div>

      <div className="ecom-funnel">
        {steps.map(s => {
          const paid = s.key === 'paid'
          return (
            <div key={s.key} className="ecom-funnel-step">
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: paid ? 'var(--green)' : 'var(--text-2)' }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, color: paid ? 'var(--green)' : 'var(--text-1)' }}>{s.value != null ? nf.format(s.value) : '—'}</div>
              <div style={{ height: 6, borderRadius: 9999, background: 'var(--bg-card2)', overflow: 'hidden' }} aria-hidden="true">
                <div style={{ width: `${s.bar}%`, height: '100%', borderRadius: 9999, background: paid ? 'var(--green)' : 'var(--accent)', transition: 'width .3s ease' }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{s.note}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', minHeight: 16, fontVariantNumeric: 'tabular-nums' }}>{s.rate != null ? `→ ${pct(s.rate)} da etapa anterior` : ''}</div>
            </div>
          )
        })}
      </div>

      {!pixel && (
        <p style={{ margin: 0, padding: '10px 14px', borderRadius: 12, border: '1px dashed var(--border)', fontSize: 12, color: 'var(--text-2)' }}>
          Visitas, carrinho e checkout aparecem depois que o pixel do Live View estiver instalado na loja (aba Integrações). Pedidos e pagos já vêm direto da loja.
        </p>
      )}
    </section>
  )
}
