"use client";

import Link from "next/link";
import { useState } from "react";
import { demanderModificationDevis, demanderNouveauDevis, refuserDevis } from "@/lib/actions/espace-client-devis";
import { payerArrhes } from "@/lib/actions/espace-client";
import type { GesteDevis } from "@/lib/espace-client/devis-reponses";
import { euros, eurosAffiches } from "@/lib/espace-client/format";
import { erreursDe, lireReponseDevis, reponseDevisSchemas } from "@/lib/espace-client/schemas";
import { Champ, ResumeErreurs, useFormulaire } from "../../../_ui/formulaire";
import { Icone } from "../../../_ui/Icone";
import { BoutonSigner, type DevisAConfirmer, type RecapDossier } from "./Confirmation";
import { Dialogue, Transmis } from "./Dialogue";

/** Ce que le client a déjà répondu sur ce devis, les dates déjà écrites (« 8 novembre »). */
export interface SuiviVue {
  refus: string | null;
  modification: string | null;
  renouvellement: string | null;
  /** L'équipe a écrit dans la discussion depuis la dernière réponse. */
  repondu: boolean;
}

/**
 * Les gestes du client sur un devis, au pied de sa carte :
 *   - en attente : accepter (la confirmation), demander une modification,
 *     refuser ;
 *   - expiré : demander un nouveau devis ;
 *   - signé, arrhes à régler : les payer.
 * Chaque réponse ouvre une fenêtre, part dans la discussion avec le
 * conseiller, et la carte dit ensuite ce qui a été demandé, et quand.
 *
 * Toujours rendu à la même place de la carte : la page se rafraîchit après
 * une réponse sans refermer la fenêtre qui dit « c'est transmis ».
 */
export function ActionsDevis({
  telecharger,
  devis,
  dossier,
  etat,
  peutSigner,
  conseiller,
  suivi,
  expireLe,
}: {
  /** Le lien signé du PDF du devis. */
  telecharger: string;
  devis: DevisAConfirmer;
  dossier: RecapDossier;
  etat: "en_attente" | "expire" | "arrhes_dues" | "clos";
  /** Le particulier (et le logement social) signent et paient en ligne ; les autres, avec leur conseiller. */
  peutSigner: boolean;
  /** Le prénom du conseiller. */
  conseiller: string;
  suivi: SuiviVue;
  expireLe: string;
}) {
  const [geste, setGeste] = useState<GesteDevis | null>(null);
  const discussion = `/espace-client/${encodeURIComponent(dossier.reference)}/conseiller`;
  const lienDiscussion = (
    <Link className="dv-lien" href={discussion}>
      {suivi.repondu ? `${conseiller} vous a répondu` : "Voir la discussion"} <Icone nom="arrow" />
    </Link>
  );
  const attente = etat === "en_attente" && !suivi.refus;

  // La ligne d'état : ce que le client a déjà répondu sur ce devis.
  let etatLigne: React.ReactNode = null;
  if (etat === "en_attente" && suivi.refus) {
    etatLigne = (
      <p className="dv-etat dv-etat-refus">
        <Icone nom="close" />
        <span>
          Vous avez refusé ce devis le {suivi.refus} ; votre conseiller en est informé dans votre discussion. {lienDiscussion}
        </span>
      </p>
    );
  } else if (attente && suivi.modification) {
    etatLigne = (
      <p className="dv-etat">
        <Icone nom="crayon" />
        <span>
          Modification demandée le {suivi.modification}. {lienDiscussion}
        </span>
      </p>
    );
  } else if (etat === "expire") {
    etatLigne = suivi.renouvellement ? (
      <p className="dv-etat">
        <Icone nom="clock" />
        <span>
          Nouveau devis demandé le {suivi.renouvellement}. {lienDiscussion}
        </span>
      </p>
    ) : (
      <p className="dv-etat dv-etat-doux">
        <Icone nom="clock" />
        <span>Ce devis a expiré le {expireLe} : votre conseiller peut le renouveler.</span>
      </p>
    );
  }

  // Le geste principal, à droite (en tête sur téléphone).
  let principal: React.ReactNode = null;
  if (attente && peutSigner) {
    principal = (
      <BoutonSigner
        devis={devis}
        dossier={dossier}
        libelle={devis.arrhes_pourcentage > 0 ? `Accepter et payer les arrhes · ${eurosAffiches(devis.arrhes)}` : "Accepter ce devis"}
      />
    );
  } else if (attente) {
    principal = <span className="note">Votre conseiller valide ce devis avec votre entreprise.</span>;
  } else if (etat === "expire" && !suivi.renouvellement) {
    principal = (
      <button type="button" className="btn btn-dark" onClick={() => setGeste("renouvellement")} aria-haspopup="dialog">
        <Icone nom="swap" /> Demander un nouveau devis
      </button>
    );
  } else if (etat === "arrhes_dues" && peutSigner) {
    principal = <PayerArrhes reference={dossier.reference} devisId={devis.id} montant={devis.arrhes} />;
  }

  return (
    <div className="dv-actions" data-reserve-client>
      {etatLigne}
      <div className="dv-rangee">
        <div className="dv-sec">
          <a className="dv-geste" href={telecharger} target="_blank" rel="noopener">
            <Icone nom="download" /> Voir le devis complet
          </a>
          {attente && (
            <>
              <button type="button" className="dv-geste" onClick={() => setGeste("modification")} aria-haspopup="dialog">
                <Icone nom="crayon" /> Demander une modification
              </button>
              <button type="button" className="dv-geste dv-geste-non" onClick={() => setGeste("refus")} aria-haspopup="dialog">
                <Icone nom="close" /> Refuser ce devis
              </button>
            </>
          )}
        </div>
        {principal && <div className="dv-principal">{principal}</div>}
      </div>
      {geste && (
        <Dialogue ouvert fermer={() => setGeste(null)} titre={TEXTES[geste].kicker} className="dv-dlg-reponse">
          <FormReponse key={geste} geste={geste} devis={devis} dossier={dossier} conseiller={conseiller} expireLe={expireLe} fermer={() => setGeste(null)} />
        </Dialogue>
      )}
    </div>
  );
}

