"use client";

import { useEffect, useState } from "react";
import { Icone } from "./Icone";

/**
 * Pendant un aperçu de l'équipe, ce qui ne doit pas partir est arrêté avant
 * React, à la phase de capture, et un message dit pourquoi.
 *
 *   - En lecture : tout envoi de formulaire, le choix d'un fichier (une pièce
 *     part dès qu'elle est choisie) et les boutons marqués
 *     `data-apercu-bloque` (une action appelée sans formulaire). Un
 *     formulaire qui ne fait que passer d'une étape à l'autre, sans rien
 *     envoyer, porte `data-apercu-libre`.
 *   - En édition : seulement ce qui n'appartient qu'au client, marqué
 *     `data-reserve-client` (payer, signer, consentir, écrire en son nom).
 *
 * Ce n'est que le confort de l'écran : le serveur refuse de toute façon
 * (session.ts : exigerClientPourAgir, refuserEnApercu).
 */
export function GardeApercu({ mode, message }: { mode: "lecture" | "edition"; message: string }) {
  const [refus, setRefus] = useState(0);

  useEffect(() => {
    const refuser = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      setRefus((n) => n + 1);
    };
    const surEnvoi = (e: Event) => {
      const form = e.target instanceof HTMLFormElement ? e.target : null;
      if (!form) return;
      if (mode === "edition" ? form.closest("[data-reserve-client]") : !form.hasAttribute("data-apercu-libre")) refuser(e);
    };
    const surClic = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return;
      if (mode === "edition") {
        if (el.closest("[data-reserve-client] button, button[data-reserve-client], a[data-reserve-client]")) refuser(e);
        return;
      }
      const fichier = el.matches('input[type="file"]') || !!el.closest("label")?.querySelector('input[type="file"]');
      if (fichier || el.closest("[data-apercu-bloque]")) refuser(e);
    };
    window.addEventListener("submit", surEnvoi, true);
    window.addEventListener("click", surClic, true);
    return () => {
      window.removeEventListener("submit", surEnvoi, true);
      window.removeEventListener("click", surClic, true);
    };
  }, [mode]);

  useEffect(() => {
    if (!refus) return;
    const t = setTimeout(() => setRefus(0), 4500);
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
