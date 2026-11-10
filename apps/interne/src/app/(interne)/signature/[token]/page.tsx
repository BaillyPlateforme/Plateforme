import { notFound } from "next/navigation";
import { getDossier } from "@/crm/lib/data";
import { devisParToken } from "@/crm/lib/data2";
import { signerParToken } from "@/crm/actions2";
import { dateFr, eur, m3, nomClient } from "@/crm/lib/format";
import DevisBailly from "@/crm/documents/DevisBailly";
import { AjusterA4 } from "@/crm/documents/AjusterA4";
import { TEL_AGENCE, TEL_AGENCE_LIEN } from "@/lib/messaging";
import { devisPourDocument, lireParametres } from "@/crm/devis/donnees";
import { effectifs, regleSesArrhesEnLigne } from "@/crm/devis/parametres";
import { nomDevis } from "@/crm/devis/modele";
import { noterSignatureVue } from "@/crm/suivi/signature";
import { cgvDuClient, TEXTE_ACCORD } from "@/crm/devis/cgv";
import { adressePublique } from "@/lib/espace-client/config";
import s from "./signature.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: { absolute: "Signature de votre devis — Bailly Déménagement" },
  robots: { index: false, follow: false },
};

/*
 * La signature du devis par le client, depuis le lien qu'on lui envoie.
 * Page publique : le client n'a pas de compte, le proxy de l'app la laisse
 * passer sans session (voir proxy.ts) et elle est rangée hors de la coque du
 * CRM. Le jeton du lien est la seule clé : un jeton inconnu ou mal formé
 * mène à une page introuvable.
 *
 * C'est le client qui la voit : elle est aux couleurs de Bailly. Il y lit le
 * devis complet, tel qu'il s'imprime, et signe dans la carte d'à côté.
 */
const date = (d: unknown) => (d ? dateFr(d as string, { day: "numeric", month: "long", year: "numeric" }) : "");

const ERREURS: Record<string, string> = {
  accord: "Cochez la case « J'ai lu le devis et les conditions générales » pour signer.",
  expire: "Ce devis a expiré : il ne peut plus être signé.",
};

