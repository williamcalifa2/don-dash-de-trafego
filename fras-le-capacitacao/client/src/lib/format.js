const intFmt = new Intl.NumberFormat("pt-BR");
const decFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const moneyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function fmtInt(n) {
  return intFmt.format(n ?? 0);
}

export function fmtDec(n) {
  return decFmt.format(n ?? 0);
}

export function fmtPct(n) {
  return `${decFmt.format(n ?? 0)}%`;
}

export function fmtMoney(n) {
  return moneyFmt.format(n ?? 0);
}

export function fmtMonth(isoMonth) {
  const [year, month] = isoMonth.split("-");
  const labels = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${labels[Number(month) - 1]}/${year.slice(2)}`;
}
