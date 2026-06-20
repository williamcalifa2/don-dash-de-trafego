import Icon from "./Icon";
import { usePeriod, PERIOD_OPTIONS } from "../lib/PeriodContext";
import "./Topbar.css";

export default function Topbar({ title, subtitle, accent, onNew, newLabel = "Novo Registro" }) {
  const { months, setMonths } = usePeriod();

  return (
    <header className="topbar">
      <div className="topbar-title">
        {accent && <span className="topbar-accent" style={{ background: accent }} />}
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>

      <div className="topbar-actions">
        <div className="period-control" role="group" aria-label="Período">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={months === opt.value ? "period-btn active" : "period-btn"}
              onClick={() => setMonths(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button className="export-btn" onClick={() => window.print()}>
          <Icon name="export" size={15} />
          Exportar
        </button>
        {onNew && (
          <button className="new-record-btn" style={{ "--pillar-accent": accent }} onClick={onNew}>
            + {newLabel}
          </button>
        )}
      </div>
    </header>
  );
}
