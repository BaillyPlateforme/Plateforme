"use client";

import Link from "next/link";
import { Icone, type NomIcone } from "@/ui/icones";
import { Picto } from "@/crm/dispatch/composants/Picto";
import { eur, m3 } from "@/crm/lib/format";
import { TEINTES, type Teinte } from "./etapes";
import s from "./carte.module.css";

/*
 * La carte des tableaux du CRM : une seule famille pour tous (demande de
 * David, 08/11/2026 : « harmonise les cartes ») — Demandes › Kanban, le
 * Tableau du Parcours (ses demandes et ses dossiers), Relances › Kanban, le
 * dispatch des conteneurs. La même anatomie partout :
 *
 *   1. le nom du client, en gras, et sa référence courte ;
 *   2. le trajet, départ → arrivée (ou la destination, au dispatch) ;
 *   3. les puces : montant, volume, date, segment ;
 *   4. le pied : le commercial, le signal de l'étape (en retard, rappel,
 *      devis signé…), les gestes de la carte.
 *
 * Ce qui est propre à un tableau passe par des emplacements (`contenu`,
 * `signaux`, `actions`), jamais par une autre carte. Le nom est le lien de
 * la carte, vers sa page de toujours : une demande, /dashboard/<id> ; un
 * dossier, /dossiers/<id>. Il couvre la carte, sous les gestes.
 *
 * Le glisser est celui du dispatch (useGlisser) : `ligne` marque la carte,
 * `saisir` la prend, `apresGlisser` empêche le clic qui termine un glisser
 * d'ouvrir la page. La couleur de la carte (--c) est celle de sa colonne ;
 * `accent` la donne quand la carte vit hors d'une colonne (tenue au glisser).
 */

export type Puce =
  | { genre: "montant"; valeur: number | null; signe?: boolean; estimation?: boolean; titre?: string }
  | { genre: "volume"; valeur: number | null }
  | { genre: "date"; texte: string | null; titre?: string }
  | { genre: "segment"; texte: string; segment: string; titre?: string };

/** Un signal du pied : une pastille de couleur, avec ou sans texte, et parfois un lien. */
export type Signal = { texte?: string; teinte: Teinte; icone?: NomIcone; titre?: string; href?: string };

/** Le commercial de la carte ; null : personne ne la suit encore. */
export type Responsable = { id: number | null; nom: string | null; initiales: string | null } | null;

/** Une teinte par commercial, la même sur les cartes et dans les filtres. */
export const teinteDe = (id: number | null | undefined) => (id == null ? undefined : id % 5);

export function Avatar({ r, mini }: { r: Responsable; mini?: boolean }) {
  if (!r?.initiales) {
    return (
      <span className={s.avatar} data-vide="" data-taille={mini ? "mini" : undefined} title="Aucun commercial" aria-label="Aucun commercial">
        <Icone nom="clients" taille={12} />
      </span>
    );
  }
  return (
    <span className={s.avatar} data-teinte={teinteDe(r.id)} data-taille={mini ? "mini" : undefined} title={r.nom ? `Commercial : ${r.nom}` : undefined}>
      {r.initiales}
    </span>
  );
}

/** La pastille d'une étape, hors des cartes : listes, parcours d'un dossier. */
export function Pastille({ label, teinte, titre }: { label: string; teinte: Teinte; titre?: string }) {
  return (
    <i className={s.pastille} style={{ ["--s" as string]: TEINTES[teinte] }} title={titre}>
      {label}
    </i>
  );
}

/** Une note dans le contenu d'une carte : une remarque, un motif. */
export function Note({ children, ton, titre }: { children: React.ReactNode; ton?: "ambre"; titre?: string }) {
  return (
    <p className={s.note} data-ton={ton} title={titre}>
      {children}
    </p>
  );
}

