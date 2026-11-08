/* eslint-disable @typescript-eslint/no-explicit-any -- les lignes SQL du dossier ne sont pas typées */
import { TEL_AGENCE } from "@/lib/messaging";
import { dateFr, m3, TYPES } from "@/crm/lib/format";
import type { FactureComplete, Mentions, Payeur } from "@/crm/facturation/donnees";
import { totaux, htDepuisTtc, libelleMode, GENRE, TVA_DEFAUT_CODE, type GenreFacture } from "@/crm/facturation/calcul";
import s from "./facture.module.css";

/*
 * La facture Bailly, sur le modèle du devis (DevisBailly) : le logo, le jaune
 * et le noir, une mise en page A4 qui s'imprime telle quelle. Elle sert aussi
 * à la facture d'arrhes, à la facture de solde et à l'avoir.
 *
 * Ce qui est imprimé vient de la facture telle qu'émise (ses lignes, son
 * payeur, ses mentions figées) et des réglages de la facturation. Une
 * mention que Bailly n'a pas encore donnée n'est pas imprimée : elle est
 * signalée à l'écran, au-dessus de la feuille (mentionsManquantes), jamais
 * inventée. Les factures d'avant le détail des lignes gardent leur ancienne
 * présentation : une ligne, le HT et la TVA recalculés à 20 % du TTC.
 */

