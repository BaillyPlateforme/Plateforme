import Link from "next/link";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import { Icone } from "@/ui/icones";
import { facturerGardeMeuble } from "@/crm/actions2";
import { dateFr, eur } from "@/crm/lib/format";
import { contrats, compteurs } from "@/crm/garde-meuble/donnees";
import { numeroContrat, PERIODICITES, estPeriodicite } from "@/crm/garde-meuble/regles";
import { reglerLoyerCaisse } from "@/crm/garde-meuble/actions";
import { reglage } from "@/crm/exploitation/commun";
import Formulaire from "@/crm/exploitation/ui/Formulaire";
import { BarreBas, RechercheVerre } from "@/crm/exploitation/ui/Bas";
import u from "@/crm/exploitation/ui/ui.module.css";
import s from "@/crm/garde-meuble/garde-meuble.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Garde-meuble" };

/*
 * Les contrats de garde-meuble : actifs, à facturer, clos. Chaque contrat a
 * sa fiche (caisses une par une, photos, factures) ; « Facturer » émet la
 * facture de la période échue. Un contrat se crée ici ou depuis la fiche
 * d'un dossier (/garde-meuble/nouveau?dossier=…).
 */
const VUES = { actifs: "Actifs", a_facturer: "À facturer", clos: "Clos", tous: "Tous" } as const;
type Vue = keyof typeof VUES;

export default async function GardeMeuble({ searchParams }: { searchParams: Promise<{ vue?: string; q?: string; ok?: string }> }) {
  const sp = await searchParams;
  const vue: Vue = sp.vue && sp.vue in VUES ? (sp.vue as Vue) : "actifs";
  const [rows, n, loyerCaisse] = await Promise.all([contrats({ vue, q: sp.q?.trim() || undefined }), compteurs(), reglage("gm_loyer_caisse")]);
  const nombres: Record<Vue, number> = { actifs: n.actifs, a_facturer: n.aFacturer, clos: n.clos, tous: n.tous };
  const lien = (v: Vue) => `/garde-meuble${v === "actifs" && !sp.q ? "" : `?${new URLSearchParams({ ...(v !== "actifs" ? { vue: v } : {}), ...(sp.q ? { q: sp.q } : {}) })}`}`;

  return (
    <div className="view">
      <Bandeau
        surtitre="Exploitation"
        titre="Garde-meuble"
        texte="Contrats, caisses une par une et facturation des périodes."
        action={{ label: "Nouveau contrat", href: "/garde-meuble/nouveau", icone: "plus" }}
        bas={
          <BarreBas>
            <Pilules label="Contrats" items={(Object.keys(VUES) as Vue[]).map((v) => ({ href: lien(v), label: VUES[v], actif: vue === v, nombre: nombres[v] }))} />
            <RechercheVerre action="/garde-meuble" valeur={sp.q} placeholder="Client, n° de caisse, contenu…" garder={{ vue: vue === "actifs" ? undefined : vue }} />
          </BarreBas>
        }
      />
      <div className={u.ecran}>
        {sp.ok === "supprime" && <p className={u.message}>Contrat supprimé.</p>}
        <section className={`${u.carte} ${u.carteSerree}`}>
          {rows.length === 0 ? (
            <div className={u.vide}>
              <i>
                <Icone nom="entrepot" taille={24} />
              </i>
              <b>{sp.q ? "Aucun contrat ne correspond." : vue === "a_facturer" ? "Rien à facturer aujourd'hui." : "Aucun contrat."}</b>
              <Link href="/garde-meuble/nouveau" className={u.lien}>
                Créer un contrat
              </Link>
            </div>
          ) : (
            <div className={u.defile}>
              <table className={u.tableau}>
                <thead>
                  <tr>
                    <th>Contrat</th>
                    <th>Caisses</th>
                    <th>Facturation</th>
                    <th className={u.droite}>Loyer mensuel</th>
                    <th>Prochaine échéance</th>
                    <th className={u.droite}>Période</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={u.ligneLien}>
                      <td className={s.client}>
                        <Link href={`/garde-meuble/${r.id}`} className={u.etendu}>
                          <b>{r.client}</b>
                        </Link>
                        <small>
                          {numeroContrat(r.id)}
                          {r.ref ? ` · ${r.ref}` : ""} · depuis {dateFr(r.debut, { month: "short", year: "numeric" })}
                          {r.assurance ? "" : " · non assuré"}
                        </small>
                      </td>
                      <td>
                        <b>{r.caisses || r.nb_caisses}</b>
                        <small>{r.numeros ?? "—"}</small>
                      </td>
                      <td>{estPeriodicite(r.periodicite) ? PERIODICITES[r.periodicite].libelle : r.periodicite}</td>
                      <td className={u.droite}>{eur(r.loyer)}</td>
                      <td>
                        {!r.actif ? (
                          <i className={u.etat} data-ton="gris">
                            Clos {r.fin ? dateFr(r.fin) : ""}
                          </i>
                        ) : r.afacturer ? (
                          <i className={u.etat} data-ton={r.retard > 20 ? "rose" : "ambre"}>
                            {r.retard > 0 ? `À facturer · échu depuis ${r.retard} j` : "À facturer aujourd’hui"}
                          </i>
                        ) : (
                          <i className={u.etat} data-ton="vert">
                            {dateFr(r.echeance, { day: "numeric", month: "short", year: "numeric" })}
                          </i>
                        )}
                      </td>
                      <td className={`${u.droite} ${s.montant}`}>{eur(r.montant)}</td>
                      <td className={u.droite}>
                        {r.afacturer && (
                          <form action={facturerGardeMeuble.bind(null, r.id, r.montant)} className={u.dessus}>
                            <button className={`${u.bouton} ${u.petit}`}>Facturer</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={u.carte}>
          <div className={u.carteTete}>
            <div>
              <h3>Loyer par caisse</h3>
              <p className={u.sousTitre}>Facultatif. Renseigné, il pré-remplit le loyer d&apos;un nouveau contrat (nombre de caisses × loyer). Vide, le loyer se saisit à chaque contrat.</p>
            </div>
          </div>
          <Formulaire action={reglerLoyerCaisse} className={s.reglage}>
            <div className={u.champ} style={{ gridColumn: "auto", width: 240 }}>
              <label htmlFor="loyer_caisse">Loyer mensuel d&apos;une caisse (€)</label>
              <input id="loyer_caisse" type="number" min={0} step="0.01" name="loyer_caisse" defaultValue={loyerCaisse ?? ""} placeholder="Non renseigné" />
            </div>
            <button type="submit" className={u.bouton} data-ton="secondaire">
              Enregistrer
            </button>
          </Formulaire>
        </section>
      </div>
    </div>
  );
}
