import { Router } from "express";
import { eadRepository, assistenciaRepository, eventosRepository } from "../repositories/index.js";

const router = Router();

const repos = {
  ead: eadRepository,
  "assistencia-tecnica": assistenciaRepository,
  "eventos-trade": eventosRepository,
};

router.get("/overview", async (req, res) => {
  const months = req.query.months;
  const [ead, assistencia, eventos] = await Promise.all([
    repos.ead.getAll(months),
    repos["assistencia-tecnica"].getAll(months),
    repos["eventos-trade"].getAll(months),
  ]);

  const sum = (series, key) => series.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);

  const leadsPeriodo = sum(eventos.series, "leads");

  const funil = {
    alcancados: sum(ead.series, "matriculas") + sum(assistencia.series, "chamados") + sum(eventos.series, "participantes"),
    engajados: sum(ead.series, "conclusoes") + sum(assistencia.series, "visitas") + leadsPeriodo,
    capacitados: sum(ead.series, "certificados"),
    convertidos: Math.round(leadsPeriodo * (eventos.summary.taxaConversaoPosEvento / 100)),
  };

  res.json({ ead, assistencia, eventos, funil });
});

router.post("/ead/cursos", async (req, res) => {
  const { nome, matriculas, conclusao } = req.body;
  if (!nome || matriculas == null || conclusao == null) {
    return res.status(400).json({ error: "Informe nome, matrículas e taxa de conclusão" });
  }
  const novoCurso = { nome: String(nome), matriculas: Number(matriculas), conclusao: Number(conclusao) };
  const data = await repos.ead.mutate((d) => {
    d.categorias.unshift(novoCurso);
    d.summary.cursosDisponiveis += 1;
    d.summary.alunosAtivos += novoCurso.matriculas;
  });
  res.status(201).json(data);
});

router.post("/assistencia-tecnica/chamados", async (req, res) => {
  const { regiao, motivo, tempoRespostaHoras, csat } = req.body;
  if (!regiao || !motivo || tempoRespostaHoras == null || csat == null) {
    return res.status(400).json({ error: "Informe estado, motivo, tempo de resposta e CSAT" });
  }
  const tempo = Number(tempoRespostaHoras);
  const csatNum = Number(csat);
  const data = await repos["assistencia-tecnica"].mutate((d) => {
    const ultimoMes = d.series[d.series.length - 1];
    ultimoMes.chamados += 1;

    let motivoRow = d.motivos.find((m) => m.nome === motivo);
    if (!motivoRow) {
      motivoRow = { nome: String(motivo), qtd: 0, pct: 0 };
      d.motivos.push(motivoRow);
    }
    motivoRow.qtd += 1;
    const totalMotivos = d.motivos.reduce((acc, m) => acc + m.qtd, 0);
    d.motivos.forEach((m) => (m.pct = Math.round((m.qtd / totalMotivos) * 1000) / 10));

    let regiaoRow = d.ranking.find((r) => r.regiao === regiao);
    if (!regiaoRow) {
      regiaoRow = { regiao: String(regiao), chamados: 0, tempoRespostaHoras: tempo, csat: csatNum };
      d.ranking.push(regiaoRow);
    } else {
      const totalAnterior = regiaoRow.chamados;
      regiaoRow.tempoRespostaHoras =
        Math.round(((regiaoRow.tempoRespostaHoras * totalAnterior + tempo) / (totalAnterior + 1)) * 10) / 10;
      regiaoRow.csat = Math.round(((regiaoRow.csat * totalAnterior + csatNum) / (totalAnterior + 1)) * 10) / 10;
    }
    regiaoRow.chamados += 1;
    d.ranking.sort((a, b) => b.chamados - a.chamados);

    d.summary.chamadosAbertos += 1;
  });
  res.status(201).json(data);
});

router.post("/eventos-trade/eventos", async (req, res) => {
  const { nome, tipo, cidade, regiao, participantes, leads } = req.body;
  if (!nome || !tipo || !cidade || !regiao || participantes == null || leads == null) {
    return res.status(400).json({ error: "Informe nome, tipo, cidade, estado, participantes e leads" });
  }
  const participantesNum = Number(participantes);
  const leadsNum = Number(leads);
  const data = await repos["eventos-trade"].mutate((d) => {
    d.destaques.unshift({ nome: String(nome), tipo: String(tipo), cidade: String(cidade), participantes: participantesNum, leads: leadsNum });

    const ultimoMes = d.series[d.series.length - 1];
    ultimoMes.eventos += 1;
    ultimoMes.participantes += participantesNum;
    ultimoMes.leads += leadsNum;

    let tipoRow = d.tipos.find((t) => t.nome === tipo);
    if (!tipoRow) {
      tipoRow = { nome: String(tipo), qtd: 0, participantes: 0 };
      d.tipos.push(tipoRow);
    }
    tipoRow.qtd += 1;
    tipoRow.participantes += participantesNum;

    let regiaoRow = d.ranking.find((r) => r.regiao === regiao);
    if (!regiaoRow) {
      regiaoRow = { regiao: String(regiao), eventos: 0, participantes: 0, leads: 0 };
      d.ranking.push(regiaoRow);
    }
    regiaoRow.eventos += 1;
    regiaoRow.participantes += participantesNum;
    regiaoRow.leads += leadsNum;
    d.ranking.sort((a, b) => b.eventos - a.eventos);

    d.summary.eventosRealizados += 1;
    d.summary.participantes += participantesNum;
    d.summary.leadsGerados += leadsNum;
  });
  res.status(201).json(data);
});

router.get("/:pillar", async (req, res) => {
  const repo = repos[req.params.pillar];
  if (!repo) return res.status(404).json({ error: "Pilar não encontrado" });
  const data = await repo.getAll(req.query.months);
  res.json(data);
});

export default router;
