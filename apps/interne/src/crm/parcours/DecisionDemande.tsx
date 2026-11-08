"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { ouvrirEspaceDepuisDemande } from "@/crm/actions-espace";
import { Fenetre, Toast, type Message } from "@/crm/dispatch/composants/elements";
import { updateStatus } from "@/lib/actions/requests";
import type { RequestStatus } from "@/lib/types";
import { Icone } from "@/ui/icones";
import { demandeClose, SOUS_ETAPES, sousStatut, type DossierDeDemande } from "./demandes-commun";
import k from "@/crm/kanban/kanban.module.css";
import s from "./decision.module.css";

/*
 * La décision sur une demande du site, première étape du Parcours
 * (unification du 08/11/2026) : l'accepter — ce qui crée son dossier au CRM
 * et ouvre l'espace client, l'action qui existait (« Créer le dossier et
 * ouvrir l'espace client ») —, ou la refuser, ce qui la marque « Perdue ».
 * Rien d'autre n'est écrit : les statuts enregistrés des demandes ne
 * changent pas de sens (demandes-commun.ts).
 *
 *  - DecisionDemande : le pied de la carte du parcours, sur la page de la
 *    demande (/dashboard/<id>) ; ses sous-étapes (nouvelle, en analyse,
 *    qualifiée) se choisissent là, la décision à côté.
 *  - FenetreAccepter, FenetreRefuser : les confirmations, communes à la
 *    page et aux cartes de la colonne « Demandes » du Tableau.
 */

export type DemandeADecider = { id: string; client: string };

/** Le bouton qui envoie le formulaire d'acceptation : il dit qu'il travaille. */
function Accepter({ libelle, className, focus }: { libelle: string; className: string; /** Dans une fenêtre : le bouton prend le curseur. */ focus?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} autoFocus={focus}>
      {pending ? "Création du dossier…" : libelle}
    </button>
  );
}

/** « Accepter cette demande ? » : le dossier et l'espace client, puis la fiche du dossier. */
export function FenetreAccepter({ demande, onFermer }: { demande: DemandeADecider; onFermer: () => void }) {
  return (
    <Fenetre
      titre="Accepter cette demande ?"
      sousTitre={demande.client}
      picto="coche"
      taille="etroite"
      onFermer={onFermer}
      pied={
        <form action={ouvrirEspaceDepuisDemande.bind(null, demande.id)} className={s.formPied}>
          <button type="button" className={k.boutonClair} onClick={onFermer}>
            Annuler
          </button>
          <Accepter libelle="Créer le dossier et l'espace client" className={k.boutonPlein} focus />
        </form>
      }
    >
      <div className={k.fenetreCorps}>
        <p className={k.texte}>Le dossier est créé au CRM, avec le client, le trajet et le volume repris de la demande, et l&apos;espace client s&apos;ouvre.</p>
        <p className={k.aide}>Ce que la demande ne dit pas — le mois prévu, le commercial — se complète sur la fiche du dossier, qui s&apos;ouvre aussitôt.</p>
      </div>
    </Fenetre>
  );
}

/** « Refuser cette demande ? » : elle passe en « Perdue », quitte le Tableau, reste dans l'analyse des demandes. */
export function FenetreRefuser({ demande, onFermer, onRefusee }: { demande: DemandeADecider; onFermer: () => void; onRefusee: (m: Message) => void }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const refuser = () =>
    demarrer(async () => {
      try {
        await updateStatus(demande.id, "lost");
        router.refresh();
        onRefusee({ texte: `${demande.client} : demande refusée, elle passe en « Perdue ».` });
      } catch {
        onRefusee({ texte: "La demande n'a pas pu être refusée : réessayez dans un instant.", ton: "erreur" });
      }
      onFermer();
    });
  return (
    <Fenetre
      titre="Refuser cette demande ?"
      sousTitre={demande.client}
      picto="alerte"
      ton="rose"
      taille="etroite"
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className={k.boutonClair} onClick={onFermer}>
            Annuler
          </button>
          <button type="button" className={k.boutonDanger} disabled={enCours} onClick={refuser} autoFocus>
            {enCours ? "Un instant…" : "Refuser : demande perdue"}
          </button>
        </>
      }
    >
      <div className={k.fenetreCorps}>
        <p className={k.texte}>Elle passe en « Perdue » et quitte le Tableau du Parcours. Elle reste consultable dans l&apos;analyse des demandes, et peut être rouverte depuis sa page.</p>
      </div>
    </Fenetre>
  );
}

