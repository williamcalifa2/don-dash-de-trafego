import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
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
import { fmtInt, fmtMonth, fmtPct, fmtDec } from "../lib/format";
import { gridColor, axisTick, tooltipStyle, tooltipLabelStyle } from "../lib/chartTheme";
import { PILLARS } from "../lib/pillars";
import { UFS } from "../lib/regions";

const COR = PILLARS["assistencia-tecnica"].cor;
const DONUT_COLORS = ["var(--red)", "#e35a5e", "#c81e23", "#8c8a86", "#cfc9bc"];
const MOTIVOS_PADRAO = ["Ruído / Vibração", "Desgaste Prematuro", "Instalação Incorreta", "Garantia de Produto", "Dúvida Técnica de Aplicação"];

export default function AssistenciaTecnica() {
  const { months } = usePeriod();
  const { data, loading, error, refetch } = useApiData(() => api.pillar("assistencia-tecnica", months), [months]);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState("");

  return (
    <>
      <Topbar
        title="Assistência Técnica"
        subtitle="Atendimento, garantia e suporte de campo"
        accent={COR}
        onNew={() => setModalOpen(true)}
        newLabel="Novo Chamado"
      />
      <div className="page-content">
        {loading && <LoadingBlock />}
        {error && <ErrorBlock message={error.message} />}
        {data && <AssistenciaBody data={data} />}
      </div>

      <Modal open={modalOpen} title="Registrar Novo Chamado" accent={COR} onClose={() => setModalOpen(false)}>
        <NovoChamadoForm
          onCancel={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            setToast("Chamado registrado com sucesso.");
            refetch();
          }}
        />
      </Modal>
      <Toast message={toast} onDismiss={() => setToast("")} />
    </>
  );
}

function NovoChamadoForm({ onCancel, onSaved }) {
  const [form, setForm] = useState({ regiao: "SP", motivo: MOTIVOS_PADRAO[0], tempoRespostaHoras: "", csat: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    if (form.tempoRespostaHoras === "" || form.csat === "") {
      setFormError("Preencha todos os campos.");
      return;
    }
    setSubmitting(true);
    try {
      await api.addChamado({
        regiao: form.regiao,
        motivo: form.motivo,
        tempoRespostaHoras: Number(form.tempoRespostaHoras),
        csat: Number(form.csat),
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
      <div className="form-row">
        <div className="form-field">
          <label>Estado</label>
          <select value={form.regiao} onChange={set("regiao")}>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Motivo</label>
          <select value={form.motivo} onChange={set("motivo")}>
            {MOTIVOS_PADRAO.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Tempo de resposta (h)</label>
          <input type="number" min="0" step="0.1" value={form.tempoRespostaHoras} onChange={set("tempoRespostaHoras")} placeholder="0.0" />
        </div>
        <div className="form-field">
          <label>CSAT (0–5)</label>
          <input type="number" min="0" max="5" step="0.1" value={form.csat} onChange={set("csat")} placeholder="0.0" />
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="form-btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="form-btn-primary" disabled={submitting}>
          {submitting ? "Salvando…" : "Registrar Chamado"}
        </button>
      </div>
    </form>
  );
}

function AssistenciaBody({ data }) {
  const { summary, series, motivos, ranking } = data;
  const garantiaTaxa = (summary.garantiasAprovadas / summary.garantiasAnalisadas) * 100;

  return (
    <>
      <div className="kpi-grid">
        <KpiCard label="Chamados no período" value={fmtInt(summary.chamadosAbertos)} accent={COR} />
        <KpiCard label="Tempo médio de resposta" value={fmtDec(summary.tempoMedioRespostaHoras)} unit="h" accent={COR} />
        <KpiCard label="Resolução 1º contato" value={fmtPct(summary.taxaResolucaoPrimeiroContato)} accent={COR} />
        <KpiCard label="Visitas técnicas" value={fmtInt(summary.visitasTecnicas)} accent={COR} />
        <KpiCard label="Garantias aprovadas" value={fmtPct(garantiaTaxa)} accent={COR} hint={`${fmtInt(summary.garantiasAprovadas)} de ${fmtInt(summary.garantiasAnalisadas)}`} />
        <KpiCard label="Satisfação (CSAT)" value={fmtDec(summary.csat)} unit="/ 5" accent={COR} />
      </div>

      <div className="grid-2-1" style={{ marginTop: 18 }}>
        <Panel title="Chamados x Visitas Técnicas" subtitle="Evolução mensal">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series} margin={{ left: -16 }}>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="mes" tickFormatter={fmtMonth} tick={axisTick} axisLine={{ stroke: gridColor }} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} labelFormatter={fmtMonth} formatter={fmtInt} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="chamados" name="Chamados" stroke={COR} strokeWidth={2.4} dot={false} />
              <Line type="monotone" dataKey="visitas" name="Visitas técnicas" stroke="var(--ink-faint)" strokeWidth={2} dot={false} strokeDasharray="4 3" />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Motivos de Chamado" subtitle="Distribuição no período">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(v) => fmtInt(v)} />
              <Pie data={motivos} dataKey="qtd" nameKey="nome" innerRadius={56} outerRadius={84} paddingAngle={2}>
                {motivos.map((_, i) => (
                  <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} stroke="none" />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="legend-list">
            {motivos.map((m, i) => (
              <div key={m.nome} className="legend-item">
                <span className="legend-dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                <span className="legend-name">{m.nome}</span>
                <span className="tabular legend-pct">{fmtPct(m.pct)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <h2 className="section-title">Ranking por Estado</h2>
      <Panel>
        <RankingTable
          accent={COR}
          columns={[
            { key: "regiao", label: "UF" },
            { key: "chamados", label: "Chamados", format: fmtInt },
            { key: "tempoRespostaHoras", label: "Tempo resposta", align: "right", format: (v) => `${fmtDec(v)}h` },
            { key: "csat", label: "CSAT", align: "right", format: (v) => fmtDec(v) },
          ]}
          rows={ranking}
        />
      </Panel>
    </>
  );
}
