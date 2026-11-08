import Link from "next/link";
import { notFound } from "next/navigation";
import Bandeau from "@/ui/Bandeau";
import { facturerGardeMeuble } from "@/crm/actions2";
import { dateFr, eur, nomClient } from "@/crm/lib/format";
import { contrat, dossiersRattachables } from "@/crm/garde-meuble/donnees";
import { majContrat, supprimerContrat } from "@/crm/garde-meuble/actions";
import { numeroContrat, PERIODICITES, estPeriodicite } from "@/crm/garde-meuble/regles";
import Caisses from "@/crm/garde-meuble/Caisses";
import GestesContrat from "@/crm/garde-meuble/GestesContrat";
import Formulaire from "@/crm/exploitation/ui/Formulaire";
import BoutonConfirme from "@/crm/exploitation/ui/BoutonConfirme";
import u from "@/crm/exploitation/ui/ui.module.css";

export const dynamic = "force-dynamic";

/*
 * La fiche d'un contrat de garde-meuble : ses caisses une par une (contenu,
 * emplacement, entrée, sortie, photos), le contrat lui-même (modifiable),
 * ses factures, et les gestes de fin : clore, rouvrir, supprimer (sans
 * facture seulement).
 */
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const MESSAGES: Record<string, string> = { cree: "Contrat créé.", photos: "Contrat créé, mais les photos n'ont pas pu être enregistrées : ajoutez-les depuis chaque caisse." };
const FA: Record<string, [string, string]> = { emise: ["Émise", "indigo"], payee: ["Payée", "vert"], retard: ["En retard", "rose"] };

