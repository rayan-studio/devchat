"use client";

import type { Channel, TeamDetail, TeamSummary, User } from "@/lib/types";
import { Avatar } from "./Avatar";

/** Colonne des équipes, à l'extrême gauche. */
export function TeamRail({
  teams,
  activeId,
  unreadTeams,
  me,
  onSelect,
  onCreate,
  onLogout,
}: {
  teams: TeamSummary[];
  activeId: string | null;
  unreadTeams: Set<string>;
  me: User;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onLogout: () => void;
}) {
  return (
    <nav aria-label="Équipes" className="flex w-16 shrink-0 flex-col items-center gap-2 bg-rail py-3">
      {teams.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            title={t.name}
            aria-label={t.name}
            aria-current={active ? "true" : undefined}
            className={`relative flex h-10 w-10 items-center justify-center rounded-md font-mono text-sm font-medium transition-colors ${
              active ? "bg-amber text-rail" : "bg-raised text-muted hover:text-text"
            }`}
          >
            {initials(t.name)}
            {!active && unreadTeams.has(t.id) && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-rail bg-amber" />
            )}
          </button>
        );
      })}
      <button
        onClick={onCreate}
        title="Nouvelle équipe"
        aria-label="Nouvelle équipe"
        className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-line text-lg text-faint hover:border-amber hover:text-amber"
      >
        +
      </button>

      <div className="mt-auto flex flex-col items-center gap-2">
        <span title={me.login}>
          <Avatar user={me} size={32} />
        </span>
        <button onClick={onLogout} className="rounded px-1 text-[11px] text-faint hover:text-text">
          Quitter
        </button>
      </div>
    </nav>
  );
}

function initials(name: string) {
  const words = name.trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toLowerCase();
}

/** Canaux et membres de l'équipe ouverte. */
export function Sidebar({
  team,
  activeChannelId,
  unreadChannels,
  online,
  meId,
  onSelectChannel,
  onCreateChannel,
  onInvite,
}: {
  team: TeamDetail;
  activeChannelId: string | null;
  unreadChannels: Set<string>;
  online: Set<string>;
  meId: string;
  onSelectChannel: (c: Channel) => void;
  onCreateChannel: () => void;
  onInvite: () => void;
}) {
  const members = [...team.members].sort((a, b) => {
    const ao = a.id === meId || online.has(a.id) ? 0 : 1;
    const bo = b.id === meId || online.has(b.id) ? 0 : 1;
    return ao - bo || a.login.localeCompare(b.login);
  });

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <h2 className="truncate font-semibold">{team.name}</h2>
        <button onClick={onInvite} className="shrink-0 rounded-md px-2 py-1 text-sm text-amber hover:bg-amber-soft">
          Inviter
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-sm text-faint">Canaux</h3>
          <button
            onClick={onCreateChannel}
            aria-label="Nouveau canal"
            title="Nouveau canal"
            className="rounded px-1.5 text-faint hover:text-amber"
          >
            +
          </button>
        </div>
        <ul className="mt-1">
          {team.channels.map((c) => {
            const active = c.id === activeChannelId;
            const unread = !active && unreadChannels.has(c.id);
            return (
              <li key={c.id}>
                <button
                  onClick={() => onSelectChannel(c)}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left font-mono text-sm ${
                    active
                      ? "bg-amber-soft text-amber"
                      : unread
                        ? "font-medium text-text hover:bg-raised"
                        : "text-muted hover:bg-raised hover:text-text"
                  }`}
                >
                  <span className={active ? "text-amber" : "text-faint"}>#</span>
                  <span className="truncate">{c.name}</span>
                  {unread && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber" aria-label="non lu" />}
                </button>
              </li>
            );
          })}
        </ul>

        <h3 className="mt-8 px-2 text-sm text-faint">
          Membres <span className="tabular-nums">{team.members.length}</span>
        </h3>
        <ul className="mt-1">
          {members.map((m) => {
            const isOnline = m.id === meId || online.has(m.id);
            return (
              <li key={m.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <span className="relative">
                  <Avatar user={m} size={22} />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel ${
                      isOnline ? "bg-ok" : "bg-faint"
                    }`}
                    aria-label={isOnline ? "en ligne" : "hors ligne"}
                  />
                </span>
                <span className={`truncate ${isOnline ? "text-text" : "text-faint"}`}>{m.name ?? m.login}</span>
                {m.role === "OWNER" && <span className="ml-auto text-xs text-faint">propriétaire</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