const euros = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const longue = (d: unknown) => (d ? dateFr(d as string, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—");
const pct = (n: number) => `${String(n).replace(".", ",")} %`;
const qte = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
const ville = (a: string | null | undefined) => {
  if (!a) return null;
  const m = a.split(",").map((x) => x.trim()).filter(Boolean);
  return (m[m.length - 1] ?? a).replace(/^\d{4,5}\s+/, "");
};
const pro = (p: Payeur | null) => !!p && (p.type === "compte" || p.type === "partenaire" || !!p.siren);

/** La seule condition de règlement déjà écrite dans le CRM (ancienne facture) : reprise tant que les Paramètres sont vides, à valider avec Bailly. */
export const CONDITION_ANCIENNE = "Paiement par virement ou carte bancaire à réception.";

/** Ce qui manque à la facture : à compléter avant de l'envoyer. Affiché à l'écran seulement. */
export function mentionsManquantes(m: Mentions, f: FactureComplete | null): string[] {
  const p = f?.payeur ?? f?.origine ?? null;
  return [
    !m.siret && !m.siren && "SIREN ou SIRET de l'entreprise (Paramètres)",
    !m.adresse && !m.adresseLibre && "adresse de l'entreprise (Paramètres)",
    !m.tvaIntracom && "numéro de TVA intracommunautaire (Paramètres › Facturation)",
    (!m.formeJuridique || !m.capital) && "forme juridique et capital social (Paramètres › Facturation)",
    !m.rcs && "immatriculation au RCS, ville et numéro (Paramètres › Facturation)",
    f && f.genre !== "avoir" && !p?.adresse && "adresse de facturation du client (fenêtre « Client facturé » du dossier)",
    f && f.genre !== "avoir" && !f.echeanceLe && !(f.conditions || m.conditions) && "date d'échéance ou conditions de règlement (Paramètres › Facturation)",
    !m.penalites && "taux des pénalités de retard (Paramètres › Facturation)",
    pro(p) && !m.indemnite && "indemnité forfaitaire pour frais de recouvrement, client professionnel (Paramètres › Facturation)",
    pro(p) && !m.escompte && "conditions d'escompte, client professionnel (Paramètres › Facturation)",
    f && f.nbLignes === 0 && `détail HT et TVA : facture émise avant le détail des lignes, recalculé à ${TVA_DEFAUT_CODE} % du TTC`,
  ].filter(Boolean) as string[];
}

/** Au-dessus de la feuille, à l'écran seulement : ce qu'il faut compléter avant d'envoyer la facture. */
export function AvisMentions({ manques }: { manques: string[] }) {
  if (!manques.length) return null;
  return (
    <aside className={s.manques} role="note">
      <b>Mentions absentes, à compléter avant d&apos;envoyer ce document (cette liste ne s&apos;imprime pas)</b>
      <ul>
        {manques.map((m) => (
          <li key={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</li>
        ))}
      </ul>
    </aside>
  );
}

function Adresse({ p }: { p: Payeur }) {
  return (
    <>
      {p.adresse && <span>{p.adresse}</span>}
      {(p.codePostal || p.ville) && <span>{[p.codePostal, p.ville].filter(Boolean).join(" ")}{p.pays ? ` · ${p.pays}` : ""}</span>}
      {(p.siren || p.tvaIntracom) && <span>{[p.siren && `SIREN ${p.siren}`, p.tvaIntracom && `TVA ${p.tvaIntracom}`].filter(Boolean).join(" · ")}</span>}
    </>
  );
}

export default function FactureBailly({ f, d, m }: { f: FactureComplete; d: any | null; m: Mentions }) {
  const avoir = f.genre === "avoir";
  const annulee = f.statut === "annulee";
  const payee = f.statut === "payee" && !avoir;
  const stops = (d?.stops as any[]) ?? [];
  const depart = stops.find((x) => x.genre === "depart")?.adresse ?? stops[0]?.adresse;
  const arrivee = [...stops].reverse().find((x) => x.genre === "arrivee")?.adresse ?? stops[stops.length - 1]?.adresse;
  const payeur = f.payeur ?? f.origine;
  const origineDistincte = !!(f.origine && f.payeur && f.origine.clientId !== f.payeur.clientId);

  // Les lignes : celles de la facture ; une facture d'avant le détail en garde une seule, au taux du devis.
  const lignes = f.lignes.length
    ? f.lignes
    : [{ genre: "prestation", libelle: f.objet, detail: depart || arrivee ? `${depart ?? "—"} → ${arrivee ?? "—"}` : null, quantite: 1, unite: null, prixUnitaireHt: htDepuisTtc(f.ttc, TVA_DEFAUT_CODE), tauxTva: TVA_DEFAUT_CODE, ht: 0, tva: 0, ttc: 0, factureDeduiteId: null }];
  const t = totaux(lignes.map((l) => ({ genre: l.genre as "prestation", libelle: l.libelle, quantite: l.quantite, prixUnitaireHt: l.prixUnitaireHt, tauxTva: l.tauxTva })));
  const ttc = f.ttc; // le total figé à l'émission (identique au calcul des lignes)
  const regle = f.reglements.reduce((a, r) => a + r.montant, 0);
  const etiquette = avoir ? "Avoir" : GENRE[f.genre as GenreFacture] ?? "Facture";
  const conditions = f.conditions || m.conditions || (avoir ? null : CONDITION_ANCIENNE);
  const adresseEmetteur = m.adresse ? [m.adresse, [m.codePostal, m.ville].filter(Boolean).join(" "), m.pays].filter(Boolean).join(", ") : m.adresseLibre;
  const legales = [
    [m.nom, m.formeJuridique].filter(Boolean).join(", "),
    m.capital && `au capital de ${m.capital}`,
    m.rcs && `RCS ${m.rcs}`,
    m.siret ? `SIRET ${m.siret}` : m.siren && `SIREN ${m.siren}`,
    m.tvaIntracom && `TVA intracommunautaire ${m.tvaIntracom}`,
    m.codeApe && `APE ${m.codeApe}`,
  ].filter(Boolean);

  return (
    <article className={s.feuille}>
      {annulee && <div className={s.filigrane} aria-hidden>Annulée</div>}
      <header className={s.entete}>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- l'image doit s'imprimer telle quelle */}
          <img src="/marque/bailly-logo.svg" alt="Bailly Déménagement" className={s.logo} />
          <div className={s.agence}>
            <b>{m.nom}</b> · BD Moving Group
            {adresseEmetteur && (<><br />{adresseEmetteur}</>)}
            <br />
            {TEL_AGENCE} · demenagements-bailly.com
            {(m.siret || m.siren) && (<><br />{m.siret ? `SIRET ${m.siret}` : `SIREN ${m.siren}`}{m.tvaIntracom ? ` · TVA ${m.tvaIntracom}` : ""}</>)}
          </div>
        </div>
        <div className={s.reference}>
          <span className={`${s.etiquette} ${avoir ? s.etiquetteAvoir : ""}`}>{etiquette}</span>
          <h1>{f.numero}</h1>
          <p>Émis{avoir ? "" : "e"} le {longue(f.emiseLe)}</p>
          {f.echeanceLe && !avoir && <p>Échéance le {longue(f.echeanceLe)}</p>}
          {f.dossierId && d && <p>Dossier {d.ref}</p>}
          <span className={`${s.statut} ${payee ? s.reglee : ""}`}>
            {avoir ? `Annule la facture ${f.origineNumero ?? ""}` : annulee ? `Annulée${f.avoirNumero ? ` par l'avoir ${f.avoirNumero}` : ""}` : payee ? `Réglée le ${longue(f.payeeLe)}` : f.affecte > 0 ? "Réglée en partie" : "À régler"}
          </span>
        </div>
      </header>

      <section className={s.parties}>
        <div className={`${s.case} ${s.client}`}>
          <small>{avoir ? "Au bénéfice de" : "Facturé à"}</small>
          <b>{payeur?.nom ?? "—"}</b>
          {payeur?.contact && <span>{payeur.contact}</span>}
          {payeur && <Adresse p={payeur} />}
          {payeur && (payeur.telephone || payeur.email) && <span>{[payeur.telephone, payeur.email].filter(Boolean).join(" · ")}</span>}
        </div>
        <div className={s.case}>
          <small>Prestation</small>
          <b>{f.gardeMeuble ? "Garde-meuble" : `Déménagement${d && TYPES[d.type] ? ` · ${TYPES[d.type]}` : ""}`}</b>
          {origineDistincte && <span>Pour le compte de {f.origine!.nom}</span>}
          {(depart || arrivee) && <span>{ville(depart) ?? "—"} → {ville(arrivee) ?? "—"}</span>}
          {d && (
            <span>
              {d.date_chargement ? `Chargement le ${longue(d.date_chargement)}` : d.periode ? `Période : ${d.periode}` : "Date à convenir"}
              {d.date_livraison && d.date_livraison !== d.date_chargement ? ` · livraison le ${longue(d.date_livraison)}` : ""}
              {d.volume > 0 ? ` · ${m3(d.volume)}` : ""}
            </span>
          )}
        </div>
      </section>

      <dl className={s.refs}>
        {payeur?.clientId && <div><dt>Code client</dt><dd>{String(payeur.clientId).padStart(6, "0")}</dd></div>}
        {d && <div><dt>Dossier</dt><dd>{d.ref}</dd></div>}
        {f.devisNumero && <div><dt>Devis</dt><dd>{f.devisNumero}</dd></div>}
        {f.bonCommande && <div><dt>Bon de commande</dt><dd>{f.bonCommande}</dd></div>}
        {avoir && f.origineNumero && <div><dt>Facture annulée</dt><dd>{f.origineNumero}</dd></div>}
      </dl>

      <h2 className={s.titre}>Détail</h2>
      <table className={s.tableau}>
        <thead>
          <tr>
            <th>Désignation</th>
            <th className={s.nombre}>Qté</th>
            <th className={s.nombre}>PU HT</th>
            <th className={s.nombre}>TVA</th>
            <th className={s.nombre}>Total HT</th>
            <th className={s.nombre}>Total TTC</th>
          </tr>
        </thead>
        <tbody>
          {t.lignes.map((l, i) => {
            const src = lignes[i];
            if (l.genre === "texte") {
              return (
                <tr key={i} className={s.texte}>
                  <td colSpan={6}><b>{l.libelle}</b>{src.detail && <small>{src.detail}</small>}</td>
                </tr>
              );
            }
            return (
              <tr key={i} className={l.genre === "deduction" ? s.deduction : undefined}>
                <td><b>{l.libelle}</b>{src.detail && <small>{src.detail}</small>}</td>
                <td className={s.nombre}>{qte(l.quantite)}{src.unite ? ` ${src.unite}` : ""}</td>
                <td className={s.nombre}>{euros(l.prixUnitaireHt)}</td>
                <td className={s.nombre}>{pct(l.tauxTva)}</td>
                <td className={s.nombre}>{euros(l.ht)}</td>
                <td className={s.nombre}><b>{euros(l.ttc)}</b></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className={s.totaux}>
        {t.parTaux.length > 1 && t.parTaux.map((g) => (
          <div key={g.taux}><span>Base HT {pct(g.taux)} · TVA {euros(g.tva)}</span><b>{euros(g.base)}</b></div>
        ))}
        <div><span>Total HT</span><b>{euros(t.ht)}</b></div>
        <div><span>{t.parTaux.length === 1 ? `TVA ${pct(t.parTaux[0].taux)}` : "Total TVA"}</span><b>{euros(t.tva)}</b></div>
        <div className={s.total}>
          <span>{avoir ? "Total de l'avoir TTC" : "Total TTC"}</span>
          <b>{euros(ttc)}</b>
        </div>
      </div>

      <section className={s.bas}>
        <div className={s.situation}>
          {avoir ? (
            <>
              <b className={s.sousTitre}>Motif</b>
              <p className={s.motif}>{f.motif ?? "—"}</p>
            </>
          ) : (
            <>
              <b className={s.sousTitre}>Règlements reçus sur ce document</b>
              <dl>
                {f.reglements.map((r) => (
                  <div key={r.id} className={s.ligne}>
                    <dt>{libelleMode(r.mode)}{r.numeroCheque ? ` n° ${r.numeroCheque}` : ""} · le {longue(r.recuLe)}</dt>
                    <dd>− {euros(r.montant)}</dd>
                  </div>
                ))}
                {f.reglements.length === 0 && (
                  <div className={s.ligne}><dt>{payee ? "Réglée (règlement non détaillé)" : "Aucun règlement reçu"}</dt><dd>{euros(payee ? ttc : 0)}</dd></div>
                )}
                <div className={`${s.ligne} ${s.fort}`}>
                  <dt>Reste à payer</dt>
                  <dd>{euros(annulee ? 0 : f.reste)}</dd>
                </div>
              </dl>
            </>
          )}
        </div>
        <div className={s.reglement}>
          <b className={s.sousTitre}>{avoir ? "Avoir" : "Règlement"}</b>
          <span className={s.reste}>
            <small>{avoir ? "Montant de l'avoir" : annulee ? "Facture annulée" : payee ? "Facture réglée" : regle > 0 ? "Net à payer" : "À payer"}</small>
            <strong>{euros(avoir ? ttc : annulee ? 0 : f.reste)}</strong>
          </span>
          {conditions && <p>{conditions}</p>}
          {!avoir && m.iban && <p>IBAN {m.iban}{m.bic ? ` · BIC ${m.bic}` : ""}{m.banque ? ` · ${m.banque}` : ""}</p>}
          {!avoir && m.penalites && <p>{m.penalites}</p>}
          {!avoir && pro(payeur) && m.indemnite && <p>{m.indemnite}</p>}
          {!avoir && pro(payeur) && m.escompte && <p>{m.escompte}</p>}
        </div>
      </section>

      <footer className={s.pied}>
        <span>
          {legales.length > 1 ? legales.join(" · ") : <><b>{m.nom}</b> · BD Moving Group · {TEL_AGENCE} · demenagements-bailly.com</>}
          {m.pied && <><br />{m.pied}</>}
        </span>
        <span>Membre IAM et de la Chambre Syndicale du Déménagement · ISO 9001, 14001, 45001</span>
      </footer>
    </article>
  );
}
