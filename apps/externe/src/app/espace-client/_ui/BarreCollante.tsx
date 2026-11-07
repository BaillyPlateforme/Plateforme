"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

/**
 * La barre claire de la micro démo : elle descend quand le bandeau photo
 * quitte l'écran, et garde les rubriques à portée de pouce.
 */
export function BarreCollante({ base, items, active }: { base: string; items: { cle: string; label: string; href: string }[]; active: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const bandeau = document.getElementById("bandeau");
    if (!bandeau || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([entree]) => setVisible(!entree.isIntersecting), { rootMargin: "-80px 0px 0px 0px" });
    io.observe(bandeau);
    return () => io.disconnect();
  }, []);

  return (
    <div className={`sticky-nav${visible ? " show" : ""}`} aria-hidden={!visible}>
      <div className="wrap">
        <Logo href={base} clair petit />
        <nav aria-label="Rubriques">
          {items.map((it) => (
            <Link key={it.cle} className={it.cle === active ? "is-active" : ""} href={it.href} tabIndex={visible ? 0 : -1}>
              {it.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
