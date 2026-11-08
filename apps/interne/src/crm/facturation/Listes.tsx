import Link from "next/link";
import type { LigneListeFacture, LigneListeReglement } from "./donnees";
import { ventilerParPayeur } from "./donnees";
import { ETAT, GENRE, NATURE, euros2, libelleMode, type GenreFacture } from "./calcul";
import s from "./facturation.module.css";

/*
 * Les listes de la page Factures : les factures (à plat, ou par client
 * payeur, ou par client d'origine), les règlements et les arrhes. Le reste à
 * payer est celui des vues de la base (crm.factures_soldes) : réel, paiements
 * partiels compris. Les totaux sont au pied de chaque liste.
 */

const fr = (j: string | null) => (j ? j.split("-").reverse().join("/") : "—");
const doc = (f: { id: number; dossierId: number | null }) => `/imprimer/${f.dossierId ?? 0}?doc=facture&f=${f.id}`;

function Etat({ etat }: { etat: string }) {
  const e = ETAT[etat] ?? ETAT.a_regler;
  return <i className={s.etat} data-ton={e.ton}>{e.label}</i>;
}

function LigneFacture({ f }: { f: LigneListeFacture }) {
  const avoir = f.genre === "avoir";
  return (
    <tr>
      <td className={s.nw}>
        <Link href={doc(f)} className={s.numero}>{f.numero}</Link>
        <small>{GENRE[f.genre as GenreFacture] ?? "Facture"}{f.origineNumero ? ` · annule ${f.origineNumero}` : ""}{f.avoirNumero ? ` · annulée par ${f.avoirNumero}` : ""}</small>
      </td>
      {/* Une seule colonne pour le client : celui du dossier, et le payeur quand c'en est un autre. */}
      <td>
        {f.dossierId ? <Link href={`/dossiers/${f.dossierId}#facturation`}>{f.origineNom}</Link> : f.origineNom}
        <small>{f.ref ?? "garde-meuble"}{f.payeurNomAffiche !== f.origineNom ? ` · payé par ${f.payeurNomAffiche}` : ""}</small>
      </td>
      <td style={{ maxWidth: 240 }}>{f.objet}</td>
      <td className={s.nw}>{fr(f.emiseLe)}</td>
      <td className={`${s.nw} ${f.enRetard ? s.rouge : ""}`}>{avoir || f.statut === "annulee" ? "—" : fr(f.echeanceLe)}</td>
      <td className={s.nw}><Etat etat={f.etat} /></td>
      <td className={s.num}><b>{avoir ? "− " : ""}{euros2(f.ttc)}</b></td>
      <td className={s.num}>{avoir || f.statut === "annulee" ? <span className={s.terne}>—</span> : euros2(f.statut === "payee" ? f.ttc : f.affecte)}</td>
      <td className={`${s.num} ${f.reste > 0 ? s.rouge : s.terne}`}>{f.reste > 0 ? euros2(f.reste) : "0 €"}</td>
    </tr>
  );
}

const totalFactures = (rows: LigneListeFacture[]) => {
  const actives = rows.filter((f) => f.genre !== "avoir" && f.statut !== "annulee");
  return {
    // Un avoir annule toujours une facture entière, déjà exclue : il ne se déduit pas une seconde fois.
    ttc: actives.reduce((a, f) => a + f.ttc, 0),
    regle: actives.reduce((a, f) => a + (f.statut === "payee" ? f.ttc : f.affecte), 0),
    reste: rows.reduce((a, f) => a + f.reste, 0),
  };
};

