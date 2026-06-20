import { NavLink } from "react-router-dom";
import Icon from "./Icon";
import { PILLAR_LIST } from "../lib/pillars";
import "./Sidebar.css";

const NAV_ICON = {
  ead: "book",
  "assistencia-tecnica": "wrench",
  "eventos-trade": "flag",
};

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <span className="brand-mark-bar" />
          <span className="brand-mark-bar brand-mark-bar--short" />
        </div>
        <div className="brand-text">
          <strong>FRAS-LE</strong>
          <span>Programa de Capacitação</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <span className="sidebar-section">Painel</span>
        <NavLink to="/" end className="sidebar-link">
          <Icon name="grid" size={16} />
          <span>Visão Geral</span>
        </NavLink>

        <span className="sidebar-section">Pilares</span>
        {PILLAR_LIST.map((p) => (
          <NavLink key={p.slug} to={`/${p.slug}`} className="sidebar-link">
            <Icon name={NAV_ICON[p.slug]} size={16} />
            <span>{p.nome}</span>
            <span className="pillar-dot" style={{ background: p.cor }} />
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-row">
          <span className="status-dot" />
          <span>Dados consolidados</span>
        </div>
        <span className="sidebar-footer-meta">Pós-Venda &amp; Mercado de Reposição</span>
      </div>
    </aside>
  );
}