/** Un geste de la carte, dans son pied. */
export function Action({
  children,
  ton,
  seul,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { ton?: "principal" | "discret" | "danger"; /** Une icône sans texte : un titre est obligatoire. */ seul?: boolean }) {
  return (
    <button type="button" className={s.action} data-ton={ton} data-seul={seul ? "" : undefined} {...props}>
      {children}
    </button>
  );
}

const AN = new Date().getFullYear();
/** Une date du jour (AAAA-MM-JJ ou ISO), courte : « 12 déc. », l'année quand ce n'est pas celle-ci. */
export function jourCourt(d: string | null | undefined) {
  if (!d) return null;
  const date = new Date(d.length === 10 ? `${d}T12:00:00Z` : d);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", ...(date.getUTCFullYear() !== AN ? { year: "numeric" } : {}), timeZone: "UTC" }).format(date);
}

export default function CarteKanban({
  titre,
  reference,
  referenceTitre,
  href,
  ouvrir,
  libelle,
  source,
  trajet,
  lieu,
  contenu,
  puces = [],
  responsable,
  signaux = [],
  actions,
  accent,
  lisere,
  id,
  ligne,
  saisir,
  apresGlisser,
  fantome,
  flottante,
  arrivee,
  figee,
  style,
}: {
  titre: string;
  /** La référence courte, à droite du nom : un dossier, une date de réception. */
  reference?: string | null;
  referenceTitre?: string;
  /** La page de la carte. */
  href?: string | null;
  /** Sans page : ce que fait un clic (la fiche d'un client du dispatch). */
  ouvrir?: () => void;
  /** Ce que dit le lien aux lecteurs d'écran. */
  libelle?: string;
  /** Une demande du site : venue du formulaire ou d'un e-mail. */
  source?: "form" | "email";
  trajet?: { depart: string | null; arrivee: string | null } | null;
  /** Une destination seule (le dispatch), à la place du trajet. */
  lieu?: string | null;
  /** Ce qui est propre au tableau, entre le trajet et les puces. */
  contenu?: React.ReactNode;
  puces?: Puce[];
  /** Le commercial ; `undefined` : pas de place pour lui (une demande n'en a pas). */
  responsable?: Responsable;
  signaux?: Signal[];
  actions?: React.ReactNode;
  /** La couleur de la carte, quand elle ne vient pas de sa colonne. */
  accent?: string;
  /** Un liseré de cette couleur, à gauche. */
  lisere?: boolean;
  id?: string;
  /** Le glisser : le rang de la carte, la saisie, et le clic qui le termine. */
  ligne?: number;
  saisir?: (e: React.PointerEvent<HTMLElement>) => void;
  apresGlisser?: () => boolean;
  fantome?: boolean;
  flottante?: boolean;
  arrivee?: boolean;
  /** Dans une colonne verrouillée : elle s'ouvre, elle ne se déplace plus. */
  figee?: boolean;
  style?: React.CSSProperties;
}) {
  const classes = [s.carte, fantome && s.fantome, flottante && s.flottante, arrivee && s.arrivee, figee && s.figee].filter(Boolean).join(" ");
  const glissable = !!saisir;
  const clic = (e: React.MouseEvent) => {
    if (apresGlisser?.()) e.preventDefault();
    else ouvrir?.();
  };
  const nom = href ? (
    <Link href={href} className={s.titre} aria-label={libelle} draggable={false} onClick={clic} tabIndex={flottante ? -1 : undefined}>
      {titre}
    </Link>
  ) : ouvrir ? (
    <button type="button" className={s.titre} data-titre="" aria-label={libelle} onClick={clic} tabIndex={flottante ? -1 : undefined}>
      {titre}
    </button>
  ) : (
    <span className={s.titre}>{titre}</span>
  );
  const pied = responsable !== undefined || signaux.length > 0 || actions;

  return (
    <article
      id={id}
      className={classes}
      style={accent ? { ...style, ["--c" as string]: accent } : style}
      data-ligne={flottante ? undefined : ligne}
      data-glissable={glissable ? "" : undefined}
      data-lisere={lisere ? "" : undefined}
      onPointerDown={(e) => {
        // Les gestes et les liens du pied gardent leur clic ; le reste de la carte se saisit.
        if (!saisir || (e.target as HTMLElement).closest("button:not([data-titre]), [data-geste]")) return;
        saisir(e);
      }}
    >
      {(glissable || figee) && (
        <span className={s.prise} data-prise="" title={figee ? "Colonne verrouillée" : "Glisser pour changer de colonne"} aria-hidden>
          <Picto nom={figee ? "cadenas" : "prise"} taille={figee ? 12 : 14} />
        </span>
      )}

      <div className={s.haut}>
        {source && (
          <span className={s.source} title={source === "email" ? "Demande reçue par e-mail" : "Demande du formulaire du site"}>
            <Icone nom={source === "email" ? "courrier" : "globe"} taille={13} />
          </span>
        )}
        {nom}
        {reference && (
          <span className={s.ref} title={referenceTitre}>
            {reference}
          </span>
        )}
      </div>

      {trajet && (
        <p className={s.trajet} title={[trajet.depart, trajet.arrivee].filter(Boolean).join(" → ") || undefined}>
          <i className={s.depart} aria-hidden />
          <span data-vide={trajet.depart ? undefined : ""}>{trajet.depart ?? "Départ à préciser"}</span>
          <Icone nom="fleche" taille={13} className={s.fleche} />
          <span data-vide={trajet.arrivee ? undefined : ""}>{trajet.arrivee ?? "Arrivée à préciser"}</span>
        </p>
      )}
      {lieu !== undefined && (
        <p className={s.trajet} title={lieu ?? undefined}>
          <i className={s.lieu} aria-hidden />
          <span data-vide={lieu ? undefined : ""}>{lieu ?? "Destination à préciser"}</span>
        </p>
      )}

      {contenu && <div className={s.contenu}>{contenu}</div>}

      {puces.length > 0 && (
        <div className={s.puces}>
          {puces.map((p) => (
            <PuceCarte key={p.genre} p={p} />
          ))}
        </div>
      )}

      {pied && (
        <div className={s.pied}>
          {responsable !== undefined && <Avatar r={responsable} />}
          {signaux.length > 0 && (
          <span className={s.signaux}>
            {signaux.map((x, i) => {
              const corps = (
                <>
                  {x.icone && <Icone nom={x.icone} taille={12} />}
                  {x.texte && <span>{x.texte}</span>}
                </>
              );
              const props = { className: s.signal, style: { ["--s" as string]: TEINTES[x.teinte] }, title: x.titre, "data-seul": x.texte ? undefined : "" };
              return x.href ? (
                <Link key={i} href={x.href} {...props} data-geste="" draggable={false}>
                  {corps}
                </Link>
              ) : (
                <span key={i} {...props}>
                  {corps}
                </span>
              );
            })}
          </span>
          )}
          {actions && (
            <span className={s.actions} data-geste="">
              {actions}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function PuceCarte({ p }: { p: Puce }) {
  switch (p.genre) {
    case "montant":
      return p.valeur == null ? null : (
        <span className={s.puce} data-genre="montant" data-signe={p.signe ? "" : undefined} data-estimation={p.estimation ? "" : undefined} title={p.titre}>
          {eur(p.valeur)}
        </span>
      );
    case "volume":
      return p.valeur != null && p.valeur > 0 ? (
        <span className={s.puce} data-genre="volume" title="Volume">
          {m3(p.valeur)}
        </span>
      ) : (
        <span className={s.puce} data-genre="volume" data-vide="" title="Volume à renseigner">
          Volume ?
        </span>
      );
    case "date":
      return (
        <span className={s.puce} data-genre="date" data-vide={p.texte ? undefined : ""} title={p.texte ? p.titre : `${p.titre ?? "Date"} : à fixer`}>
          <Icone nom="calendrier" taille={12} />
          <span>{p.texte ?? "Date ?"}</span>
        </span>
      );
    case "segment":
      return (
        <span className={s.puce} data-genre="segment" data-segment={p.segment} title={p.titre ?? p.texte}>
          <span>{p.texte}</span>
        </span>
      );
  }
}
