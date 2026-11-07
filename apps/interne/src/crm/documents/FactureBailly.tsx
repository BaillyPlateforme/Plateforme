/* eslint-disable @typescript-eslint/no-explicit-any -- les lignes SQL du CRM ne sont pas typées */
import { TEL_AGENCE } from "@/lib/messaging";
import { dateFr, nomClient, m3, TYPES } from "@/crm/lib/format";
import s from "./facture.module.css";

/*
 * La facture Bailly, sur le modèle du devis (DevisBailly) : le logo, le jaune
 * et le noir, une mise en page A4 qui s'imprime telle quelle.
 *
 * N'y figure que ce que la base et le code savent déjà : le numéro, les dates,
 * le client, l'objet, le montant (la base l'enregistre TTC ; le HT et la TVA
 * sont recalculés à 20 %, comme sur le devis), les paiements reçus, le reste
 * dû, et les coordonnées de l'agence que porte le devis. L'adresse et le SIRET
 * de l'entreprise viennent des Paramètres quand ils y sont renseignés. Ce qui
 * manque pour une facture complète est signalé à l'écran, au-dessus de la
 * feuille (voir `mentionsManquantes`), jamais inventé.
 */

export type Entreprise = { adresse: string | null; siret: string | null };

const euros = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const longue = (d: unknown) => (d ? dateFr(d as string, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—");
const FORMULE: Record<string, string> = { economique: "Économique", standard: "Standard", premium: "Premium" };
const ville = (a: string | null | undefined) => {
  if (!a) return null;
  const m = a.split(",").map((x) => x.trim()).filter(Boolean);
  return (m[m.length - 1] ?? a).replace(/^\d{4,5}\s+/, "");
};

/** Ce qui manque à la facture : à compléter avant de l'envoyer. Affiché à l'écran seulement. */
export function mentionsManquantes(e: Entreprise) {
  return [
    !e.siret && "SIRET de l'entreprise (Paramètres)",
    !e.adresse && "adresse de l'entreprise (Paramètres)",
    "numéro de TVA intracommunautaire",
    "forme juridique, capital et RCS",
    "adresse de facturation du client",
    "date d'échéance et conditions de règlement",
    "taux de TVA applicable : la base enregistre le TTC, le HT et la TVA sont recalculés à 20 %",
  ].filter(Boolean) as string[];
}

/** Au-dessus de la feuille, à l'écran seulement : ce qu'il faut compléter avant d'envoyer la facture. */
export function AvisMentions({ entreprise }: { entreprise: Entreprise }) {
  return (
    <aside className={s.manques} role="note">
      <b>Mentions absentes de la base, à compléter avant d&apos;envoyer cette facture</b>
      <ul>
        {mentionsManquantes(entreprise).map((m) => (
          <li key={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</li>
        ))}
      </ul>
    </aside>
  );
}

export default function FactureBailly({ d, f, entreprise }: { d: any; f: any; entreprise: Entreprise }) {
  const ttc = Number(f.montant);
  const ht = Math.round((ttc / 1.2) * 100) / 100;
  const tva = Math.round((ttc - ht) * 100) / 100;
  const payee = f.statut === "payee";
  const contact = [d.civilite, d.prenom, d.nom].filter(Boolean).join(" ");
  const stops = d.stops as any[];
  const depart = stops.find((x) => x.genre === "depart")?.adresse ?? stops[0]?.adresse;
  const arrivee = [...stops].reverse().find((x) => x.genre === "arrivee")?.adresse ?? stops[stops.length - 1]?.adresse;
  const signe = (d.devis as any[]).find((v) => v.statut === "signe");
  const paiements = d.paiements as any[];
  const recu = paiements.reduce((a, p) => a + Number(p.montant), 0);
  const facturesReglees = (d.factures as any[]).filter((x) => x.statut === "payee").reduce((a, x) => a + Number(x.montant), 0);
  const resteDossier = signe ? Math.max(0, Number(signe.montant) - recu - facturesReglees) : null;

  return (
    <article className={s.feuille}>
      <header className={s.entete}>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- l'image doit s'imprimer telle quelle */}
          <img src="/marque/bailly-logo.svg" alt="Bailly Déménagement" className={s.logo} />
          <div className={s.agence}>
            <b>Bailly Déménagement</b> · BD Moving Group
            {entreprise.adresse && (
              <>
                <br />
                {entreprise.adresse}
              </>
            )}
            <br />
            {TEL_AGENCE} · demenagements-bailly.com
            {entreprise.siret && (
              <>
                <br />
                SIRET {entreprise.siret}
              </>
            )}
          </div>
        </div>
        <div className={s.reference}>
          <span className={s.etiquette}>Facture</span>
          <h1>{f.numero}</h1>
          <p>Émise le {longue(f.emise_le)}</p>
          <p>Dossier {d.ref}</p>
          <span className={`${s.statut} ${payee ? s.reglee : ""}`}>{payee ? `Réglée le ${longue(f.payee_le)}` : "À régler"}</span>
        </div>
      </header>

      <section className={s.parties}>
        <div className={`${s.case} ${s.client}`}>
          <small>Facturé à</small>
          <b>{nomClient(d)}</b>
          {contact && contact !== nomClient(d) && <span>{contact}</span>}
          <span>{[d.telephone, d.email].filter(Boolean).join(" · ") || "—"}</span>
        </div>
        <div className={s.case}>
          <small>Prestation</small>
          <b>Déménagement {TYPES[d.type] ? `· ${TYPES[d.type]}` : ""}</b>
          <span>
            {ville(depart) ?? "—"} → {ville(arrivee) ?? "—"}
          </span>
          <span>
            {d.date_chargement ? `Chargement le ${longue(d.date_chargement)}` : d.periode ? `Période : ${d.periode}` : "Date à convenir"}
            {d.volume > 0 ? ` · ${m3(d.volume)}` : ""}
          </span>
        </div>
      </section>

      <h2 className={s.titre}>Détail</h2>
      <table className={s.tableau}>
        <thead>
          <tr>
            <th>Désignation</th>
            <th className={s.nombre}>Montant HT</th>
            <th className={s.nombre}>TVA 20 %</th>
            <th className={s.nombre}>Montant TTC</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <b>{f.objet}</b>
              <small>
                {depart ?? "—"} → {arrivee ?? "—"}
              </small>
            </td>
            <td className={s.nombre}>{euros(ht)}</td>
            <td className={s.nombre}>{euros(tva)}</td>
            <td className={s.nombre}>
              <b>{euros(ttc)}</b>
            </td>
          </tr>
        </tbody>
      </table>

      <div className={s.totaux}>
        <div>
          <span>Total HT</span>
          <b>{euros(ht)}</b>
        </div>
        <div>
          <span>TVA 20 %</span>
          <b>{euros(tva)}</b>
        </div>
        <div className={s.total}>
          <span>Total TTC</span>
          <b>{euros(ttc)}</b>
        </div>
      </div>

      <section className={s.bas}>
        <div className={s.situation}>
          <b className={s.sousTitre}>Situation du dossier</b>
          <dl>
            {signe && (
              <div className={s.ligne}>
                <dt>
                  Devis signé {signe.numero} · {FORMULE[signe.formule] ?? signe.formule}
                </dt>
                <dd>{euros(Number(signe.montant))}</dd>
              </div>
            )}
            {paiements.map((p) => (
              <div key={p.id} className={s.ligne}>
                <dt>
                  {p.libelle} · reçu le {longue(p.recu_le)}
                </dt>
                <dd>− {euros(Number(p.montant))}</dd>
              </div>
            ))}
            {paiements.length === 0 && (
              <div className={s.ligne}>
                <dt>Paiements reçus</dt>
                <dd>{euros(0)}</dd>
              </div>
            )}
            {resteDossier != null && (
              <div className={`${s.ligne} ${s.fort}`}>
                <dt>Reste dû sur le dossier</dt>
                <dd>{euros(resteDossier)}</dd>
              </div>
            )}
          </dl>
        </div>
        <div className={s.reglement}>
          <b className={s.sousTitre}>Règlement</b>
          <span className={s.reste}>
            <small>{payee ? "Facture réglée" : "Reste à payer sur cette facture"}</small>
            <strong>{payee ? euros(0) : euros(ttc)}</strong>
          </span>
          {/* La seule condition de règlement déjà écrite dans le CRM (ancienne facture) ; à valider avec Bailly. */}
          <p>Paiement par virement ou carte bancaire à réception.</p>
        </div>
      </section>

      <footer className={s.pied}>
        <span>
          <b>Bailly Déménagement</b> · BD Moving Group · {TEL_AGENCE} · demenagements-bailly.com
        </span>
        <span>Membre IAM et de la Chambre Syndicale du Déménagement · ISO 9001, 14001, 45001</span>
      </footer>
    </article>
  );
}
