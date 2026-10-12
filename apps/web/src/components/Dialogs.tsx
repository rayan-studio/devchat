"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { Channel, TeamDetail, TeamSummary } from "@/lib/types";
import { ghostButtonClass, inputClass, Modal, primaryButtonClass } from "./Modal";

export function CreateTeamForm({ onCreated, onCancel }: { onCreated: (t: TeamSummary) => void; onCancel?: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(await api<TeamSummary>("/api/teams", { method: "POST", body: { name } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="team-name" className="block text-sm text-muted">
        Nom de l&apos;équipe ou du projet
      </label>
      <input
        id="team-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nebula Devs"
        maxLength={50}
        className={`${inputClass} mt-2`}
      />
      <p className="mt-2 text-xs text-faint">Les canaux #general et #random sont créés avec l&apos;équipe.</p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className={ghostButtonClass}>
            Annuler
          </button>
        )}
        <button type="submit" disabled={busy || name.trim().length < 2} className={primaryButtonClass}>
          Créer l&apos;équipe
        </button>
      </div>
    </form>
  );
}

export function CreateTeamDialog(props: { onCreated: (t: TeamSummary) => void; onClose: () => void }) {
  return (
    <Modal title="Nouvelle équipe" onClose={props.onClose}>
      <CreateTeamForm onCreated={props.onCreated} onCancel={props.onClose} />
    </Modal>
  );
}

export function CreateChannelDialog({
  teamId,
  onCreated,
  onClose,
}: {
  teamId: string;
  onCreated: (c: Channel) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = name.trim().toLowerCase().replace(/\s+/g, "-");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(
        await api<Channel>(`/api/teams/${teamId}/channels`, {
          method: "POST",
          body: { name, topic: topic || undefined },
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible");
      setBusy(false);
    }
  }

  return (
    <Modal title="Nouveau canal" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="channel-name" className="block text-sm text-muted">
            Nom
          </label>
          <div className="relative mt-2">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-faint">#</span>
            <input
              id="channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="deploiements"
              maxLength={40}
              className={`${inputClass} pl-7 font-mono`}
            />
          </div>
          {preview && preview !== name && <p className="mt-1 font-mono text-xs text-faint">sera créé comme #{preview}</p>}
        </div>
        <div>
          <label htmlFor="channel-topic" className="block text-sm text-muted">
            Sujet <span className="text-faint">(facultatif)</span>
          </label>
          <input
            id="channel-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="À quoi sert ce canal"
            maxLength={200}
            className={`${inputClass} mt-2`}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Annuler
          </button>
          <button type="submit" disabled={busy || !preview} className={primaryButtonClass}>
            Créer le canal
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function InviteDialog({
  team,
  onReset,
  onClose,
}: {
  team: TeamDetail;
  onReset: (code: string) => void;
  onClose: () => void;
}) {
  const link = `${window.location.origin}/join/${team.inviteCode}`;
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Copie refusée par le navigateur : sélectionne le lien à la main.");
    }
  }

  async function reset() {
    try {
      const res = await api<{ inviteCode: string }>(`/api/teams/${team.id}/invite/reset`, { method: "POST" });
      onReset(res.inviteCode);
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de changer le lien");
    }
  }

  return (
    <Modal title={`Inviter dans ${team.name}`} onClose={onClose}>
      <p className="text-sm text-muted">Toute personne qui a ce lien peut rejoindre l&apos;équipe.</p>
      <div className="mt-4 flex gap-2">
        <input readOnly value={link} onFocus={(e) => e.target.select()} className={`${inputClass} font-mono text-xs`} />
        <button onClick={copy} className={`${primaryButtonClass} shrink-0`}>
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-6 flex items-center justify-between">
        {team.role === "OWNER" ? (
          <button onClick={reset} className="text-sm text-muted hover:text-danger">
            Changer le lien
          </button>
        ) : (
          <span />
        )}
        <button onClick={onClose} className={ghostButtonClass}>
          Fermer
        </button>
      </div>
    </Modal>
  );
}
