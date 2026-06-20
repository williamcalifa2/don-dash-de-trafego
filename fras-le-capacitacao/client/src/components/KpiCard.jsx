import "./KpiCard.css";

export default function KpiCard({ label, value, unit, trend, accent = "var(--ink)", hint }) {
  const trendPositive = typeof trend === "number" && trend >= 0;
  return (
    <div className="kpi-card">
      <span className="kpi-accent" style={{ background: accent, boxShadow: `0 0 14px -1px ${accent}` }} />
      <div className="kpi-label">{label}</div>
      <div className="kpi-value-row">
        <span className="kpi-value tabular">{value}</span>
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      <div className="kpi-meta">
        {typeof trend === "number" && (
          <span className={trendPositive ? "kpi-trend up" : "kpi-trend down"}>
            {trendPositive ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
        {hint && <span className="kpi-hint">{hint}</span>}
      </div>
    </div>
  );
}
