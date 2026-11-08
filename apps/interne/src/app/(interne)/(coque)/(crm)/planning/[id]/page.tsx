import Link from "next/link";
import { notFound } from "next/navigation";
import Bandeau from "@/ui/Bandeau";
import { commerciaux } from "@/crm/lib/data";
import { nomClient } from "@/crm/lib/format";
import { changerEtatVisite, majFenetreVisite, modifierRdv, supprimerRendezVous } from "@/crm/planning/actions";
import BoutonConfirmer from "@/crm/planning/BoutonConfirmer";
import { etapesDossier, rendezVous } from "@/crm/planning/donnees";
import { commencerVisite } from "@/crm/visites/actions";
import { estVisite, etatVisite, ETATS_VISITE } from "@/crm/visites/cycle";
import { canauxDeRappel } from "@/crm/visites/rappels";
import { ACCES_MONTE_MEUBLE, ACCES_STATIONNEMENT, GENRE_ETAPE, hhmmParis, jourParis, momentVisite } from "@/lib/visite/regles";
import s from "@/crm/planning/fenetre.module.css";

export const dynamic = "force-dynamic";

/*
 * Un rendez-vous du planning : tout se modifie (date, heure, durée, type,
 * commercial, lieu, commentaire), il se supprime, et une visite y suit son
 * cycle. Pour une visite rattachée à un dossier, la fenêtre de visite reprend
 * celle de Créagidem : chaque adresse avec son code postal, sa ville, son
 * pays et un téléphone, puis les accès — monte-charge, transbordement,
 * portage, monte-meubles, demande de stationnement —, et une étape s'ajoute.
 */

const TYPES: Record<string, string> = { phys: "Visite physique", visio: "Visio", tache: "Tâche", perso: "Perso / règle" };
const MESSAGES: Record<string, string> = { adresses: "Adresses et accès enregistrés.", etape: "Étape ajoutée : complétez son adresse." };

