"use client";
import { useEffect, useState, useTransition } from "react";
import { enregistrerReglagesFacturation, lireReglagesFacturation } from "./actions";
import type { Reglages } from "./donnees";
import { TVA_DEFAUT_CODE } from "./calcul";

/*
 * Paramètres › Facturation : les mentions et les conditions des factures.
 * Toutes vides tant que Bailly ne les a pas données : rien n'est proposé ni
 * inventé. Le SIRET et l'adresse de la carte « Entreprise » (Réglages ›
 * Paramètres) restent où ils sont ; la facture les reprend. Composant de
 * l'espace équipe (Tailwind), page Réglages › Facturation
 * (/dashboard/parametres/facturation).
 */

type Valeurs = Record<keyof Reglages, string>;
const CHAMPS: { cle: keyof Reglages; label: string; aide?: string; long?: boolean; place?: string }[][] = [
  [
    { cle: "raison_sociale", label: "Raison sociale", aide: "sinon le nom de la carte Entreprise" },
    { cle: "forme_juridique", label: "Forme juridique", place: "SAS, SARL…" },
    { cle: "capital", label: "Capital social", place: "Montant et devise" },
    { cle: "rcs", label: "Immatriculation au RCS", place: "RCS Ville n° …" },
    { cle: "siren", label: "SIREN", aide: "si le SIRET n'est pas renseigné" },
    { cle: "tva_intracom", label: "N° de TVA intracommunautaire" },
    { cle: "code_ape", label: "Code APE / NAF" },
  ],
  [
    { cle: "adresse", label: "Adresse du siège", aide: "pour la facture électronique, en champs séparés" },
    { cle: "code_postal", label: "Code postal" },
    { cle: "ville", label: "Ville" },
    { cle: "pays", label: "Pays" },
  ],
  [
    { cle: "conditions_reglement", label: "Conditions de règlement", long: true, aide: "imprimées sur chaque facture" },
    { cle: "delai_paiement_jours", label: "Délai de paiement (jours)", aide: "calcule l'échéance proposée" },
    { cle: "penalites_retard", label: "Pénalités de retard", long: true, aide: "taux et conditions, tels que Bailly les fixe" },
    { cle: "indemnite_recouvrement", label: "Indemnité forfaitaire pour frais de recouvrement", long: true, aide: "clients professionnels" },
    { cle: "escompte", label: "Conditions d'escompte", long: true, aide: "clients professionnels" },
    { cle: "iban", label: "IBAN", aide: "pour les virements" },
    { cle: "bic", label: "BIC" },
    { cle: "banque", label: "Banque" },
  ],
  [
    { cle: "comptes_encaissement", label: "Comptes d'encaissement", long: true, aide: "un par ligne : proposés à chaque encaissement" },
    { cle: "taux_tva_defaut", label: "Taux de TVA proposé (%)", aide: `vide : ${TVA_DEFAUT_CODE} %, le taux déjà appliqué au devis` },
    { cle: "mention_pied", label: "Mention libre en pied de facture", long: true },
  ],
];
const TITRES = ["Identité légale de l'émetteur", "Adresse (champs séparés)", "Conditions de règlement", "Encaissement et présentation"];

export default function ReglagesFacturation() {
  const [v, setV] = useState<Valeurs | null>(null);
  const [entreprise, setEntreprise] = useState<{ siret: string | null; adresse: string | null; nom: string } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [enCours, lancer] = useTransition();

  useEffect(() => {
    lireReglagesFacturation()
      .then((r) => {
        setV(Object.fromEntries(Object.entries(r.reglages).map(([k, x]) => [k, x == null ? "" : String(x)])) as Valeurs);
        setEntreprise(r.entreprise);
      })
      .catch((e) => setErreurLecture(e instanceof Error ? e.message : "Lecture impossible."));
  }, []);

  const manque = v && entreprise ? [
    !entreprise.siret && !v.siren && "SIREN ou SIRET",
    !entreprise.adresse && !v.adresse && "adresse de l'entreprise",
    !v.tva_intracom && "TVA intracommunautaire",
    !v.forme_juridique && "forme juridique",
    !v.capital && "capital social",
    !v.rcs && "RCS",
    !v.conditions_reglement && "conditions de règlement",
    !v.penalites_retard && "pénalités de retard",
  ].filter(Boolean) as string[] : [];

  return (
    <section id="facturation" className="max-w-4xl scroll-mt-28 rounded-[18px] bg-card p-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="eyebrow text-ink-soft">Facturation · mentions et conditions</h3>
        {manque.length > 0 && <span className="text-xs font-medium text-warn">{manque.length} mention{manque.length > 1 ? "s" : ""} à faire fournir par Bailly</span>}
      </div>
      <p className="mb-4 text-sm text-ink-soft">
        Imprimées sur les factures et les avoirs dès qu&apos;elles sont renseignées. Rien n&apos;est prérempli : ces valeurs viennent de Bailly.
        {entreprise && (
          <> Le SIRET ({entreprise.siret ?? "vide"}) et l&apos;adresse ({entreprise.adresse ?? "vide"}) de la carte « Entreprise », dans les Paramètres, sont repris.</>
        )}
      </p>
      {erreurLecture && <p className="mb-3 text-sm text-warn">{erreurLecture}</p>}
      {manque.length > 0 && (
        <p className="mb-4 rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink-soft">À obtenir de Bailly : {manque.join(", ")}.</p>
      )}
      {!v ? (
        <p className="text-sm text-ink-soft">Chargement…</p>
      ) : (
        <div className="space-y-6">
          {CHAMPS.map((groupe, i) => (
            <div key={TITRES[i]}>
              <h4 className="mb-2 text-sm font-semibold">{TITRES[i]}</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {groupe.map((c) => (
                  <div key={c.cle} className={c.long ? "sm:col-span-2" : undefined}>
                    <label htmlFor={`fact-${c.cle}`} className="mb-1 block text-sm text-ink-soft">
                      {c.label}
                      {c.aide && <span className="text-xs opacity-70"> · {c.aide}</span>}
                    </label>
                    {c.long ? (
                      <textarea id={`fact-${c.cle}`} rows={2} value={v[c.cle]} placeholder={c.place} onChange={(e) => setV({ ...v, [c.cle]: e.target.value })}
                        className="w-full resize-y rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" />
                    ) : (
                      <input id={`fact-${c.cle}`} value={v[c.cle]} placeholder={c.place} onChange={(e) => setV({ ...v, [c.cle]: e.target.value })}
                        inputMode={c.cle === "delai_paiement_jours" || c.cle === "taux_tva_defaut" ? "decimal" : undefined}
                        className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button type="button" disabled={enCours}
              onClick={() => lancer(async () => {
                const r = await enregistrerReglagesFacturation(v);
                setMessage(r.ok ? { ok: true, texte: "Mentions enregistrées." } : { ok: false, texte: r.erreur });
                setTimeout(() => setMessage(null), 3000);
              })}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50">
              {enCours ? "…" : "Enregistrer la facturation"}
            </button>
            {message && <span className={`text-sm ${message.ok ? "text-good" : "text-warn"}`}>{message.texte}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
