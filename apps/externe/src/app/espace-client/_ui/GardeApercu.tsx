"use client";

import { useEffect, useState } from "react";
import { Icone } from "./Icone";

/**
 * Pendant un aperçu de l'équipe, rien ne part du navigateur : tout envoi de
 * formulaire, le choix d'un fichier (une pièce part dès qu'elle est choisie)
 * et les boutons marqués `data-apercu-bloque` (une action appelée sans
 * formulaire) sont arrêtés avant React, à la phase de capture, et un message
 * dit pourquoi. Un formulaire qui ne fait que passer d'une étape à l'autre,
 * sans rien envoyer, porte `data-apercu-libre`.
 *
 * Ce n'est que le confort de l'écran : le serveur refuse de toute façon
 * chaque écriture pendant l'aperçu (session.ts, exigerClientPourAgir).
 */
export function GardeApercu({ message }: { message: string }) {
  const [refus, setRefus] = useState(0);

  useEffect(() => {
    const refuser = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      setRefus((n) => n + 1);
    };
    const surEnvoi = (e: Event) => {
      const form = e.target instanceof HTMLFormElement ? e.target : null;
      if (form?.hasAttribute("data-apercu-libre")) return;
      refuser(e);
    };
    const surClic = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return;
      const fichier = el.matches('input[type="file"]') || !!el.closest("label")?.querySelector('input[type="file"]');
      if (fichier || el.closest("[data-apercu-bloque]")) refuser(e);
    };
    window.addEventListener("submit", surEnvoi, true);
    window.addEventListener("click", surClic, true);
    return () => {
      window.removeEventListener("submit", surEnvoi, true);
      window.removeEventListener("click", surClic, true);
    };
  }, []);

  useEffect(() => {
    if (!refus) return;
    const t = setTimeout(() => setRefus(0), 4000);
    return () => clearTimeout(t);
  }, [refus]);

  if (!refus) return null;
  return (
    <div key={refus} className="toast apercu-refus" role="alert">
      <Icone nom="lock" />
      <span>{message}</span>
    </div>
  );
}
