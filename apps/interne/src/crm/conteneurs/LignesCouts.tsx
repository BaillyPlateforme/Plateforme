"use client";

import { useRef, useState } from "react";
import { Icone } from "@/ui/icones";
import u from "@/crm/exploitation/ui/ui.module.css";
import { totaux } from "./regles";
import s from "./conteneurs.module.css";

/*
 * Les coûts d'un conteneur, ligne par ligne : libellé, fournisseur, prix de
 * revient et prix de vente, prévus et réalisés ; la marge de chaque ligne et
 * le total se calculent en direct. Aucun poste n'est imposé : les lignes
 * sont celles que l'exploitation saisit (fret, frais de port, dédouanement…).
 */
type Ligne = { cle: number; id: number | null; libelle: string; fournisseur: string; rp: string; rr: string; vp: string; vr: string };
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const eur = (n: number | null) => (n == null || !Number.isFinite(n) ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n));

export default function LignesCouts({
  couts,
  fournisseurs,
}: {
  couts: { id: number; libelle: string; fournisseur: string | null; revient_prevu: number | null; revient_reel: number | null; vente_prevue: number | null; vente_reelle: number | null }[];
  fournisseurs: string[];
}) {
  const cle = useRef(couts.length + 1);
  const [lignes, setLignes] = useState<Ligne[]>(() =>
    couts.length
      ? couts.map((c, i) => ({ cle: i, id: c.id, libelle: c.libelle, fournisseur: c.fournisseur ?? "", rp: c.revient_prevu?.toString() ?? "", rr: c.revient_reel?.toString() ?? "", vp: c.vente_prevue?.toString() ?? "", vr: c.vente_reelle?.toString() ?? "" }))
      : [{ cle: 0, id: null, libelle: "", fournisseur: "", rp: "", rr: "", vp: "", vr: "" }],
  );
  const maj = (k: number, champ: keyof Ligne, v: string) => setLignes((ls) => ls.map((l) => (l.cle === k ? { ...l, [champ]: v } : l)));
  const t = totaux(lignes.map((l) => ({ revient_prevu: num(l.rp), revient_reel: num(l.rr), vente_prevue: num(l.vp), vente_reelle: num(l.vr) })));
  const taux = (marge: number | null, vente: number | null) => (marge != null && vente ? `${Math.round((marge / vente) * 100)} %` : "");

  return (
    <div className={s.couts}>
      <datalist id="tc-fournisseurs">{fournisseurs.map((n) => <option key={n} value={n} />)}</datalist>
      <div className={u.defile}>
        <table className={`${u.tableau} ${s.tableCouts}`}>
          <thead>
            <tr>
              <th>Poste</th>
              <th>Fournisseur</th>
              <th className={u.droite}>Revient prévu</th>
              <th className={u.droite}>Revient réel</th>
              <th className={u.droite}>Vente prévue</th>
              <th className={u.droite}>Vente réelle</th>
              <th className={u.droite}>Marge prévue</th>
              <th className={u.droite}>Marge réelle</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => {
              const mp = num(l.rp) != null && num(l.vp) != null ? num(l.vp)! - num(l.rp)! : null;
              const mr = num(l.rr) != null && num(l.vr) != null ? num(l.vr)! - num(l.rr)! : null;
              return (
                <tr key={l.cle}>
                  <td>
                    {l.id && <input type="hidden" name={`cout_${l.cle}_id`} value={l.id} />}
                    <input className={u.saisie} type="text" name={`cout_${l.cle}_libelle`} value={l.libelle} onChange={(e) => maj(l.cle, "libelle", e.target.value)} placeholder="Fret maritime…" aria-label="Poste" />
                  </td>
                  <td>
                    <input className={u.saisie} type="text" name={`cout_${l.cle}_fournisseur`} value={l.fournisseur} onChange={(e) => maj(l.cle, "fournisseur", e.target.value)} list="tc-fournisseurs" aria-label="Fournisseur" />
                  </td>
                  {(["rp", "rr", "vp", "vr"] as const).map((k) => (
                    <td key={k}>
                      <input className={`${u.saisie} ${s.montant}`} type="number" step="0.01" name={`cout_${l.cle}_${k}`} value={l[k]} onChange={(e) => maj(l.cle, k, e.target.value)} aria-label={k} />
                    </td>
                  ))}
                  <td className={u.droite} data-signe={mp != null ? Math.sign(mp) : undefined}>
                    {eur(mp)}
                  </td>
                  <td className={u.droite} data-signe={mr != null ? Math.sign(mr) : undefined}>
                    {eur(mr)}
                  </td>
                  <td>
                    <button type="button" className={s.retirerLigne} aria-label="Retirer la ligne" onClick={() => setLignes((ls) => ls.filter((x) => x.cle !== l.cle))}>
                      <Icone nom="plus" taille={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>
                <b>Total HT</b>
              </td>
              <td className={u.droite}>{eur(t.revientPrevu)}</td>
              <td className={u.droite}>{eur(t.revientReel)}</td>
              <td className={u.droite}>{eur(t.ventePrevue)}</td>
              <td className={u.droite}>{eur(t.venteReelle)}</td>
              <td className={u.droite} data-signe={t.margePrevue != null ? Math.sign(t.margePrevue) : undefined}>
                <b>{eur(t.margePrevue)}</b>
                <small>{taux(t.margePrevue, t.ventePrevue)}</small>
              </td>
              <td className={u.droite} data-signe={t.margeReelle != null ? Math.sign(t.margeReelle) : undefined}>
                <b>{eur(t.margeReelle)}</b>
                <small>{taux(t.margeReelle, t.venteReelle)}</small>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <button
        type="button"
        className={`${u.bouton} ${u.petit}`}
        data-ton="secondaire"
        onClick={() => setLignes((ls) => [...ls, { cle: cle.current++, id: null, libelle: "", fournisseur: "", rp: "", rr: "", vp: "", vr: "" }])}
      >
        <Icone nom="plus" taille={15} />
        Ajouter un poste
      </button>
    </div>
  );
}
