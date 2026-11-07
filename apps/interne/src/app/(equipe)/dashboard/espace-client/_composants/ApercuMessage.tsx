"use client";

import { useEffect } from "react";
import { useRessource } from "@/lib/donnees";
import { usePorte } from "./socle";

type Apercu = { canal: "email" | "sms"; destinataire: string; sujet: string; texte: string; html: string | null };

/** L'aperçu d'un message du journal : l'e-mail tel que le client le reçoit, ou le texte du SMS. */
export function ApercuMessage({ id, fermer }: { id: string; fermer: () => void }) {
  const { base } = usePorte();
  const { donnees, erreur } = useRessource<Apercu>(`${base}/apercu-message/${id}`);

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [fermer]);

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/50 p-4 md:p-10" onClick={fermer}>
      <div className="w-full max-w-[720px] overflow-hidden rounded-[18px] bg-card shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Aperçu du message">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">{donnees?.sujet ?? "Chargement…"}</p>
            {donnees && <p className="mt-0.5 text-[12.5px] text-ink-soft">À : {donnees.destinataire}</p>}
          </div>
          <button onClick={fermer} className="rounded-full px-2.5 py-1 text-[13px] text-ink-soft hover:bg-subtle hover:text-ink" aria-label="Fermer">
            ✕
          </button>
        </div>
        {erreur && <p className="p-5 text-[13px] text-danger">Aperçu impossible : {erreur}</p>}
        {donnees?.canal === "sms" && <p className="m-5 max-w-[85%] rounded-2xl rounded-bl-md bg-subtle p-4 text-[14px] leading-relaxed">{donnees.texte}</p>}
        {donnees?.html && <iframe title="Aperçu de l'e-mail" srcDoc={donnees.html} sandbox="allow-popups" className="h-[75vh] w-full border-0 bg-subtle" />}
      </div>
    </div>
  );
}
