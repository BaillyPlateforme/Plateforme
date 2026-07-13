"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Actualise les données du dashboard (server components) sans rechargement complet.
export default function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [spinning, setSpinning] = useState(false);

  const refresh = () => {
    setSpinning(true);
    start(() => {
      router.refresh();
      // laisse l'animation tourner un court instant même si le refresh est instantané
      setTimeout(() => setSpinning(false), 600);
    });
  };

  return (
    <button
      onClick={refresh}
      disabled={pending}
      title="Actualiser les données"
      className="fixed right-[240px] top-4 z-50 flex items-center gap-1.5 rounded-full border border-line bg-card/90 px-3 py-1.5 text-xs font-medium text-ink-soft shadow-sm backdrop-blur transition hover:text-ink disabled:opacity-60"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-3.5 w-3.5 ${spinning ? "animate-spin" : ""}`}
      >
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
      Actualiser
    </button>
  );
}
