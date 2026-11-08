"use client";

import { Icone } from "@/ui/icones";
import { NOM_PARCOURS } from "@/lib/parcours";
import { etapeDe, type DemandeVue } from "@/crm/demandes/etapes";
import CarteKanban, { Action, jourCourt, type Signal } from "./Carte";
import { ETAPE_DEMANDE, etapeDossier, TEINTES } from "./etapes";

/*
 * Une demande du site, en carte (Carte.tsx) : la même dans le Kanban de
 * Demandes et dans la colonne « Demandes » du Tableau du Parcours — la même
 * lecture (lireDemandes), la même étape (etapeDe), les mêmes mots.
 *
 *  - un clic l'ouvre : /dashboard/<id> ; acceptée, son dossier ;
 *  - « Accepter » (le dossier et l'espace client) et « Refuser » (perdue)
 *    décident sans l'ouvrir ; acceptée, elle ne décide plus rien ;
 *  - dans le Kanban de Demandes, elle se glisse d'une étape à l'autre
 *    (`saisir`) ; la colonne dit son étape (`etapeDite`) : la carte ne la
 *    répète pas. Au Parcours, sa pastille la dit.
 */

const RAPPEL: Record<string, string> = { a_rappeler: "À rappeler", en_cours: "Rappel en cours" };
const DEVIS_PERDU: Record<string, string> = { refuse: "Devis du site refusé", expire: "Devis du site expiré" };

export default function CarteDemande({
  demande: d,
  decider,
  etapeDite = false,
  saisir,
  apresGlisser,
  ligne,
  fantome,
  flottante,
  style,
}: {
  demande: DemandeVue;
  /** Les gestes de la décision ; sans eux, pas de boutons. */
  decider?: (genre: "accepter" | "refuser") => void;
  /** La colonne dit déjà l'étape (Kanban de Demandes). */
  etapeDite?: boolean;
  saisir?: (e: React.PointerEvent<HTMLElement>) => void;
  apresGlisser?: () => boolean;
  ligne?: number;
  fantome?: boolean;
  flottante?: boolean;
  style?: React.CSSProperties;
}) {
  const etape = etapeDe(d);
  const def = ETAPE_DEMANDE[etape];
  const signaux: Signal[] = [];
  if (d.dossier) {
    const e = etapeDossier(d.dossier.statut);
    signaux.push(
      d.dossier.archive
        ? { texte: "Dossier archivé", teinte: "ardoise", titre: `Dossier ${d.dossier.ref} : archivé` }
        : { texte: e.label, teinte: e.teinte, titre: `Dossier ${d.dossier.ref}, à l'étape « ${e.label} » du Parcours` },
    );
  } else {
    if (!etapeDite) signaux.push({ texte: def.label, teinte: def.teinte, titre: def.aide });
    // Le rappel, quand la colonne ne le dit pas, ou pour dire où il en est.
    if (d.rappel && RAPPEL[d.rappel] && (etape !== "rappel" || etapeDite)) signaux.push({ texte: RAPPEL[d.rappel], teinte: "ambre", icone: "horloge", titre: "Le client a demandé qu'on le rappelle" });
    if (d.devisSite && DEVIS_PERDU[d.devisSite]) signaux.push({ texte: DEVIS_PERDU[d.devisSite], teinte: "rose" });
  }
  const recue = jourCourt(d.recueLe);
  return (
    <CarteKanban
      titre={d.client}
      reference={d.dossier ? d.dossier.ref : `Reçue ${recue}`}
      referenceTitre={d.dossier ? `Dossier ${d.dossier.ref}` : `Demande reçue le ${recue}`}
      href={d.dossier ? `/dossiers/${d.dossier.id}` : `/dashboard/${d.id}`}
      libelle={d.dossier ? `${d.client}, dossier ${d.dossier.ref}. Ouvrir le dossier` : `${d.client}, demande du site. Ouvrir la demande`}
      source={d.source}
      trajet={{ depart: d.depart, arrivee: d.arrivee }}
      puces={[
        { genre: "montant", valeur: d.estimation, estimation: true, titre: "Estimation donnée par le site" },
        { genre: "volume", valeur: d.volume },
        { genre: "date", texte: jourCourt(d.dateSouhaitee), titre: d.flexibilite ? `Date souhaitée · ${d.flexibilite}` : "Date souhaitée" },
        { genre: "segment", texte: NOM_PARCOURS[d.parcours], segment: d.parcours, titre: d.parcoursLabel },
      ]}
      // Une demande n'a pas de commercial ; son dossier, si.
      responsable={d.dossier ? { id: d.dossier.commercialId ?? null, nom: d.dossier.commercial ?? null, initiales: d.dossier.initiales ?? null } : undefined}
      signaux={signaux}
      actions={
        decider && !d.dossier ? (
          <>
            <Action ton="discret" onClick={() => decider("refuser")} title="Refuser : la demande passe en « Perdue »">
              Refuser
            </Action>
            <Action ton="principal" onClick={() => decider("accepter")} title="Accepter : créer le dossier et l'espace client">
              <Icone nom="coche" taille={14} />
              Accepter
            </Action>
          </>
        ) : undefined
      }
      // Tenue hors de sa colonne, elle en garde la couleur.
      accent={flottante ? TEINTES[def.teinte] : undefined}
      ligne={ligne}
      saisir={saisir}
      apresGlisser={apresGlisser}
      fantome={fantome}
      flottante={flottante}
      style={style}
    />
  );
}
