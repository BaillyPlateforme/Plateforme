"use client";

import { useState, useTransition } from "react";
import { Icone } from "@/ui/icones";
import Fenetre from "@/crm/exploitation/ui/Fenetre";
import Formulaire from "@/crm/exploitation/ui/Formulaire";
import u from "@/crm/exploitation/ui/ui.module.css";
import { ajouterCaisses, majCaisse, supprimerCaisse, supprimerPhoto } from "./actions";
import { deplier } from "./regles";
import s from "./garde-meuble.module.css";

/*
 * Les caisses d'un contrat, une par une : numéro, contenu, emplacement,
 * entrée et sortie, photos. Une caisse se modifie dans une fenêtre (photos
 * comprises) ; « Ajouter des caisses » accepte un numéro ou une suite.
 */

export type CaisseVue = { id: number; numero: string; contenu: string | null; emplacement: string | null; entree: string | null; sortie: string | null; photos: { id: number }[] };

const jourFr = (v: string | null) => (v ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${v}T00:00:00Z`)) : "—");
const photo = (id: number) => `/api/garde-meuble/photos/${id}`;

export default function Caisses({ contrat, caisses, numerosTexte, nbTexte }: { contrat: number; caisses: CaisseVue[]; /** Les numéros en texte d'un contrat sans caisses détaillées. */ numerosTexte: string | null; nbTexte: number }) {
  const [edite, setEdite] = useState<CaisseVue | null>(null);
  const [ajout, setAjout] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [, lancer] = useTransition();
  const presentes = caisses.filter((c) => !c.sortie);
  const sorties = caisses.filter((c) => c.sortie);

  return (
    <>
      <div className={u.carteTete}>
        <h3>
          Caisses <small>{caisses.length ? `${presentes.length} présente${presentes.length > 1 ? "s" : ""}${sorties.length ? ` · ${sorties.length} sortie${sorties.length > 1 ? "s" : ""}` : ""}` : `${nbTexte} au contrat`}</small>
        </h3>
        <button type="button" className={`${u.bouton} ${u.petit}`} onClick={() => setAjout(true)}>
          <Icone nom="plus" taille={15} />
          Ajouter des caisses
        </button>
      </div>

      {caisses.length === 0 ? (
        <div className={s.sansDetail}>
          <i>
            <Icone nom="caisse" taille={22} />
          </i>
          <div>
            <b>{nbTexte} caisse{nbTexte > 1 ? "s" : ""} saisie{nbTexte > 1 ? "s" : ""} en une ligne</b>
            <p>{numerosTexte || "Numéros non renseignés"}</p>
            <p className={u.aide}>Ajoutez une caisse : les numéros ci-dessus deviennent des caisses une par une, que l&apos;on peut décrire et photographier.</p>
          </div>
        </div>
      ) : (
        <div className={s.caisses}>
          {[...presentes, ...sorties].map((c) => (
            <button key={c.id} type="button" className={s.caisse} data-sortie={c.sortie ? "oui" : undefined} onClick={() => setEdite(c)}>
              <span className={s.caisseTete}>
                <b>{c.numero}</b>
                <i className={u.etat} data-ton={c.sortie ? "gris" : "vert"}>
                  {c.sortie ? `Sortie ${jourFr(c.sortie)}` : "Au dépôt"}
                </i>
              </span>
              <span className={s.caisseContenu}>{c.contenu ?? "Contenu non décrit"}</span>
              <span className={s.caissePied}>
                <span>
                  <Icone nom="entrepot" taille={14} />
                  {c.emplacement ?? "Emplacement libre"}
                </span>
                <span>Entrée {jourFr(c.entree)}</span>
              </span>
              {c.photos.length > 0 && (
                <span className={s.caissePhotos}>
                  {c.photos.slice(0, 4).map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element -- photo privée servie par une URL signée
                    <img key={p.id} src={photo(p.id)} alt={`Photo de la caisse ${c.numero}`} />
                  ))}
                  {c.photos.length > 4 && <em>+{c.photos.length - 4}</em>}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <Fenetre ouvert={!!edite} fermer={() => setEdite(null)} titre={edite ? `Caisse ${edite.numero}` : "Caisse"} sousTitre="Contenu, emplacement, entrée et sortie, photos" icone="caisse" ton="ambre">
        {edite && (
          <Formulaire key={edite.id} action={majCaisse.bind(null, contrat, edite.id)} className={u.fenetreFormulaire} onSucces={() => setEdite(null)}>
            <div className={u.fenetreCorps}>
              <div className={u.champs}>
                <div className={`${u.champ} ${u.w4}`}>
                  <label htmlFor="k-numero">
                    Numéro <em>*</em>
                  </label>
                  <input id="k-numero" type="text" name="numero" defaultValue={edite.numero} required />
                </div>
                <div className={`${u.champ} ${u.w8}`}>
                  <label htmlFor="k-emplacement">Emplacement</label>
                  <input id="k-emplacement" type="text" name="emplacement" defaultValue={edite.emplacement ?? ""} placeholder="Allée, rang, niveau…" />
                </div>
                <div className={`${u.champ} ${u.w12}`}>
                  <label htmlFor="k-contenu">Contenu</label>
                  <input id="k-contenu" type="text" name="contenu" defaultValue={edite.contenu ?? ""} placeholder="Ce que contient la caisse" />
                </div>
                <div className={`${u.champ} ${u.w6}`}>
                  <label htmlFor="k-entree">Entrée au dépôt</label>
                  <input id="k-entree" type="date" name="entree_le" defaultValue={edite.entree ?? ""} />
                </div>
                <div className={`${u.champ} ${u.w6}`}>
                  <label htmlFor="k-sortie">Sortie</label>
                  <input id="k-sortie" type="date" name="sortie_le" defaultValue={edite.sortie ?? ""} />
                  <p className={u.aide}>Une caisse sortie ne compte plus dans le contrat.</p>
                </div>
              </div>
              <div className={u.bloc}>
                <p className={u.blocTitre}>
                  Photos <small>{edite.photos.length || "aucune"}</small>
                </p>
                {edite.photos.length > 0 && (
                  <div className={s.galerie}>
                    {edite.photos.map((p) => (
                      <figure key={p.id}>
                        <a href={photo(p.id)} target="_blank" rel="noopener">
                          {/* eslint-disable-next-line @next/next/no-img-element -- photo privée servie par une URL signée */}
                          <img src={photo(p.id)} alt={`Photo de la caisse ${edite.numero}`} />
                        </a>
                        <button
                          type="button"
                          aria-label="Retirer la photo"
                          onClick={() => {
                            if (!window.confirm("Retirer cette photo ?")) return;
                            lancer(async () => {
                              await supprimerPhoto(contrat, p.id);
                              setEdite((e) => (e ? { ...e, photos: e.photos.filter((x) => x.id !== p.id) } : e));
                            });
                          }}
                        >
                          <Icone nom="plus" taille={14} />
                        </button>
                      </figure>
                    ))}
                  </div>
                )}
                <label className={s.depot}>
                  <input type="file" name="photos" accept="image/*" multiple />
                  <Icone nom="plus" taille={16} />
                  Ajouter des photos (facultatif, 15 Mo au plus chacune)
                </label>
              </div>
            </div>
            <div className={u.fenetrePied}>
              <button
                type="button"
                className={u.bouton}
                data-ton="danger"
                data-gauche
                onClick={() => {
                  if (!window.confirm(`Retirer la caisse ${edite.numero} du contrat (et ses photos) ? Pour une caisse rendue au client, indiquez plutôt sa date de sortie.`)) return;
                  lancer(async () => {
                    await supprimerCaisse(contrat, edite.id);
                    setEdite(null);
                  });
                }}
              >
                Retirer la caisse
              </button>
              <button type="button" className={u.bouton} data-ton="secondaire" onClick={() => setEdite(null)}>
                Annuler
              </button>
              <button type="submit" className={u.bouton}>
                Enregistrer
              </button>
            </div>
          </Formulaire>
        )}
      </Fenetre>

      <Fenetre ouvert={ajout} fermer={() => setAjout(false)} titre="Ajouter des caisses" sousTitre="Un numéro, ou une suite : « GM-0720 à GM-0725 »" icone="caisse" ton="ambre">
        {ajout && (
          <Formulaire action={ajouterCaisses.bind(null, contrat)} className={u.fenetreFormulaire} onSucces={() => setAjout(false)}>
            <div className={u.fenetreCorps}>
              <div className={u.champs}>
                <div className={`${u.champ} ${u.w12}`}>
                  <label htmlFor="a-numeros">
                    Numéro(s) <em>*</em>
                  </label>
                  <input id="a-numeros" type="text" name="numeros" value={saisie} onChange={(e) => setSaisie(e.target.value)} required placeholder="GM-0720, ou GM-0720 à GM-0725" />
                  <p className={u.aide}>{deplier(saisie).length > 1 ? `${deplier(saisie).length} caisses seront créées.` : "Séparez plusieurs numéros par des virgules."}</p>
                </div>
                <div className={`${u.champ} ${u.w8}`}>
                  <label htmlFor="a-contenu">Contenu</label>
                  <input id="a-contenu" type="text" name="contenu" placeholder="Facultatif" />
                </div>
                <div className={`${u.champ} ${u.w4}`}>
                  <label htmlFor="a-entree">Entrée au dépôt</label>
                  <input id="a-entree" type="date" name="entree_le" />
                </div>
                <div className={`${u.champ} ${u.w12}`}>
                  <label htmlFor="a-emplacement">Emplacement</label>
                  <input id="a-emplacement" type="text" name="emplacement" placeholder="Allée, rang…" />
                </div>
                {deplier(saisie).length <= 1 && (
                  <div className={`${u.champ} ${u.w12}`}>
                    <label className={s.depot}>
                      <input type="file" name="photos" accept="image/*" multiple />
                      <Icone nom="plus" taille={16} />
                      Photos de la caisse (facultatif)
                    </label>
                  </div>
                )}
              </div>
            </div>
            <div className={u.fenetrePied}>
              <button type="button" className={u.bouton} data-ton="secondaire" onClick={() => setAjout(false)}>
                Annuler
              </button>
              <button type="submit" className={u.bouton}>
                Ajouter
              </button>
            </div>
          </Formulaire>
        )}
      </Fenetre>
    </>
  );
}
