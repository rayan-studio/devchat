"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { formatDay, formatFull, formatTime, sameDay } from "@/lib/format";
import type { Channel, Message, User } from "@/lib/types";
import { Avatar } from "./Avatar";
import { MessageContent } from "./MessageContent";

export interface ChannelState {
  messages: Message[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
}

interface Props {
  channel: Channel;
  me: User;
  canModerate: boolean;
  state: ChannelState | undefined;
  typing: string[];
  onLoadOlder: () => void;
  onSend: (content: string) => Promise<void>;
  onEdit: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTyping: () => void;
  onOpenMenu: () => void;
}

/** Deux messages se regroupent sous le même en-tête si même auteur, même jour, moins de 5 minutes d'écart. */
function continues(prev: Message | undefined, m: Message) {
  return (
    !!prev &&
    prev.author.id === m.author.id &&
    sameDay(prev.createdAt, m.createdAt) &&
    new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000
  );
}

export function ChannelView(props: Props) {
  const { channel, me, state } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prevHeight = useRef<number | null>(null);
  const messages = state?.messages ?? [];
  const firstId = messages[0]?.id;
  const lastId = messages.at(-1)?.id;

  // À l'ouverture d'un canal : on se place en bas.
  useLayoutEffect(() => {
    atBottom.current = true;
    prevHeight.current = null;
  }, [channel.id]);

  // Messages plus anciens chargés : on garde la position de lecture.
  // Nouveau message : on descend si on était déjà en bas.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [firstId, lastId, channel.id]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 120 && state?.hasMore && !state.loading) {
      prevHeight.current = el.scrollHeight;
      props.onLoadOlder();
    }
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-ground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 md:px-6">
        <button
          onClick={props.onOpenMenu}
          className="-ml-1 rounded p-1.5 text-muted hover:text-text md:hidden"
          aria-label="Ouvrir la liste des canaux"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
        </button>
        <h1 className="font-mono text-[15px] font-medium text-text">#{channel.name}</h1>
        {channel.topic && <p className="hidden truncate text-sm text-faint sm:block">{channel.topic}</p>}
      </header>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6" aria-live="polite">
        {state?.hasMore && (
          <p className="py-3 text-center font-mono text-xs text-faint">{state.loading ? "Chargement…" : "Remonte pour voir la suite"}</p>
        )}
        {state && !state.hasMore && !state.loading && <ChannelStart channel={channel} empty={messages.length === 0} />}
        {!state && <p className="py-10 text-center font-mono text-sm text-faint">Chargement…</p>}
        {state?.error && (
          <p role="alert" className="py-3 text-center text-sm text-danger">
            {state.error}
          </p>
        )}

        <ol>
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
            return (
              <li key={m.id}>
                {newDay && <DayDivider iso={m.createdAt} />}
                <MessageItem
                  message={m}
                  me={me}
                  grouped={!newDay && continues(prev, m)}
                  canDelete={m.author.id === me.id || props.canModerate}
                  onEdit={props.onEdit}
                  onDelete={props.onDelete}
                />
              </li>
            );
          })}
        </ol>
      </div>

      <Composer channel={channel} onSend={props.onSend} onTyping={props.onTyping} typing={props.typing} />
    </section>
  );
}

function ChannelStart({ channel, empty }: { channel: Channel; empty: boolean }) {
  return (
    <div className="mb-6 border-b border-line pb-6 pt-8">
      <p className="font-mono text-2xl text-text">#{channel.name}</p>
      <p className="mt-2 text-sm text-muted">
        {channel.topic ? channel.topic : "Début du canal."}
        {empty && " Écris le premier message ci-dessous."}
      </p>
    </div>
  );
}

