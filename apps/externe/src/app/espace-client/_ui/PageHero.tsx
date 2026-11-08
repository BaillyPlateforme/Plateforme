import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Espace } from "@/lib/espace-client/espace";
import { aVille } from "@/lib/espace-client/format";
import { ActionsHaut, PiluleLien } from "./Hero";
import { Icone } from "./Icone";
import { Logo } from "./Logo";
import { BarreCollante } from "./BarreCollante";
import { pilules } from "./navigation";

const i = (n: number) => ({ "--i": n }) as CSSProperties;

/**
 * Le bandeau des pages intérieures, dans la grammaire de la page de garde :
 * la même photo, le retour « Mon déménagement à Lyon », le grand titre et
 * les pilules — la rubrique ouverte en jaune. Une barre claire prend le
 * relais en haut de l'écran quand on descend dans la page.
 */
export function PageHero({
  e,
  titre,
  sous,
  active,
  kicker,
  retour,
  titreLong = false,
}: {
  e: Espace;
  titre: React.ReactNode;
  sous?: string;
  active: string;
  /** Une ligne en capitales au-dessus du titre (« Tuto 01 · Emballage »). */
  kicker?: string;
  /** Le lien de retour, à la place de « Mon déménagement à … » (une page de second niveau). */
  retour?: { href: string; label: string };
  /** Un titre de plusieurs mots : un corps plus petit, pour tenir en deux lignes. */
  titreLong?: boolean;
}) {
  const { dossier, photo } = e;
  const base = `/espace-client/${dossier.reference}`;
  const items = pilules(e);
  return (
    <>
      <header className="page-hero" id="bandeau">
        <div className="hero-media">
          <Image src={photo.chemin} alt="" fill priority sizes="100vw" style={{ objectPosition: photo.position }} />
        </div>
        <div className="hero-top">
          <Logo href={base} />
          <ActionsHaut e={e} />
        </div>
        <div className="hero-center">
          <Link className="crumb rise" style={i(0)} href={retour?.href ?? base}>
            <Icone nom="back" /> {retour?.label ?? `Mon déménagement ${aVille(dossier.ville_arrivee)}`}
          </Link>
          {kicker && (
            <p className="kicker hero-kicker rise" style={i(1)}>
              {kicker}
            </p>
          )}
          <h1 className={`display rise${titreLong ? " titre-long" : ""}`} style={i(1)}>
            {titre}
          </h1>
          {sous && (
            <p className="sub rise" style={i(2)}>
              {sous}
            </p>
          )}
        </div>
        <nav className="hero-pills rise" style={i(3)} aria-label="Rubriques">
          {items.map((p) => (
            <PiluleLien key={p.cle} p={p} active={p.cle === active} />
          ))}
        </nav>
        <div className="hero-credit">{photo.credit}</div>
      </header>
      <BarreCollante base={base} items={items.map((p) => ({ cle: p.cle, label: p.label, href: p.href }))} active={active} />
    </>
  );
}
