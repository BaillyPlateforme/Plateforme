"use client";

import Link from "next/link";
import { Icone } from "@/ui/icones";
import { Picto } from "@/crm/dispatch/composants/Picto";
import { dateFr, eur, m3, STATUTS } from "@/crm/lib/format";
import { libelleDemande, sousStatut } from "@/crm/parcours/demandes-commun";
import s from "./kanban.module.css";

/*
 * La carte d'une demande du site, la même dans la colonne « Demandes » du
 * Tableau du Parcours et dans le Kanban de Demandes : un clic l'ouvre (le
 * nom du client est un lien qui couvre la carte), ses deux boutons décident
 * sans l'ouvrir — « Accepter » (le dossier et l'espace client), « Refuser »
 * (perdue). Acceptée, elle mène à son dossier et ne décide plus rien.
 *
 * Dans le Kanban de Demandes, elle se glisse d'une étape à l'autre
 * (`saisir`) ; un glisser ne l'ouvre pas (`apresGlisser`).
 */

export type DemandeCarte = {
  id: string;
  client: string;
  source: "form" | "email";
  statut: string;
  recueLe: string;
  parcours: string;
  parcoursLabel: string;
  depart: string | null;
  arrivee: string | null;
  volume: number | null;
  dateSouhaitee: string | null;
  estimation: number | null;
  incomplete: boolean;
  dossier?: { id: number; ref: string; statut: string } | null;
};

export default function CarteDemande({
  demande: d,
  decider,
  marque,
  saisir,
  apresGlisser,
  ligne,
  fantome,
  flottante,
  style,
  etapeDite = false,
}: {
  /** La colonne dit déjà l'étape (Kanban de Demandes) : ni pastille de statut, ni « Incomplète ». */
  etapeDite?: boolean;
  demande: DemandeCarte;
  /** Les boutons de la décision ; sans eux, pas de boutons. */
  decider?: (genre: "accepter" | "refuser") => void;
  /** Une pastille de plus, sous le trajet : le rappel, le devis du site refusé… */
  marque?: { libelle: string; ton: "ambre" | "rose" | "vert" | "gris" } | null;
  /** Le glisser du Kanban de Demandes. */
  saisir?: (e: React.PointerEvent<HTMLElement>) => void;
  apresGlisser?: () => boolean;
  /** Le rang de la carte, pour le glisser. */
  ligne?: number;
  fantome?: boolean;
  flottante?: boolean;
  style?: React.CSSProperties;
}) {
  const date = d.dateSouhaitee ? dateFr(`${d.dateSouhaitee}T12:00:00Z`, { day: "numeric", month: "short", year: "numeric" }) : null;
  const href = d.dossier ? `/dossiers/${d.dossier.id}` : `/dashboard/${d.id}`;
  const classes = [s.carte, s.carteDemande, fantome && s.fantome, flottante && s.flottante].filter(Boolean).join(" ");
  return (
    <article
      className={classes}
      style={style}
      data-ligne={flottante ? undefined : ligne}
      onPointerDown={(e) => {
        // Les boutons et le lien gardent leur clic ; le reste de la carte se saisit.
        if (!saisir || (e.target as HTMLElement).closest("button")) return;
        saisir(e);
      }}
    >
      <div className={s.carteHaut}>
        {saisir && (
          <span className={s.prise} data-prise="" title="Glisser pour changer d'étape" aria-hidden>
            <Picto nom="prise" taille={14} />
          </span>
        )}
        <span className={s.source} title={d.source === "email" ? "Reçue par e-mail" : "Formulaire du site"}>
          <Icone nom={d.source === "email" ? "courrier" : "globe"} taille={14} />
        </span>
        <Link
          href={href}
          className={`${s.client} ${s.lienCarte}`}
          aria-label={d.dossier ? `${d.client}, dossier ${d.dossier.ref}. Ouvrir le dossier` : `${d.client}, demande du site. Ouvrir la demande`}
          draggable={false}
          onClick={(e) => {
            if (apresGlisser?.()) e.preventDefault();
          }}
          tabIndex={flottante ? -1 : undefined}
        >
          {d.client}
        </Link>
        {d.dossier ? (
          <span className={s.statutDemande} data-statut="dossier" title={`Dossier ${d.dossier.ref}`}>
            {STATUTS[d.dossier.statut]?.label ?? d.dossier.statut}
          </span>
        ) : (
          !etapeDite && (
            <span className={s.statutDemande} data-statut={sousStatut(d.statut)}>
              {libelleDemande(d.statut)}
            </span>
          )
        )}
      </div>
      <div className={s.ligneRef}>
        <span className={s.ref}>{d.dossier ? d.dossier.ref : `Reçue le ${dateFr(d.recueLe, { day: "numeric", month: "short" })}`}</span>
        <span className={s.segment} data-segment={d.parcours === "particulier" ? "particulier" : "compte"} title={d.parcoursLabel}>
          {d.parcoursLabel}
        </span>
      </div>
      <p className={s.trajet} title={[d.depart, d.arrivee].filter(Boolean).join(" → ")}>
        <i className={s.point} />
        <span>{d.depart ?? "Départ à préciser"}</span>
        <Icone nom="fleche" taille={13} className={s.flecheTrajet} />
        <span>{d.arrivee ?? "Arrivée à préciser"}</span>
      </p>
      <div className={s.pied}>
        <span className={s.volume}>{d.volume != null && d.volume > 0 ? m3(d.volume) : "Volume ?"}</span>
        <span className={s.date} title="Date souhaitée">
          <Icone nom="calendrier" taille={13} />
          {date ?? "Date à fixer"}
        </span>
        {d.estimation != null && (
          <span className={s.montant} title="Estimation donnée par le site">
            {eur(d.estimation)}
          </span>
        )}
      </div>
      {(marque || (decider && !d.dossier) || (d.incomplete && !etapeDite)) && (
        <div className={s.decision}>
          <span className={s.marques}>
            {d.incomplete && !d.dossier && !etapeDite && (
              <span className={s.incomplete} title="Il manque le volume ou une adresse, ou le client n'a pas fini de compléter sa demande">
                Incomplète
              </span>
            )}
            {marque && (
              <span className={s.marque} data-ton={marque.ton}>
                {marque.libelle}
              </span>
            )}
          </span>
          {decider && !d.dossier && (
            <>
              <button type="button" className={s.refuser} onClick={() => decider("refuser")} title="Refuser : la demande passe en « Perdue »">
                Refuser
              </button>
              <button type="button" className={s.accepter} onClick={() => decider("accepter")} title="Accepter : créer le dossier et l'espace client">
                <Icone nom="coche" taille={14} />
                Accepter
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
