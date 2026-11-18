"use client";

import Link from "next/link";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import type { Resultat } from "@/lib/actions/espace-client-equipe";

/*
 * Le socle des écrans de l'espace client dans le back-office : d'où lire les
 * données, où mènent les liens, et les petites briques visuelles — dans le
 * style de l'espace équipe (cartes blanches sur le sol gris, noir et jaune).
 *
 * Les mêmes écrans servent deux portes : /dashboard/espace-client, derrière
 * la session de l'équipe, et /espace-client/demo-equipe, le back-office de
 * démonstration. Le contexte dit laquelle.
 */

export type Porte = { racine: string; base: string; demo: boolean };

const Contexte = createContext<Porte>({ racine: "/dashboard/espace-client", base: "/api/data/espace-client", demo: false });
export const PorteProvider = Contexte.Provider;
export const usePorte = () => useContext(Contexte);

/**
 * Lance une action de l'équipe, garde son message, puis relit les données.
 *
 * On relit sans vider le cache : vidé, l'écran repasserait par son squelette
 * le temps de la requête, et la section qui a lancé l'action — démontée —
 * perdrait son message.
 */
export function useAction(recharger?: () => void) {
  const [enCours, demarrer] = useTransition();
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const lancer = (action: () => Promise<Resultat>, apres?: (r: Resultat) => void) =>
    demarrer(async () => {
      const r = await action();
      setResultat(r);
      if (r.ok) recharger?.();
      apres?.(r);
    });
  return { lancer, enCours, resultat, effacer: () => setResultat(null) };
}

export function Carte({ titre, action, children, className = "" }: { titre?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[18px] bg-card p-5 ${className}`}>
      {(titre || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {titre && <h2 className="text-[15px] font-semibold">{titre}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const TONS = {
  ok: "bg-good-soft text-good",
  attente: "bg-brand-soft text-brand-ink",
  alerte: "bg-danger-soft text-danger",
  neutre: "bg-subtle text-ink-soft",
  noir: "bg-ink text-white",
} as const;
export type Ton = keyof typeof TONS;

export function Pastille({ ton = "neutre", children }: { ton?: Ton; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONS[ton]}`}>{children}</span>;
}

const BOUTONS = {
  noir: "bg-accent text-white hover:bg-accent-dark",
  jaune: "bg-brand text-nuit hover:bg-brand-mid",
  contour: "border border-line-strong bg-card text-ink hover:border-ink",
  discret: "text-ink-soft hover:text-ink",
  danger: "border border-danger/30 bg-card text-danger hover:bg-danger-soft",
} as const;

