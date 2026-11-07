"use client";

import { useEffect, useState } from "react";
import { Icone } from "../../../_ui/Icone";

/** « Aperçu du SMS de la veille » : la fenêtre de la micro démo. */
export function ApercuSms({ texte }: { texte: string }) {
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    document.addEventListener("keydown", fermer);
    return () => document.removeEventListener("keydown", fermer);
  }, [ouvert]);

  return (
    <>
      <button type="button" className="btn btn-dark" onClick={() => setOuvert(true)}>
        <Icone nom="phone" /> Aperçu du SMS de la veille
      </button>
      {ouvert && (
        <>
          <div className="overlay" onClick={() => setOuvert(false)} />
          <div className="modal" role="dialog" aria-modal="true" aria-label="SMS envoyé la veille">
            <div className="pay-head">
              <span className="secure">
                <Icone nom="phone" /> SMS envoyé la veille
              </span>
              <span className="sim">APERÇU</span>
            </div>
            <div className="pay-body">
              <div style={{ background: "#e9e9eb", borderRadius: "18px 18px 18px 4px", padding: "14px 16px", fontSize: 15.5, lineHeight: 1.45, textAlign: "left" }}>{texte}</div>
              <p className="note" style={{ textAlign: "center", marginTop: 14 }}>
                Le créneau d&apos;une heure est calculé la veille, après l&apos;optimisation de la tournée. Il vous arrive aussi par e-mail.
              </p>
              <button type="button" className="btn btn-dark" style={{ width: "100%", marginTop: 12 }} onClick={() => setOuvert(false)}>
                Fermer
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
