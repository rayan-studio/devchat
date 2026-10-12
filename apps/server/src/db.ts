import { PrismaClient } from "@prisma/client";

export const db = new PrismaClient();

/** Données publiques d'un utilisateur, renvoyées au client. */
export const publicUser = {
  id: true,
  login: true,
  name: true,
  avatarUrl: true,
} as const;

/** Vérifie que l'utilisateur fait partie de l'équipe. Renvoie son rôle, ou null. */
export async function getMembership(userId: string, teamId: string) {
  return db.membership.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

/** Renvoie le canal si l'utilisateur est membre de son équipe, sinon null. */
export async function getAccessibleChannel(userId: string, channelId: string) {
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) return null;
  const membership = await getMembership(userId, channel.teamId);
  return membership ? channel : null;
}
