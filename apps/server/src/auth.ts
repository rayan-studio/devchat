import crypto from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "./db.js";
import { env, githubEnabled } from "./env.js";

const TOKEN_TTL = "30d";

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/** Renvoie l'id utilisateur contenu dans le jeton, ou null s'il est invalide. */
export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    return typeof payload === "object" && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Middleware : exige un en-tête « Authorization: Bearer <jeton> » valide. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const userId = verifyToken(token);
  if (!userId) {
    res.status(401).json({ error: "Non connecté" });
    return;
  }
  req.userId = userId;
  next();
}

/** Redirige vers l'interface web avec le jeton dans le fragment d'URL (jamais envoyé aux serveurs). */
function redirectWithToken(res: Response, userId: string) {
  const token = signToken(userId);
  res.redirect(`${env.WEB_URL}/auth/callback#token=${encodeURIComponent(token)}`);
}

// États OAuth en attente (anti-CSRF). En mémoire : suffisant pour un seul serveur.
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;

function createState(): string {
  const now = Date.now();
  for (const [s, createdAt] of pendingStates) {
    if (now - createdAt > STATE_TTL_MS) pendingStates.delete(s);
  }
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, now);
  return state;
}

function consumeState(state: unknown): boolean {
  if (typeof state !== "string") return false;
  const createdAt = pendingStates.get(state);
  pendingStates.delete(state);
  return createdAt !== undefined && Date.now() - createdAt <= STATE_TTL_MS;
}

export const authRouter = Router();

authRouter.get("/providers", (_req, res) => {
  res.json({ github: githubEnabled, dev: env.DEV_LOGIN });
});

authRouter.get("/github", (_req, res) => {
  if (!githubEnabled) {
    res.status(503).send("Connexion GitHub non configurée (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET).");
    return;
  }
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.SERVER_URL}/auth/github/callback`,
    scope: "read:user",
    state: createState(),
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

authRouter.get("/github/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!githubEnabled || typeof code !== "string" || !consumeState(state)) {
    res.redirect(`${env.WEB_URL}/?error=github`);
    return;
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${env.SERVER_URL}/auth/github/callback`,
    }),
  });
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    res.redirect(`${env.WEB_URL}/?error=github`);
    return;
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "devchat",
    },
  });
  if (!userRes.ok) {
    res.redirect(`${env.WEB_URL}/?error=github`);
    return;
  }
  const gh = (await userRes.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string;
  };

  // Un pseudo GitHub peut avoir été pris entre-temps par un compte de test : on le libère.
  const user = await db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { githubId: gh.id } });
    if (!existing) {
      await tx.user.updateMany({
        where: { login: gh.login, githubId: null },
        data: { login: `${gh.login}-dev-${Date.now()}` },
      });
    }
    return tx.user.upsert({
      where: { githubId: gh.id },
      create: { githubId: gh.id, login: gh.login, name: gh.name, avatarUrl: gh.avatar_url },
      update: { login: gh.login, name: gh.name, avatarUrl: gh.avatar_url },
    });
  });

  redirectWithToken(res, user.id);
});

const devLoginSchema = z.object({
  login: z
    .string()
    .trim()
    .min(2)
    .max(39)
    .regex(/^[a-zA-Z0-9-]+$/, "Lettres, chiffres et tirets uniquement"),
});

/** Connexion de test sans GitHub, activée seulement si DEV_LOGIN=true. */
authRouter.post("/dev", async (req, res) => {
  if (!env.DEV_LOGIN) {
    res.status(404).json({ error: "Désactivé" });
    return;
  }
  const parsed = devLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Pseudo invalide" });
    return;
  }
  const { login } = parsed.data;
  const existing = await db.user.findUnique({ where: { login } });
  if (existing?.githubId) {
    res.status(409).json({ error: "Ce pseudo appartient à un compte GitHub" });
    return;
  }
  const user = existing ?? (await db.user.create({ data: { login } }));
  res.json({ token: signToken(user.id) });
});
