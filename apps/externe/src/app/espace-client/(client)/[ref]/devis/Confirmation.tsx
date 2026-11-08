"use client";

import Link from "next/link";
import { useState } from "react";
import { accepterDevis, payerArrhes } from "@/lib/actions/espace-client";
import { euros, eurosAffiches } from "@/lib/espace-client/format";
import { erreursDe, lireSignatureDevis, signatureDevisSchema } from "@/lib/espace-client/schemas";
import { CGV, VERSIONS } from "@/lib/espace-client/textes";
import { Champ, ResumeErreurs, useFormulaire } from "../../../_ui/formulaire";
import { Icone } from "../../../_ui/Icone";
import { TexteJuridique } from "../documents/FormulaireCgv";
import { Dialogue } from "./Dialogue";

/** Le devis tel que la confirmation le récapitule (lu par le serveur, jamais modifiable ici). */
export interface DevisAConfirmer {
  id: string;
  numero: string;
  formule: string;
  montant_ttc: number;
  arrhes: number;
  arrhes_pourcentage: number;
  /** « 12 décembre 2026 ». */
  valable: string;
}

/** Le dossier, pour le récapitulatif : trajet, période, volume. */
export interface RecapDossier {
  reference: string;
  depart: { ville: string; adresse: string };
  arrivee: { ville: string; adresse: string };
  /** « en décembre 2026 », « du 14 au 15 décembre 2026 ». */
  periode: string;
  volume: number;
  logement: string | null;
  /** D'autres formules attendent une réponse : elles ne seront plus retenues. */
  autresFormules: number;
  /** Les CGV en vigueur déjà acceptées dans « Mes documents » : le jour, sinon null. */
  cgvAccepteesLe: string | null;
}

/**
 * « Accepter » un devis : le bouton, puis la confirmation — ce qui est signé,
 * ce qui se passe ensuite, les CGV à lire et la case à cocher. Avec des
 * arrhes, le bouton final mène au paiement, qui signe le devis ; sans arrhes,
 * il signe tout de suite. La case est revérifiée par l'action serveur.
 */
export function BoutonSigner({ devis, dossier, libelle, className = "btn btn-primary" }: { devis: DevisAConfirmer; dossier: RecapDossier; libelle: string; className?: string }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOuvert(true)} aria-haspopup="dialog">
        {libelle}
      </button>
      {ouvert && <FenetreConfirmation devis={devis} dossier={dossier} fermer={() => setOuvert(false)} />}
    </>
  );
}

