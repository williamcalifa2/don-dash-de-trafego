import "./FunnelBars.css";
import { fmtInt, fmtPct } from "../lib/format";

export default function FunnelBars({ stages }) {
  const max = stages[0]?.value || 1;

  return (
    <div className="funnel-bars">
      {stages.map((stage, i) => {
        const widthPct = Math.max(6, (stage.value / max) * 100);
        const ofTotalPct = (stage.value / max) * 100;
        const stepConv = i === 0 ? null : (stage.value / stages[i - 1].value) * 100;

        return (
          <div className="funnel-row" key={stage.name}>
            <div className="funnel-row-head">
              <span className="funnel-step-index tabular">{String(i + 1).padStart(2, "0")}</span>
              <span className="funnel-step-name">{stage.name}</span>
              <span className="funnel-step-value tabular">{fmtInt(stage.value)}</span>
            </div>

            <div className="funnel-track">
              <div
                className="funnel-fill"
                style={{ width: `${widthPct}%`, background: stage.color }}
              />
            </div>

            <div className="funnel-row-foot">
              <span className="tabular">{fmtPct(ofTotalPct)} do total</span>
              {stepConv !== null && (
                <span className="funnel-step-conv tabular" style={{ color: stage.color }}>
                  {fmtPct(stepConv)} da etapa anterior
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
