import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Espace } from "@/lib/espace-client/espace";
import { aVille, nomClient, periodeCompacte } from "@/lib/espace-client/format";
import { FlecheTrajet, Icone } from "./Icone";
import { Logo } from "./Logo";
import { liensBas, pilules, type Pilule } from "./navigation";

const i = (n: number) => ({ "--i": n }) as CSSProperties;

/** En haut à droite : changer de dossier, et le nom du client qui mène à son conseiller. */
export function ActionsHaut({ e }: { e: Espace }) {
  const base = `/espace-client/${e.dossier.reference}`;
  const initiales = `${e.client.prenom[0] ?? ""}${e.client.nom[0] ?? ""}`.toUpperCase();
  return (
    <div className="top-actions">
      {e.autresDossiers.length > 0 && (
        <Link className="chip-glass" href="/espace-client?choisir=1">
          <Icone nom="swap" />
          <span className="lbl">Changer de dossier</span>
        </Link>
      )}
      <Link className="chip-glass" href={`${base}/conseiller`}>
        <span className="lbl">
          {e.client.prenom} {e.client.nom}
        </span>
        <span className="avatar">{initiales}</span>
      </Link>
    </div>
  );
}

export function LiensBas({ e }: { e: Espace }) {
  return (
    <ul className="hero-links">
      {liensBas(e).map((l) => (
        <li key={l.label}>{l.externe ? <a href={l.href}>{l.label}</a> : <Link href={l.href}>{l.label}</Link>}</li>
      ))}
    </ul>
  );
}

export function PiluleLien({ p, active, style, className = "" }: { p: Pilule; active?: boolean; style?: CSSProperties; className?: string }) {
  return (
    <Link className={`pill ${active ? "is-active" : ""} ${className}`} style={style} href={p.href}>
      {p.point && <span className="dot" />}
      {p.label}
    </Link>
  );
}

/**
 * La page de garde : la reproduction du modèle Word de la micro démo — photo
 * plein écran, grand titre condensé, nom, période et trajet, boutons pilule
 * blancs, liens à puces et numéro de dossier.
 */
export function Hero({ e }: { e: Espace }) {
  const { client, dossier, photo } = e;
  const nom = client.type === "grand_compte" && client.societe ? `${nomClient(client)} · ${client.societe}` : nomClient(client);
  return (
    <header className="hero" id="hero">
      <div className="hero-media">
        <Image src={photo.chemin} alt={dossier.ville_arrivee} fill priority sizes="100vw" style={{ objectPosition: photo.position }} />
      </div>
      <div className="hero-top">
        <Logo href={`/espace-client/${dossier.reference}`} />
        <ActionsHaut e={e} />
      </div>
      <div className="hero-center">
        <h1 className="display hero-title">
          <span className="rise" style={i(0)}>
            Mon déménagement
          </span>
          <span className="rise" style={i(1)}>
            {aVille(dossier.ville_arrivee)}
          </span>
        </h1>
        <div className="hero-meta rise" style={i(3)}>
          <div>{nom}</div>
          <div>{periodeCompacte(dossier.periode_debut, dossier.periode_fin)}</div>
          <div className="route">
            {dossier.ville_depart} <FlecheTrajet /> {dossier.ville_arrivee}
          </div>
        </div>
        <nav className="hero-pills" aria-label="Rubriques">
          {pilules(e).map((p, n) => (
            <PiluleLien key={p.cle} p={p.cle === "accueil" ? { ...p, href: "#progression" } : p} className="rise" style={i(5 + n)} />
          ))}
        </nav>
      </div>
      <div className="hero-bottom rise" style={i(10)}>
        <LiensBas e={e} />
        <div className="hero-dossier">Dossier : {dossier.reference}</div>
      </div>
      <div className="hero-credit">{photo.credit}</div>
    </header>
  );
}
