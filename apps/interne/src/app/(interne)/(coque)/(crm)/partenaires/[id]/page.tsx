import Link from "next/link";
import { notFound } from "next/navigation";
import Bandeau from "@/ui/Bandeau";
import MenuActions from "@/ui/MenuActions";
import { dateFr, eur, nomClient } from "@/crm/lib/format";
import { partenaire } from "@/crm/partenaires/donnees";
import { CATEGORIES } from "@/crm/partenaires/categories";
import { majPartenaire, supprimerPartenaire } from "@/crm/partenaires/actions";
import ChampsPartenaire from "@/crm/partenaires/ChampsPartenaire";
import Contacts from "@/crm/partenaires/Contacts";
import Formulaire from "@/crm/exploitation/ui/Formulaire";
import BoutonConfirme from "@/crm/exploitation/ui/BoutonConfirme";
import u from "@/crm/exploitation/ui/ui.module.css";

export const dynamic = "force-dynamic";

const LV: Record<string, [string, string]> = { a_planifier: ["À planifier", "indigo"], planifiee: ["Planifiée", "violet"], en_cours: ["En cours", "ambre"], livree: ["Livrée", "vert"] };
const LIT: Record<string, [string, string]> = { ouvert: ["Ouvert", "rose"], en_cours: ["En cours", "ambre"], clos: ["Clos", "vert"] };

/** La fiche d'une société de l'annuaire : coordonnées, zones, notes, contacts, lettres de voiture et litiges. */
export default async function FichePartenaire({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const p = await partenaire(id);
  if (!p) notFound();
  const cat = CATEGORIES[p.categorie] ?? CATEGORIES.autre;
  const cout = p.lettres.reduce((a, l) => a + Number(l.prix ?? 0), 0);

  return (
    <div className="view">
      <Bandeau
        surtitre={`Partenaires · ${cat.libelle}`}
        titre={p.nom}
        texte={[p.ville, p.telephone, p.email].filter(Boolean).join(" · ") || "Coordonnées à compléter"}
        etiquettes={[!p.actif && "Désactivée", p.demo && "Démonstration", ...p.zones.slice(0, 3)]}
        secondaire={{ label: "Tout l’annuaire", href: "/partenaires" }}
      >
        {p.telephone && (
          <a data-ton="contour" href={`tel:${p.telephone.replace(/\s/g, "")}`}>
            Appeler
          </a>
        )}
        {p.email && (
          <a data-ton="contour" href={`mailto:${p.email}`}>
            Écrire
          </a>
        )}
        <MenuActions>
          <BoutonConfirme action={supprimerPartenaire.bind(null, id)} question={`Supprimer ${p.nom} de l'annuaire ? Ses lettres de voiture gardent le nom saisi.`} enBandeau>
            Supprimer la fiche
          </BoutonConfirme>
        </MenuActions>
      </Bandeau>

      <div className={u.ecran}>
        <div className={u.colonnes}>
          <section className={u.carte}>
            <div className={u.carteTete}>
              <h3>La société</h3>
            </div>
            <Formulaire action={majPartenaire.bind(null, id)}>
              <div style={{ display: "grid", gap: 18 }}>
                <ChampsPartenaire p={p} />
                <div className={u.bloc}>
                  <div className={u.champs}>
                    <div className={`${u.champ} ${u.w6}`}>
                      <label htmlFor="actif">Dans l&apos;annuaire</label>
                      <select id="actif" name="actif" defaultValue={p.actif ? "oui" : "non"}>
                        <option value="oui">Active : proposée dans les listes</option>
                        <option value="non">Désactivée : gardée, plus proposée</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className={u.pied}>
                  <button type="submit" className={u.bouton}>
                    Enregistrer la fiche
                  </button>
                </div>
              </div>
            </Formulaire>
          </section>

          <div className={u.pile}>
            <section className={u.carte}>
              <div className={u.carteTete}>
                <h3>
                  Contacts <small>{p.contacts.length}</small>
                </h3>
              </div>
              <Contacts id={id} contacts={p.contacts} />
            </section>
            <section className={u.carte}>
              <div className={u.carteTete}>
                <h3>En chiffres</h3>
              </div>
              <div className={u.valeurs} style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div>
                  <small>Lettres</small>
                  <b>{p.lettres.length}</b>
                </div>
                <div>
                  <small>Sous-traité</small>
                  <b>{cout ? eur(cout) : "—"}</b>
                </div>
                <div>
                  <small>Litiges ouverts</small>
                  <b>{p.litiges.filter((l) => l.statut !== "clos").length}</b>
                </div>
                <div>
                  <small>Dernière mission</small>
                  <b>{p.lettres[0] ? dateFr(p.lettres[0].date_chargement ?? p.lettres[0].date_livraison) : "—"}</b>
                </div>
              </div>
            </section>
          </div>
        </div>

        <section className={`${u.carte} ${u.carteSerree}`}>
          <div className={u.carteTete}>
            <h3>
              Lettres de voiture <small>{p.lettres.length}</small>
            </h3>
            <Link href="/lettres-de-voiture" className={u.lien}>
              Toutes les lettres
            </Link>
          </div>
          {p.lettres.length === 0 ? (
            <p className={u.vide}>Aucune lettre de voiture reliée à cette société.</p>
          ) : (
            <div className={u.defile}>
              <table className={u.tableau}>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Client</th>
                    <th>Trajet</th>
                    <th>Chargement</th>
                    <th>Statut</th>
                    <th className={u.droite}>Prix sous-traitant</th>
                  </tr>
                </thead>
                <tbody>
                  {p.lettres.map((l) => (
                    <tr key={l.id} className={u.ligneLien}>
                      <td>
                        <Link href={`/dossiers/${l.did}`} className={`${u.etendu} ${u.ref}`}>
                          {l.numero}
                        </Link>
                      </td>
                      <td>
                        <b>{nomClient(l)}</b>
                        <small>{l.ref}</small>
                      </td>
                      <td>{l.trajet}</td>
                      <td className={u.nowrap}>{dateFr(l.date_chargement)}</td>
                      <td>
                        <i className={u.etat} data-ton={LV[l.statut]?.[1]}>
                          {LV[l.statut]?.[0] ?? l.statut}
                        </i>
                      </td>
                      <td className={u.droite}>{l.prix != null ? eur(l.prix) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {p.litiges.length > 0 && (
          <section className={`${u.carte} ${u.carteSerree}`}>
            <div className={u.carteTete}>
              <h3>
                Litiges <small>{p.litiges.length}</small>
              </h3>
              <Link href="/litiges" className={u.lien}>
                Tous les litiges
              </Link>
            </div>
            <div className={u.defile}>
              <table className={u.tableau}>
                <tbody>
                  {p.litiges.map((l) => (
                    <tr key={l.id}>
                      <td className={u.nowrap}>{dateFr(l.ouvert_le)}</td>
                      <td>
                        <b>{l.objet}</b>
                        <small>
                          <Link href={`/dossiers/${l.did}`} className={u.lien}>
                            {l.ref}
                          </Link>
                        </small>
                      </td>
                      <td>
                        <i className={u.etat} data-ton={LIT[l.statut]?.[1]}>
                          {LIT[l.statut]?.[0]}
                        </i>
                      </td>
                      <td className={u.droite}>{l.montant != null ? eur(l.montant) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