export function TableFactures({ rows, groupe }: { rows: LigneListeFacture[]; groupe: "payeur" | "origine" | null }) {
  if (!rows.length) return <div className={`${s.liste} ${s.listeVide}`}><b>Aucune facture ici</b>Changez de filtre, ou facturez depuis la fiche d&apos;un dossier.</div>;
  const t = totalFactures(rows);
  const groupes = groupe ? ventilerParPayeur(rows, groupe) : null;
  return (
    <div className={s.liste}>
      <table>
        <thead>
          <tr>
            <th>N°</th><th>Client</th><th>Objet</th><th>Émise le</th><th>Échéance</th><th>État</th>
            <th className={s.num}>TTC</th><th className={s.num}>Réglé</th><th className={s.num}>Reste</th>
          </tr>
        </thead>
        {groupes ? groupes.map((g) => (
          <tbody key={`${g.id ?? g.nom}`}>
            <tr className={s.groupeTete}>
              <td colSpan={9}>
                <b>{g.nom}</b><span>{g.lignes.length} document{g.lignes.length > 1 ? "s" : ""}</span>
                <em className={g.lignes.reduce((a, x) => a + x.reste, 0) > 0 ? s.rouge : s.terne}>reste {euros2(g.lignes.reduce((a, x) => a + x.reste, 0))}</em>
              </td>
            </tr>
            {g.lignes.map((f) => <LigneFacture key={f.id} f={f} />)}
          </tbody>
        )) : <tbody>{rows.map((f) => <LigneFacture key={f.id} f={f} />)}</tbody>}
        <tfoot>
          <tr>
            <td colSpan={6}>{rows.length} document{rows.length > 1 ? "s" : ""} · totaux hors factures annulées et avoirs</td>
            <td className={s.num}>{euros2(t.ttc)}</td>
            <td className={s.num}>{euros2(t.regle)}</td>
            <td className={`${s.num} ${t.reste > 0 ? s.rouge : ""}`}>{euros2(t.reste)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const MODE_COURT: Record<string, string> = { cheque: "CHQ", virement: "VIR", carte: "CB", carte_en_ligne: "WEB", especes: "ESP", prelevement: "PRL", autre: "…" };

export function TableReglements({ rows, arrhes }: { rows: LigneListeReglement[]; arrhes?: boolean }) {
  if (!rows.length) return <div className={`${s.liste} ${s.listeVide}`}><b>Aucun {arrhes ? "versement d'arrhes" : "règlement"} ici</b>Les encaissements se saisissent depuis la carte « Facturation » d&apos;un dossier.</div>;
  const total = rows.reduce((a, r) => a + r.montant, 0);
  return (
    <div className={s.liste}>
      <table>
        <thead>
          <tr>
            <th>Reçu le</th><th>Client</th>{!arrhes && <th>Nature</th>}<th>Mode</th><th>Références</th><th>Compte</th><th>Prévu le</th>
            <th>{arrhes ? "Facture d'arrhes" : "Affecté à"}</th><th className={s.num}>Montant</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={s.nw}>{fr(r.recuLe)}{r.saisiPar && <small>saisi par {r.saisiPar}</small>}</td>
              <td><Link href={`/dossiers/${r.dossierId}#facturation`}>{r.client}</Link><small>{r.ref}</small></td>
              {!arrhes && <td>{NATURE[r.nature ?? "reglement"] ?? "Règlement"}</td>}
              <td className={s.nw}><span className={s.mode} data-mode={r.mode ?? ""}><i>{MODE_COURT[r.mode ?? ""] ?? "—"}</i>{libelleMode(r.mode)}</span></td>
              <td>{[r.banque, r.numeroCheque && `n° ${r.numeroCheque}`, r.titulaire].filter(Boolean).join(" · ") || <span className={s.terne}>—</span>}{r.commentaire && <small>{r.commentaire}</small>}</td>
              <td>{r.compte ?? <span className={s.terne}>—</span>}</td>
              <td className={s.nw}>{r.datePrevue ? fr(r.datePrevue) : <span className={s.terne}>—</span>}</td>
              <td className={s.nw}>
                {r.factureNumero
                  ? <Link className={s.lien} href={`/imprimer/${r.dossierId}?doc=facture&f=${r.factureId}`}>{r.factureNumero}</Link>
                  : <span className={s.etat} data-ton={arrhes ? "attente" : "info"}>{arrhes ? "À facturer" : "Au crédit"}</span>}
              </td>
              <td className={`${s.num} ${r.montant < 0 ? s.rouge : ""}`}><b>{euros2(r.montant)}</b></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={arrhes ? 7 : 8}>{rows.length} {arrhes ? "versement" : "règlement"}{rows.length > 1 ? "s" : ""}</td>
            <td className={s.num}>{euros2(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