function DayDivider({ iso }: { iso: string }) {
  return (
    <div className="my-4 flex items-center gap-3" role="separator">
      <div className="h-px flex-1 bg-line" />
      <span className="text-xs text-faint">{formatDay(iso)}</span>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}

function MessageItem({
  message,
  me,
  grouped,
  canDelete,
  onEdit,
  onDelete,
}: {
  message: Message;
  me: User;
  grouped: boolean;
  canDelete: boolean;
  onEdit: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [error, setError] = useState<string | null>(null);
  const mine = message.author.id === me.id;

  async function saveEdit() {
    const content = draft.trim();
    if (!content || content === message.content) {
      setEditing(false);
      return;
    }
    try {
      await onEdit(message.id, content);
      setEditing(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Modification impossible");
    }
  }

  async function remove() {
    if (!window.confirm("Supprimer ce message ?")) return;
    try {
      await onDelete(message.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible");
    }
  }

  return (
    <div className={`group relative flex gap-3 rounded-md px-2 hover:bg-panel ${grouped ? "py-0.5" : "mt-3 py-1"}`}>
      <div className="w-8 shrink-0">
        {grouped ? (
          <time
            dateTime={message.createdAt}
            title={formatFull(message.createdAt)}
            className="invisible block pt-1 text-right text-[11px] text-faint tabular-nums group-hover:visible"
          >
            {formatTime(message.createdAt)}
          </time>
        ) : (
          <Avatar user={message.author} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-text">{message.author.name ?? message.author.login}</span>
            {message.author.name && <span className="font-mono text-xs text-faint">{message.author.login}</span>}
            <time dateTime={message.createdAt} title={formatFull(message.createdAt)} className="text-xs text-faint tabular-nums">
              {formatTime(message.createdAt)}
            </time>
          </div>
        )}

        {message.deleted ? (
          <p className="text-sm italic text-faint">Message supprimé</p>
        ) : editing ? (
          <div className="mt-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  saveEdit();
                }
              }}
              autoFocus
              rows={Math.min(12, draft.split("\n").length + 1)}
              className="w-full resize-none rounded-md border border-amber bg-rail px-3 py-2 font-sans text-[15px] text-text focus:outline-none"
            />
            <p className="mt-1 text-xs text-faint">Entrée pour enregistrer, Échap pour annuler</p>
          </div>
        ) : (
          <div className="text-[15px] leading-relaxed text-text/95">
            <MessageContent text={message.content} me={me.login} />
            {message.editedAt && (
              <span className="text-xs text-faint" title={formatFull(message.editedAt)}>
                {" "}
                (modifié)
              </span>
            )}
          </div>
        )}
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>

      {!message.deleted && !editing && (mine || canDelete) && (
        <div className="absolute -top-3 right-2 hidden gap-1 rounded-md border border-line bg-raised p-0.5 group-focus-within:flex group-hover:flex">
          {mine && (
            <button
              onClick={() => {
                setDraft(message.content);
                setEditing(true);
              }}
              className="rounded px-2 py-0.5 text-xs text-muted hover:text-text"
            >
              Modifier
            </button>
          )}
          {canDelete && (
            <button onClick={remove} className="rounded px-2 py-0.5 text-xs text-muted hover:text-danger">
              Supprimer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Composer({
  channel,
  onSend,
  onTyping,
  typing,
}: {
  channel: Channel;
  onSend: (content: string) => Promise<void>;
  onTyping: () => void;
  typing: string[];
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);

  useEffect(() => {
    setText("");
    setError(null);
    area.current?.focus();
  }, [channel.id]);

  // Hauteur automatique, jusqu'à environ 12 lignes.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
  }, [text]);

  async function send() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await onSend(content);
      setText("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setSending(false);
      area.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    // Dans un bloc ``` encore ouvert, Entrée passe à la ligne au lieu d'envoyer.
    const beforeCursor = text.slice(0, e.currentTarget.selectionStart);
    const openFences = (beforeCursor.match(/```/g) ?? []).length;
    if (openFences % 2 === 1) return;
    e.preventDefault();
    send();
  }

  const typingLabel =
    typing.length === 0
      ? ""
      : typing.length === 1
        ? `${typing[0]} écrit…`
        : typing.length === 2
          ? `${typing[0]} et ${typing[1]} écrivent…`
          : "Plusieurs personnes écrivent…";

  return (
    <div className="shrink-0 px-4 pb-4 md:px-6">
      <div className="flex items-start gap-2 rounded-md border border-line bg-rail px-3 py-2.5 focus-within:border-amber">
        <span aria-hidden className="select-none pt-px font-mono text-[15px] text-amber">
          ›
        </span>
        <textarea
          ref={area}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const now = Date.now();
            if (now - lastTyping.current > 3000) {
              lastTyping.current = now;
              onTyping();
            }
          }}
          onKeyDown={onKeyDown}
          rows={1}
          aria-label={`Message dans #${channel.name}`}
          placeholder={`Écrire dans #${channel.name}`}
          className="max-h-[300px] min-h-[24px] flex-1 resize-none bg-transparent text-[15px] leading-6 text-text placeholder:text-faint focus:outline-none"
        />
      </div>
      <div className="mt-1.5 flex h-4 items-center justify-between text-xs">
        <span className="text-muted" aria-live="polite">
          {error ? <span className="text-danger">{error}</span> : typingLabel}
        </span>
        <span className="hidden text-faint sm:inline">
          Entrée pour envoyer, Maj+Entrée pour aller à la ligne, ``` pour un bloc de code
        </span>
      </div>
    </div>
  );
}