function FenetreConfirmation({ devis, dossier, fermer }: { devis: DevisAConfirmer; dossier: RecapDossier; fermer: () => void }) {
  const avecArrhes = devis.arrhes_pourcentage > 0;
  const action = (avecArrhes ? payerArrhes : accepterDevis).bind(null, dossier.reference, devis.id);
  const { etat, erreurs, enCours, onSubmit, onChange, essai } = useFormulaire(action, (fd) => {
    const r = signatureDevisSchema.safeParse(lireSignatureDevis(fd));
    return r.success ? {} : erreursDe(r.error);
  });
  const solde = Math.max(0, Math.round((devis.montant_ttc - devis.arrhes) * 100) / 100);

  // Textes à valider par Bailly : ils ne disent que ce que fait la plateforme et ce que disent les CGV.
  const ensuite = avecArrhes
    ? [
        ["Le paiement des arrhes", `Vous réglez ${euros(devis.arrhes)} sur la page sécurisée de notre prestataire. Aucune donnée bancaire n'est conservée par Bailly.`],
        ["La signature", "Dès le paiement confirmé, votre devis est signé : l'acceptation est horodatée, avec votre adresse IP et votre appareil."],
        ...(dossier.autresFormules > 0 ? [["Les autres formules", "Les autres formules proposées ne sont plus retenues."]] : []),
        ["Le solde", `Les ${euros(solde)} restants sont exigibles avant le déchargement, sauf conditions particulières (CGV, article 6).`],
      ]
    : [
        ["La signature", "Votre acceptation est horodatée, avec votre adresse IP et votre appareil."],
        ...(dossier.autresFormules > 0 ? [["Les autres formules", "Les autres formules proposées ne sont plus retenues."]] : []),
        ["Le paiement", "Le solde est exigible avant le déchargement, sauf conditions particulières (CGV, article 6)."],
      ];

  return (
    <Dialogue ouvert fermer={fermer} titre={`Confirmer la formule ${devis.formule}`} occupe={enCours} className="dv-dlg-signer">
      <header className="dv-billet">
        <p className="dv-billet-k">{avecArrhes ? "Bon pour accord · arrhes" : "Bon pour accord"}</p>
        <h2>
          <span>Formule</span> {devis.formule}
        </h2>
        <p className="dv-billet-ref">
          Devis {devis.numero} · valable jusqu&apos;au {devis.valable}
        </p>
        <dl className="dv-billet-sommes">
          <div>
            <dt>Total TTC</dt>
            <dd className="num">{eurosAffiches(devis.montant_ttc)}</dd>
          </div>
          {avecArrhes && (
            <div className="fort">
              <dt>Arrhes · {devis.arrhes_pourcentage} %</dt>
              <dd className="num">{eurosAffiches(devis.arrhes)}</dd>
            </div>
          )}
        </dl>
      </header>

      <form className="dv-corps" noValidate onSubmit={onSubmit} onChange={onChange} data-reserve-client>
        <dl className="dv-recap">
          <div>
            <dt>Trajet</dt>
            <dd>
              <b>
                {dossier.depart.ville} <Icone nom="arrow" /> {dossier.arrivee.ville}
              </b>
              <small>
                {dossier.depart.adresse}
                <br />
                {dossier.arrivee.adresse}
              </small>
            </dd>
          </div>
          <div>
            <dt>Période</dt>
            <dd>
              <b>{dossier.periode.charAt(0).toUpperCase() + dossier.periode.slice(1)}</b>
            </dd>
          </div>
          <div>
            <dt>Volume</dt>
            <dd>
              <b>{dossier.volume.toLocaleString("fr-FR")} m³</b>
              {dossier.logement && <small>{dossier.logement}</small>}
            </dd>
          </div>
        </dl>

        <p className="dv-sous-titre">Ce qui se passe ensuite</p>
        <ol className="dv-ensuite">
          {ensuite.map(([t, x]) => (
            <li key={t}>
              <b>{t}</b>
              <span>{x}</span>
            </li>
          ))}
        </ol>

        <details className="dv-cgv">
          <summary>
            <Icone nom="documents" />
            <span>
              Lire les conditions générales de vente <em>{VERSIONS.cgv}</em>
            </span>
          </summary>
          <TexteJuridique titre={`Conditions générales de vente · ${VERSIONS.cgv}`} sections={CGV} />
          <Link className="link-arrow dv-cgv-lien" href={`/espace-client/${encodeURIComponent(dossier.reference)}/documents#cgv`}>
            Les retrouver dans « Mes documents » <Icone nom="arrow" />
          </Link>
        </details>

        <ResumeErreurs erreurs={{}} message={etat.message} essai={essai} />
        <Champ erreur={erreurs.cgv || undefined}>
          <label className="check dv-case">
            <input type="checkbox" name="cgv" aria-describedby="dv-cgv-aide" />
            <span>
              J&apos;ai lu et j&apos;accepte les conditions générales de vente
              <small id="dv-cgv-aide">
                Version {VERSIONS.cgv}
                {dossier.cgvAccepteesLe ? ` · déjà acceptée le ${dossier.cgvAccepteesLe} dans « Mes documents »` : " · enregistrée aussi dans « Mes documents »"}
              </small>
            </span>
          </label>
        </Champ>

        <button className="btn btn-primary btn-block dv-valider" disabled={enCours}>
          {enCours ? (
            <>
              <span className="spinner dv-spinner" aria-hidden /> {avecArrhes ? "Ouverture du paiement…" : "Signature…"}
            </>
          ) : avecArrhes ? (
            <>
              <Icone nom="lock" /> Payer les arrhes et signer · {eurosAffiches(devis.arrhes)}
            </>
          ) : (
            <>
              <Icone nom="check" /> Signer le devis
            </>
          )}
        </button>
        {avecArrhes && <p className="dv-mention">Le devis n&apos;est signé qu&apos;une fois le paiement confirmé.</p>}
      </form>
    </Dialogue>
  );
}
