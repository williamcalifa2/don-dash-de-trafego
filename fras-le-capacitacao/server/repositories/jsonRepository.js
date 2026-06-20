import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

const cache = new Map();

/**
 * Repository genérico baseado em arquivo JSON.
 * Implementa o mesmo contrato (getAll/getSummary/getSeries/getRanking) que uma
 * implementação futura sobre banco (ex: PostgresPillarRepository) deve seguir,
 * para troca sem alterar as rotas.
 */
export function createJsonRepository(fileName) {
  async function load() {
    if (cache.has(fileName)) return cache.get(fileName);
    const raw = await readFile(path.join(DATA_DIR, fileName), "utf-8");
    const parsed = JSON.parse(raw);
    cache.set(fileName, parsed);
    return parsed;
  }

  function filterByPeriod(series, months) {
    if (!months || months === "all") return series;
    const n = Number(months);
    if (!Number.isFinite(n) || n <= 0) return series;
    return series.slice(-n);
  }

  return {
    async getAll(months) {
      const data = await load();
      return {
        ...data,
        series: filterByPeriod(data.series, months),
      };
    },
    async getSummary() {
      const data = await load();
      return data.summary;
    },
    /**
     * Aplica `updater(data)` sobre o estado completo (sem filtro de período) e
     * persiste em disco. Quando esta troca por um repositório de banco, basta
     * substituir a escrita em arquivo por um UPDATE/INSERT transacional —
     * a assinatura do método continua a mesma para as rotas.
     */
    async mutate(updater) {
      const data = await load();
      updater(data);
      cache.set(fileName, data);
      await writeFile(path.join(DATA_DIR, fileName), JSON.stringify(data, null, 2) + "\n", "utf-8");
      return data;
    },
  };
}