export default async function Signature({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ erreur?: string }> }) {
  const token = (await params).token;
  const erreur = ERREURS[(await searchParams).erreur ?? ""] ?? null;
  const v = await devisParToken(token);
  if (!v) notFound();
  const dossier = await getDossier(v.dossier_id);
  if (!dossier) notFound();
  // « A consulté son devis » au suivi de l'e-mail du devis (jamais quand c'est l'équipe qui l'ouvre).
  await noterSignatureVue({ id: v.id, dossier_id: v.dossier_id, ref: v.ref });
  const signe = v.statut === "signe";
  // Une autre formule du dossier a été signée, ici ou dans l'espace client : celle-ci n'est plus ouverte.
  const ferme = v.statut === "refuse";
  // Passé sa date de validité, un devis ne se signe plus : le conseiller en établit un nouveau.
  const expire = !signe && !ferme && !!v.expire;
  // Le document ne montre que la formule envoyée pour signature.
  const [devisComplets, parametres] = await Promise.all([devisPourDocument(v.dossier_id), lireParametres()]);
  const eff = effectifs(parametres);
  const complet = devisComplets.find((x) => x.id === v.id);
  const document = { ...dossier, devis: devisComplets.filter((x) => x.id === v.id) };
  // Les arrhes du devis (onglet Données contractuelles), sinon celles du CRM.
  const arrhesPct = complet?.arrhes_pct != null ? Number(complet.arrhes_pct) : eff.arrhesPct;
  const arrhes = Math.round(v.montant * arrhesPct) / 100;
  // Les CGV que le client lit et accepte ici : les mêmes que dans son espace client tant que Bailly n'a pas saisi les siennes.
  const cgv = cgvDuClient(parametres.cgv);
  const validite = date(v.valide_jusqu_au);
  // Après la signature : les arrhes se règlent dans l'espace client, quand le dossier en a un.
  const espace = v.espace_reference
    ? `${await adressePublique()}/espace-client/connexion?suite=${encodeURIComponent(`/espace-client/${v.espace_reference}/devis`)}`
    : null;
  const arrhesEnLigne = !!espace && regleSesArrhesEnLigne(v.type) && arrhesPct > 0;

  return (
    <div className={s.page}>
      <header className={s.bandeau}>
        <div className={s.bandeauInterieur}>
          {/* eslint-disable-next-line @next/next/no-img-element -- logo de la marque, servi tel quel */}
          <img src="/marque/bailly-logo-blanc.svg" alt="Bailly Déménagement" />
          <span className={s.securise}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
              <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
            </svg>
            Signature électronique
          </span>
        </div>
      </header>

      <section className={s.accueil}>
        <small>Votre devis</small>
        <h1>Bonjour {nomClient(v)}</h1>
        <p>
          {ferme
            ? `Voici votre devis ${v.numero} (dossier ${v.ref}). Une autre formule de votre dossier a été retenue : celui-ci reste consultable, il n'est plus à signer.`
            : expire
              ? `Voici votre devis ${v.numero} (dossier ${v.ref}). Il était valable jusqu'au ${validite} : il reste consultable, mais ne peut plus être signé.`
              : `Bailly Déménagement vous a envoyé votre devis ${v.numero} (dossier ${v.ref}) pour signature électronique. Relisez-le ci-dessous, avec les conditions générales qui le suivent, puis donnez votre accord dans la carte${signe ? "" : " à droite"}.`}
        </p>
      </section>

      <div className={s.grille}>
        <div className={s.document}>
          <AjusterA4>
            <DevisBailly d={document} parametres={{ cgv: cgv.texte, tvaAssurance: eff.tvaAssurance, arrhesPct }} />
          </AjusterA4>
        </div>

        <aside className={s.carte}>
          <h2>{signe ? "Devis signé" : ferme ? "Devis non retenu" : expire ? "Devis expiré" : "Votre accord"}</h2>
          <div className={s.lignes}>
            <div className={s.ligne}>
              <span>Trajet</span>
              <b>
                {v.depart} → {v.arrivee}
              </b>
            </div>
            <div className={s.ligne}>
              <span>Volume</span>
              <b>{m3(v.volume)}</b>
            </div>
            <div className={s.ligne}>
              <span>Formule</span>
              <b>{complet ? nomDevis(complet) : v.formule}</b>
            </div>
          </div>
          <div className={s.montant}>
            <small>Montant TTC</small>
            <b>{eur(v.montant)}</b>
            {arrhesPct > 0 && <span>Arrhes à la signature ({String(arrhesPct).replace(".", ",")} %) : {eur(arrhes)}</span>}
            {!signe && !ferme && validite && <span>{expire ? "Expiré" : "Valable"} {expire ? "depuis le" : "jusqu'au"} {validite}</span>}
          </div>

          {signe ? (
            <>
              <div className={s.signe}>
                <i>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                </i>
                <span>
                  {arrhesEnLigne
                    ? `Merci, votre devis est signé. Il reste à régler les arrhes de ${eur(arrhes)} pour confirmer la réservation, depuis votre espace client.`
                    : "Merci, votre devis est signé. Votre conseiller vous contactera pour fixer les dates."}
                </span>
              </div>
              {espace && (
                <a className={s.signer} href={espace}>
                  {arrhesEnLigne ? `Régler mes arrhes · ${eur(arrhes)}` : "Ouvrir mon espace client"}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </a>
              )}
            </>
          ) : ferme ? (
            <p className={s.ferme}>Une autre formule de votre dossier a déjà été retenue : ce devis n&apos;est plus ouvert à la signature. Votre conseiller reste à votre disposition.</p>
          ) : expire ? (
            <p className={s.ferme}>
              Ce devis a expiré le {validite} : il ne peut plus être signé. Votre conseiller peut vous en établir un nouveau, aux conditions du moment.
            </p>
          ) : (
            <form action={signerParToken.bind(null, token)}>
              {erreur && (
                <p className={s.erreur} role="alert">
                  {erreur}
                </p>
              )}
              <label className={s.accord}>
                <input type="checkbox" name="accord" value="oui" required />
                <span>
                  {TEXTE_ACCORD} <a href="#cgv">Lire les conditions générales</a>
                </span>
              </label>
              <button className={s.signer}>
                Signer le devis
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </form>
          )}
          <p className={s.contact}>
            Une question ? <a href={TEL_AGENCE_LIEN}>{TEL_AGENCE}</a>
          </p>
        </aside>
      </div>
    </div>
  );
}
