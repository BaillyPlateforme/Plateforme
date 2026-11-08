"use client";

import { useState } from "react";
import { ESCALIER, MONTE_MEUBLE, POIDS_LOURD, STATIONNEMENT, libelleEtage } from "@/lib/espace-client/libelles";
import { Icone } from "@/ui/icones";
import { appareilDe, euros, jourCourt, jourHeure, type Apercable, type DonneesFiche } from "./outils";
import { Visionneuse } from "./Visionneuse";
import s from "./suivi.module.css";

/*
 * Ce que le client a répondu dans son espace, lisible comme un document :
 * ses conditions de livraison, sa déclaration de valeurs, et la trace de
 * chacun de ses engagements (CGV, RGPD, devis…) — date, adresse IP, version.
 */

const ENGAGEMENT: Record<string, string> = {
  cgv: "Conditions générales de vente",
  rgpd: "Politique de confidentialité",
  conditions_livraison: "Conditions de livraison certifiées",
  declaration_valeurs: "Déclaration de valeurs certifiée",
  devis: "Acceptation du devis",
};

function Etat({ ton, children }: { ton: "ok" | "bloquant" | "a_faire" | "neutre"; children: React.ReactNode }) {
  return (
    <span className={s.etat} data-etat={ton === "ok" ? "fait" : ton}>
      {children}
    </span>
  );
}

function Vide({ ton, titre, texte }: { ton: "bloquant" | "a_faire"; titre: string; texte: string }) {
  return (
    <div className={s.reponseVide} data-ton={ton}>
      <Icone nom={ton === "bloquant" ? "alerte" : "horloge"} taille={18} />
      <p>
        <b>{titre}</b>
        {texte}
      </p>
    </div>
  );
}

