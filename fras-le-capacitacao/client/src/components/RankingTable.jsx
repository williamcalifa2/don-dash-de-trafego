import "./RankingTable.css";

export default function RankingTable({ columns, rows, accent = "var(--ink)" }) {
  const max = Math.max(...rows.map((r) => Number(r[columns[1].key]) || 0), 1);

  return (
    <table className="ranking-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} className={col.align === "right" ? "align-right" : ""}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.regiao ?? i}>
            {columns.map((col, ci) => (
              <td key={col.key} className={col.align === "right" ? "align-right" : ""}>
                {ci === 1 ? (
                  <div className="bar-cell">
                    <span className="bar-track">
                      <span
                        className="bar-fill"
                        style={{
                          width: `${Math.max(4, ((Number(row[col.key]) || 0) / max) * 100)}%`,
                          background: accent,
                        }}
                      />
                    </span>
                    <span className="tabular bar-value">{col.format ? col.format(row[col.key]) : row[col.key]}</span>
                  </div>
                ) : col.format ? (
                  col.format(row[col.key])
                ) : (
                  row[col.key]
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
