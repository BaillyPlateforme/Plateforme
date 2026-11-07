/* eslint-disable @typescript-eslint/no-explicit-any -- les lignes SQL du CRM ne sont pas typées */
import { TEL_AGENCE } from "@/lib/messaging";
import { dateFr, eur, m3, nomClient, TYPES } from "@/crm/lib/format";
import s from "./devis.module.css";

/*
 * Le devis Bailly, tel que le client le reçoit : aux couleurs de la maison
 * (le logo, le jaune et le noir), le résumé du déménagement, l'itinéraire,
 * les formules côte à côte et le bon pour accord.
 *
 * Seuls des faits connus y figurent : les données du dossier, le téléphone de
 * l'agence, son site et les labels affichés sur demenagements-bailly.com.
 */

const GENRE: Record<string, string> = { depart: "Départ", garde_meuble: "Garde-meuble", arrivee: "Arrivée", autre: "Étape" };
const ORDRE: Record<string, number> = { economique: 0, standard: 1, premium: 2 };
const NOM_FORMULE: Record<string, string> = { economique: "Économique", standard: "Standard", premium: "Premium" };
const nomFormule = (f: string) => NOM_FORMULE[f?.toLowerCase?.()] ?? f;
/** « 4 », « RDC », « 0 » : l'étage tel qu'on le lit. */
const etage = (e: unknown) => {
  const t = String(e ?? "").trim();
  return !t || /^(rdc|0|rez)/i.test(t) ? "Rez-de-chaussée" : `Étage ${t}`;
};

function Coche() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export default function DevisBailly({ d, lienSignature }: { d: any; lienSignature?: (token: string) => string }) {
  const formules = [...(d.devis as any[])].sort((a, b) => (ORDRE[a.formule] ?? 9) - (ORDRE[b.formule] ?? 9));
  const vedette = formules.find((f) => f.formule === "standard")?.id;
  const contact = [d.civilite, d.prenom, d.nom].filter(Boolean).join(" ");
  const aujourdhui = new Date();
  // Une seule formule : le numéro de son devis. Plusieurs : la proposition porte le dossier, et les numéros suivent.
  const numeros = formules.map((f) => f.numero).filter(Boolean);
  const aSigner = formules.find((f) => f.token && !f.signe_le);

  return (
    <article className={s.feuille}>
      <header className={s.entete}>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- l'image doit s'imprimer telle quelle */}
          <img src="/marque/bailly-logo.svg" alt="Bailly Déménagement" className={s.logo} />
          <div className={s.agence}>
            <b>Bailly Déménagement</b> · BD Moving Group
            <br />
            {TEL_AGENCE} · demenagements-bailly.com
          </div>
        </div>
        <div className={s.reference}>
          <span className={s.etiquette}>Proposition de déménagement</span>
          <h1>{numeros.length === 1 ? `Devis ${numeros[0]}` : `Proposition ${d.ref}`}</h1>
          <p>
            {numeros.length > 1 ? `Devis ${numeros.join(", ")}` : `Dossier ${d.ref}`} · établi le{" "}
            {dateFr(aujourdhui, { day: "numeric", month: "long", year: "numeric" })}
          </p>
          {d.commercial && <p>Votre conseiller : {d.commercial}</p>}
        </div>
      </header>

      <section className={s.resume}>
        <div className={`${s.case} ${s.client}`}>
          <small>Client</small>
          <b>{nomClient(d)}</b>
          <span>{[contact !== nomClient(d) ? contact : null, d.telephone, d.email].filter(Boolean).join(" · ") || "—"}</span>
        </div>
        <div className={s.case}>
          <small>Période</small>
          <b>{d.periode ?? (d.date_chargement ? dateFr(d.date_chargement, { day: "numeric", month: "long", year: "numeric" }) : "À convenir")}</b>
          <span>Chargement</span>
        </div>
        <div className={s.case}>
          <small>Volume</small>
          <b>{m3(d.volume)}</b>
          <span>Volume estimé</span>
        </div>
        <div className={s.case}>
          <small>Prestation</small>
          <b>{TYPES[d.type] ?? "Déménagement"}</b>
          <span>{d.stops.length} adresse{d.stops.length > 1 ? "s" : ""}</span>
        </div>
      </section>

      <h2 className={s.titre}>Itinéraire</h2>
      <ol className={s.trajet}>
        {(d.stops as any[]).map((e, i) => (
          <li key={e.id} className={s.etape}>
            <span className={s.point}>{i + 1}</span>
            <span className={s.genre}>{GENRE[e.genre] ?? "Étape"}</span>
            <span className={s.adresse}>{e.adresse}</span>
            <span className={s.acces}>
              {[etage(e.etage), e.ascenseur ? "ascenseur" : "sans ascenseur", e.acces].filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ol>

      <h2 className={s.titre}>{formules.length > 1 ? "Nos formules" : "Votre formule"}</h2>
      {formules.length === 0 ? (
        <p>Aucun devis n&apos;a encore été établi pour ce dossier.</p>
      ) : (
        <div className={s.formules} style={{ gridTemplateColumns: `repeat(${formules.length}, minmax(0, 1fr))` }}>
          {formules.map((f) => {
            const lignes = (f.lignes ?? []) as any[];
            return (
              <div key={f.id} className={`${s.formule} ${f.id === vedette && formules.length > 1 ? s.vedette : ""}`}>
                {f.id === vedette && formules.length > 1 && <span className={s.badge}>Le plus choisi</span>}
                <span className={s.nomFormule}>{nomFormule(f.formule)}</span>
                <span className={s.prix}>
                  {eur(f.montant)} <small>TTC</small>
                </span>
                <span className={s.ht}>
                  {eur(f.montant / 1.2)} HT · TVA 20 % {eur(f.montant - f.montant / 1.2)}
                </span>
                <ul className={s.lignes}>
                  {lignes.map((l, i) => (
                    <li key={i} className={l.charge === "client" ? s.charge : undefined}>
                      <span className={s.coche}>{l.charge === "client" ? "–" : <Coche />}</span>
                      <span>
                        {l.libelle}
                        {l.charge === "client" ? " — à votre charge" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <section className={s.bas}>
        <div className={s.conditions}>
          <b>Conditions</b>
          <ul>
            <li>Arrhes à la réservation : 30 % du montant de la formule retenue.</li>
          </ul>
        </div>
        <div className={s.accord}>
          <b>Bon pour accord</b>
          <p>Formule retenue, date et signature précédée de la mention « bon pour accord ».</p>
          <div className={s.signature} />
          {aSigner && lienSignature && <div className={s.enLigne}>Ou signez en ligne : {lienSignature(aSigner.token)}</div>}
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
