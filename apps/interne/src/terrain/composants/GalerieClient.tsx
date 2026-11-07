"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { retirerPhoto } from "../actions";
import { CATEGORIES, ecartAppareil, heureParis, jourLong, libelleCategorie, urlPhoto, type Categorie, type PhotoVue } from "../regles";
import { Picto } from "./Picto";
import Visionneuse from "./Visionneuse";
import g from "./galerie.module.css";
import v from "./visionneuse.module.css";

/*
 * La galerie du dossier, dans le CRM : par jour (puis par auteur) ou par
 * équipe (puis par jour), filtrée par catégorie. Une vignette s'agrandit ;
 * l'équipe du bureau peut y télécharger une photo, ou la retirer (le retrait
 * est noté à l'activité du dossier).
 */

type Mode = "date" | "equipe";
type Groupe = { cle: string; titre: string; sous: string; lots: { cle: string; titre: string; photos: PhotoVue[] }[] };

const SANS_EQUIPE = "Sans équipe";

function grouper(photos: PhotoVue[], mode: Mode): Groupe[] {
  const premier = (p: PhotoVue) => (mode === "date" ? p.jour : (p.equipe ?? SANS_EQUIPE));
  const second = (p: PhotoVue) => (mode === "date" ? `${p.auteur}${p.equipe ? ` · ${p.equipe}` : ""}` : p.jour);
  const groupes = new Map<string, Map<string, PhotoVue[]>>();
  for (const p of photos) {
    const a = premier(p);
    const b = second(p);
    if (!groupes.has(a)) groupes.set(a, new Map());
    const lots = groupes.get(a)!;
    if (!lots.has(b)) lots.set(b, []);
    lots.get(b)!.push(p);
  }
  return [...groupes.entries()].map(([cle, lots]) => {
    const n = [...lots.values()].reduce((t, l) => t + l.length, 0);
    return {
      cle,
      titre: mode === "date" ? jourLong(cle, true) : cle,
      sous: `${n} photo${n > 1 ? "s" : ""}`,
      lots: [...lots.entries()].map(([k, l]) => ({ cle: k, titre: mode === "date" ? k : jourLong(k, true), photos: l })),
    };
  });
}

export default function GalerieClient({ photos }: { photos: PhotoVue[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("date");
  const [filtre, setFiltre] = useState<Categorie | "toutes">("toutes");
  const [retirees, setRetirees] = useState<Set<number>>(new Set());
  const [ouverte, setOuverte] = useState<number | null>(null);

  const restantes = useMemo(() => photos.filter((p) => !retirees.has(p.id)), [photos, retirees]);
  const visibles = useMemo(() => (filtre === "toutes" ? restantes : restantes.filter((p) => p.categorie === filtre)), [restantes, filtre]);
  const groupes = useMemo(() => grouper(visibles, mode), [visibles, mode]);
  // L'ordre de l'agrandissement suit celui de l'affichage.
  const ordre = useMemo(() => groupes.flatMap((gr) => gr.lots.flatMap((l) => l.photos)), [groupes]);
  const rang = useMemo(() => new Map(ordre.map((p, i) => [p.id, i])), [ordre]);
  const compte = (c: Categorie) => restantes.filter((p) => p.categorie === c).length;

  async function retirer(p: PhotoVue) {
    if (!window.confirm(`Retirer cette photo (${libelleCategorie(p.categorie).toLowerCase()}, ${p.auteur}) du dossier ? Elle ne pourra pas être récupérée.`)) return;
    // La visionneuse se ferme d'abord : elle ne redemande pas une photo en train de disparaître.
    setOuverte(null);
    const r = await retirerPhoto(p.id).catch(() => ({ ok: false as const, erreur: "Le serveur ne répond pas : la photo n'a pas été retirée." }));
    if (!r.ok) {
      window.alert(r.erreur);
      return;
    }
    setRetirees((avant) => new Set(avant).add(p.id));
    router.refresh();
  }

  return (
    <div className={g.galerie}>
      <div className={g.outils}>
        <div className="seg" role="group" aria-label="Ranger les photos">
          <button type="button" className={mode === "date" ? "on" : ""} onClick={() => setMode("date")}>
            Par date
          </button>
          <button type="button" className={mode === "equipe" ? "on" : ""} onClick={() => setMode("equipe")}>
            Par équipe
          </button>
        </div>
        <div className={g.filtres} role="group" aria-label="Filtrer par catégorie">
          <button type="button" aria-pressed={filtre === "toutes"} onClick={() => setFiltre("toutes")}>
            Toutes · {restantes.length}
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.cle} type="button" aria-pressed={filtre === c.cle} onClick={() => setFiltre(c.cle)}>
              {c.label} · {compte(c.cle)}
            </button>
          ))}
        </div>
      </div>

      {groupes.length === 0 && <p className="sub">Aucune photo dans cette catégorie.</p>}
      {groupes.map((gr) => (
        <div key={gr.cle} className={g.groupe}>
          <h4 className={g.titreGroupe}>
            <span>{gr.titre}</span>
            <small>{gr.sous}</small>
          </h4>
          {gr.lots.map((l) => (
            <div key={l.cle} className={g.lot}>
              <p className={g.titreLot}>
                {l.titre} <small>· {l.photos.length}</small>
              </p>
              <div className={g.grille}>
                {l.photos.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={g.vignette}
                    onClick={() => setOuverte(rang.get(p.id) ?? 0)}
                    title={`${libelleCategorie(p.categorie)} · ${heureParis(p.priseLe)} · ${p.auteur}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- une URL signée d'une minute, servie par la porte des photos : pas d'optimisation d'image */}
                    <img src={urlPhoto(p.id, { vignette: true })} alt={`${libelleCategorie(p.categorie)}, ${heureParis(p.priseLe)}, par ${p.auteur}`} loading="lazy" decoding="async" />
                    <span className={`${g.etiquette} ${g[p.categorie]}`}>{libelleCategorie(p.categorie)}</span>
                    <span className={g.heure}>
                      {heureParis(p.priseLe)}
                      {p.latitude !== null && <Picto nom="position" taille={12} epaisseur={2.6} />}
                      {p.note && <Picto nom="note" taille={12} epaisseur={2.6} />}
                      {ecartAppareil(p) && <Picto nom="alerte" taille={12} epaisseur={2.6} />}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      {ouverte !== null && ordre[ouverte] && (
        <Visionneuse
          photos={ordre}
          index={ouverte}
          onFermer={() => setOuverte(null)}
          onAller={setOuverte}
          actions={(p) => (
            <button type="button" className={`${v.bouton} ${v.danger}`} onClick={() => retirer(p)}>
              <Picto nom="poubelle" taille={19} />
              Retirer du dossier
            </button>
          )}
        />
      )}
    </div>
  );
}
