"use client";

import { useEffect, useState } from "react";
import { Icone } from "../../../_ui/Icone";

/** Le sommaire collant de la page Documents, qui suit la lecture (micro démo). */
export function Sommaire({ chapitres }: { chapitres: { id: string; titre: string; ok: boolean | null }[] }) {
  const [actif, setActif] = useState(chapitres[0]?.id);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entrees) => entrees.forEach((x) => x.isIntersecting && setActif(x.target.id)),
      { rootMargin: "-40% 0px -55% 0px" },
    );
    chapitres.forEach((c) => {
      const el = document.getElementById(c.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [chapitres]);

  return (
    <nav className="toc" aria-label="Sommaire">
      {chapitres.map((c, i) => (
        <a key={c.id} href={`#${c.id}`} className={c.id === actif ? "is-active" : ""}>
          <span className="n">0{i + 1}</span>
          <span>{c.titre}</span>
          {c.ok === null ? <span /> : <span className={`st ${c.ok ? "ok" : "todo"}`}>{c.ok && <Icone nom="check" />}</span>}
        </a>
      ))}
    </nav>
  );
}
