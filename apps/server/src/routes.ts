import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import { db, getAccessibleChannel, getMembership, publicUser } from "./db.js";
import { messageInclude, serializeMessage } from "./messages.js";
import { getIO, teamRoom } from "./realtime.js";

export const api = Router();
api.use(requireAuth);

const newInviteCode = () => crypto.randomBytes(9).toString("base64url");

/** Noms de canaux façon Slack : minuscules, chiffres, tirets. */
const channelName = z
  .string()
  .trim()
  .toLowerCase()
  .transform((s) => s.replace(/\s+/g, "-"))
  .pipe(
    z
      .string()
      .min(1, "Nom requis")
      .max(40, "40 caractères maximum")
      .regex(/^[a-z0-9][a-z0-9_-]*$/, "Lettres minuscules, chiffres, - et _ uniquement"),
  );

// --- Profil -----------------------------------------------------------------

api.get("/me", async (req, res) => {
  const user = await db.user.findUnique({
    where: { id: req.userId },
    select: {
      ...publicUser,
      memberships: {
        orderBy: { createdAt: "asc" },
        select: { role: true, team: { select: { id: true, name: true } } },
      },
    },
  });
  if (!user) {
    res.status(401).json({ error: "Compte introuvable" });
    return;
  }
  const { memberships, ...profile } = user;
  res.json({
    user: profile,
    teams: memberships.map((m) => ({ ...m.team, role: m.role })),
  });
});

// --- Équipes ----------------------------------------------------------------

const createTeamSchema = z.object({ name: z.string().trim().min(2).max(50) });

api.post("/teams", async (req, res) => {
  const parsed = createTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Le nom d'équipe doit faire entre 2 et 50 caractères" });
    return;
  }
  const team = await db.team.create({
    data: {
      name: parsed.data.name,
      inviteCode: newInviteCode(),
      members: { create: { userId: req.userId!, role: "OWNER" } },
      channels: {
        create: [
          { name: "general", topic: "Discussions de toute l'équipe" },
          { name: "random", topic: "Tout le reste" },
        ],
      },
    },
    select: { id: true, name: true },
  });
  res.status(201).json({ ...team, role: "OWNER" });
});

api.get("/teams/:teamId", async (req, res) => {
  const membership = await getMembership(req.userId!, req.params.teamId);
  if (!membership) {
    res.status(404).json({ error: "Équipe introuvable" });
    return;
  }
  const team = await db.team.findUnique({
    where: { id: req.params.teamId },
    select: {
      id: true,
      name: true,
      inviteCode: true,
      channels: { orderBy: { name: "asc" }, select: { id: true, name: true, topic: true } },
      members: {
        orderBy: { createdAt: "asc" },
        select: { role: true, user: { select: publicUser } },
      },
    },
  });
  res.json({
    ...team,
    role: membership.role,
    members: team!.members.map((m) => ({ ...m.user, role: m.role })),
  });
});

/** Régénère le lien d'invitation (l'ancien cesse de fonctionner). Réservé au propriétaire. */
api.post("/teams/:teamId/invite/reset", async (req, res) => {
  const membership = await getMembership(req.userId!, req.params.teamId);
  if (membership?.role !== "OWNER") {
    res.status(403).json({ error: "Réservé au propriétaire de l'équipe" });
    return;
  }
  const team = await db.team.update({
    where: { id: req.params.teamId },
    data: { inviteCode: newInviteCode() },
    select: { inviteCode: true },
  });
  res.json(team);
});

api.get("/invites/:code", async (req, res) => {
  const team = await db.team.findUnique({
    where: { inviteCode: req.params.code },
    select: { id: true, name: true, _count: { select: { members: true } } },
  });
  if (!team) {
    res.status(404).json({ error: "Invitation invalide ou expirée" });
    return;
  }
  res.json({ id: team.id, name: team.name, memberCount: team._count.members });
});

api.post("/invites/:code/join", async (req, res) => {
  const team = await db.team.findUnique({ where: { inviteCode: req.params.code } });
  if (!team) {
    res.status(404).json({ error: "Invitation invalide ou expirée" });
    return;
  }
  const membership = await db.membership.upsert({
    where: { userId_teamId: { userId: req.userId!, teamId: team.id } },
    create: { userId: req.userId!, teamId: team.id },
    update: {},
    include: { user: { select: publicUser } },
  });
  getIO()
    .to(teamRoom(team.id))
    .emit("member:joined", { teamId: team.id, member: { ...membership.user, role: membership.role } });
  res.json({ id: team.id, name: team.name, role: membership.role });
});

// --- Canaux -----------------------------------------------------------------

const createChannelSchema = z.object({
  name: channelName,
  topic: z.string().trim().max(200).optional(),
});

api.post("/teams/:teamId/channels", async (req, res) => {
  const membership = await getMembership(req.userId!, req.params.teamId);
  if (!membership) {
    res.status(404).json({ error: "Équipe introuvable" });
    return;
  }
  const parsed = createChannelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Nom invalide" });
    return;
  }
  const exists = await db.channel.findUnique({
    where: { teamId_name: { teamId: req.params.teamId, name: parsed.data.name } },
  });
  if (exists) {
    res.status(409).json({ error: "Un canal porte déjà ce nom" });
    return;
  }
  const channel = await db.channel.create({
    data: { teamId: req.params.teamId, name: parsed.data.name, topic: parsed.data.topic || null },
    select: { id: true, name: true, topic: true },
  });
  getIO().to(teamRoom(req.params.teamId)).emit("channel:created", { teamId: req.params.teamId, channel });
  res.status(201).json(channel);
});

// --- Messages ---------------------------------------------------------------

const PAGE_SIZE = 50;

/** Historique d'un canal, du plus récent au plus ancien, paginé avec ?before=<id>. */
api.get("/channels/:channelId/messages", async (req, res) => {
  const channel = await getAccessibleChannel(req.userId!, req.params.channelId);
  if (!channel) {
    res.status(404).json({ error: "Canal introuvable" });
    return;
  }
  const before = typeof req.query.before === "string" ? req.query.before : undefined;
  const rows = await db.message.findMany({
    where: { channelId: channel.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    include: messageInclude,
  });
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE).reverse();
  res.json({ messages: page.map(serializeMessage), hasMore });
});
