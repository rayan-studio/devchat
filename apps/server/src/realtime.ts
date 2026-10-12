import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { verifyToken } from "./auth.js";
import { db, getAccessibleChannel, getMembership, publicUser } from "./db.js";
import { env } from "./env.js";
import { messageInclude, serializeMessage } from "./messages.js";

let io: Server | undefined;

export const teamRoom = (teamId: string) => `team:${teamId}`;
const userRoom = (userId: string) => `user:${userId}`;

export function getIO(): Server {
  if (!io) throw new Error("Socket.io n'est pas encore démarré");
  return io;
}

/** Nombre de connexions ouvertes par utilisateur (un utilisateur peut avoir plusieurs onglets). */
const connections = new Map<string, number>();
const isOnline = (userId: string) => (connections.get(userId) ?? 0) > 0;

type Ack = (res: { ok: true; data?: unknown } | { ok: false; error: string }) => void;
const noop: Ack = () => {};

const MAX_MESSAGE_LENGTH = 8000;
const sendSchema = z.object({
  channelId: z.string().min(1),
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});
const editSchema = z.object({
  id: z.string().min(1),
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});
const idSchema = z.object({ id: z.string().min(1) });
const teamSchema = z.object({ teamId: z.string().min(1) });
const channelSchema = z.object({ channelId: z.string().min(1) });

/** Anti-spam simple : 10 messages par tranche de 5 secondes et par utilisateur. */
const rate = new Map<string, number[]>();
function allowMessage(userId: string): boolean {
  const now = Date.now();
  const recent = (rate.get(userId) ?? []).filter((t) => now - t < 5000);
  if (recent.length >= 10) {
    rate.set(userId, recent);
    return false;
  }
  recent.push(now);
  rate.set(userId, recent);
  return true;
}

export function startRealtime(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: env.WEB_URL },
  });

  // Authentification de la connexion : le client envoie son jeton dans `auth.token`.
  io.use((socket, next) => {
    const userId = verifyToken(socket.handshake.auth?.token);
    if (!userId) return next(new Error("unauthorized"));
    socket.data.userId = userId;
    next();
  });

  io.on("connection", async (socket: Socket) => {
    const userId: string = socket.data.userId;
    const user = await db.user.findUnique({ where: { id: userId }, select: publicUser });
    if (!user) {
      socket.disconnect(true);
      return;
    }
    socket.data.login = user.login;
    socket.join(userRoom(userId));

    const memberships = await db.membership.findMany({ where: { userId }, select: { teamId: true } });
    const teamIds = memberships.map((m) => m.teamId);
    for (const teamId of teamIds) socket.join(teamRoom(teamId));

    const wasOnline = isOnline(userId);
    connections.set(userId, (connections.get(userId) ?? 0) + 1);
    if (!wasOnline) {
      for (const teamId of teamIds) {
        socket.to(teamRoom(teamId)).emit("presence:update", { userId, online: true });
      }
    }

    /** Rejoindre une équipe rejointe après la connexion (lien d'invitation). */
    socket.on("team:subscribe", async (payload: unknown, ack: Ack = noop) => {
      const parsed = teamSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: "Requête invalide" });
      if (!(await getMembership(userId, parsed.data.teamId))) {
        return ack({ ok: false, error: "Équipe introuvable" });
      }
      socket.join(teamRoom(parsed.data.teamId));
      ack({ ok: true });
    });

    /** Liste des membres en ligne d'une équipe. */
    socket.on("presence:list", async (payload: unknown, ack: Ack = noop) => {
      const parsed = teamSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: "Requête invalide" });
      if (!(await getMembership(userId, parsed.data.teamId))) {
        return ack({ ok: false, error: "Équipe introuvable" });
      }
      const members = await db.membership.findMany({
        where: { teamId: parsed.data.teamId },
        select: { userId: true },
      });
      ack({ ok: true, data: members.map((m) => m.userId).filter(isOnline) });
    });

    socket.on("message:send", async (payload: unknown, ack: Ack = noop) => {
      const parsed = sendSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: "Message vide ou trop long" });
      if (!allowMessage(userId)) return ack({ ok: false, error: "Doucement, trop de messages d'un coup" });

      const channel = await getAccessibleChannel(userId, parsed.data.channelId);
      if (!channel) return ack({ ok: false, error: "Canal introuvable" });

      const message = await db.message.create({
        data: { channelId: channel.id, authorId: userId, content: parsed.data.content },
        include: messageInclude,
      });
      const data = serializeMessage(message);
      io!.to(teamRoom(channel.teamId)).emit("message:new", { teamId: channel.teamId, message: data });
      ack({ ok: true, data });
    });

    socket.on("message:edit", async (payload: unknown, ack: Ack = noop) => {
      const parsed = editSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: "Message vide ou trop long" });
      const existing = await db.message.findUnique({
        where: { id: parsed.data.id },
        include: { channel: true },
      });
      if (!existing || existing.deletedAt) return ack({ ok: false, error: "Message introuvable" });
      if (existing.authorId !== userId) return ack({ ok: false, error: "Tu ne peux modifier que tes messages" });

      const message = await db.message.update({
        where: { id: existing.id },
        data: { content: parsed.data.content, editedAt: new Date() },
        include: messageInclude,
      });
      const data = serializeMessage(message);
      io!.to(teamRoom(existing.channel.teamId)).emit("message:updated", { teamId: existing.channel.teamId, message: data });
      ack({ ok: true, data });
    });

    socket.on("message:delete", async (payload: unknown, ack: Ack = noop) => {
      const parsed = idSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: "Requête invalide" });
      const existing = await db.message.findUnique({
        where: { id: parsed.data.id },
        include: { channel: true },
      });
      if (!existing || existing.deletedAt) return ack({ ok: false, error: "Message introuvable" });

      const membership = await getMembership(userId, existing.channel.teamId);
      const canDelete = existing.authorId === userId || membership?.role === "OWNER";
      if (!canDelete) return ack({ ok: false, error: "Tu ne peux supprimer que tes messages" });

      const message = await db.message.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
        include: messageInclude,
      });
      const data = serializeMessage(message);
      io!.to(teamRoom(existing.channel.teamId)).emit("message:updated", { teamId: existing.channel.teamId, message: data });
      ack({ ok: true });
    });

    /** Indicateur « est en train d'écrire », relayé aux autres membres de l'équipe. */
    socket.on("typing", async (payload: unknown) => {
      const parsed = channelSchema.safeParse(payload);
      if (!parsed.success) return;
      const channel = await getAccessibleChannel(userId, parsed.data.channelId);
      if (!channel) return;
      socket.to(teamRoom(channel.teamId)).emit("typing", {
        channelId: channel.id,
        userId,
        login: socket.data.login,
      });
    });

    socket.on("disconnect", async () => {
      const count = (connections.get(userId) ?? 1) - 1;
      if (count > 0) {
        connections.set(userId, count);
        return;
      }
      connections.delete(userId);
      const current = await db.membership.findMany({ where: { userId }, select: { teamId: true } });
      for (const { teamId } of current) {
        io!.to(teamRoom(teamId)).emit("presence:update", { userId, online: false });
      }
    });
  });

  return io;
}
