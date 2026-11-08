"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Icone } from "@/ui/icones";
import Fenetre from "@/crm/exploitation/ui/Fenetre";
import Formulaire from "@/crm/exploitation/ui/Formulaire";
import u from "@/crm/exploitation/ui/ui.module.css";
import { ajouterClient, deplacerClient, majClient, retirerClient } from "./actions";
import s from "./conteneurs.module.css";

/*
 * Le contenu d'un conteneur, dans l'ordre de chargement : position, client,
 * dossier, volume, ville de livraison, n° FE. On ajoute, modifie, retire,
 * monte ou descend un client ; la jauge suit le volume chargé.
 */
type Ligne = { id: number; dossier_id: number; ref: string; client: string; volume: number; ville_livraison: string | null; numero_fe: string | null; perdu: boolean };
type Dispo = { id: number; ref: string; client: string; volume: number; ville: string | null };

const m3 = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString("fr-FR")} m³`;

export default function ContenuConteneur({ id, lignes, dispo, capacite }: { id: number; lignes: Ligne[]; dispo: Dispo[]; capacite: number }) {
  const [edite, setEdite] = useState<Ligne | "nouveau" | null>(null);
  const [choix, setChoix] = useState<string>("");
  const [enCours, lancer] = useTransition();
  const utilise = lignes.reduce((a, l) => a + l.volume, 0);
  const part = capacite ? utilise / capacite : 0;
  const l = edite && edite !== "nouveau" ? edite : null;
  const choisi = dispo.find((d) => String(d.id) === choix);

  return (
    <>
      <div className={s.remplissage}>
        <div>
          <b>{m3(utilise)}</b> chargés sur {m3(capacite)} · <b>{m3(Math.max(0, capacite - utilise))}</b> libres · {lignes.length} client{lignes.length > 1 ? "s" : ""}
        </div>
        <div className={u.jauge} data-ton={part > 1 ? "rose" : part > 0.9 ? "ambre" : undefined} style={{ height: 12 }}>
          <i style={{ width: `${Math.min(100, part * 100)}%` }} />
        </div>
      </div>

      {lignes.length === 0 ? (
        <p className={u.vide}>Aucun client dans ce conteneur.</p>
      ) : (
        <div className={u.defile}>
          <table className={u.tableau}>
            <thead>
              <tr>
                <th>Pos.</th>
                <th>Client</th>
                <th className={u.droite}>Volume</th>
                <th>Livraison</th>
                <th>N° FE</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lignes.map((x, i) => (
                <tr key={x.id}>
                  <td>
                    <span className={s.position}>{i + 1}</span>
                  </td>
                  <td>
                    <Link href={`/dossiers/${x.dossier_id}`} className={u.lien} style={{ color: "inherit" }}>
                      <b>{x.client}</b>
                    </Link>
                    <small>
                      {x.ref}
                      {x.perdu && (
                        <i className={u.etat} data-ton="rose" style={{ marginLeft: 6 }}>
                          Dossier perdu
                        </i>
                      )}
                    </small>
                  </td>
                  <td className={u.droite}>
                    <b>{m3(x.volume)}</b>
                  </td>
                  <td>{x.ville_livraison ?? "—"}</td>
                  <td>{x.numero_fe ?? "—"}</td>
                  <td className={u.droite}>
                    <span className={s.gestes}>
                      <button type="button" disabled={enCours || i === 0} aria-label="Monter" title="Monter" onClick={() => lancer(async () => void (await deplacerClient(id, x.id, -1)))}>
                        ↑
                      </button>
                      <button type="button" disabled={enCours || i === lignes.length - 1} aria-label="Descendre" title="Descendre" onClick={() => lancer(async () => void (await deplacerClient(id, x.id, 1)))}>
                        ↓
                      </button>
                      <button type="button" onClick={() => setEdite(x)}>
                        Modifier
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button type="button" className={`${u.bouton} ${u.petit}`} onClick={() => setEdite("nouveau")} style={{ marginTop: 14 }}>
        <Icone nom="plus" taille={15} />
        Ajouter un client
      </button>

      <Fenetre
        ouvert={!!edite}
        fermer={() => setEdite(null)}
        titre={l ? l.client : "Ajouter un client"}
        sousTitre={l ? `Dossier ${l.ref}` : "Un dossier signé ou planifié, avec son volume dans ce conteneur"}
        icone="bateau"
        ton="ciel"
      >
        {edite && (
          <Formulaire key={l?.id ?? "nouveau"} action={l ? majClient.bind(null, id, l.id) : ajouterClient.bind(null, id)} className={u.fenetreFormulaire} onSucces={() => setEdite(null)}>
            <div className={u.fenetreCorps}>
              <div className={u.champs}>
                {!l && (
                  <div className={`${u.champ} ${u.w12}`}>
                    <label htmlFor="cc-dossier">
                      Dossier <em>*</em>
                    </label>
                    <select id="cc-dossier" name="dossier_id" value={choix} onChange={(e) => setChoix(e.target.value)} required>
                      <option value="">Choisir un dossier signé ou planifié…</option>
                      {dispo.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.ref} · {d.client} · {m3(d.volume)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className={`${u.champ} ${u.w4}`}>
                  <label htmlFor="cc-volume">
                    Volume (m³) <em>*</em>
                  </label>
                  <input key={choix} id="cc-volume" type="number" step="0.1" min={0} name="volume" defaultValue={l?.volume ?? choisi?.volume ?? ""} required />
                </div>
                <div className={`${u.champ} ${u.w4}`}>
                  <label htmlFor="cc-ville">Ville de livraison</label>
                  <input key={`v${choix}`} id="cc-ville" type="text" name="ville" defaultValue={l?.ville_livraison ?? choisi?.ville ?? ""} />
                </div>
                <div className={`${u.champ} ${u.w4}`}>
                  <label htmlFor="cc-fe">N° FE</label>
                  <input id="cc-fe" type="text" name="numero_fe" defaultValue={l?.numero_fe ?? ""} />
                </div>
              </div>
            </div>
            <div className={u.fenetrePied}>
              {l && (
                <button
                  type="button"
                  className={u.bouton}
                  data-ton="danger"
                  data-gauche
                  onClick={() => {
                    if (!window.confirm(`Retirer ${l.client} du conteneur ?`)) return;
                    lancer(async () => {
                      await retirerClient(id, l.id);
                      setEdite(null);
                    });
                  }}
                >
                  Retirer du conteneur
                </button>
              )}
              <button type="button" className={u.bouton} data-ton="secondaire" onClick={() => setEdite(null)}>
                Annuler
              </button>
              <button type="submit" className={u.bouton}>
                {l ? "Enregistrer" : "Ajouter au conteneur"}
              </button>
            </div>
          </Formulaire>
        )}
      </Fenetre>
    </>
  );
}
