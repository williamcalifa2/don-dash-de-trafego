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
  BarChart,
  Bar,
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
import { fmtInt, fmtMonth, fmtPct } from "../lib/format";
import { gridColor, axisTick, tooltipStyle, tooltipLabelStyle } from "../lib/chartTheme";
import { PILLARS } from "../lib/pillars";

const COR = PILLARS.ead.cor;

export default function Ead() {
  const { months } = usePeriod();
  const { data, loading, error, refetch } = useApiData(() => api.pillar("ead", months), [months]);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState("");

  return (
    <>
      <Topbar
        title="EAD"
        subtitle="Capacitação a Distância — mecânicos, distribuidores e varejistas"
        accent={COR}
        onNew={() => setModalOpen(true)}
        newLabel="Novo Curso"
      />
      <div className="page-content">
        {loading && <LoadingBlock />}
        {error && <ErrorBlock message={error.message} />}
        {data && <EadBody data={data} />}
      </div>

      <Modal open={modalOpen} title="Cadastrar Novo Curso" accent={COR} onClose={() => setModalOpen(false)}>
        <NovoCursoForm
          onCancel={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            setToast("Curso cadastrado com sucesso.");
            refetch();
          }}
        />
      </Modal>
      <Toast message={toast} onDismiss={() => setToast("")} />
    </>
  );
}

function NovoCursoForm({ onCancel, onSaved }) {
  const [form, setForm] = useState({ nome: "", matriculas: "", conclusao: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    if (!form.nome.trim() || form.matriculas === "" || form.conclusao === "") {
      setFormError("Preencha todos os campos.");
      return;
    }
    setSubmitting(true);
    try {
      await api.addCurso({
        nome: form.nome.trim(),
        matriculas: Number(form.matriculas),
        conclusao: Number(form.conclusao),
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
        <label>Nome do curso</label>
        <input value={form.nome} onChange={set("nome")} placeholder="Ex: Sistemas de Freio ABS" autoFocus />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Matrículas</label>
          <input type="number" min="0" value={form.matriculas} onChange={set("matriculas")} placeholder="0" />
        </div>
        <div className="form-field">
          <label>Taxa de conclusão (%)</label>
          <input type="number" min="0" max="100" step="0.1" value={form.conclusao} onChange={set("conclusao")} placeholder="0.0" />
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="form-btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="form-btn-primary" disabled={submitting}>
          {submitting ? "Salvando…" : "Salvar Curso"}
        </button>
      </div>
    </form>
  );
}

function EadBody({ data }) {
  const { summary, series, categorias, ranking } = data;

  return (
    <>
      <div className="kpi-grid">
        <KpiCard label="Cursos disponíveis" value={fmtInt(summary.cursosDisponiveis)} accent={COR} />
        <KpiCard label="Alunos ativos" value={fmtInt(summary.alunosAtivos)} accent={COR} hint="Base atual" />
        <KpiCard label="Taxa de conclusão" value={fmtPct(summary.taxaConclusao)} accent={COR} />
        <KpiCard label="Certificados emitidos" value={fmtInt(summary.certificadosEmitidos)} accent={COR} />
        <KpiCard label="Horas de treinamento" value={fmtInt(summary.horasTreinamento)} accent={COR} hint="Acumulado" />
        <KpiCard label="NPS do programa" value={summary.nps} accent={COR} />
      </div>

      <div className="grid-2-1" style={{ marginTop: 18 }}>
        <Panel title="Matrículas x Conclusões" subtitle="Evolução mensal">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series} margin={{ left: -16 }}>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="mes" tickFormatter={fmtMonth} tick={axisTick} axisLine={{ stroke: gridColor }} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} labelFormatter={fmtMonth} formatter={fmtInt} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="matriculas" name="Matrículas" stroke={COR} strokeWidth={2.4} dot={false} />
              <Line type="monotone" dataKey="conclusoes" name="Conclusões" stroke="var(--ink-faint)" strokeWidth={2} dot={false} strokeDasharray="4 3" />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Por Categoria" subtitle="Matrículas no período">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={categorias} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid stroke={gridColor} horizontal={false} />
              <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis dataKey="nome" type="category" width={140} tick={{ ...axisTick, fontSize: 10.5 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={fmtInt} />
              <Bar dataKey="matriculas" fill={COR} radius={[0, 2, 2, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <h2 className="section-title">Ranking por Estado</h2>
      <Panel>
        <RankingTable
          accent={COR}
          columns={[
            { key: "regiao", label: "UF" },
            { key: "matriculas", label: "Matrículas", format: fmtInt },
            { key: "conclusao", label: "Conclusão", align: "right", format: fmtPct },
            { key: "certificados", label: "Certificados", align: "right", format: fmtInt },
          ]}
          rows={ranking}
        />
      </Panel>
    </>
  );
}