/** Les textes des trois réponses. À valider par Bailly. */
const TEXTES: Record<GesteDevis, { kicker: string; intro: (c: { conseiller: string; expireLe: string }) => string; champ: string; aide: string; exemple: string; bouton: string; fini: string; suite: (c: string) => string }> = {
  refus: {
    kicker: "Refuser ce devis",
    intro: ({ conseiller }) => `Votre réponse part dans votre discussion avec ${conseiller}. Un mot sur ce qui ne vous convient pas l'aide à vous proposer mieux.`,
    champ: "Pourquoi ?",
    aide: "facultatif",
    exemple: "Le budget, la date, une prestation en trop…",
    bouton: "Refuser ce devis",
    fini: "C'est noté",
    suite: (c) => `Votre réponse est dans votre discussion avec ${c}, qui vous répondra là.`,
  },
  modification: {
    kicker: "Demander une modification",
    intro: ({ conseiller }) => `Décrivez ce qui doit changer : une prestation à ajouter ou à retirer, une date, un accès… ${conseiller} vous répond dans votre discussion.`,
    champ: "Ce que vous souhaitez changer",
    aide: "",
    exemple: "Par exemple : ajouter le démontage de l'armoire de la chambre.",
    bouton: "Envoyer ma demande",
    fini: "Demande envoyée",
    suite: (c) => `Elle est dans votre discussion avec ${c}, qui vous répondra là. Ce devis reste disponible en attendant.`,
  },
  renouvellement: {
    kicker: "Demander un nouveau devis",
    intro: ({ expireLe }) => `Ce devis a expiré le ${expireLe} : votre conseiller peut le renouveler. Si quelque chose a changé depuis, dites-le ici.`,
    champ: "Quelque chose a changé ?",
    aide: "facultatif",
    exemple: "Une nouvelle date, un autre volume…",
    bouton: "Demander un nouveau devis",
    fini: "Demande envoyée",
    suite: (c) => `Elle est dans votre discussion avec ${c}, qui vous répondra là.`,
  },
};

const ACTIONS = { refus: refuserDevis, modification: demanderModificationDevis, renouvellement: demanderNouveauDevis };

function FormReponse({
  geste,
  devis,
  dossier,
  conseiller,
  expireLe,
  fermer,
}: {
  geste: GesteDevis;
  devis: DevisAConfirmer;
  dossier: RecapDossier;
  conseiller: string;
  expireLe: string;
  fermer: () => void;
}) {
  const t = TEXTES[geste];
  const { etat, erreurs, enCours, onSubmit, onChange, essai } = useFormulaire(ACTIONS[geste].bind(null, dossier.reference, devis.id), (fd) => {
    const r = reponseDevisSchemas[geste].safeParse(lireReponseDevis(fd));
    return r.success ? {} : erreursDe(r.error);
  });

  if (etat.ok) return <Transmis titre={t.fini} texte={t.suite(conseiller)} reference={dossier.reference} fermer={fermer} />;

  const id = `dv-texte-${geste}`;
  return (
    <form className="dv-reponse" noValidate onSubmit={onSubmit} onChange={onChange} data-reserve-client>
      <p className="dv-reponse-k">{t.kicker}</p>
      <div className="dv-reponse-devis">
        <b>Formule {devis.formule}</b>
        <span>
          {devis.numero} · {eurosAffiches(devis.montant_ttc)} TTC
        </span>
      </div>
      <p className="dv-reponse-intro">{t.intro({ conseiller, expireLe })}</p>
      <ResumeErreurs erreurs={{}} message={etat.message} essai={essai} />
      <Champ id={id} label={t.champ} aide={t.aide ? `(${t.aide})` : undefined} erreur={erreurs.texte || undefined}>
        <textarea
          id={id}
          name="texte"
          className="textarea"
          rows={geste === "modification" ? 5 : 3}
          maxLength={geste === "modification" ? 1500 : 600}
          placeholder={t.exemple}
          required={geste === "modification"}
          aria-describedby={`${id}-err`}
        />
      </Champ>
      {geste === "refus" && dossier.autresFormules > 0 && <p className="note">Les autres formules de votre dossier restent disponibles.</p>}
      <div className="dv-reponse-pied">
        <button type="button" className="btn btn-ghost" onClick={fermer} disabled={enCours}>
          Annuler
        </button>
        <button className={`btn ${geste === "refus" ? "btn-dark" : "btn-primary"}`} disabled={enCours}>
          {enCours ? "Envoi…" : t.bouton}
        </button>
      </div>
    </form>
  );
}

/** Un devis signé dont les arrhes restent dues : les régler, sans autre confirmation (rien n'est signé ici). */
function PayerArrhes({ reference, devisId, montant }: { reference: string; devisId: string; montant: number }) {
  const { etat, enCours, onSubmit, essai } = useFormulaire(payerArrhes.bind(null, reference, devisId), () => ({}));
  return (
    <form className="dv-payer" onSubmit={onSubmit} data-reserve-client>
      <ResumeErreurs erreurs={{}} message={etat.message} essai={essai} />
      <button className="btn btn-primary" disabled={enCours}>
        <Icone nom="lock" /> {enCours ? "Ouverture du paiement…" : `Payer les arrhes · ${euros(montant)}`}
      </button>
    </form>
  );
}