/**
 * Le pied de la carte du parcours, sur la page d'une demande : où elle en
 * est, et la décision. Trois cas :
 *  - acceptée (elle a son dossier) : le dossier, l'espace client, et les
 *    liens vers eux ;
 *  - perdue ou archivée : la rouvrir ;
 *  - ouverte : ses sous-étapes (nouvelle, en analyse, qualifiée), à choisir,
 *    puis « Refuser / Perdue » et « Accepter : créer le dossier et l'espace
 *    client ».
 */
export default function DecisionDemande({
  demande,
  statut,
  analysee,
  dossier,
  espace,
}: {
  demande: DemandeADecider;
  statut: RequestStatus;
  /** La demande a déjà son évaluation : rouverte, elle repart « Qualifiée ». */
  analysee: boolean;
  dossier: DossierDeDemande | null;
  espace: { id: string; reference: string } | null;
}) {
  const router = useRouter();
  const [fenetre, setFenetre] = useState<"refuser" | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const fermerMessage = useCallback(() => setMessage(null), []);
  const [enCours, demarrer] = useTransition();
  const [vise, setVise] = useState<string | null>(null);
  const poser = (st: RequestStatus) => {
    setVise(st);
    demarrer(async () => {
      await updateStatus(demande.id, st);
      router.refresh();
    });
  };
  const sous = vise && enCours ? vise : sousStatut(statut);

  if (dossier) {
    return (
      <div className={`${k.racine} ${s.decision}`} data-cas="acceptee">
        <div className={s.gauche}>
          <span className={s.pastille} data-ton="vert">
            <Icone nom="coche" taille={16} />
          </span>
          <div className={s.textes}>
            <b>Demande acceptée · dossier {dossier.ref}</b>
            <small>{espace ? `Espace client ouvert · ${espace.reference}` : "L'espace client n'est pas encore ouvert"}</small>
          </div>
        </div>
        <div className={s.boutons}>
          {espace ? (
            <Link href={`/dashboard/espace-client/dossiers/${espace.id}`} className={k.boutonClair}>
              Fiche de l&apos;espace client
            </Link>
          ) : (
            <form action={ouvrirEspaceDepuisDemande.bind(null, demande.id)}>
              <Accepter libelle="Ouvrir l'espace client" className={k.boutonClair} />
            </form>
          )}
          <Link href={`/dossiers/${dossier.id}`} className={k.boutonPlein}>
            Ouvrir le dossier
            <Icone nom="fleche" taille={15} />
          </Link>
        </div>
      </div>
    );
  }

  if (demandeClose(statut)) {
    return (
      <div className={`${k.racine} ${s.decision}`} data-cas="close">
        <div className={s.gauche}>
          <span className={s.pastille} data-ton="rose">
            <Icone nom="archive" taille={16} />
          </span>
          <div className={s.textes}>
            <b>{statut === "lost" ? "Demande perdue" : "Demande archivée"}</b>
            <small>Elle a quitté le Tableau du Parcours.</small>
          </div>
        </div>
        <div className={s.boutons}>
          <button type="button" className={k.boutonClair} disabled={enCours} onClick={() => poser(analysee ? "qualified" : "new")}>
            {enCours ? "Un instant…" : "Rouvrir la demande"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${k.racine} ${s.decision}`} data-cas="ouverte">
      <div className={s.gauche}>
        <span className={s.libelle}>Demande</span>
        <div className={s.segments} role="radiogroup" aria-label="Où en est la demande">
          {SOUS_ETAPES.map((e, i) => {
            const rang = SOUS_ETAPES.findIndex((x) => x.cle === sous);
            return (
              <button
                key={e.cle}
                type="button"
                role="radio"
                aria-checked={sous === e.cle}
                data-fait={i < rang || undefined}
                disabled={enCours}
                onClick={() => sous !== e.cle && poser(e.cle)}
              >
                <i aria-hidden>{i < rang ? <Icone nom="coche" taille={12} /> : i + 1}</i>
                {e.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className={s.boutons}>
        <button type="button" className={k.boutonDanger} onClick={() => setFenetre("refuser")}>
          Refuser / Perdue
        </button>
        <form action={ouvrirEspaceDepuisDemande.bind(null, demande.id)}>
          <Accepter libelle="Accepter : créer le dossier et l'espace client" className={k.boutonPlein} />
        </form>
      </div>
      {fenetre === "refuser" && <FenetreRefuser demande={demande} onFermer={() => setFenetre(null)} onRefusee={setMessage} />}
      <Toast message={message} onFermer={fermerMessage} />
    </div>
  );
}
