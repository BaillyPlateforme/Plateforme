"use client";

import Link from "next/link";
import { m3 } from "@/crm/lib/format";
import { libelleSegment, libelleType } from "@/crm/creation/commun";
import { Icone } from "@/ui/icones";
import { A_VALIDER, CASES_NOUVEAU_CLIENT, DOSSIER_NOUVEAU_JAMAIS, type CleCase } from "../textes";
import type { SourceDuplication } from "../types";
import s from "../duplication.module.css";

/*
 * Le panneau « Dupliquer pour un nouveau client », en tête de l'écran de
 * création (/dossiers/nouveau?depuis=<id>) : d'où l'on part, quatre cases
 * pour dire ce qui est repris (chacune avec ce qu'elle reprendrait), ce qui
 * ne l'est jamais. Décocher une case vide les champs qu'elle avait remplis ;
 * ce que l'utilisateur a tapé reste le sien.
 */

export type Coches = Record<CleCase, boolean>;
export const COCHES_DEFAUT = Object.fromEntries(CASES_NOUVEAU_CLIENT.map((c) => [c.cle, c.defaut])) as Coches;

const court = (a?: string | null) => (a ? a.split(",").pop()!.trim() : "—");
const pl = (n: number, un: string, plusieurs = `${un}s`) => `${n} ${n > 1 ? plusieurs : un}`;

/** Ce qu'une case reprendrait de ce dossier ; null : rien à reprendre. */
function detail(src: SourceDuplication, cle: CleCase): string | null {
  if (cle === "trajet") {
    if (!src.depart?.adresse && !src.arrivee?.adresse) return null;
    return `${court(src.depart?.adresse)} → ${court(src.arrivee?.adresse)}${src.intermediaires ? ` · + ${pl(src.intermediaires, "étape")}` : ""}`;
  }
  if (cle === "inventaire") {
    if (!src.objets && !(src.volume > 0)) return null;
    return [src.objets ? pl(src.objets, "objet") : "aucun objet", src.pieces ? pl(src.pieces, "pièce") : null, src.volume > 0 ? m3(src.volume) : null].filter(Boolean).join(" · ");
  }
  if (cle === "options") {
    return [libelleType(src.typeDemenagement), src.gardeMeuble ? "garde-meuble" : null, src.vehicule ? "véhicule" : null, libelleSegment(src.type)].filter(Boolean).join(" · ");
  }
  if (!src.observations?.trim()) return null;
  const o = src.observations.trim().replace(/\s+/g, " ");
  return `« ${o.length > 70 ? `${o.slice(0, 68)}…` : o} »`;
}

/** Les cases au départ : celles du réglage par défaut, sauf celles qui n'auraient rien à reprendre dans ce dossier. */
export const cochesInitiales = (src: SourceDuplication): Coches =>
  Object.fromEntries(CASES_NOUVEAU_CLIENT.map((c) => [c.cle, c.defaut && detail(src, c.cle) != null])) as Coches;

export default function PanneauDuplication({
  source,
  actif,
  coches,
  onChanger,
  onAnnuler,
}: {
  source: SourceDuplication;
  actif: boolean;
  coches: Coches;
  onChanger: (c: Coches) => void;
  onAnnuler: () => void;
}) {
  if (!actif) {
    return (
      <div className={s.panneau} role="status">
        <div className={s.panneauTete}>
          <span className={s.panneauIcone} style={{ opacity: 0.55 }}>
            <Icone nom="dupliquer" taille={20} />
          </span>
          <div style={{ flex: 1 }}>
            <h3>Duplication de {source.ref} annulée</h3>
            <p>Le dossier sera créé vierge. Rien de {source.ref} n&apos;est repris.</p>
          </div>
          <button type="button" className={s.secondaire} onClick={() => onChanger(coches)}>
            Reprendre la duplication
          </button>
        </div>
      </div>
    );
  }
  return (
    <section className={s.panneau} aria-label={`Dupliquer le dossier ${source.ref}`}>
      <div className={s.panneauTete}>
        <span className={s.panneauIcone}>
          <Icone nom="dupliquer" taille={20} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>
            Duplication de{" "}
            <Link href={`/dossiers/${source.id}`} style={{ color: "inherit" }} prefetch={false}>
              {source.ref}
            </Link>{" "}
            ({source.client}) pour un nouveau client
          </h3>
          <p>Cochez ce qui est repris. Le client se saisit ci-dessous, ou se rattache s&apos;il existe déjà.</p>
        </div>
        <i className={s.aValider} title="Nouveaux textes, à valider par l'équipe">{A_VALIDER}</i>
      </div>
      <div className={`${s.cases} ${s.casesDeux}`}>
        {CASES_NOUVEAU_CLIENT.map((c) => {
          const d = detail(source, c.cle);
          return (
            <label key={c.cle} className={s.case} data-champ={`dupliquer_${c.cle}`}>
              <input type="checkbox" checked={coches[c.cle]} disabled={!d} onChange={() => onChanger({ ...coches, [c.cle]: !coches[c.cle] })} />
              <span>
                <b>{c.libelle}</b>
                <small>{d ?? "Rien à reprendre dans ce dossier."}</small>
                <small style={{ color: "#a3a0b5" }}>{c.aide}</small>
              </span>
            </label>
          );
        })}
      </div>
      <div className={s.boutons} style={{ justifyContent: "space-between" }}>
        <p className={s.note} style={{ flex: 1, minWidth: 260 }}>{DOSSIER_NOUVEAU_JAMAIS}</p>
        <button type="button" className={s.discret} onClick={onAnnuler}>
          Annuler la duplication
        </button>
      </div>
    </section>
  );
}
