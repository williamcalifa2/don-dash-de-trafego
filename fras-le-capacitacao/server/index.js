import express from "express";
import cors from "cors";
import pillarsRouter from "./routes/pillars.js";

const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api", pillarsRouter);

app.listen(PORT, () => {
  console.log(`Fras-le Capacitação API rodando em http://localhost:${PORT}`);
});
