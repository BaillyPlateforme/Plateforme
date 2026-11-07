"use client";

import Link from "next/link";
import Indicateurs from "@/ui/Indicateurs";
import { cleDestination, dateLongue, jauge, lignesDe, m3, somme } from "../outils";
import { GENRES, type Ligne, type Plan } from "../types";
import { Jauge } from "./elements";
import { Picto, PICTO_GENRE } from "./Picto";
import s from "./dispatch.module.css";

const STATUTS: Record<string, string> = { preparation: "En préparation", charge: "Chargé", en_mer: "En mer", arrive: "Arrivé", livre: "Livré" };

/**
 * Le récapitulatif par conteneur (et par colonne) : ce qui part, pour où,
 * combien, et ce qui reste à répartir. Le même contenu s'imprime depuis
 * « Exporter ».
 */
export default function Recapitulatif({ plan, lignes, couleurs }: { plan: Plan; lignes: Ligne[]; couleurs: Map<string, string> }) {
  // Les conteneurs d'abord, puis les autres colonnes, dans l'ordre du planning.
  const colonnes = [...plan.colonnes].sort((a, b) => Number(b.genre === "conteneur") - Number(a.genre === "conteneur") || a.ordre - b.ordre);
  const conteneurs = colonnes.filter((c) => c.genre === "conteneur");
  const reste = lignesDe(lignes, null);
  const volumeTc = somme(lignes.filter((l) => conteneurs.some((c) => c.id === l.colonneId)));
  const capaciteTc = conteneurs.reduce((n, c) => n + (c.capacite ?? 0), 0);
  const depasses = colonnes.filter((c) => jauge(somme(lignesDe(lignes, c.id)), c.capacite).etat === "depasse").length;

  return (
    <section aria-label="Récapitulatif par conteneur">
      <div className={s.outils} style={{ marginBottom: 4 }}>
        <p className={s.sousTitre} style={{ fontSize: 13.5 }}>
          {conteneurs.length} conteneur{conteneurs.length > 1 ? "s" : ""} · {m3(volumeTc)} chargés sur {m3(capaciteTc)} de capacité
          {capaciteTc ? ` (${Math.round((volumeTc / capaciteTc) * 100)} %)` : ""}
        </p>
        <div className={s.actions}>
          <a className={s.bouton} href={`/imprimer/dispatch/${plan.id}?doc=recap`} target="_blank" rel="noopener">
            <Picto nom="imprimer" taille={16} /> Imprimer le récapitulatif
          </a>
          <a className={s.bouton} href={`/api/dispatch/${plan.id}/excel`}>
            <Picto nom="tableur" taille={16} /> Excel
          </a>
        </div>
      </div>
      <div style={{ marginBottom: 18 }}>
        <Indicateurs
          items={[
            { libelle: "Conteneurs", precision: `${conteneurs.filter((c) => c.verrouilleeLe).length} validés`, valeur: String(conteneurs.length), icone: "bateau", ton: "violet" },
            { libelle: "Volume chargé", precision: "conteneurs", valeur: m3(volumeTc), icone: "entrepot", ton: "ciel" },
            { libelle: "À répartir", precision: m3(somme(reste)), valeur: `${reste.length} client${reste.length > 1 ? "s" : ""}`, icone: "clients", ton: reste.length ? "ambre" : "vert" },
            { libelle: "Dépassements", precision: "de capacité", valeur: String(depasses), icone: "tendance", ton: depasses ? "rose" : "vert" },
          ]}
        />
      </div>

      <div className={s.recap}>
        {colonnes.map((c) => {
          const ls = lignesDe(lignes, c.id);
          const v = somme(ls);
          const villes = new Map<string, { n: number; v: number; c: string }>();
          for (const l of ls) {
            const nom = l.ville ?? l.pays ?? "—";
            const x = villes.get(nom) ?? { n: 0, v: 0, c: couleurs.get(cleDestination(l)) ?? "#4b2fe0" };
            villes.set(nom, { ...x, n: x.n + 1, v: x.v + l.volume });
          }
          return (
            <article key={c.id} className={s.carte}>
              <div className={s.carteTete}>
                <span className={s.pastille}>
                  <Picto nom={PICTO_GENRE[c.genre]} taille={20} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>{c.libelle}</h3>
                  <p>
                    {[GENRES[c.genre].nom + (c.taille ? ` ${c.taille} pieds` : ""), c.zone, c.jour ? `${c.genre === "conteneur" ? "départ " : ""}${dateLongue(c.jour)}` : null].filter(Boolean).join(" · ")}
                  </p>
                  {c.conteneur && (
                    <p>
                      <Link href={`/conteneurs/${c.conteneurId}`} style={{ color: "#4b2fe0", fontWeight: 650 }}>
                        {c.conteneur.numero}
                      </Link>{" "}
                      · {STATUTS[c.conteneur.statut] ?? c.conteneur.statut}
                    </p>
                  )}
                </div>
                {c.verrouilleeLe ? (
                  <span className={`${s.badge} ${s.vert}`}>
                    <Picto nom="cadenas" taille={12} /> Validé
                  </span>
                ) : (
                  <span className={`${s.badge} ${s.violet}`}>Ouvert</span>
                )}
              </div>
              <div className={s.stats}>
                <div>
                  <small>Clients</small>
                  <b>{ls.length}</b>
                </div>
                <div>
                  <small>Volume</small>
                  <b>{m3(v)}</b>
                </div>
                <div>
                  <small>Remplissage</small>
                  <b>{c.capacite ? `${Math.round((v / c.capacite) * 100)} %` : "—"}</b>
                </div>
              </div>
              <Jauge volume={v} capacite={c.capacite} />
              {villes.size > 0 && (
                <div className={s.villes} style={{ marginTop: 12 }}>
                  {[...villes].map(([nom, x]) => (
                    <span key={nom} className={s.puce} style={{ ["--c" as string]: x.c }}>
                      <i />
                      <span>{nom}</span>
                      <em>
                        {x.n} · {m3(x.v)}
                      </em>
                    </span>
                  ))}
                </div>
              )}
              {ls.length > 0 ? (
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Client</th>
                      <th>Destination</th>
                      <th className={s.n}>Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ls.map((l, i) => (
                      <tr key={l.id}>
                        <td>{i + 1}</td>
                        <td>
                          <b style={{ fontWeight: 650 }}>{l.client}</b>
                          {l.remarques && <div className={s.sousTitre}>{l.remarques}</div>}
                        </td>
                        <td>
                          <i style={{ ["--c" as string]: couleurs.get(cleDestination(l)) }} />
                          {[l.ville, l.pays].filter(Boolean).join(", ")}
                        </td>
                        <td className={s.n}>{m3(l.volume)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className={s.sousTitre} style={{ marginTop: 12 }}>
                  Aucun client pour l&apos;instant.
                </p>
              )}
              <div style={{ marginTop: 14 }}>
                <a className={`${s.bouton} ${s.petit}`} href={`/imprimer/dispatch/${plan.id}?doc=feuilles&colonne=${c.id}`} target="_blank" rel="noopener">
                  <Picto nom="imprimer" taille={14} /> {GENRES[c.genre].feuille}
                </a>
              </div>
            </article>
          );
        })}
        {reste.length > 0 && (
          <article className={s.carte} style={{ borderStyle: "dashed" }}>
            <div className={s.carteTete}>
              <span className={`${s.pastille} ${s.ambre}`}>
                <Picto nom="deplacer" taille={20} />
              </span>
              <div style={{ flex: 1 }}>
                <h3>À répartir</h3>
                <p>
                  {reste.length} client{reste.length > 1 ? "s" : ""} · {m3(somme(reste))} sans colonne
                </p>
              </div>
            </div>
            <table className={s.table} style={{ marginTop: 12 }}>
              <tbody>
                {reste.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <b style={{ fontWeight: 650 }}>{l.client}</b>
                    </td>
                    <td>
                      <i style={{ ["--c" as string]: couleurs.get(cleDestination(l)) }} />
                      {[l.ville, l.pays].filter(Boolean).join(", ")}
                    </td>
                    <td className={s.n}>{m3(l.volume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        )}
      </div>
    </section>
  );
}
