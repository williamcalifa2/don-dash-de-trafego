const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4001/api";

async function get(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao buscar ${path}: ${res.status}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Falha ao salvar ${path}`);
  return json;
}

export const api = {
  overview: (months) => get("/overview", { months }),
  pillar: (slug, months) => get(`/${slug}`, { months }),
  addCurso: (payload) => post("/ead/cursos", payload),
  addChamado: (payload) => post("/assistencia-tecnica/chamados", payload),
  addEvento: (payload) => post("/eventos-trade/eventos", payload),
};
