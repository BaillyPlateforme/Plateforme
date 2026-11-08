"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import Formulaire from "@/crm/exploitation/ui/Formulaire";
import u from "@/crm/exploitation/ui/ui.module.css";
import { archiver, archiverSelection, restaurer } from "./actions";
import type { DossierClos } from "./donnees";

/*
 * Les dossiers clos : à archiver (cases à cocher, « Tout cocher », archivage
 * groupé ou ligne par ligne) ou archivés (restaurer).
 */
const eur = (n: number | null) => (n == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n));
const jourFr = (v: string | null) => (v ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(v.length === 10 ? `${v}T12:00:00Z` : v)) : "—");

function Statut({ d }: { d: DossierClos }) {
  return d.statut === "perdu" ? (
    <i className={u.etat} data-ton="rose">
      Perdu
    </i>
  ) : (
    <i className={u.etat} data-ton="vert">
      Terminé
    </i>
  );
}

export function AArchiver({ lignes }: { lignes: DossierClos[] }) {
  const [coches, setCoches] = useState<Set<number>>(new Set());
  const [enCours, lancer] = useTransition();
  const tout = lignes.length > 0 && coches.size === lignes.length;
  return (
    <Formulaire action={archiverSelection} onSucces={() => setCoches(new Set())}>
      <div className={u.carteTete} style={{ padding: "16px 22px", margin: 0, borderBottom: "1px solid #ebe9f3" }}>
        <label className={u.case} style={{ minHeight: 38 }}>
          <input type="checkbox" checked={tout} onChange={() => setCoches(tout ? new Set() : new Set(lignes.map((l) => l.id)))} />
          Tout cocher ({lignes.length})
        </label>
        <button type="submit" className={u.bouton} disabled={!coches.size}>
          Archiver {coches.size ? `${coches.size} dossier${coches.size > 1 ? "s" : ""}` : "la sélection"}
        </button>
      </div>
      <div className={u.defile}>
        <table className={u.tableau}>
          <thead>
            <tr>
              <th />
              <th>Dossier</th>
              <th>Client</th>
              <th>État</th>
              <th>Déménagement</th>
              <th className={u.droite}>Montant signé</th>
              <th>Commercial</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lignes.map((d) => (
              <tr key={d.id}>
                <td style={{ width: 44 }}>
                  <input
                    type="checkbox"
                    name="dossier"
                    value={d.id}
                    checked={coches.has(d.id)}
                    onChange={(e) =>
                      setCoches((c) => {
                        const n = new Set(c);
                        if (e.target.checked) n.add(d.id);
                        else n.delete(d.id);
                        return n;
                      })
                    }
                    aria-label={`Cocher ${d.ref}`}
                    style={{ width: 17, height: 17, accentColor: "#4b2fe0" }}
                  />
                </td>
                <td>
                  <Link href={`/dossiers/${d.id}`} className={u.ref}>
                    {d.ref}
                  </Link>
                </td>
                <td>
                  <b>{d.client}</b>
                  <small>{[d.depart, d.arrivee].filter(Boolean).join(" → ") || "Trajet non renseigné"}</small>
                </td>
                <td>
                  <Statut d={d} />
                </td>
                <td className={u.nowrap}>
                  {jourFr(d.demenagement)}
                  {d.statut === "termine" && <small>terminé depuis {d.depuis} j</small>}
                </td>
                <td className={u.droite}>{eur(d.montant)}</td>
                <td>{d.commercial ?? "—"}</td>
                <td className={u.droite}>
                  <button
                    type="button"
                    className={`${u.bouton} ${u.petit}`}
                    data-ton="secondaire"
                    disabled={enCours}
                    onClick={() => lancer(async () => void (await archiver(d.id)))}
                  >
                    Archiver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Formulaire>
  );
}

export function Archives({ lignes }: { lignes: DossierClos[] }) {
  const [enCours, lancer] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <>
      {message && (
        <p className={u.message} style={{ margin: 16 }}>
          {message}
        </p>
      )}
      <div className={u.defile}>
        <table className={u.tableau}>
          <thead>
            <tr>
              <th>Dossier</th>
              <th>Client</th>
              <th>État</th>
              <th>Déménagement</th>
              <th className={u.droite}>Montant signé</th>
              <th>Archivé</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lignes.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link href={`/dossiers/${d.id}`} className={u.ref}>
                    {d.ref}
                  </Link>
                </td>
                <td>
                  <b>{d.client}</b>
                  <small>{[d.depart, d.arrivee].filter(Boolean).join(" → ") || "Trajet non renseigné"}</small>
                </td>
                <td>
                  <Statut d={d} />
                </td>
                <td className={u.nowrap}>{jourFr(d.demenagement)}</td>
                <td className={u.droite}>{eur(d.montant)}</td>
                <td className={u.nowrap}>
                  {jourFr(d.archive_le)}
                  <small>{d.archive_par ?? ""}</small>
                </td>
                <td className={u.droite}>
                  <button
                    type="button"
                    className={`${u.bouton} ${u.petit}`}
                    data-ton="discret"
                    disabled={enCours}
                    onClick={() =>
                      lancer(async () => {
                        const r = await restaurer(d.id);
                        setMessage(r.ok ? `${d.ref} · ${r.message}` : r.erreur);
                      })
                    }
                  >
                    Restaurer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
