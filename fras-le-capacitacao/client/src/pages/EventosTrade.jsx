import { useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
} from "recharts";
import Topbar from "../components/Topbar";
import KpiCard from "../components/KpiCard";
import Panel from "../components/Panel";
import RankingTable from "../components/RankingTable";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import { LoadingBlock, ErrorBlock } from "../components/StateBlock";
import { usePeriod } from "../lib/PeriodContext";
import { useApiData } from "../lib/useApiData";
import { api } from "../lib/api";
import { fmtInt, fmtMonth, fmtPct, fmtMoney } from "../lib/format";
import { gridColor, axisTick, tooltipStyle, tooltipLabelStyle } from "../lib/chartTheme";
import { PILLARS } from "../lib/pillars";
import { UFS } from "../lib/regions";

const COR = PILLARS["eventos-trade"].cor;
const TIPOS_PADRAO = ["Feira Setorial", "Treinamento Presencial Regional", "Caravana Trade (Distribuidor)", "Convenção de Rede"];

export default function EventosTrade() {
  const { months } = usePeriod();
  const { data, loading, error, refetch } = useApiData(() => api.pillar("eventos-trade", months), [months]);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState("");

  return (
    <>
      <Topbar
        title="Eventos & Trade"
        subtitle="Feiras, treinamentos presenciais e ativação de canal"
        accent={COR}
        onNew={() => setModalOpen(true)}
        newLabel="Novo Evento"
      />
      <div className="page-content">
        {loading && <LoadingBlock />}
        {error && <ErrorBlock message={error.message} />}
        {data && <EventosBody data={data} />}
      </div>

      <Modal open={modalOpen} title="Cadastrar Novo Evento" accent={COR} onClose={() => setModalOpen(false)}>
        <NovoEventoForm
          onCancel={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            setToast("Evento cadastrado com sucesso.");
            refetch();
          }}
        />
      </Modal>
      <Toast message={toast} onDismiss={() => setToast("")} />
    </>
  );
}

function NovoEventoForm({ onCancel, onSaved }) {
  const [form, setForm] = useState({
    nome: "",
    tipo: TIPOS_PADRAO[0],
    cidade: "",
    regiao: "SP",
    participantes: "",
    leads: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    if (!form.nome.trim() || !form.cidade.trim() || form.participantes === "" || form.leads === "") {
      setFormError("Preencha todos os campos.");
      return;
    }
    setSubmitting(true);
    try {
      await api.addEvento({
        nome: form.nome.trim(),
        tipo: form.tipo,
        cidade: form.cidade.trim(),
        regiao: form.regiao,
        participantes: Number(form.participantes),
        leads: Number(form.leads),
      });
      onSaved();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {formError && <div className="form-error">{formError}</div>}
      <div className="form-field">
        <label>Nome do evento</label>
        <input value={form.nome} onChange={set("nome")} placeholder="Ex: Feira Automec Regional Sul" autoFocus />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Tipo</label>
          <select value={form.tipo} onChange={set("tipo")}>
            {TIPOS_PADRAO.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Estado</label>
          <select value={form.regiao} onChange={set("regiao")}>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-field">
        <label>Cidade</label>
        <input value={form.cidade} onChange={set("cidade")} placeholder="Ex: Caxias do Sul, RS" />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Participantes</label>
          <input type="number" min="0" value={form.participantes} onChange={set("participantes")} placeholder="0" />
        </div>
        <div className="form-field">
          <label>Leads gerados</label>
          <input type="number" min="0" value={form.leads} onChange={set("leads")} placeholder="0" />
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="form-btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="form-btn-primary" disabled={submitting}>
          {submitting ? "Salvando…" : "Salvar Evento"}
        </button>
      </div>
    </form>
  );
}

function EventosBody({ data }) {
  const { summary, series, tipos, ranking, destaques } = data;

  return (
    <>
      <div className="kpi-grid">
        <KpiCard label="Eventos realizados" value={fmtInt(summary.eventosRealizados)} accent={COR} />
        <KpiCard label="Participantes" value={fmtInt(summary.participantes)} accent={COR} />
        <KpiCard label="Distribuidores engajados" value={fmtInt(summary.distribuidoresEngajados)} accent={COR} />
        <KpiCard label="Varejistas engajados" value={fmtInt(summary.varejistasEngajados)} accent={COR} />
        <KpiCard label="Investimento em trade" value={fmtMoney(summary.investimentoReais)} accent={COR} />
        <KpiCard label="Conversão pós-evento" value={fmtPct(summary.taxaConversaoPosEvento)} accent={COR} hint={`${fmtInt(summary.leadsGerados)} leads`} />
      </div>

      <div className="grid-2-1" style={{ marginTop: 18 }}>
        <Panel title="Eventos x Leads Gerados" subtitle="Evolução mensal">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={series} margin={{ left: -16 }}>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="mes" tickFormatter={fmtMonth} tick={axisTick} axisLine={{ stroke: gridColor }} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} labelFormatter={fmtMonth} formatter={fmtInt} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="eventos" name="Eventos" fill="var(--gold-tint)" stroke={COR} strokeWidth={1.2} barSize={18} radius={[2, 2, 0, 0]} />
              <Line type="monotone" dataKey="leads" name="Leads" stroke="var(--ink)" strokeWidth={2.2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Por Tipo de Evento" subtitle="Quantidade no período">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={tipos} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid stroke={gridColor} horizontal={false} />
              <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis dataKey="nome" type="category" width={150} tick={{ ...axisTick, fontSize: 10.5 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={fmtInt} />
              <Bar dataKey="qtd" fill={COR} radius={[0, 2, 2, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid-2-1" style={{ marginTop: 18 }}>
        <Panel>
          <h2 className="section-title" style={{ margin: "0 0 10px" }}>Ranking por Estado</h2>
          <RankingTable
            accent={COR}
            columns={[
              { key: "regiao", label: "UF" },
              { key: "eventos", label: "Eventos", format: fmtInt },
              { key: "participantes", label: "Participantes", align: "right", format: fmtInt },
              { key: "leads", label: "Leads", align: "right", format: fmtInt },
            ]}
            rows={ranking}
          />
        </Panel>

        <Panel>
          <h2 className="section-title" style={{ margin: "0 0 10px" }}>Eventos em Destaque</h2>
          <div className="highlight-list">
            {destaques.map((d) => (
              <div key={d.nome} className="highlight-item">
                <div className="highlight-head">
                  <strong>{d.nome}</strong>
                  <span>{d.tipo}</span>
                </div>
                <div className="highlight-meta">
                  <span>{d.cidade}</span>
                  <span className="tabular">{fmtInt(d.participantes)} participantes</span>
                  <span className="tabular">{fmtInt(d.leads)} leads</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
