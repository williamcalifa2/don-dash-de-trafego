import { Link } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import Topbar from "../components/Topbar";
import KpiCard from "../components/KpiCard";
import Panel from "../components/Panel";
import RankingTable from "../components/RankingTable";
import FunnelBars from "../components/FunnelBars";
import { LoadingBlock, ErrorBlock } from "../components/StateBlock";
import { usePeriod } from "../lib/PeriodContext";
import { useApiData } from "../lib/useApiData";
import { api } from "../lib/api";
import { fmtInt, fmtMonth } from "../lib/format";
import { PILLAR_LIST } from "../lib/pillars";

export default function Overview() {
  const { months } = usePeriod();
  const { data, loading, error } = useApiData(() => api.overview(months), [months]);

  return (
    <>
      <Topbar title="Visão Geral" subtitle="Consolidado dos 3 pilares do programa de capacitação" />
      <div className="page-content">
        {loading && <LoadingBlock />}
        {error && <ErrorBlock message={error.message} />}
        {data && <OverviewBody data={data} />}
      </div>
    </>
  );
}

function OverviewBody({ data }) {
  const { ead, assistencia, eventos, funil } = data;

  const kpis = [
    { label: "Mecânicos Certificados", value: fmtInt(ead.summary.certificadosEmitidos), accent: "var(--blue)", hint: "EAD · acumulado" },
    { label: "Atendimentos Técnicos", value: fmtInt(assistencia.summary.chamadosAbertos), accent: "var(--red)", hint: "Assistência Técnica · período" },
    { label: "Eventos Realizados", value: fmtInt(eventos.summary.eventosRealizados), accent: "var(--gold)", hint: `${fmtInt(eventos.summary.participantes)} participantes` },
    { label: "Leads Convertidos", value: fmtInt(funil.convertidos), accent: "var(--ink)", hint: "Pós-evento · trade" },
  ];

  const funnelStages = [
    { name: "Alcançados", value: funil.alcancados, color: "#5b6178", colorDark: "#34394a" },
    { name: "Engajados", value: funil.engajados, color: "#e2a93f", colorDark: "#b9791a" },
    { name: "Capacitados", value: funil.capacitados, color: "#3d96e8", colorDark: "#0d4b8a" },
    { name: "Convertidos", value: funil.convertidos, color: "#ff4347", colorDark: "#c81e23" },
  ];

  const regiaoTotais = mergeRegioes(ead.ranking, assistencia.ranking, eventos.ranking);

  return (
    <>
      <div className="kpi-grid">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <div className="grid-2-1" style={{ marginTop: 18 }}>
        <Panel title="Funil de Capacitação" subtitle="Do alcance à conversão em negócio, somando os 3 pilares">
          <FunnelBars stages={funnelStages} />
        </Panel>

        <Panel title="Estados em Destaque" subtitle="Soma de atividade dos 3 pilares">
          <RankingTable
            accent="var(--ink)"
            columns={[
              { key: "regiao", label: "UF" },
              { key: "total", label: "Atividade total", format: fmtInt },
            ]}
            rows={regiaoTotais.slice(0, 6)}
          />
        </Panel>
      </div>

      <h2 className="section-title">Pilares</h2>
      <div className="pillar-card-grid">
        {PILLAR_LIST.map((p) => {
          const source = p.slug === "ead" ? ead : p.slug === "assistencia-tecnica" ? assistencia : eventos;
          return <PillarMiniCard key={p.slug} pillar={p} source={source} />;
        })}
      </div>
    </>
  );
}

function PillarMiniCard({ pillar, source }) {
  const seriesKey = Object.keys(source.series[0]).filter((k) => k !== "mes")[0];
  return (
    <Link to={`/${pillar.slug}`} className="pillar-mini-card" style={{ "--pillar-color": pillar.cor }}>
      <div className="pillar-mini-head">
        <span className="pillar-mini-dot" />
        <span className="pillar-mini-name">{pillar.nomeLongo}</span>
        <span className="pillar-mini-arrow">→</span>
      </div>
      <ResponsiveContainer width="100%" height={64}>
        <LineChart data={source.series}>
          <Line type="monotone" dataKey={seriesKey} stroke={pillar.cor} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="pillar-mini-foot">
        <span>{fmtMonth(source.series[0].mes)} — {fmtMonth(source.series[source.series.length - 1].mes)}</span>
      </div>
    </Link>
  );
}

function mergeRegioes(...rankings) {
  const map = new Map();
  rankings.forEach((ranking) => {
    ranking.forEach((row) => {
      const valueKey = Object.keys(row).find((k) => k !== "regiao");
      const current = map.get(row.regiao) || 0;
      map.set(row.regiao, current + (Number(row[valueKey]) || 0));
    });
  });
  return [...map.entries()]
    .map(([regiao, total]) => ({ regiao, total }))
    .sort((a, b) => b.total - a.total);
}