export default async function RendezVous({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erreur?: string; ok?: string }> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const r = await rendezVous(id);
  if (!r) notFound();
  const [coms, etapes] = await Promise.all([commerciaux(), r.dossier_id ? etapesDossier(r.dossier_id) : Promise.resolve([])]);
  const visite = estVisite(r.type) && !!r.dossier_id && !r.journee;
  const etat = visite ? etatVisite(r as Parameters<typeof etatVisite>[0]) : null;
  const jour = jourParis(r.debut);
  const client = r.dossier_id ? nomClient(r) : null;
  const sms = visite && canauxDeRappel({ email: null, telephone: r.client_telephone }).sms;
  const listeComs = coms.some((c) => c.id === r.commercial_id) ? coms : [...coms, { id: r.commercial_id, nom: r.commercial }];

  return (
    <div className="view">
      <Bandeau
        surtitre={visite ? "Planning commercial · Visite technique" : "Planning commercial"}
        titre={r.titre}
        texte={r.journee ? `Journée entière · ${momentVisite(r.debut, true).replace(/ à .*$/, "")}` : `${momentVisite(r.debut, true)} · ${TYPES[r.type] ?? r.type} · ${r.commercial}`}
        etiquettes={[etat && ETATS_VISITE[etat].libelle, r.ref, client]}
        secondaire={{ label: "Retour au planning", href: `/planning?semaine=${jour}` }}
      />
      {sp.erreur && <p className={`${s.flash} ${s.ko}`}>{sp.erreur}</p>}
      {sp.ok && MESSAGES[sp.ok] && <p className={`${s.flash} ${s.ok}`}>{MESSAGES[sp.ok]}</p>}

      <div className={s.grille}>
        <form action={modifierRdv.bind(null, id)} className={`card ${s.carte}`}>
          <h3 className={s.titre}>Le rendez-vous</h3>
          <div className="form-grid">
            <div className="fld w4">
              <label htmlFor="type">Type</label>
              <select id="type" name="type" defaultValue={r.type}>
                {Object.entries(TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld w4">
              <label htmlFor="commercial_id">Commercial</label>
              <select id="commercial_id" name="commercial_id" defaultValue={r.commercial_id}>
                {listeComs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld w4">
              <label htmlFor="titre">Titre</label>
              <input id="titre" type="text" name="titre" defaultValue={r.titre} required />
            </div>
            <div className="fld w4">
              <label htmlFor="date">Date</label>
              <input id="date" type="date" name="date" defaultValue={jour} required />
            </div>
            <div className="fld w4">
              <label htmlFor="heure">Heure</label>
              <input id="heure" type="time" name="heure" step={900} defaultValue={r.journee ? "09:00" : hhmmParis(r.debut)} />
            </div>
            <div className="fld w4">
              <label htmlFor="duree_min">Durée (min)</label>
              <input id="duree_min" type="number" name="duree_min" min={15} max={720} step={15} defaultValue={r.journee ? 60 : r.duree_min} />
            </div>
            <div className="fld w12">
              <label className={s.case}>
                <input type="checkbox" name="journee" defaultChecked={r.journee} disabled={!!r.dossier_id} />
                Toute la journée (une « journée visio », par exemple) {r.dossier_id ? "· réservé aux rendez-vous sans dossier" : ""}
              </label>
            </div>
            <div className="fld w12">
              <label htmlFor="lieu">Lieu</label>
              <input id="lieu" type="text" name="lieu" defaultValue={r.lieu ?? ""} placeholder="Adresse ou « Visio »" />
            </div>
            <div className="fld w12">
              <label htmlFor="notes">Commentaire</label>
              <textarea id="notes" name="notes" defaultValue={r.notes ?? ""} placeholder="Accès, particularités, ce que le client a déjà vu…" />
            </div>
            {sms && (
              <div className="fld w12">
                <label className={s.case}>
                  <input type="checkbox" name="sms" />
                  Si l&apos;horaire change, consigner le SMS de confirmation au dossier (modèle « Confirmation de rendez-vous »)
                </label>
              </div>
            )}
          </div>
          <p className={s.aide}>
            {visite
              ? "Une visite ne se pose pas sur un autre rendez-vous du commercial, ni sur un créneau qu'il propose à un autre client. Le rappel de la veille suit le nouvel horaire, et l'espace du client se met à jour."
              : "Une tâche ou une règle perso se place librement dans le planning."}
          </p>
          <div className="form-actions">
            <button className="btn primary">Enregistrer</button>
          </div>
        </form>

        <div className={s.colonne}>
          {visite && etat && (
            <section className={`card ${s.carte}`}>
              <h3 className={s.titre}>Cycle de la visite</h3>
              <ol className={s.cycle}>
                {(["planifiee", "effectuee", "devis"] as const).map((k) => (
                  <li key={k} className={etat === k ? s.actuel : ["planifiee", "effectuee", "devis"].indexOf(k) < ["planifiee", "effectuee", "devis"].indexOf(etat) ? s.passe : ""}>
                    {ETATS_VISITE[k].libelle}
                  </li>
                ))}
                {etat === "sans_suite" && <li className={`${s.actuel} ${s.sansSuite}`}>Sans suite</li>}
              </ol>
              <div className={s.actions}>
                {etat === "planifiee" && (
                  <form action={changerEtatVisite.bind(null, id, "effectuee")}>
                    <button className="btn ghost sm">Marquer effectuée</button>
                  </form>
                )}
                {etat !== "sans_suite" ? (
                  <form action={changerEtatVisite.bind(null, id, "sans_suite")}>
                    <button className="btn ghost sm">Classer sans suite</button>
                  </form>
                ) : (
                  r.sans_suite && (
                    <form action={changerEtatVisite.bind(null, id, "reprise")}>
                      <button className="btn ghost sm">Reprendre</button>
                    </form>
                  )
                )}
                <form action={commencerVisite.bind(null, r.dossier_id, id)}>
                  <button className="btn ghost sm">Ouvrir sur la tablette</button>
                </form>
                <Link className="btn ghost sm" href={`/dossiers/${r.dossier_id}#visite`}>
                  Fiche du dossier
                </Link>
              </div>
              <p className={s.aide}>« Devis établi » vient du dossier : il se pose quand ses devis sont générés ou envoyés.</p>
            </section>
          )}
          <section className={`card ${s.carte} ${s.danger}`}>
            <h3 className={s.titre}>Supprimer le rendez-vous</h3>
            <p className={s.aide}>Il disparaît du planning{visite ? " et de l'espace du client ; le rappel de la veille n'a plus lieu" : ""}.</p>
            <form action={supprimerRendezVous.bind(null, id)}>
              <BoutonConfirmer className="btn danger sm" libelle="Supprimer" confirmation="Confirmer la suppression" />
            </form>
          </section>
        </div>
      </div>

      {r.dossier_id && (
        <form action={majFenetreVisite.bind(null, id, r.dossier_id)} className={`card ${s.fenetre}`} id="fenetre">
          <div className={s.fenetreTete}>
            <h3 className={s.titre}>Fenêtre de visite · adresses et accès</h3>
            <span className={s.aide}>Les adresses du dossier {r.ref} : elles servent aussi au devis, aux lettres de voiture et à l&apos;espace du client.</span>
          </div>
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
                  <input name={`adresse_${e.id}`} defaultValue={e.adresse ?? ""} placeholder="Numéro et rue" />
                </label>
                <label>
                  <span>Code postal</span>
                  <input name={`code_postal_${e.id}`} defaultValue={e.code_postal ?? ""} inputMode="numeric" />
                </label>
                <label>
                  <span>Ville</span>
                  <input name={`ville_${e.id}`} defaultValue={e.ville ?? ""} />
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
      )}
    </div>
  );
}
