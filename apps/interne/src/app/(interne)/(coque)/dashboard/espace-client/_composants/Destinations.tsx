"use client";

import { useState } from "react";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import { enregistrerPiece, supprimerPiece } from "@/lib/actions/espace-client-equipe";
import type { vueDestinations } from "@/lib/espace-client/vues-equipe";
import { BandeauMode, Bouton, Carte, Champ, Pastille, Retour, champ, useAction, usePorte } from "./socle";

type Donnees = ReturnType<typeof vueDestinations>;
type Piece = Donnees["pieces"][number];

const vide = { pays: "", segment: "", libelle: "", description: "", obligatoire: true, ordre: "50" };

/**
 * Les pièces à fournir, par destination et par segment. Une pièce sans pays
 * ni segment est demandée à tous ; une pièce d'un pays ne l'est qu'aux
 * dossiers internationaux vers ce pays ; une pièce d'un segment, qu'à ses
 * clients — l'ordre de mutation d'un militaire, les documents du bailleur
 * d'un logement social. Les listes réelles sont à fournir par Bailly.
 */
export function Destinations() {
  const { base } = usePorte();
  const { donnees, erreur, recharger } = useRessource<Donnees>(`${base}/destinations`);
  const action = useAction(recharger);
  const [edition, setEdition] = useState<{ id: string | null; v: typeof vide } | null>(null);
  if (erreur) return <Echec message={erreur} onRetry={recharger} />;
  if (!donnees) return <Squelette titre={false} lignes={6} />;

  // Un groupe par segment, puis par destination : « Toutes les destinations », « Canada (CA) », « Militaires »…
  const nomSegment = (s: string | null) => donnees.segments.find((x) => x.cle === s)?.libelle ?? s ?? "";
  const titreGroupe = (p: Piece) =>
    [p.segment ? `Segment ${nomSegment(p.segment).toLowerCase()}` : null, p.pays ? `${donnees.pays[p.pays] ?? p.pays} (${p.pays})` : p.segment ? null : "Toutes les destinations"].filter(Boolean).join(" · ");
  const groupes = new Map<string, Piece[]>();
  for (const p of donnees.pieces) groupes.set(titreGroupe(p), [...(groupes.get(titreGroupe(p)) ?? []), p]);
  const erreurs = action.resultat && !action.resultat.ok ? action.resultat.erreurs ?? {} : {};
  const editer = (p: Piece | null) =>
    setEdition({ id: p?.id ?? null, v: p ? { pays: p.pays ?? "", segment: p.segment ?? "", libelle: p.libelle, description: p.description, obligatoire: p.obligatoire, ordre: String(p.ordre) } : vide });

  return (
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <BandeauMode mode={donnees.mode} />
        {[...groupes.entries()].map(([titre, pieces]) => (
          <Carte key={titre} titre={titre}>
            <ul className="divide-y divide-line/70">
              {pieces.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 py-2.5 text-[13px]">
                  <span>
                    <span className="font-medium">{p.libelle}</span> {p.obligatoire ? <Pastille ton="attente">Obligatoire</Pastille> : <Pastille>Facultative</Pastille>}
                    <span className="block text-[12px] text-ink-soft">{p.description}</span>
                  </span>
                  <span className="flex shrink-0 gap-3">
                    <button className="text-ink-soft hover:text-ink" onClick={() => editer(p)}>
                      Modifier
                    </button>
                    <button className="text-ink-soft hover:text-danger" onClick={() => confirm(`Retirer « ${p.libelle} » des listes ?`) && action.lancer(() => supprimerPiece(p.id))}>
                      Retirer
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </Carte>
        ))}
      </div>
      <div className="space-y-5">
        <Carte titre={edition?.id ? "Modifier la pièce" : "Ajouter une pièce"} action={edition?.id && <Bouton variante="discret" onClick={() => editer(null)}>Nouvelle</Bouton>}>
          {(() => {
            const v = edition?.v ?? vide;
            const maj = (p: Partial<typeof vide>) => setEdition({ id: edition?.id ?? null, v: { ...v, ...p } });
            return (
              <div className="space-y-3">
                <Champ label="Pays (code à deux lettres, vide pour toutes les destinations)" erreur={erreurs.pays}>
                  <input className={champ} value={v.pays} onChange={(e) => maj({ pays: e.target.value.toUpperCase().slice(0, 2) })} placeholder="CA" list="pays-connus" />
                  <datalist id="pays-connus">
                    {Object.entries(donnees.pays).map(([code, nom]) => (
                      <option key={code} value={code}>
                        {nom}
                      </option>
                    ))}
                  </datalist>
                </Champ>
                <Champ label="Segment (vide pour tous les clients)" erreur={erreurs.segment}>
                  <select className={champ} value={v.segment} onChange={(e) => maj({ segment: e.target.value })}>
                    <option value="">Tous les segments</option>
                    {donnees.segments.map((s) => (
                      <option key={s.cle} value={s.cle}>
                        {s.libelle}
                      </option>
                    ))}
                  </select>
                </Champ>
                <Champ label="Libellé" erreur={erreurs.libelle}>
                  <input className={champ} value={v.libelle} onChange={(e) => maj({ libelle: e.target.value })} />
                </Champ>
                <Champ label="Ce que le client doit fournir" erreur={erreurs.description}>
                  <textarea className="champ !min-h-[5rem] !rounded-xl !text-[13.5px]" value={v.description} onChange={(e) => maj({ description: e.target.value })} />
                </Champ>
                <div className="grid grid-cols-2 gap-3">
                  <Champ label="Ordre d'affichage">
                    <input className={champ} inputMode="numeric" value={v.ordre} onChange={(e) => maj({ ordre: e.target.value.replace(/\D/g, "") })} />
                  </Champ>
                  <label className="mt-5 flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={v.obligatoire} onChange={(e) => maj({ obligatoire: e.target.checked })} /> Obligatoire
                  </label>
                </div>
                <Bouton disabled={action.enCours} onClick={() => action.lancer(() => enregistrerPiece(edition?.id ?? null, v), (r) => r.ok && setEdition(null))}>
                  {edition?.id ? "Enregistrer" : "Ajouter la pièce"}
                </Bouton>
                <Retour r={action.resultat} />
              </div>
            );
          })()}
        </Carte>
      </div>
    </div>
  );
}
