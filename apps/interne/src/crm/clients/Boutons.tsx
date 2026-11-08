"use client";

import { useFormStatus } from "react-dom";
import { Icone, type NomIcone } from "@/ui/icones";
import s from "./clients.module.css";

/*
 * Les boutons des formulaires de la fiche client : l'enregistrement (grisé
 * pendant l'envoi) et un geste à confirmer (retirer un contact).
 */

export function Enregistrer({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={s.boutonPlein} disabled={pending} aria-busy={pending || undefined}>
      <Icone nom="coche" taille={16} />
      {pending ? "Enregistrement…" : children}
    </button>
  );
}

export function Confirmer({ question, children, icone, titre }: { question: string; children?: React.ReactNode; icone?: NomIcone; titre?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={s.boutonDiscret}
      disabled={pending}
      title={titre}
      aria-label={titre}
      onClick={(e) => {
        if (!confirm(question)) e.preventDefault();
      }}
    >
      {icone && <Icone nom={icone} taille={15} />}
      {children}
    </button>
  );
}
