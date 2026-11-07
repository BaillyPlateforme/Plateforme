import { notFound } from "next/navigation";
import { getDossier } from "@/crm/lib/data";
import { devisParToken } from "@/crm/lib/data2";
import { signerParToken } from "@/crm/actions2";
import { eur, m3, nomClient } from "@/crm/lib/format";
import DevisBailly from "@/crm/documents/DevisBailly";
import { TEL_AGENCE, TEL_AGENCE_LIEN } from "@/lib/messaging";
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
export default async function Signature({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const v = await devisParToken(token);
  if (!v) notFound();
  const dossier = await getDossier(v.dossier_id);
  if (!dossier) notFound();
  const signe = v.statut === "signe";
  // Le document ne montre que la formule envoyée pour signature.
  const document = { ...dossier, devis: dossier.devis.filter((x: { id?: unknown }) => x.id === v.id) };

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
          Bailly Déménagement vous a envoyé votre devis {v.numero} (dossier {v.ref}) pour signature électronique. Relisez-le
          ci-dessous, puis donnez votre accord dans la carte{signe ? "" : " à droite"}.
        </p>
      </section>

      <div className={s.grille}>
        <div className={s.document}>
          <DevisBailly d={document} />
        </div>

        <aside className={s.carte}>
          <h2>{signe ? "Devis signé" : "Votre accord"}</h2>
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
              <b>{({ economique: "Économique", standard: "Standard", premium: "Premium" } as Record<string, string>)[v.formule] ?? v.formule}</b>
            </div>
          </div>
          <div className={s.montant}>
            <small>Montant TTC</small>
            <b>{eur(v.montant)}</b>
            <span>Arrhes à la signature (30 %) : {eur(Math.round(v.montant * 0.3))}</span>
          </div>

          {signe ? (
            <div className={s.signe}>
              <i>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              </i>
              <span>Merci, votre devis est signé. Votre conseiller vous contactera pour fixer les dates.</span>
            </div>
          ) : (
            <form action={signerParToken.bind(null, token)}>
              <label className={s.accord}>
                <input type="checkbox" required />
                <span>J&apos;ai lu le devis et les conditions générales, et je les accepte.</span>
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
