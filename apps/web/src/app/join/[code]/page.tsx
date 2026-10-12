"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, getToken, rememberNext } from "@/lib/api";
import { saveLastTeam } from "@/lib/prefs";

type Invite = { id: string; name: string; memberCount: number };

export default function JoinTeam() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      rememberNext(`/join/${code}`);
      router.replace("/");
      return;
    }
    api<Invite>(`/api/invites/${encodeURIComponent(code)}`)
      .then(setInvite)
      .catch((e: Error) => setError(e.message));
  }, [code, router]);

  async function join() {
    setBusy(true);
    try {
      const team = await api<{ id: string }>(`/api/invites/${encodeURIComponent(code)}/join`, { method: "POST" });
      saveLastTeam(team.id);
      router.replace("/chat");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de rejoindre l'équipe");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-rail px-6">
      <div className="w-full max-w-sm rounded-lg border border-line bg-ground p-6">
        {error ? (
          <>
            <h1 className="text-lg font-semibold">Ce lien ne fonctionne plus</h1>
            <p className="mt-2 text-sm text-muted">{error} Demande un nouveau lien à un membre de l&apos;équipe.</p>
            <button onClick={() => router.replace("/chat")} className="mt-6 text-sm text-amber hover:underline">
              Retour au chat
            </button>
          </>
        ) : !invite ? (
          <p className="font-mono text-sm text-muted">Vérification du lien…</p>
        ) : (
          <>
            <p className="text-sm text-muted">Tu es invité à rejoindre</p>
            <h1 className="mt-1 text-2xl font-semibold">{invite.name}</h1>
            <p className="mt-1 text-sm text-faint">
              {invite.memberCount} membre{invite.memberCount > 1 ? "s" : ""}
            </p>
            <button
              onClick={join}
              disabled={busy}
              className="mt-6 h-11 w-full rounded-md bg-amber font-medium text-rail hover:bg-[#f6b55e] disabled:opacity-50"
            >
              Rejoindre l&apos;équipe
            </button>
          </>
        )}
      </div>
    </main>
  );
}
