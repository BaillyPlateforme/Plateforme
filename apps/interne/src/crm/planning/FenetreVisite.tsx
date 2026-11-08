import ChampAdresse from "@/ui/ChampAdresse";
import { ACCES_MONTE_MEUBLE, ACCES_STATIONNEMENT, GENRE_ETAPE } from "@/lib/visite/regles";
import { majFenetreVisite } from "./actions";
import { etapesDossier } from "./donnees";
import s from "./fenetre.module.css";

/*
 * La fenêtre de visite de Créagidem, sous le planificateur d'un rendez-vous
 * de dossier (/planning/<id>) : chaque adresse du dossier avec son code
 * postal, sa ville, son pays et un téléphone, puis les accès — monte-charge,
 * transbordement, portage, monte-meubles, demande de stationnement —, et une
 * étape s'ajoute. Repliée d'office : l'écran sert d'abord à modifier la
 * visite ; elle s'ouvre au retour d'un enregistrement.
 */

const MESSAGES: Record<string, string> = { adresses: "Adresses et accès enregistrés.", etape: "Étape ajoutée : complétez son adresse." };

export default async function FenetreVisite({ rdvId, dossierId, reference, ok }: { rdvId: number; dossierId: number; reference: string; ok?: string }) {
  const etapes = await etapesDossier(dossierId);
  return (
    <details className={`card ${s.fenetre} ${s.repliable}`} id="fenetre" open={!!(ok && MESSAGES[ok])}>
      <summary className={s.fenetreTete}>
        <h3 className={s.titre}>Fenêtre de visite · adresses et accès</h3>
        <span className={s.aide}>Les adresses du dossier {reference} : elles servent aussi au devis, aux lettres de voiture et à l&apos;espace du client.</span>
      </summary>
      {ok && MESSAGES[ok] && <p className={`${s.flash} ${s.ok}`}>{MESSAGES[ok]}</p>}
      <form action={majFenetreVisite.bind(null, rdvId, dossierId)}>
        {etapes.map((e, i) => (
          <fieldset key={e.id} className={s.etape}>
            <legend>
              <i>{i + 1}</i>
              {GENRE_ETAPE[e.genre] ?? "Étape"}
              {["autre", "garde_meuble"].includes(e.genre) && (
                <button className={s.retirer} name="retirer" value={e.id} title="Retirer cette étape">
                  Retirer
                </button>
              )}
            </legend>
            <div className={s.ligneAdresse}>
              <label className={s.large}>
                <span>Adresse</span>
                <ChampAdresse
                  name={`adresse_${e.id}`}
                  defaultValue={e.adresse ?? ""}
                  placeholder="Numéro et rue"
                  remplir={{ codePostal: `code_postal_${e.id}`, ville: `ville_${e.id}`, pays: `pays_${e.id}` }}
                />
              </label>
              <label>
                <span>Code postal</span>
                <input name={`code_postal_${e.id}`} defaultValue={e.code_postal ?? ""} inputMode="numeric" />
              </label>
              <label>
                <span>Ville</span>
                <ChampAdresse mode="ville" name={`ville_${e.id}`} defaultValue={e.ville ?? ""} remplir={{ codePostal: `code_postal_${e.id}`, pays: `pays_${e.id}` }} />
              </label>
              <label>
                <span>Pays</span>
                <input name={`pays_${e.id}`} defaultValue={e.pays ?? ""} placeholder="France" />
              </label>
              <label>
                <span>Téléphone sur place</span>
                <input name={`telephone_${e.id}`} defaultValue={e.telephone ?? ""} type="tel" />
              </label>
            </div>
            <div className={s.ligneAcces}>
              <label>
                <span>Étage</span>
                <input name={`etage_${e.id}`} defaultValue={e.etage ?? ""} placeholder="RDC, 3…" />
              </label>
              <label>
                <span>Portage (m)</span>
                <input name={`portage_${e.id}`} defaultValue={e.portage_m ?? ""} inputMode="numeric" />
              </label>
              <label>
                <span>Monte-meubles</span>
                <select name={`monte_meuble_${e.id}`} defaultValue={e.monte_meuble ?? ""}>
                  <option value="">—</option>
                  {Object.entries(ACCES_MONTE_MEUBLE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Stationnement</span>
                <select name={`stationnement_${e.id}`} defaultValue={e.stationnement ?? ""}>
                  <option value="">—</option>
                  {Object.entries(ACCES_STATIONNEMENT).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <div className={s.cases}>
                <label className={s.case}>
                  <input type="checkbox" name={`ascenseur_${e.id}`} defaultChecked={e.ascenseur} />
                  Ascenseur
                </label>
                <label className={s.case}>
                  <input type="checkbox" name={`monte_charge_${e.id}`} defaultChecked={e.monte_charge} />
                  Monte-charge
                </label>
                <label className={s.case}>
                  <input type="checkbox" name={`transbordement_${e.id}`} defaultChecked={e.transbordement} />
                  Transbordement
                </label>
              </div>
            </div>
            <label className={s.precisions}>
              <span>Précisions d&apos;accès</span>
              <input name={`acces_${e.id}`} defaultValue={e.acces ?? ""} placeholder="Code portail, cour intérieure, horaires de la rue…" />
            </label>
          </fieldset>
        ))}
        <div className={s.fenetreBas}>
          <button className="btn ghost" name="ajouter" value="1">
            + Ajouter une étape
          </button>
          <button className="btn primary">Enregistrer les adresses</button>
        </div>
      </form>
    </details>
  );
}