export default async function FicheContrat({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const c = await contrat(id);
  if (!c) notFound();
  const dossiers = await dossiersRattachables(c.dossier_id);
  const aujourdhui = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const periode = estPeriodicite(c.periodicite) ? PERIODICITES[c.periodicite] : PERIODICITES.mensuelle;
  const nb = c.caisseListe.length ? c.caisses : c.nb_caisses;

  return (
    <div className="view">
      <Bandeau
        surtitre={`Garde-meuble · ${numeroContrat(id)}`}
        titre={c.client}
        texte={`${nb} caisse${nb > 1 ? "s" : ""} · ${eur(c.loyer)} par mois · ${c.actif ? `prochaine échéance le ${dateFr(c.echeance, { day: "numeric", month: "long", year: "numeric" })}` : `clos le ${dateFr(c.fin, { day: "numeric", month: "long", year: "numeric" })}`}`}
        etiquettes={[c.actif ? (c.afacturer ? "À facturer" : "Actif") : "Clos", periode.libelle, c.assurance ? "Assuré" : "Non assuré", c.ref]}
        secondaire={{ label: "Tous les contrats", href: "/garde-meuble" }}
      >
        {c.dossier && (
          <Link href={`/dossiers/${c.dossier.id}`} data-ton="contour">
            Dossier {c.dossier.ref}
          </Link>
        )}
        <GestesContrat id={id} actif={c.actif} aujourdhui={aujourdhui} />
      </Bandeau>

      <div className={u.ecran}>
        {sp.ok && MESSAGES[sp.ok] && (
          <p className={u.message} data-ton={sp.ok === "photos" ? "ambre" : undefined}>
            {MESSAGES[sp.ok]}
          </p>
        )}
        {c.afacturer && (
          <section className={u.carte} style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <i className={u.pastille} data-ton="ambre" style={{ width: 44, height: 44 }}>
              €
            </i>
            <div style={{ flex: 1, minWidth: 220 }}>
              <h3 className={u.titre}>Période à facturer</h3>
              <p className={u.sousTitre}>
                Échéance du {dateFr(c.echeance, { day: "numeric", month: "long", year: "numeric" })}
                {c.retard > 0 ? `, échue depuis ${c.retard} jour${c.retard > 1 ? "s" : ""}` : ""} · {periode.libelle.toLowerCase()}, {eur(c.montant)}
              </p>
            </div>
            <form action={facturerGardeMeuble.bind(null, id, c.montant)}>
              <button className={u.bouton}>Émettre la facture de {eur(c.montant)}</button>
            </form>
          </section>
        )}

        <div className={u.colonnes}>
          <div className={u.pile}>
            <section className={u.carte}>
              <Caisses
                contrat={id}
                numerosTexte={c.numeros}
                nbTexte={c.nb_caisses}
                caisses={c.caisseListe.map((k) => ({ id: k.id, numero: k.numero, contenu: k.contenu, emplacement: k.emplacement, entree: iso(k.entree_le) || null, sortie: iso(k.sortie_le) || null, photos: k.photos }))}
              />
            </section>
            <section className={`${u.carte} ${u.carteSerree}`}>
              <div className={u.carteTete}>
                <h3>
                  Factures <small>{c.factures.length}</small>
                </h3>
              </div>
              {c.factures.length === 0 ? (
                <p className={u.vide} style={{ padding: 26 }}>
                  Aucune facture pour l&apos;instant.
                </p>
              ) : (
                <table className={u.tableau}>
                  <tbody>
                    {c.factures.map((f) => (
                      <tr key={f.id}>
                        <td>
                          {f.dossier_id ? (
                            <Link href={`/imprimer/${f.dossier_id}?doc=facture&f=${f.id}`} className={u.ref}>
                              {f.numero}
                            </Link>
                          ) : (
                            <b className={u.ref}>{f.numero}</b>
                          )}
                          <small>{dateFr(f.emise_le, { day: "numeric", month: "short", year: "numeric" })}</small>
                        </td>
                        <td>
                          <i className={u.etat} data-ton={FA[f.statut]?.[1]}>
                            {FA[f.statut]?.[0] ?? f.statut}
                          </i>
                        </td>
                        <td className={u.droite}>
                          <b>{eur(f.montant)}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <div className={u.pile}>
            <section className={u.carte}>
              <div className={u.carteTete}>
                <h3>Le contrat</h3>
              </div>
              <Formulaire action={majContrat.bind(null, id)}>
                <div className={u.champs}>
                  <div className={`${u.champ} ${u.w12}`}>
                    <label htmlFor="dossier_id">Dossier</label>
                    <select id="dossier_id" name="dossier_id" defaultValue={c.dossier_id ?? ""}>
                      <option value="">Sans dossier</option>
                      {dossiers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.ref} · {d.client}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={`${u.champ} ${u.w12}`}>
                    <label htmlFor="client">Nom sur le contrat</label>
                    <input id="client" type="text" name="client" defaultValue={c.client} required />
                  </div>
                  <div className={`${u.champ} ${u.w6}`}>
                    <label htmlFor="debut">Début</label>
                    <input id="debut" type="date" name="debut" defaultValue={iso(c.debut)} required />
                  </div>
                  <div className={`${u.champ} ${u.w6}`}>
                    <label htmlFor="periodicite">Périodicité</label>
                    <select id="periodicite" name="periodicite" defaultValue={c.periodicite}>
                      {Object.entries(PERIODICITES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.libelle}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={`${u.champ} ${u.w6}`}>
                    <label htmlFor="loyer">Loyer mensuel (€)</label>
                    <input id="loyer" type="number" name="loyer" min={0} step="0.01" defaultValue={c.loyer} required />
                  </div>
                  <div className={`${u.champ} ${u.w6}`}>
                    <label htmlFor="echeance">Prochaine échéance</label>
                    <input id="echeance" type="date" name="echeance" defaultValue={c.echeance} />
                  </div>
                  {c.caisseListe.length === 0 && (
                    <>
                      <div className={`${u.champ} ${u.w4}`}>
                        <label htmlFor="nb_caisses">Caisses</label>
                        <input id="nb_caisses" type="number" name="nb_caisses" min={1} defaultValue={c.nb_caisses} />
                      </div>
                      <div className={`${u.champ} ${u.w8}`}>
                        <label htmlFor="numeros">Numéros</label>
                        <input id="numeros" type="text" name="numeros" defaultValue={c.numeros ?? ""} />
                      </div>
                    </>
                  )}
                  <div className={`${u.champ} ${u.w12}`}>
                    <label htmlFor="assurance">Assurance</label>
                    <select id="assurance" name="assurance" defaultValue={c.assurance ? "oui" : "non"}>
                      <option value="oui">Assuré</option>
                      <option value="non">Non assuré</option>
                    </select>
                  </div>
                  <div className={`${u.champ} ${u.w12}`}>
                    <label htmlFor="notes">Notes</label>
                    <textarea id="notes" name="notes" defaultValue={c.notes ?? ""} />
                  </div>
                </div>
                <div className={u.pied} style={{ marginTop: 14 }}>
                  <button type="submit" className={u.bouton}>
                    Enregistrer le contrat
                  </button>
                </div>
              </Formulaire>
            </section>


            {c.dossier && (
              <section className={u.carte}>
                <p className={u.surtitre}>Client du dossier</p>
                <h3 className={u.titre}>{nomClient(c.dossier)}</h3>
                <p className={u.sousTitre}>{[c.dossier.telephone, c.dossier.email].filter(Boolean).join(" · ") || "Coordonnées sur la fiche du dossier"}</p>
              </section>
            )}

            {c.factures.length === 0 && (
              <section className={u.carte} style={{ borderColor: "#ffd9e1" }}>
                <h3 className={u.titre}>Supprimer le contrat</h3>
                <p className={u.sousTitre} style={{ margin: "6px 0 12px" }}>
                  Possible tant qu&apos;aucune facture n&apos;a été émise : ses caisses et leurs photos partent avec lui.
                </p>
                <BoutonConfirme action={supprimerContrat.bind(null, id)} question={`Supprimer le contrat ${numeroContrat(id)} de ${c.client}, ses caisses et leurs photos ?`} petit>
                  Supprimer le contrat
                </BoutonConfirme>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
