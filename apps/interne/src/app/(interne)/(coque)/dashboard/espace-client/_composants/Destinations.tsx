"use client";

import { useState } from "react";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import { ajouterModele, enregistrerPiece, retirerModele, supprimerPiece } from "@/lib/actions/espace-client-equipe";
import { ACCEPTE_MODELES, formatDuModele, verifierModele } from "@/lib/espace-client/modeles-schema";
import type { vueDestinations } from "@/lib/espace-client/vues-equipe";
import { BandeauMode, Bouton, Carte, Champ, Pastille, Retour, champ, useAction, usePorte } from "./socle";

type Donnees = ReturnType<typeof vueDestinations>;
type Piece = Donnees["pieces"][number];

const vide = { pays: "", segment: "", condition: "", libelle: "", description: "", obligatoire: true, ordre: "50" };

/**
 * Les pièces à fournir, par destination et par segment. Une pièce sans pays
 * ni segment est demandée à tous ; une pièce d'un pays ne l'est qu'aux
 * dossiers internationaux vers ce pays ; une pièce d'un segment, qu'à ses
 * clients — les pièces CIMOB/DICOM d'un militaire, les documents du bailleur
 * d'un logement social.
 *
 * Depuis la migration 0021, une pièce peut aussi avoir une condition (un
 * repli, un véhicule, une arrivée outre-mer…, lue dans le CRM) et des
 * modèles à télécharger, que l'équipe ajoute, remplace et retire ici.
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
  const condition = (c: string | null) => donnees.conditions.find((x) => x.cle === c) ?? null;
  const titreGroupe = (p: Piece) =>
    [p.segment ? `Segment ${nomSegment(p.segment).toLowerCase()}` : null, p.pays ? `${donnees.pays[p.pays] ?? p.pays} (${p.pays})` : p.segment ? null : "Toutes les destinations"].filter(Boolean).join(" · ");
  const groupes = new Map<string, Piece[]>();
  for (const p of donnees.pieces) groupes.set(titreGroupe(p), [...(groupes.get(titreGroupe(p)) ?? []), p]);
  const erreurs = action.resultat && !action.resultat.ok ? action.resultat.erreurs ?? {} : {};
  const editer = (p: Piece | null) =>
    setEdition({
      id: p?.id ?? null,
      v: p ? { pays: p.pays ?? "", segment: p.segment ?? "", condition: p.condition ?? "", libelle: p.libelle, description: p.description, obligatoire: p.obligatoire, ordre: String(p.ordre) } : vide,
    });

  return (
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <BandeauMode mode={donnees.mode} />
        {!donnees.migration0021 && (
          <p className="rounded-xl bg-brand-soft px-3.5 py-2.5 text-[13px] text-brand-ink">
            Les conditions (repli, véhicule, outre-mer…) et les modèles à télécharger attendent la migration 0021 sur cette base : en attendant, chaque pièce est
            demandée à tous les dossiers de son pays et de son segment.
          </p>
        )}
        {[...groupes.entries()].map(([titre, pieces]) => (
          <Carte key={titre} titre={titre}>
            <ul className="divide-y divide-line/70">
              {pieces.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 py-2.5 text-[13px]">
                  <div className="min-w-0">
                    <span className="font-medium">{p.libelle}</span> {p.obligatoire ? <Pastille ton="attente">Obligatoire</Pastille> : <Pastille>Facultative</Pastille>}{" "}
                    {p.condition && <Pastille ton="noir">{condition(p.condition)?.libelle ?? p.condition}</Pastille>}
                    <span className="block text-[12px] text-ink-soft">{p.description}</span>
                    {donnees.migration0021 && <ModelesDeLaPiece piece={p} recharger={recharger} />}
                  </div>
                  <span className="flex shrink-0 gap-3">
                    <button className="text-ink-soft hover:text-ink" onClick={() => editer(p)}>
                      Modifier
                    </button>
                    <button
                      className="text-ink-soft hover:text-danger"
                      onClick={() =>
                        confirm(`Retirer « ${p.libelle} » des listes ?${p.modeles.length ? `\n\nSes ${p.modeles.length} modèle(s) à télécharger partent avec elle.` : ""}`) &&
                        action.lancer(() => supprimerPiece(p.id))
                      }
                    >
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
                {(donnees.migration0021 || v.condition) && (
                  <Champ
                    label="Seulement si (lu dans le CRM)"
                    erreur={erreurs.condition}
                    aide={
                      condition(v.condition)
                        ? `D'après ${condition(v.condition)!.source}. Tant que le CRM ne le dit pas, la pièce est demandée « si vous êtes concerné », facultative.`
                        : "Demandée à tous les dossiers de ce pays et de ce segment."
                    }
                  >
                    <select className={champ} value={v.condition} onChange={(e) => maj({ condition: e.target.value })}>
                      <option value="">Toujours</option>
                      {donnees.conditions.map((c) => (
                        <option key={c.cle} value={c.cle}>
                          {c.libelle}
                        </option>
                      ))}
                    </select>
                  </Champ>
                )}
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

/**
 * Les modèles à télécharger d'une pièce : les voir, en remplacer le fichier,
 * les retirer, en ajouter un (le libellé d'abord : « Modèle », « Exemple
 * rempli »…). Format et poids sont vérifiés avant l'envoi, puis à nouveau
 * par l'action.
 */
