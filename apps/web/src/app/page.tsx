"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { API_URL, ApiError, getToken, setToken, takeNext } from "@/lib/api";

type Providers = { github: boolean; dev: boolean };

export default function Home() {
  const router = useRouter();
  const [providers, setProviders] = useState<Providers | null>(null);
  const [serverDown, setServerDown] = useState(false);
  const [login, setLogin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getToken()) {
      router.replace(takeNext());
      return;
    }
    if (new URLSearchParams(window.location.search).get("error") === "github") {
      setError("La connexion avec GitHub a échoué. Réessaie.");
    }
    fetch(`${API_URL}/auth/providers`)
      .then((r) => r.json())
      .then(setProviders)
      .catch(() => setServerDown(true));
  }, [router]);

  async function devLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/dev`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login }),
      });
      const data = await res.json();
      if (!res.ok) throw new ApiError(data.error ?? "Connexion impossible", res.status);
      setToken(data.token);
      router.replace(takeNext());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-full bg-rail">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-16 px-6 py-16 lg:grid-cols-[1fr_1.1fr]">
        <section className="max-w-md">
          <p className="font-mono text-lg text-amber">devchat</p>
          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-text sm:text-5xl">
            Chaque pull request a enfin sa propre conversation.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Le chat d&apos;équipe pour développeurs : vos canaux, vos blocs de code lisibles, et bientôt un fil
            ouvert automatiquement pour chaque PR et chaque issue GitHub.
          </p>

          <div className="mt-10 space-y-4">
            {serverDown && (
              <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                Le serveur ne répond pas sur {API_URL}. Lance-le avec <code className="font-mono">npm run dev:server</code>.
              </p>
            )}

            {providers?.github && (
              <a
                href={`${API_URL}/auth/github`}
                className="flex h-12 items-center justify-center gap-3 rounded-md bg-amber px-5 font-medium text-rail transition-colors hover:bg-[#f6b55e]"
              >
                <GitHubMark />
                Se connecter avec GitHub
              </a>
            )}

            {providers?.dev && (
              <form onSubmit={devLogin} className="rounded-md border border-line bg-ground p-4">
                <label htmlFor="login" className="block text-sm text-muted">
                  Connexion de test, sans GitHub
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="login"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    placeholder="ton-pseudo"
                    autoComplete="username"
                    className="h-10 min-w-0 flex-1 rounded-md border border-line bg-rail px-3 font-mono text-sm text-text placeholder:text-faint focus:border-amber focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busy || login.trim().length < 2}
                    className="h-10 rounded-md border border-line px-4 text-sm font-medium text-text hover:border-amber disabled:opacity-40"
                  >
                    Entrer
                  </button>
                </div>
              </form>
            )}

            {providers && !providers.github && !providers.dev && (
              <p className="text-sm text-muted">
                Aucune méthode de connexion n&apos;est configurée sur le serveur. Renseigne GITHUB_CLIENT_ID et
                GITHUB_CLIENT_SECRET, ou active DEV_LOGIN.
              </p>
            )}

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
        </section>

        <PreviewThread />
      </div>
    </main>
  );
}

/** Aperçu statique d'une discussion, pour montrer à quoi sert l'outil. */
function PreviewThread() {
  return (
    <figure aria-label="Exemple de discussion dans DevChat" className="hidden rounded-lg border border-line bg-ground lg:block">
      <div className="flex items-center gap-3 border-b border-line px-5 py-3">
        <span className="font-mono text-sm text-text">#api</span>
        <span className="text-sm text-faint">Fil de la PR 214 · Pagination des messages</span>
      </div>
      <div className="space-y-5 px-5 py-5 text-[14px]">
        <PreviewLine who="lina" time="10:42">
          J&apos;ai passé la pagination sur un curseur, l&apos;offset ramait au-delà de 10 000 messages.
        </PreviewLine>
        <PreviewLine who="lina" time="10:43">
          <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-rail px-4 py-3 font-mono text-[13px] leading-relaxed text-text">
{`db.message.findMany({
  cursor: { id: before },
  skip: 1,
  take: 50,
})`}
          </pre>
        </PreviewLine>
        <PreviewLine who="sam" time="10:51">
          Propre. Tu peux ajouter un index sur (channelId, createdAt) avant de fusionner ?
        </PreviewLine>
        <div className="flex items-center gap-2 font-mono text-[13px] text-muted">
          <span className="text-amber">›</span>
          <span>c&apos;est fait, je fusionne</span>
          <span className="caret inline-block h-4 w-2 bg-amber" aria-hidden />
        </div>
      </div>
    </figure>
  );
}

function PreviewLine({ who, time, children }: { who: string; time: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised font-mono text-xs text-muted">
        {who.slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-text">{who}</span>
          <span className="text-xs text-faint tabular-nums">{time}</span>
        </div>
        <div className="text-text/90">{children}</div>
      </div>
    </div>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
