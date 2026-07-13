"use client";

import Link from "next/link";

// Bascule flottante entre le formulaire public et l'espace équipe.
export default function ModeSwitch({ current }: { current: "form" | "dashboard" }) {
  return (
    <div className="fixed right-4 top-4 z-50 flex items-center gap-0.5 rounded-full border border-line bg-card/90 p-1 text-xs shadow-sm backdrop-blur">
      <Seg href="/demande" active={current === "form"} label="Formulaire" />
      <Seg href="/dashboard" active={current === "dashboard"} label="Espace équipe" />
    </div>
  );
}

function Seg({ href, active, label }: { href: string; active: boolean; label: string }) {
  if (active) {
    return (
      <span className="rounded-full bg-accent px-3 py-1.5 font-medium text-white">{label}</span>
    );
  }
  return (
    <Link href={href} className="rounded-full px-3 py-1.5 text-ink-soft transition hover:text-ink">
      {label}
    </Link>
  );
}
