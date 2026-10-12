import { publicUser } from "./db.js";

export const messageInclude = { author: { select: publicUser } } as const;

/** Forme d'un message envoyée au client (le contenu d'un message supprimé est masqué). */
export function serializeMessage(m: {
  id: string;
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  channelId: string;
  author: { id: string; login: string; name: string | null; avatarUrl: string | null };
}) {
  return {
    id: m.id,
    channelId: m.channelId,
    content: m.deletedAt ? "" : m.content,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    deleted: m.deletedAt !== null,
    author: m.author,
  };
}
