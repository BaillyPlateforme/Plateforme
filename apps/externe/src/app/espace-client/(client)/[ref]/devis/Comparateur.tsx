import type { CSSProperties } from "react";
import { eurosAffiches, joursRestants, jourMois } from "@/lib/espace-client/format";
import type { Devis } from "@/lib/espace-client/types";
import { Icone } from "../../../_ui/Icone";
import { BoutonSigner, type DevisAConfirmer, type RecapDossier } from "./Confirmation";
import "../../../_ui/devis.css";

type Colonne = { devis: Devis; confirmer: DevisAConfirmer; recap: RecapDossier };

/** Une prestation de l'union : son libellé, et ce qu'en dit chaque formule (absente : null). */
interface Rangee {
  libelle: string;
  cellules: ({ detail: string | null; offert: boolean } | null)[];
}

const cle = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** L'union des lignes (ou des pastilles « inclus ») des formules, dans l'ordre où elles apparaissent. */
function union(colonnes: Colonne[], lire: (v: Devis) => { libelle: string; detail?: string | null; offert?: boolean }[]): Rangee[] {
  const ordre: string[] = [];
  const libelles = new Map<string, string>();
  for (const c of colonnes) {
    for (const l of lire(c.devis)) {
      const k = cle(l.libelle);
      if (!k || libelles.has(k)) continue;
      libelles.set(k, l.libelle.trim());
      ordre.push(k);
    }
  }
  return ordre.map((k) => ({
    libelle: libelles.get(k)!,
    cellules: colonnes.map((c) => {
      const l = lire(c.devis).find((x) => cle(x.libelle) === k);
      return l ? { detail: l.detail?.trim() || null, offert: !!l.offert } : null;
    }),
  }));
}

function Cellule({ c, i }: { c: Rangee["cellules"][number]; i: number }) {
  return (
    <td data-c={i}>
      {c ? (
        <span className="cmp-oui">
          <i aria-hidden>
            <Icone nom="check" />
          </i>
          <span className="sr-only">Compris</span>
          {(c.detail || c.offert) && <small>{[c.detail, c.offert ? "offert" : null].filter(Boolean).join(" · ")}</small>}
        </span>
      ) : (
        <span className="cmp-non">
          <span aria-hidden>—</span>
          <span className="sr-only">Non compris</span>
        </span>
      )}
    </td>
  );
}

/**
 * Les formules ouvertes côte à côte (au moins deux devis envoyés, ni expirés
 * ni refusés) : le total, les arrhes, la validité, puis l'union de leurs
 * prestations et de ce qu'elles comprennent, avec ✓ / — à chaque rangée. Au
 * pied de chaque colonne, « Accepter » ouvre la même confirmation que la carte
 * du devis. Aucune formule n'est mise en avant : rien ne le justifie.
 *
 * Sur téléphone, le libellé de chaque rangée passe au-dessus de ses valeurs :
 * les formules restent côte à côte, sans défilement de côté jusqu'à trois.
 */
export function Comparateur({ colonnes, peutSigner }: { colonnes: Colonne[]; peutSigner: boolean }) {
  const n = colonnes.length;
  const lignes = union(colonnes, (v) => v.lignes.map((l) => ({ libelle: l.libelle, detail: l.detail ?? null, offert: !l.montant_ht })));
  const inclus = union(colonnes, (v) => v.inclus.map((x) => ({ libelle: x })));
  const arrhes = peutSigner && colonnes.some((c) => c.devis.arrhes_pourcentage > 0);
  const style = { "--n": n } as CSSProperties;

  return (
    <div className={`cmp apparait${n > 3 ? " cmp-large" : ""}`} style={style}>
      <div className="cmp-defile">
        <table>
          <caption className="sr-only">Comparaison des {n} formules proposées</caption>
          <thead>
            <tr>
              <td className="cmp-coin" aria-hidden>
                <span>
                  {n} formules
                  <br />
                  côte à côte
                </span>
              </td>
              {colonnes.map((c, i) => (
                <th key={c.devis.id} scope="col" data-c={i}>
                  <span className="cmp-nom">{c.devis.formule}</span>
                  <span className="cmp-prix num">{eurosAffiches(c.devis.montant_ttc)}</span>
                  <span className="cmp-ttc">TTC<span className="cmp-numero"> · {c.devis.numero}</span></span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {arrhes && (
              <tr className="cmp-chiffre">
                <th scope="row">Arrhes</th>
                {colonnes.map((c, i) => (
                  <td key={c.devis.id} data-c={i}>
                    {c.devis.arrhes_pourcentage > 0 ? (
                      <>
                        <b className="num">{eurosAffiches(c.confirmer.arrhes)}</b>
                        <small>{c.devis.arrhes_pourcentage} %</small>
                      </>
                    ) : (
                      <span className="cmp-non">—</span>
                    )}
                  </td>
                ))}
              </tr>
            )}
            <tr className="cmp-chiffre">
              <th scope="row">Valable jusqu&apos;au</th>
              {colonnes.map((c, i) => {
                const j = joursRestants(c.devis.valide_jusqu_au);
                return (
                  <td key={c.devis.id} data-c={i}>
                    <b>{jourMois(c.devis.valide_jusqu_au)}</b>
                    <small className={j <= 7 ? "cmp-bientot" : undefined}>{j === 0 ? "dernier jour" : j === 1 ? "encore 1 jour" : `encore ${j} jours`}</small>
                  </td>
                );
              })}
            </tr>
            {lignes.length > 0 && (
              <tr className="cmp-section">
                <th scope="colgroup" colSpan={n + 1}>
                  Prestations
                </th>
              </tr>
            )}
            {lignes.map((r) => (
              <tr key={`l-${r.libelle}`}>
                <th scope="row">{r.libelle}</th>
                {r.cellules.map((c, i) => (
                  <Cellule key={i} c={c} i={i} />
                ))}
              </tr>
            ))}
            {inclus.length > 0 && (
              <tr className="cmp-section">
                <th scope="colgroup" colSpan={n + 1}>
                  Compris dans la formule
                </th>
              </tr>
            )}
            {inclus.map((r) => (
              <tr key={`i-${r.libelle}`}>
                <th scope="row">{r.libelle}</th>
                {r.cellules.map((c, i) => (
                  <Cellule key={i} c={c} i={i} />
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="cmp-coin" aria-hidden />
              {colonnes.map((c, i) => (
                <td key={c.devis.id} data-c={i}>
                  {peutSigner && (
                    <BoutonSigner devis={c.confirmer} dossier={c.recap} libelle="Accepter" className="btn btn-primary btn-sm cmp-choisir" />
                  )}
                  <a className="cmp-detail" href={`#devis-${c.devis.id}`}>
                    Détail <Icone nom="arrow" />
                  </a>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {!peutSigner && <p className="note cmp-note">Votre conseiller valide la formule retenue avec votre entreprise.</p>}
    </div>
  );
}
