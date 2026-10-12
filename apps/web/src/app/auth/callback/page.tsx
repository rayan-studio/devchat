"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { setToken, takeNext } from "@/lib/api";

/** Reçoit le jeton dans le fragment d'URL après la connexion GitHub, le stocke puis ouvre le chat. */
export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!token) {
      router.replace("/?error=github");
      return;
    }
    setToken(token);
    // Efface le jeton de la barre d'adresse et de l'historique.
    window.history.replaceState(null, "", window.location.pathname);
    router.replace(takeNext());
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-rail font-mono text-sm text-muted">
      Connexion en cours…
    </main>
  );
}
