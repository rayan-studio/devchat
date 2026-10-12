import { createServer } from "node:http";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { authRouter } from "./auth.js";
import { db } from "./db.js";
import { env, githubEnabled } from "./env.js";
import { startRealtime } from "./realtime.js";
import { api } from "./routes.js";

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: env.WEB_URL }));
app.use(express.json({ limit: "100kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/auth", authRouter);
app.use("/api", api);

app.use((_req, res) => {
  res.status(404).json({ error: "Introuvable" });
});

// Express 5 transmet ici les erreurs des routes async.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erreur interne du serveur" });
});

const server = createServer(app);
startRealtime(server);

server.listen(env.PORT, () => {
  console.log(`DevChat API prête sur ${env.SERVER_URL} (port ${env.PORT})`);
  console.log(`Connexion GitHub : ${githubEnabled ? "activée" : "non configurée"}, connexion de test : ${env.DEV_LOGIN ? "activée" : "désactivée"}`);
});

async function shutdown() {
  server.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
