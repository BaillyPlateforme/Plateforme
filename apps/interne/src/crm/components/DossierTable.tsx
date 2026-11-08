"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Ic } from "@/crm/lib/icons";
import { Icone } from "@/ui/icones";
import { dateFr, eur, m3, nomClient, photoPour, STATUTS, TYPES } from "@/crm/lib/format";
import { ville } from "@/crm/kanban/regles";
import { RANG_ETAPE } from "@/crm/parcours/filtres";
import type { Row } from "@/crm/lib/db";
import s from "./table-dossiers.module.css";

/*
 * La liste des dossiers : client, type, trajet, volume, commercial, étape,
 * montant, date. Chaque en-tête trie la liste (un clic : croissant, deux :
 * décroissant, trois : l'ordre d'origine, la dernière activité d'abord).
 *
 * Deux sources : les lignes d'une requête du CRM (listDossiers, les visites
 * à planifier), ou des lignes déjà mises en forme (le Parcours, qui y mêle
 * les demandes du site pas encore entrées au CRM).
 */

export type LigneDossier = {
  cle: string;
  href: string;
  client: string;
  /** Sous le nom : la référence, ou « Demande du site · Qualifiée ». */
  sous: string;
  photo: string | null;
  type: string;
  depart: string | null;
  arrivee: string | null;
  volume: number | null;
  commercial: string | null;
  etape: { label: string; ton: string; rang: number };
  montant: number | null;
  /** Un montant qui n'est pas un devis : l'estimation du site. */
  estimation?: boolean;
  /** La date du déménagement (AAAA-MM-JJ) pour le tri ; le texte affiché. */
  date: string | null;
  dateTexte: string;
};

const iso = (d: unknown) => (d == null ? null : d instanceof Date ? d.toISOString() : String(d));

/** Une ligne de listDossiers, mise en forme. */
function ligneDe(r: Row): LigneDossier {
  const chargement = iso(r.date_chargement);
  return {
    cle: `d${r.id}`,
    href: `/dossiers/${r.id}`,
    client: nomClient(r) || "Sans nom",
    sous: r.ref,
    photo: photoPour(r.arrivee, r.id),
    type: TYPES[r.type] ?? r.type,
    depart: r.depart ?? null,
    arrivee: r.arrivee ?? null,
    volume: r.volume ?? null,
    commercial: r.commercial ?? null,
    etape: { label: STATUTS[r.statut]?.label ?? r.statut, ton: STATUTS[r.statut]?.cls ?? "i", rang: RANG_ETAPE[r.statut] ?? 9 },
    montant: r.montant ?? null,
    date: chargement ? chargement.slice(0, 10) : null,
    dateTexte: chargement ? dateFr(chargement, { day: "numeric", month: "short", year: "numeric" }) : (r.periode ?? "—"),
  };
}

type Colonne = { cle: string; label: string; num?: boolean; valeur: (l: LigneDossier) => string | number | null };
const COLONNES: Colonne[] = [
  { cle: "client", label: "Client", valeur: (l) => l.client.toLocaleLowerCase("fr") },
  { cle: "type", label: "Type", valeur: (l) => l.type },
  { cle: "trajet", label: "Trajet", valeur: (l) => `${ville(l.depart) ?? ""} ${ville(l.arrivee) ?? ""}`.trim() || null },
  { cle: "volume", label: "Volume", num: true, valeur: (l) => l.volume },
  { cle: "commercial", label: "Commercial", valeur: (l) => l.commercial },
  { cle: "etape", label: "Étape", valeur: (l) => l.etape.rang },
  { cle: "montant", label: "Montant", num: true, valeur: (l) => l.montant },
  { cle: "date", label: "Date", valeur: (l) => l.date },
];

type Tri = { cle: string; sens: 1 | -1 } | null;

export function DossierTable({ rows, lignes, vide = "Aucun dossier ne correspond." }: { rows?: Row[]; lignes?: LigneDossier[]; vide?: string }) {
  const [tri, setTri] = useState<Tri>(null);
  const toutes = useMemo(() => lignes ?? (rows ?? []).map(ligneDe), [lignes, rows]);
  const triees = useMemo(() => {
    const c = tri && COLONNES.find((x) => x.cle === tri.cle);
    if (!tri || !c) return toutes;
    // Les cases vides restent en bas, quel que soit le sens.
    return [...toutes].sort((a, b) => {
      const va = c.valeur(a);
      const vb = c.valeur(b);
      if (va == null || va === "") return vb == null || vb === "" ? 0 : 1;
      if (vb == null || vb === "") return -1;
      const n = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "fr", { numeric: true });
      return n * tri.sens;
    });
  }, [toutes, tri]);

  const trier = (cle: string) => setTri((t) => (t?.cle !== cle ? { cle, sens: 1 } : t.sens === 1 ? { cle, sens: -1 } : null));

  if (toutes.length === 0) return <div className="card empty">{vide}</div>;
  return (
    <div className="card tcard">
      <table className={`tbl ${s.table}`}>
        <thead>
          <tr>
            {COLONNES.map((c) => (
              <th key={c.cle} className={c.num ? "num" : undefined} aria-sort={tri?.cle === c.cle ? (tri.sens === 1 ? "ascending" : "descending") : undefined}>
                <button type="button" className={s.entete} data-actif={tri?.cle === c.cle || undefined} onClick={() => trier(c.cle)}>
                  {c.label}
                  <span className={s.sens} aria-hidden>
                    {tri?.cle === c.cle ? (tri.sens === 1 ? "↑" : "↓") : "↕"}
                  </span>
                </button>
              </th>
            ))}
            <th aria-label="Ouvrir" />
          </tr>
        </thead>
        <tbody>
          {triees.map((l) => (
            <tr key={l.cle} className="row">
              <td>
                <Link className="name" href={l.href}>
                  {l.photo ? (
                    <i className="thumb" style={{ backgroundImage: `url(${l.photo})` }} />
                  ) : (
                    <i className={`thumb ${s.vignetteDemande}`}>
                      <Icone nom="globe" taille={18} />
                    </i>
                  )}
                  <span>
                    <b>{l.client}</b>
                    <small>{l.sous}</small>
                  </span>
                </Link>
              </td>
              <td>
                <i className="ty">{l.type}</i>
              </td>
              <td className="trajet" title={[l.depart, l.arrivee].filter(Boolean).join(" → ")}>
                {ville(l.depart) ?? "—"} → {ville(l.arrivee) ?? "—"}
              </td>
              <td className="num">{l.volume != null && l.volume > 0 ? m3(l.volume) : "—"}</td>
              <td>{l.commercial ?? "—"}</td>
              <td>
                <i className={`st ${l.etape.ton}`}>{l.etape.label}</i>
              </td>
              <td className="num">
                {l.montant == null ? (
                  "—"
                ) : l.estimation ? (
                  <span className={s.estimation} title="Estimation donnée par le site">
                    {eur(l.montant)}
                    <small>estimation</small>
                  </span>
                ) : (
                  <b>{eur(l.montant)}</b>
                )}
              </td>
              <td className={s.date}>{l.dateTexte}</td>
              <td>
                <Link href={l.href} className="go" aria-label={`Ouvrir ${l.client}`}>
                  <Ic n="right" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
