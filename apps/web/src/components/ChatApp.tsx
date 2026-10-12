"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { api, ApiError, clearToken, getToken } from "@/lib/api";
import { loadLastChannel, loadLastTeam, saveLastChannel, saveLastTeam } from "@/lib/prefs";
import { connectSocket, request } from "@/lib/socket";
import type { Channel, Member, Message, TeamDetail, TeamSummary, User } from "@/lib/types";
import { ChannelView, type ChannelState } from "./ChannelView";
import { CreateChannelDialog, CreateTeamDialog, CreateTeamForm, InviteDialog } from "./Dialogs";
import { Sidebar, TeamRail } from "./Sidebar";

type DialogKind = "team" | "channel" | "invite" | null;

export function ChatApp() {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Record<string, ChannelState>>({});
  const [unreadChannels, setUnreadChannels] = useState<Set<string>>(new Set());
  const [unreadTeams, setUnreadTeams] = useState<Set<string>>(new Set());
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [typing, setTyping] = useState<Record<string, Record<string, number>>>({});
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [connected, setConnected] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);

  const socket = useRef<Socket | null>(null);
  // Les écouteurs du socket lisent ces refs pour connaître l'équipe et le canal ouverts.
  const teamIdRef = useRef<string | null>(null);
  const channelIdRef = useRef<string | null>(null);
  const channelsRef = useRef(channels);
  teamIdRef.current = teamId;
  channelIdRef.current = channelId;
  channelsRef.current = channels;

  const logout = useCallback(() => {
    socket.current?.disconnect();
    clearToken();
    router.replace("/");
  }, [router]);

  // --- Chargement initial -------------------------------------------------------
  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/");
      return;
    }
    api<{ user: User; teams: TeamSummary[] }>("/api/me")
      .then(({ user, teams }) => {
        setMe(user);
        setTeams(teams);
        const last = loadLastTeam();
        setTeamId(teams.find((t) => t.id === last)?.id ?? teams[0]?.id ?? null);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) logout();
        else setFatal(e instanceof Error ? e.message : "Chargement impossible");
      });
  }, [router, logout]);

  // --- Temps réel ---------------------------------------------------------------
  useEffect(() => {
    const token = getToken();
    if (!me || !token) return;
    const s = connectSocket(token);
    socket.current = s;

    s.on("connect", () => {
      setConnected(true);
      // Après une coupure, on recharge le canal ouvert pour récupérer les messages manqués.
      const cid = channelIdRef.current;
      if (cid && channelsRef.current[cid]) loadMessages(cid, undefined, true);
      const tid = teamIdRef.current;
      if (tid) refreshPresence(s, tid);
    });
    s.on("disconnect", () => setConnected(false));
    s.on("connect_error", (err) => {
      setConnected(false);
      if (err.message === "unauthorized") logout();
    });

    s.on("message:new", ({ teamId: tid, message }: { teamId: string; message: Message }) => {
      upsertMessage(message);
      setTyping((prev) => {
        const forChannel = prev[message.channelId];
        if (!forChannel?.[message.author.login]) return prev;
        const { [message.author.login]: _gone, ...rest } = forChannel;
        return { ...prev, [message.channelId]: rest };
      });
      if (message.author.id === me.id) return;
      if (message.channelId !== channelIdRef.current) {
        setUnreadChannels((prev) => new Set(prev).add(message.channelId));
      }
      if (tid !== teamIdRef.current) setUnreadTeams((prev) => new Set(prev).add(tid));
    });

    s.on("message:updated", ({ message }: { message: Message }) => upsertMessage(message));

    s.on("channel:created", ({ teamId: tid, channel }: { teamId: string; channel: Channel }) => {
      if (tid !== teamIdRef.current) return;
      setTeam((prev) =>
        prev && !prev.channels.some((c) => c.id === channel.id)
          ? { ...prev, channels: [...prev.channels, channel].sort((a, b) => a.name.localeCompare(b.name)) }
          : prev,
      );
    });

    s.on("member:joined", ({ teamId: tid, member }: { teamId: string; member: Member }) => {
      if (tid !== teamIdRef.current) return;
      setTeam((prev) =>
        prev && !prev.members.some((m) => m.id === member.id) ? { ...prev, members: [...prev.members, member] } : prev,
      );
      setOnline((prev) => new Set(prev).add(member.id));
    });

    s.on("presence:update", ({ userId, online: isOnline }: { userId: string; online: boolean }) => {
      setOnline((prev) => {
        const next = new Set(prev);
        if (isOnline) next.add(userId);
        else next.delete(userId);
        return next;
      });
    });

    s.on("typing", ({ channelId: cid, login }: { channelId: string; login: string }) => {
      setTyping((prev) => ({ ...prev, [cid]: { ...prev[cid], [login]: Date.now() + 5000 } }));
    });

    return () => {
      s.disconnect();
      socket.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  // Les indicateurs « écrit… » expirent au bout de 5 secondes.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setTyping((prev) => {
        let changed = false;
        const next: typeof prev = {};
        for (const [cid, who] of Object.entries(prev)) {
          const kept = Object.fromEntries(Object.entries(who).filter(([, until]) => until > now));
          if (Object.keys(kept).length !== Object.keys(who).length) changed = true;
          next[cid] = kept;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  function refreshPresence(s: Socket, tid: string) {
    request<string[]>(s, "presence:list", { teamId: tid })
      .then((ids) => setOnline(new Set(ids ?? [])))
      .catch(() => {});
  }

  function upsertMessage(message: Message) {
    setChannels((prev) => {
      const state = prev[message.channelId];
      if (!state) return prev; // canal jamais ouvert : son historique sera chargé à l'ouverture
      const idx = state.messages.findIndex((m) => m.id === message.id);
      const messages =
        idx === -1
          ? [...state.messages, message]
          : state.messages.map((m) => (m.id === message.id ? message : m));
      return { ...prev, [message.channelId]: { ...state, messages } };
    });
  }

  // --- Équipe ouverte -------------------------------------------------------------
  useEffect(() => {
    setChannelId(null);
    setTeam((prev) => (prev?.id === teamId ? prev : null));
    if (!teamId) return;
    saveLastTeam(teamId);
    setUnreadTeams((prev) => {
      if (!prev.has(teamId)) return prev;
      const next = new Set(prev);
      next.delete(teamId);
      return next;
    });
    let cancelled = false;
    api<TeamDetail>(`/api/teams/${teamId}`)
      .then((detail) => {
        if (cancelled) return;
        setTeam(detail);
        const last = loadLastChannel(teamId);
        const pick =
          detail.channels.find((c) => c.id === last) ??
          detail.channels.find((c) => c.name === "general") ??
          detail.channels[0];
        setChannelId(pick?.id ?? null);
      })
      .catch((e) => !cancelled && setFatal(e instanceof Error ? e.message : "Équipe introuvable"));
    if (socket.current?.connected) refreshPresence(socket.current, teamId);
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  // --- Canal ouvert ---------------------------------------------------------------
  useEffect(() => {
    if (!channelId || !teamId) return;
    saveLastChannel(teamId, channelId);
    setUnreadChannels((prev) => {
      if (!prev.has(channelId)) return prev;
      const next = new Set(prev);
      next.delete(channelId);
      return next;
    });
    if (!channelsRef.current[channelId]) loadMessages(channelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  async function loadMessages(cid: string, before?: string, replace = false) {
    setChannels((prev) => ({
      ...prev,
      [cid]: { messages: prev[cid]?.messages ?? [], hasMore: prev[cid]?.hasMore ?? false, loading: true, error: null },
    }));
    try {
      const qs = before ? `?before=${encodeURIComponent(before)}` : "";
      const page = await api<{ messages: Message[]; hasMore: boolean }>(`/api/channels/${cid}/messages${qs}`);
      setChannels((prev) => {
        const current = prev[cid]?.messages ?? [];
        let messages: Message[];
        if (before) {
          messages = [...page.messages, ...current];
        } else if (replace) {
          // Garde les messages plus anciens déjà chargés, remplace la page la plus récente.
          const oldest = page.messages[0]?.createdAt;
          const older = oldest ? current.filter((m) => m.createdAt < oldest) : [];
          messages = [...older, ...page.messages];
        } else {
          messages = page.messages;
        }
        const hasMore = before || !replace ? page.hasMore : (prev[cid]?.hasMore ?? page.hasMore);
        return { ...prev, [cid]: { messages, hasMore, loading: false, error: null } };
      });
    } catch (e) {
      setChannels((prev) => ({
        ...prev,
        [cid]: {
          messages: prev[cid]?.messages ?? [],
          hasMore: prev[cid]?.hasMore ?? false,
          loading: false,
          error: e instanceof Error ? e.message : "Chargement impossible",
        },
      }));
    }
  }

  // --- Actions ----------------------------------------------------------------------
  async function send(content: string) {
    if (!socket.current?.connected) throw new Error("Hors ligne : le message n'est pas parti");
    const message = await request<Message>(socket.current, "message:send", { channelId, content });
    if (message) upsertMessage(message);
  }

  async function edit(id: string, content: string) {
    if (!socket.current?.connected) throw new Error("Hors ligne");
    const message = await request<Message>(socket.current, "message:edit", { id, content });
    if (message) upsertMessage(message);
  }

  async function remove(id: string) {
    if (!socket.current?.connected) throw new Error("Hors ligne");
    await request(socket.current, "message:delete", { id });
  }

  function onTeamCreated(t: TeamSummary) {
    setTeams((prev) => [...prev, t]);
    setTeamId(t.id);
    setDialog(null);
    if (socket.current) request(socket.current, "team:subscribe", { teamId: t.id }).catch(() => {});
  }

  function onChannelCreated(c: Channel) {
    setTeam((prev) =>
      prev && !prev.channels.some((x) => x.id === c.id)
        ? { ...prev, channels: [...prev.channels, c].sort((a, b) => a.name.localeCompare(b.name)) }
        : prev,
    );
    setChannelId(c.id);
    setDialog(null);
    setMenuOpen(false);
  }

  // --- Rendu --------------------------------------------------------------------------
  if (fatal) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-rail px-6 text-center">
        <p className="text-danger">{fatal}</p>
        <button onClick={() => window.location.reload()} className="text-sm text-amber hover:underline">
          Recharger
        </button>
      </main>
    );
  }

  if (!me) {
    return <main className="flex min-h-screen items-center justify-center bg-rail font-mono text-sm text-faint">Chargement…</main>;
  }

  if (teams.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-rail px-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold">Crée ta première équipe</h1>
          <p className="mt-2 text-sm text-muted">
            Une équipe regroupe tes canaux et les personnes avec qui tu codes. Tu pourras inviter du monde juste après.
          </p>
          <div className="mt-8 rounded-lg border border-line bg-ground p-6">
            <CreateTeamForm onCreated={onTeamCreated} />
          </div>
          <button onClick={logout} className="mt-6 text-sm text-faint hover:text-text">
            Se déconnecter
          </button>
        </div>
      </main>
    );
  }

  const channel = team?.channels.find((c) => c.id === channelId) ?? null;
  const typingHere = channelId ? Object.keys(typing[channelId] ?? {}).filter((l) => l !== me.login) : [];

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Navigation : fixe sur ordinateur, tiroir sur mobile */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 md:hidden ${menuOpen ? "block" : "hidden"}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden
      />
      <div
        className={`fixed inset-y-0 left-0 z-50 flex transition-transform md:static md:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <TeamRail
          teams={teams}
          activeId={teamId}
          unreadTeams={unreadTeams}
          me={me}
          onSelect={(id) => setTeamId(id)}
          onCreate={() => setDialog("team")}
          onLogout={logout}
        />
        {team && (
          <Sidebar
            team={team}
            activeChannelId={channelId}
            unreadChannels={unreadChannels}
            online={online}
            meId={me.id}
            onSelectChannel={(c) => {
              setChannelId(c.id);
              setMenuOpen(false);
            }}
            onCreateChannel={() => setDialog("channel")}
            onInvite={() => setDialog("invite")}
          />
        )}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!connected && (
          <p role="status" className="shrink-0 bg-amber px-4 py-1.5 text-center text-sm font-medium text-rail">
            Connexion perdue, reconnexion en cours…
          </p>
        )}
        {channel && team ? (
          <ChannelView
            channel={channel}
            me={me}
            canModerate={team.role === "OWNER"}
            state={channels[channel.id]}
            typing={typingHere}
            onLoadOlder={() => {
              const oldest = channels[channel.id]?.messages[0];
              if (oldest) loadMessages(channel.id, oldest.id);
            }}
            onSend={send}
            onEdit={edit}
            onDelete={remove}
            onTyping={() => socket.current?.emit("typing", { channelId: channel.id })}
            onOpenMenu={() => setMenuOpen(true)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center font-mono text-sm text-faint">Chargement…</div>
        )}
      </div>

      {dialog === "team" && <CreateTeamDialog onCreated={onTeamCreated} onClose={() => setDialog(null)} />}
      {dialog === "channel" && team && (
        <CreateChannelDialog teamId={team.id} onCreated={onChannelCreated} onClose={() => setDialog(null)} />
      )}
      {dialog === "invite" && team && (
        <InviteDialog
          team={team}
          onReset={(code) => setTeam((prev) => (prev ? { ...prev, inviteCode: code } : prev))}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