export function Bouton({ variante = "noir", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: keyof typeof BOUTONS }) {
  return <button {...p} className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium transition disabled:opacity-50 ${BOUTONS[variante]} ${className}`} />;
}

export function LienBouton({ href, variante = "contour", children, cible }: { href: string; variante?: keyof typeof BOUTONS; children: ReactNode; cible?: "_blank" }) {
  const cls = `inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium transition ${BOUTONS[variante]}`;
  return cible ? (
    <a href={href} target="_blank" rel="noopener" className={cls}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

/** Le retour d'une action : vert si elle a réussi, rouge sinon. */
export function Retour({ r, apercu }: { r: Resultat | null; apercu?: (id: string) => void }) {
  if (!r) return null;
  if (r.ok)
    return r.message ? (
      <p className="flex flex-wrap items-center gap-2 rounded-xl bg-good-soft px-3.5 py-2.5 text-[13px] font-medium text-good" role="status">
        ✓ {r.message}
        {r.apercu && apercu && (
          <button onClick={() => apercu(r.apercu!)} className="rounded-full bg-white/70 px-2.5 py-0.5 text-[12px] font-semibold text-good hover:bg-white">
            Voir l&apos;e-mail
          </button>
        )}
      </p>
    ) : null;
  const n = r.erreurs ? Object.values(r.erreurs).filter(Boolean).length : 0;
  return (
    <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger" role="alert">
      {r.erreur ?? (n === 1 ? Object.values(r.erreurs!).find(Boolean) : `${n} champs à corriger.`)}
    </p>
  );
}

export function Champ({ label, erreur, children, aide, className = "" }: { label: string; erreur?: string; children: ReactNode; aide?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[12px] font-medium text-ink-soft">{label}</span>
      {children}
      {aide && !erreur && <span className="mt-1 block text-[11.5px] text-ink-soft">{aide}</span>}
      {erreur && <span className="mt-1 block text-[12px] font-medium text-danger">{erreur}</span>}
    </label>
  );
}

/** Les champs du back-office : plus compacts que ceux du formulaire de devis. */
export const champ = "champ !h-10 !rounded-xl !text-[13.5px]";
export const zoneTexte = "champ !rounded-xl !text-[13.5px] !min-h-[6rem]";

export function Jauge({ pourcent }: { pourcent: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-subtle">
        <div className="h-full rounded-full bg-brand" style={{ width: `${pourcent}%` }} />
      </div>
      <span className="text-[11.5px] tabular-nums text-ink-soft">{pourcent} %</span>
    </div>
  );
}

export const dateFr = (iso: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
export const dateHeureFr = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const euro = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/**
 * Le bandeau qui dit où vivent les données et si les messages partent
 * vraiment. Il ne parle qu'en démonstration : en base, l'état des envois se
 * lit dans les Réglages de la section et sur chaque message (« journalisé »).
 */
export function BandeauMode({ mode }: { mode: { donnees: string; envoi: boolean; demoEquipe: boolean; envois?: { par?: string } } }) {
  const { demo } = usePorte();
  if (mode.donnees !== "demo" && !demo) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      {mode.donnees === "demo" ? <Pastille ton="attente">Données de démonstration, en mémoire</Pastille> : <Pastille ton="ok">Données en base (tables ec_*, cloisonnées par client)</Pastille>}
      {mode.envoi ? <Pastille ton="ok">E-mails et SMS envoyés par {mode.envois?.par ?? "le fournisseur"}</Pastille> : <Pastille>E-mails et SMS journalisés, non envoyés</Pastille>}
      {demo && <Pastille ton="alerte">Back-office de démonstration, sans connexion</Pastille>}
    </div>
  );
}

/** L'état du module d'envoi, tel que le serveur le lit (lib/envois, etatEnvois). */
export type EtatEnvoisVu = { mode: string; libelle: string; detail: string; bacASable: boolean; avertissements: string[] };

const TON_MODE: Record<string, Ton> = { actif: "ok", recette: "attente", desactive: "neutre" };

/**
 * Ce que deviennent les messages, en une ligne : désactivé, recette avec
 * liste blanche, ou actif — et le lien vers le journal complet des envois.
 */
export function EtatDesEnvois({ envois, lien = true }: { envois: EtatEnvoisVu; lien?: boolean }) {
  const { demo } = usePorte();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-card px-4 py-3 text-[12.5px]">
      <span className="font-medium">Envois</span>
      <Pastille ton={TON_MODE[envois.mode] ?? "neutre"}>{envois.libelle}</Pastille>
      <span className="text-ink-soft">{envois.detail}</span>
      {envois.avertissements.map((a) => (
        <span key={a} className="basis-full text-[12px] font-medium text-danger">
          {a}
        </span>
      ))}
      {lien && !demo && (
        <Link href="/dashboard/envois" className="ml-auto font-medium hover:text-brand-ink">
          Journal des envois et tâche de la veille →
        </Link>
      )}
    </div>
  );
}

const STATUTS_ENVOI: Record<string, { ton: Ton; label: string }> = {
  envoye: { ton: "ok", label: "Envoyé" },
  echec: { ton: "alerte", label: "Échec" },
  incertain: { ton: "alerte", label: "Incertain" },
  journalise: { ton: "neutre", label: "Journalisé" },
  bloque: { ton: "attente", label: "Bloqué (recette)" },
  fictif: { ton: "neutre", label: "Fictif" },
  bac_a_sable: { ton: "attente", label: "Bac à sable" },
  en_cours: { ton: "neutre", label: "En cours" },
};

/** Le statut d'un message au journal des envois. */
export function PastilleEnvoi({ statut }: { statut: string }) {
  const s = STATUTS_ENVOI[statut] ?? { ton: "neutre" as Ton, label: statut };
  return <Pastille ton={s.ton}>{s.label}</Pastille>;
}
