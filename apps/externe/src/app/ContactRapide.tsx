"use client";

import { useState, type CSSProperties } from "react";
import { Icone } from "./demande/ui";
import { HORAIRES_BUREAUX, REPONSE_24H } from "@/lib/zone";
import type { Parcours } from "@/lib/parcours";

/*
 * « Je souhaite être contacté(e) par un commercial » (Céline, 19/11/2026) :
 * une ligne jaune en haut de chaque bulle, de la largeur des cartes, avec une
 * case pour le numéro — pour le client qui ne veut rien remplir et aimerait
 * juste être rappelé. Le nom est facultatif (proposé à Céline, à confirmer).
 * L'envoi : /api/contact-rapide (lib/contact-rapide).
 */
export default function ContactRapide({ parcours, d = 0 }: { parcours: Parcours; d?: number }) {
  const [telephone, setTelephone] = useState("");
  const [nom, setNom] = useState("");
  const [etat, setEtat] = useState<"saisie" | "envoi" | "fait">("saisie");
  const [erreur, setErreur] = useState<string | null>(null);
  const style = { "--d": `${d}ms` } as CSSProperties;

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setEtat("envoi");
    setErreur(null);
    try {
      const r = await fetch("/api/contact-rapide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telephone, nom: nom.trim() || null, parcours }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error || "Envoi impossible : réessayez dans un instant.");
      setEtat("fait");
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Envoi impossible : réessayez dans un instant.");
      setEtat("saisie");
    }
  }

  if (etat === "fait") {
    return (
      <div role="status" className="reveal flex items-start gap-3 rounded-[22px] bg-brand px-5 py-4 text-sur-brand sm:items-center" style={style}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1b1a18] text-brand-clair">
          <Icone nom="check" taille={18} trait={2.6} />
        </span>
        <p className="text-[14.5px] leading-snug">
          <b>Demande envoyée !</b> {REPONSE_24H} {HORAIRES_BUREAUX}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={envoyer} className="reveal @container rounded-[22px] bg-brand px-5 py-4 text-sur-brand" style={style} aria-label="Être contacté(e) par un commercial">
      <div className="flex flex-col gap-3 @4xl:flex-row @4xl:items-center">
        <div className="flex min-w-0 items-center gap-3 @4xl:flex-1">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1b1a18] text-brand-clair">
            <Icone nom="tel" taille={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-[15.5px] font-semibold leading-tight">Je souhaite être contacté(e) par un commercial</span>
            <span className="mt-0.5 block text-[13px] leading-snug opacity-75">Nos bureaux sont ouverts du lundi au vendredi, de 8h à 18h.</span>
          </span>
        </div>
        <div className="flex flex-col gap-2 @xl:flex-row">
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Votre nom (facultatif)"
            autoComplete="name"
            aria-label="Votre nom (facultatif)"
            className="h-11 rounded-full border-0 bg-white px-4 text-[14.5px] text-ink outline-none ring-[#1b1a18] placeholder:text-ink-mid focus:ring-2 @xl:min-w-0 @xl:flex-1 @4xl:w-48 @4xl:flex-none"
          />
          <input
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            type="tel"
            required
            placeholder="Votre numéro de téléphone"
            autoComplete="tel"
            aria-label="Votre numéro de téléphone"
            className="h-11 rounded-full border-0 bg-white px-4 text-[14.5px] text-ink outline-none ring-[#1b1a18] placeholder:text-ink-mid focus:ring-2 @xl:min-w-0 @xl:flex-1 @4xl:w-56 @4xl:flex-none"
          />
          <button
            type="submit"
            disabled={etat === "envoi"}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#1b1a18] px-5 text-[14.5px] font-semibold text-white transition hover:bg-black disabled:opacity-60"
          >
            {etat === "envoi" ? "Envoi…" : "Être rappelé(e)"}
          </button>
        </div>
      </div>
      {erreur && (
        <p role="alert" className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[13px] font-medium text-[#8a1c1c]">
          {erreur}
        </p>
      )}
    </form>
  );
}