function ModelesDeLaPiece({ piece, recharger }: { piece: Piece; recharger: () => void }) {
  const action = useAction(recharger);
  const [libelle, setLibelle] = useState("Modèle");
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = (input: HTMLInputElement, remplace?: { id: string; libelle: string }) => {
    const fichier = input.files?.[0] ?? null;
    input.value = "";
    if (!fichier) return;
    const err = verifierModele(fichier);
    setErreur(err);
    if (err) return;
    const fd = new FormData();
    fd.set("fichier", fichier);
    fd.set("libelle", remplace?.libelle ?? libelle);
    if (remplace) fd.set("remplace", remplace.id);
    action.lancer(() => ajouterModele(piece.id, fd), (r) => r.ok && !remplace && setLibelle("Modèle"));
  };

  return (
    <div className="mt-1.5 space-y-1 text-[12px]">
      {piece.modeles.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <a href={m.lien} target="_blank" rel="noopener" className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink" title={m.nom_fichier}>
            ⤓ {m.libelle} · {formatDuModele(m.nom_fichier)}
          </a>
          <label className={`text-ink-soft hover:text-ink ${action.enCours ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
            Remplacer
            <input type="file" hidden accept={ACCEPTE_MODELES} onChange={(e) => envoyer(e.currentTarget, { id: m.id, libelle: m.libelle })} />
          </label>
          <button
            className="text-ink-soft hover:text-danger"
            disabled={action.enCours}
            onClick={() => confirm(`Retirer le modèle « ${m.libelle} » (${m.nom_fichier}) ?\n\nLes clients ne pourront plus le télécharger.`) && action.lancer(() => retirerModele(m.id))}
          >
            Retirer
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <input className="champ !h-7 !w-36 !rounded-lg !px-2 !text-[12px]" value={libelle} maxLength={60} onChange={(e) => setLibelle(e.target.value)} aria-label="Libellé du modèle à ajouter" />
        <label className={`font-medium text-ink-soft hover:text-ink ${action.enCours ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
          {action.enCours ? "Envoi…" : "+ Ajouter un modèle"}
          <input type="file" hidden accept={ACCEPTE_MODELES} onChange={(e) => envoyer(e.currentTarget)} />
        </label>
      </div>
      {erreur && (
        <p className="font-medium text-danger" role="alert">
          {erreur}
        </p>
      )}
      <Retour r={action.resultat} />
    </div>
  );
}
