"use client";
import { useState } from "react";
import { MODES_SAISIS } from "@/crm/facturation/calcul";
import { envoyerPourSignatureDevis, remettreDevis, retirerDevis, validerDevis } from "../actions";
import { r2 } from "../calcul";
import { Champ, PICTOS, Pic, Section, euros, pct } from "./champs";
import s from "../editeur.module.css";

/*
 * Commande et signature : envoyer le lien de signature (Créagidem, section
 * K), valider le devis en commande avec l'encaissement des arrhes (section
 * J), retirer le devis de la proposition, et son historique.
 */

type Props = {
  devis: { id: number; numero: string; statut: string; token: string | null; envoye_le: string | null; signe_le: string | null; retire_le: string | null; validation: Record<string, unknown> | null };
  lienSignature: string | null;
  ttc: number;
  arrhesPct: number | null;
  titulaire: string;
  emailClient: string | null;
  autreSigne: boolean;
  modifie: boolean;
  modes: string[];
  comptes: string[];
  historique: { libelle: string; le: string; nom: string | null }[];
  retour: { ok?: string; erreur?: string };
};

const ERREURS: Record<string, string> = {
  autre_signe: "Un autre devis du dossier est déjà signé : celui-ci ne peut plus l'être.",
  ferme: "Ce devis n'est plus ouvert à la signature (retiré ou non retenu).",
  inconnu: "Le devis est introuvable.",
  encaissement: "Le devis est validé, mais les arrhes n'ont pas été enregistrées (date future ou montant refusé) : saisissez-les depuis la carte « Facturation » du dossier.",
};
const jourFr = (d: unknown) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : d);
const dateHeure = (d: string) => new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export default function OngletCommande({ devis, lienSignature, ttc, arrhesPct, titulaire, emailClient, autreSigne, modifie, comptes, historique, retour }: Props) {
  const [copie, setCopie] = useState(false);
  const signe = devis.statut === "signe";
  const ouvert = ["brouillon", "envoye"].includes(devis.statut) && !devis.retire_le && !autreSigne;
  const montantArrhes = arrhesPct != null ? r2((ttc * arrhesPct) / 100) : 0;
  const v = devis.validation;
  const etapes = [
    { cle: "etabli", label: "Établi", fait: true, quand: null as string | null },
    { cle: "envoye", label: "Envoyé", fait: !!devis.envoye_le, quand: devis.envoye_le },
    { cle: "signe", label: "Signé", fait: signe, quand: devis.signe_le },
  ];
  return (
    <>
      {modifie && <p className={s.bandeauAlerte}>Des modifications ne sont pas enregistrées : enregistrez avant d&apos;envoyer ou de valider, pour que le client reçoive la bonne version.</p>}
      {retour.erreur && <p className={s.bandeauAlerte}>{ERREURS[retour.erreur] ?? "L'action n'a pas abouti."}</p>}
      {retour.ok === "valide" && <p className={s.bandeauSucces}>Devis validé en commande{v?.montant ? " et arrhes enregistrées" : ""}.</p>}

      <Section surtitre="Signature électronique" titre={signe ? "Devis signé" : devis.retire_le ? "Devis retiré de la proposition" : "Faire signer le devis"}>
        <ol className={s.frise}>
          {etapes.map((e) => (
            <li key={e.cle} data-fait={e.fait ? "" : undefined}>
              <i>{e.fait ? <Pic d={PICTOS.coche} taille={13} /> : null}</i>
              <b>{e.label}</b>
              <small>{e.quand ? dateHeure(e.quand) : e.fait ? "" : "—"}</small>
            </li>
          ))}
        </ol>
        <div className={s.signature}>
          <div>
            <p className={s.signatureTexte}>
              {signe
                ? "Le client a signé : le dossier est passé en commande, et l'espace client le montre aussitôt."
                : autreSigne
                  ? "Un autre devis du dossier est signé : celui-ci n'est plus à signer."
                  : devis.token
                    ? "Le lien est créé. Le client signe en ligne, sans compte : la signature est horodatée."
                    : `Le lien de signature part par e-mail${emailClient ? ` à ${emailClient}` : " (aucune adresse sur la fiche : le lien reste à copier)"}.`}
            </p>
            {lienSignature && (
              <div className={s.lien}>
                <code>{lienSignature}</code>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(lienSignature).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1800); }); }}>
                  <Pic d={copie ? PICTOS.coche : PICTOS.copie} /> {copie ? "Copié" : "Copier"}
                </button>
                <a href={lienSignature.replace(/^https?:\/\/[^/]+/, "")} target="_blank" rel="noreferrer"><Pic d={PICTOS.oeil} /> Ouvrir</a>
              </div>
            )}
          </div>
          {ouvert && (
            <form action={envoyerPourSignatureDevis.bind(null, devis.id)}>
              <button className={s.boutonPlein} disabled={modifie}>{devis.token ? "Renvoyer le lien" : "Envoyer pour signature"}</button>
            </form>
          )}
        </div>
      </Section>

      {(ouvert || (signe && !v)) && (
        <Section
          surtitre="Valider le devis"
          titre="Transférer en commande"
          texte="Le devis est signé au nom du client et le dossier passe en commande ; les autres devis du dossier deviennent « non retenus ». Le montant des arrhes proposé correspond aux conditions de règlement mentionnées dans le devis."
        >
          <form action={validerDevis.bind(null, devis.id)} className={s.grille}>
            <Champ label="Date du règlement" large={1}><input type="date" name="date" defaultValue={new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" })} /></Champ>
            <Champ label={`Arrhes versées${arrhesPct != null ? ` (${pct(arrhesPct)})` : ""}`} large={1} aide="Laisser vide : aucun encaissement">
              <input type="text" inputMode="decimal" name="montant" defaultValue={montantArrhes ? String(montantArrhes).replace(".", ",") : ""} />
            </Champ>
            <Champ label="Mode de règlement" large={1}>
              <select name="mode" defaultValue="cheque">
                {MODES_SAISIS.map((m) => <option key={m.cle} value={m.cle}>{m.label}</option>)}
              </select>
            </Champ>
            <Champ label="Banque" large={1}><input type="text" name="banque" /></Champ>
            <Champ label="N° du chèque" large={1}><input type="text" name="cheque" /></Champ>
            <Champ label="Titulaire du compte" large={1}><input type="text" name="titulaire" defaultValue={titulaire} /></Champ>
            <Champ label="Compte d'encaissement" large={2}><input type="text" name="compte" list="comptes-encaissement" /></Champ>
            <Champ label="Date d'encaissement prévue" large={1}><input type="date" name="encaissement_prevu" /></Champ>
            <Champ label="Commentaire" large={3}><input type="text" name="commentaire" /></Champ>
            <datalist id="comptes-encaissement">{comptes.map((c) => <option key={c} value={c} />)}</datalist>
            <div className={s.actionsForm} data-large={6}>
              <span>{euros(ttc)} TTC</span>
              <button className={s.boutonPlein} disabled={modifie}><Pic d={PICTOS.coche} /> Valider le devis</button>
            </div>
          </form>
        </Section>
      )}

      {v && (
        <Section surtitre="Validation" titre="Règlement enregistré à la commande">
          <dl className={s.fiche}>
            {([["Date du règlement", jourFr(v.date)], ["Montant", typeof v.montant === "number" ? euros(v.montant) : null], ["Mode", v.mode], ["Banque", v.banque], ["N° du chèque", v.cheque], ["Titulaire", v.titulaire], ["Compte d'encaissement", v.compte], ["Encaissement prévu", jourFr(v.encaissement_prevu)], ["Commentaire", v.commentaire], ["Par", v.par]] as [string, unknown][])
              .filter(([, x]) => x != null && x !== "")
              .map(([k, x]) => <div key={k}><dt>{k}</dt><dd>{String(x)}</dd></div>)}
          </dl>
        </Section>
      )}

      {!signe && <Section surtitre="Proposition" titre={devis.retire_le ? "Remettre ce devis" : "Retirer ce devis"} texte={devis.retire_le ? "Le devis revient dans la proposition, à son état d'avant." : devis.statut === "brouillon" ? "Un brouillon retiré est supprimé." : signe ? "Un devis signé ne se retire pas." : "Un devis envoyé reste au dossier, marqué retiré : il quitte la proposition et ne se signe plus."}>
        {devis.retire_le ? (
          <form action={remettreDevis.bind(null, devis.id)}><button className={s.boutonDoux} disabled={autreSigne}>Remettre dans la proposition</button></form>
        ) : !signe && (
          <form action={retirerDevis.bind(null, devis.id)} onSubmit={(e) => { if (!confirm(devis.statut === "brouillon" ? `Supprimer le brouillon ${devis.numero} ?` : `Retirer le devis ${devis.numero} de la proposition ?`)) e.preventDefault(); }}>
            <button className={s.boutonDanger}>{devis.statut === "brouillon" ? "Supprimer ce brouillon" : "Retirer de la proposition"}</button>
          </form>
        )}
      </Section>}

      <Section surtitre="Histo." titre="Historique du devis">
        {historique.length === 0 ? <p className={s.vide}>Rien encore.</p> : (
          <ol className={s.historique}>
            {historique.map((h, i) => <li key={i}><time>{dateHeure(h.le)}</time><span>{h.libelle}</span>{h.nom && <small>{h.nom}</small>}</li>)}
          </ol>
        )}
      </Section>
    </>
  );
}
