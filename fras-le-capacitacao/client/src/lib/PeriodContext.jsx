import { createContext, useContext, useMemo, useState } from "react";

const PeriodContext = createContext(null);

export const PERIOD_OPTIONS = [
  { value: "3", label: "3 meses" },
  { value: "6", label: "6 meses" },
  { value: "12", label: "12 meses" },
  { value: "all", label: "Tudo" },
];

export function PeriodProvider({ children }) {
  const [months, setMonths] = useState("12");
  const value = useMemo(() => ({ months, setMonths }), [months]);
  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error("usePeriod precisa estar dentro de PeriodProvider");
  return ctx;
}
