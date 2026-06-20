import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PeriodProvider } from "./lib/PeriodContext";
import Layout from "./components/Layout";
import Overview from "./pages/Overview";
import Ead from "./pages/Ead";
import AssistenciaTecnica from "./pages/AssistenciaTecnica";
import EventosTrade from "./pages/EventosTrade";

export default function App() {
  return (
    <PeriodProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="ead" element={<Ead />} />
            <Route path="assistencia-tecnica" element={<AssistenciaTecnica />} />
            <Route path="eventos-trade" element={<EventosTrade />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PeriodProvider>
  );
}