export function Reponses({ d }: { d: DonneesFiche }) {
  const [vue, setVue] = useState<number | null>(null);
  const c = d.conditions;
  const v = d.declaration;
  const certif = d.acceptations.find((a) => a.type === "conditions_livraison");
  const certifValeurs = d.acceptations.find((a) => a.type === "declaration_valeurs");
  const photos: Apercable[] = (c?.photos ?? []).map((p) => ({ cle: p.id, libelle: "Photo de l'accès", nom: p.nom, mime: p.mime, lien: p.lien, telecharger: p.telecharger, categorie: "Conditions de livraison", taille: p.taille }));

  const lignes: [string, React.ReactNode][] = c
    ? [
        ["Adresse de livraison", c.adresse_livraison || "—"],
        ["Étage", libelleEtage(c.etage)],
        [
          "Ascenseur",
          c.ascenseur ? (c.ascenseur_dimensions ? `Oui · cabine ${c.ascenseur_dimensions.largeur} × ${c.ascenseur_dimensions.profondeur} × ${c.ascenseur_dimensions.hauteur} cm` : "Oui") : "Non",
        ],
        ["Escalier", ESCALIER[c.escalier]],
        ["Distance de portage", `${c.distance_portage_m} m`],
        ["Accès poids lourd", POIDS_LOURD[c.acces_poids_lourd]],
        ["Stationnement", STATIONNEMENT[c.stationnement]],
        ["Monte-meuble", MONTE_MEUBLE[c.monte_meuble]],
        ["Particularités de la rue", c.particularites_rue.length ? c.particularites_rue.join(", ") : "Aucune"],
        ["Horaires restreints", c.horaires_restreints || "Aucun"],
      ]
    : [];

  return (
    <div className={s.reponses}>
      {/* Les conditions de livraison : l'étape bloquante. */}
      <article className={s.document} id="conditions">
        <header className={s.documentTete}>
          <span className={s.documentPicto}>
            <Icone nom="camion" taille={18} />
          </span>
          <div>
            <h3>Conditions de livraison</h3>
            <p>Le questionnaire d&apos;accès à l&apos;adresse d&apos;arrivée, certifié par le client</p>
          </div>
          {c?.valide_at ? <Etat ton="ok">Certifiées le {jourCourt(c.valide_at)}</Etat> : c ? <Etat ton="a_faire">Commencé, non certifié</Etat> : <Etat ton="bloquant">Bloquant</Etat>}
        </header>
        {c ? (
          <>
            <dl className={s.definitions}>
              {lignes.map(([k, val]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{val}</dd>
                </div>
              ))}
            </dl>
            {c.commentaire && (
              <blockquote className={s.citation}>
                <span>Commentaire du client</span>« {c.commentaire} »
              </blockquote>
            )}
            {photos.length > 0 && (
              <div className={s.photos}>
                <span className={s.photosTitre}>Photos jointes · {photos.length}</span>
                <ul>
                  {photos.map((p, i) => (
                    <li key={p.cle}>
                      <button type="button" onClick={() => setVue(i)} aria-label={`Voir ${p.nom}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- adresse signée qui redirige vers le stockage */}
                        <img src={p.lien} alt="" loading="lazy" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {certif && (
              <p className={s.trace}>
                <Icone nom="signature" taille={14} />
                Certifiées le {jourHeure(certif.accepted_at)} · version {certif.version_texte} · IP {certif.ip} · {appareilDe(certif.user_agent)}
              </p>
            )}
          </>
        ) : (
          <Vide
            ton="bloquant"
            titre="Pas encore rempli."
            texte=" Étage, ascenseur, escalier, distance de portage, accès du camion, stationnement : sans ces réponses certifiées, le déménagement ne peut pas être réalisé."
          />
        )}
      </article>

      {/* La déclaration de valeurs. */}
      <article className={s.document} id="valeurs">
        <header className={s.documentTete}>
          <span className={s.documentPicto}>
            <Icone nom="euro" taille={18} />
          </span>
          <div>
            <h3>Déclaration de valeurs</h3>
            <p>Les biens déclarés par le client : elle fixe la couverture de l&apos;assurance</p>
          </div>
          {v?.statut === "soumise" ? <Etat ton="ok">Transmise le {jourCourt(v.soumise_at!)}</Etat> : v ? <Etat ton="a_faire">Brouillon</Etat> : <Etat ton="a_faire">À remplir</Etat>}
        </header>
        {v && v.contenu.objets.length > 0 ? (
          <>
            <div className={s.tableau}>
              <table>
                <thead>
                  <tr>
                    <th>Désignation</th>
                    <th>Catégorie</th>
                    <th className={s.nombre}>Qté</th>
                    <th className={s.nombre}>Valeur unitaire</th>
                    <th className={s.nombre}>Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {v.contenu.objets.map((o, i) => (
                    <tr key={i}>
                      <td className={s.fort}>{o.designation}</td>
                      <td>{o.categorie}</td>
                      <td className={s.nombre}>{o.quantite}</td>
                      <td className={s.nombre}>{euros(o.valeur_unitaire)}</td>
                      <td className={s.nombre}>{euros(o.quantite * o.valeur_unitaire)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>
                      Total déclaré · {v.contenu.objets.length} ligne{v.contenu.objets.length > 1 ? "s" : ""}
                    </td>
                    <td className={s.nombre}>{euros(v.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <dl className={s.definitions} data-ligne="">
              <div>
                <dt>Déclarant</dt>
                <dd>
                  {v.contenu.declarant_nom || "—"}
                  {v.contenu.declarant_qualite && <small>{v.contenu.declarant_qualite}</small>}
                </dd>
              </div>
              <div>
                <dt>Fait à</dt>
                <dd>
                  {v.contenu.lieu || "—"}
                  {v.contenu.date && <small>le {jourCourt(v.contenu.date)}</small>}
                </dd>
              </div>
              {v.contenu.saisie_equipe && (
                <div>
                  <dt>Saisie par l&apos;équipe</dt>
                  <dd>
                    {v.contenu.saisie_equipe.par}
                    <small>le {jourHeure(v.contenu.saisie_equipe.le)}</small>
                  </dd>
                </div>
              )}
            </dl>
            {certifValeurs && (
              <p className={s.trace}>
                <Icone nom="signature" taille={14} />
                Certifiée le {jourHeure(certifValeurs.accepted_at)} · version {certifValeurs.version_texte} · IP {certifValeurs.ip} · {appareilDe(certifValeurs.user_agent)}
              </p>
            )}
          </>
        ) : (
          <Vide ton="a_faire" titre={v ? "Brouillon vide." : "Pas encore remplie."} texte=" Le client liste ses biens par catégorie, avec leur valeur de remplacement ; le total se calcule tout seul." />
        )}
      </article>

      {/* La trace des engagements. */}
      <article className={s.document} id="engagements">
        <header className={s.documentTete}>
          <span className={s.documentPicto}>
            <Icone nom="signature" taille={18} />
          </span>
          <div>
            <h3>Engagements du client</h3>
            <p>CGV, confidentialité, devis : chaque acceptation horodatée, avec sa version et son origine</p>
          </div>
          <Etat ton={d.acceptations.length ? "neutre" : "a_faire"}>
            {d.acceptations.length} acceptation{d.acceptations.length > 1 ? "s" : ""}
          </Etat>
        </header>
        {d.acceptations.length ? (
          <div className={s.tableau}>
            <table>
              <thead>
                <tr>
                  <th>Engagement</th>
                  <th>Version</th>
                  <th>Date et heure</th>
                  <th>Adresse IP</th>
                  <th>Appareil</th>
                </tr>
              </thead>
              <tbody>
                {d.acceptations.map((a) => (
                  <tr key={a.id}>
                    <td className={s.fort}>
                      <Icone nom="coche" taille={14} className={s.coche} />
                      {ENGAGEMENT[a.type] ?? a.type}
                      {a.objet && <small> · {a.objet}</small>}
                    </td>
                    <td className={s.mono}>{a.version_texte}</td>
                    <td>{jourHeure(a.accepted_at)}</td>
                    <td className={s.mono}>{a.ip}</td>
                    <td title={a.user_agent}>{appareilDe(a.user_agent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vide ton="a_faire" titre="Aucune acceptation enregistrée." texte=" Les CGV et la politique de confidentialité s'acceptent en ligne, d'une case cochée et horodatée." />
        )}
      </article>
      {vue !== null && <Visionneuse fichiers={photos} index={vue} changer={setVue} fermer={() => setVue(null)} />}
    </div>
  );
}
