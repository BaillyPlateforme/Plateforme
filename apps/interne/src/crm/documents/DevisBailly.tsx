/* eslint-disable @typescript-eslint/no-explicit-any -- les lignes SQL du CRM ne sont pas typées */
import { TEL_AGENCE } from "@/lib/messaging";
import { dateFr, m3, nomClient, TYPES } from "@/crm/lib/format";
import { ACCES_ESCALIER, ACCES_MONTE_MEUBLE, ACCES_POIDS_LOURD, ACCES_STATIONNEMENT, libelleEtageTexte } from "@/lib/visite/regles";
import { calculer, type Calcul } from "@/crm/devis/calcul";
import { ARRHES_CODE, LIGNES_GARANTIE, TVA_CODE, lireAssurance, lireLignes, lirePrestations, nomDevis, type Chiffrage } from "@/crm/devis/modele";
import { euros, pct } from "@/crm/devis/format";
import { volumeClient } from "./volume-client";
import s from "./devis.module.css";

/*
 * Le devis Bailly, tel que le client le reçoit : aux couleurs de la maison
 * (le logo, le jaune et le noir), sur une page A4 quand c'est possible.
 *
 * - Un devis : le client, la visite, la catégorie, l'itinéraire et tous les
 *   accès de chaque adresse, le chiffrage (lignes détaillées, ou un prix
 *   global pour un forfait), la remise, la TVA, la garantie si une prime est
 *   calculée, nos prestations, les conditions (arrhes, solde, validité,
 *   conditions particulières) et le bon pour accord. Les CGV, quand Bailly
 *   les a fournies, suivent en page 2.
 * - Plusieurs devis (proposition du dossier) : les formules côte à côte.
 *
 * Seuls des faits connus y figurent : les données du dossier et du devis,
 * le téléphone de l'agence, son site et les labels de demenagements-bailly.com.
 * Jamais les codes d'accès (donnée interne), ni, pour un client CIMOB/DICOM,
 * son volume réel : seulement ses droits (volume-client.ts).
 */

const GENRE: Record<string, string> = { depart: "Chargement", garde_meuble: "Garde-meuble", arrivee: "Livraison", autre: "Étape" };
const ORDRE: Record<string, number> = { economique: 0, standard: 1, premium: 2, libre: 3 };
const date = (d: unknown) => dateFr(d as string, { day: "numeric", month: "long", year: "numeric" });
const texte = (v: unknown) => String(v ?? "").trim();
const dans = (table: Record<string, string>, cle: unknown) => (typeof cle === "string" && Object.hasOwn(table, cle) ? table[cle] : null);
const ouiNon = (v: unknown) => (v ? "Oui" : "Non");
/** « 4 » → « 4 personnes » ; un texte libre (« 4 pers., 1,2 m ») tel quel. */
const tailleAscenseur = (v: unknown) => {
  const t = texte(v);
  return !t ? null : /^\d+$/.test(t) ? `${t} personne${t === "1" ? "" : "s"}` : t;
};

/**
 * Tous les accès d'une adresse, tels que la fiche et la visite les ont
 * notés (Céline, 16/11/2026 : « asc, portage, transbordement, MM… ») :
 * étage, ascenseur et sa taille, monte-meubles, monte-charge,
 * transbordement, portage et sa distance, toujours ; escalier,
 * stationnement, accès du camion, surface et précisions quand ils sont
 * renseignés. Le code d'accès n'y est jamais : donnée interne.
 */
export function accesAdresse(e: any): [string, string][] {
  const portage = e.portage_m != null && Number(e.portage_m) > 0 ? `Oui, ${e.portage_m} m` : ouiNon(e.portage);
  const escalier = [dans(ACCES_ESCALIER, e.escalier), texte(e.escalier_precision)].filter(Boolean).join(" · ");
  const stationnement = [dans(ACCES_STATIONNEMENT, e.stationnement), texte(e.stationnement_precision)].filter(Boolean).join(" · ");
  const camion = texte(e.acces_camion) || (dans(ACCES_POIDS_LOURD, e.poids_lourd) ? `Poids lourds : ${String(dans(ACCES_POIDS_LOURD, e.poids_lourd)).toLowerCase()}` : "");
  const lignes: ([string, string | null] | false)[] = [
    ["Étage", libelleEtageTexte(texte(e.etage)) ?? "—"],
    ["Ascenseur", e.ascenseur ? ["Oui", tailleAscenseur(e.ascenseur_taille)].filter(Boolean).join(", ") : "Non"],
    ["Monte-meubles", dans(ACCES_MONTE_MEUBLE, e.monte_meuble) ?? "—"],
    ["Monte-charge", ouiNon(e.monte_charge)],
    ["Transbordement", ouiNon(e.transbordement)],
    ["Portage", portage],
    !!escalier && ["Escalier", escalier],
    !!stationnement && ["Stationnement", stationnement],
    !!camion && ["Accès camion", camion],
    e.surface_m2 != null && Number(e.surface_m2) > 0 && ["Surface", `${e.surface_m2} m²`],
    !!texte(e.acces) && ["Précisions", texte(e.acces)],
  ];
  return lignes.filter((l): l is [string, string] => !!l && !!l[1]);
}

export type ParametresDocument = { cgv: string; tvaAssurance: number; arrhesPct: number };

function Coche() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * Le chiffrage d'un devis, recalculé de ses lignes. Un devis d'avant (jamais
 * réenregistré par la fenêtre Devis) garde le montant qu'il avait : si ses
 * lignes n'y retombent pas, le montant enregistré fait foi (TVA 20 %, comme
 * l'imprimait le CRM) et les lignes s'impriment sans prix (`sansPrix`).
 */
function chiffrageDe(v: any, tvaAssurance: number): { ch: Chiffrage; c: Calcul; sansPrix: boolean } {
  const ancien = v.montant_ht == null;
  const ch: Chiffrage = {
    mode: v.mode === "forfait" ? "forfait" : "postes",
    saisie: v.saisie === "ht" ? "ht" : "ttc",
    remisePct: Number(v.remise_pct ?? 0),
    lignes: lireLignes(v.lignes, ancien ? Number(v.montant ?? 0) : null),
    assurance: lireAssurance(v.assurance),
  };
  const c = calculer(ch, tvaAssurance);
  const montant = Number(v.montant ?? 0);
  if (!ancien || Math.abs(c.ttc - montant) < 0.005) return { ch, c, sansPrix: false };
  const ht = Math.round((montant / 1.2) * 100) / 100, tva = Math.round((montant - ht) * 100) / 100;
  return {
    ch,
    c: { ...c, brut: montant, remise: 0, net: montant, parTaux: [{ taux: 20, brut: montant, remise: 0, net: montant, ht, tva, ttc: montant }], ht, tva, ttc: montant },
    sansPrix: true,
  };
}

export default function DevisBailly({
  d, lienSignature, devisId, parametres, apercu,
}: {
  d: any;
  lienSignature?: (token: string) => string;
  /** Un seul devis du dossier (impression depuis sa fenêtre). */
  devisId?: number;
  parametres?: ParametresDocument;
  /** Aperçu de l'équipe : les emplacements vides (CGV) sont signalés à l'écran, jamais imprimés. */
  apercu?: boolean;
}) {
  const p: ParametresDocument = parametres ?? { cgv: "", tvaAssurance: TVA_CODE, arrhesPct: ARRHES_CODE };
  const tous = (d.devis as any[]).filter((v) => (devisId ? v.id === devisId : !v.retire_le));
  const liste = [...tous].sort((a, b) => (ORDRE[a.formule] ?? 9) - (ORDRE[b.formule] ?? 9) || a.id - b.id);
  return (
    <>
      {liste.length === 1 ? <Detail d={d} v={liste[0]} p={p} lienSignature={lienSignature} /> : <Proposition d={d} liste={liste} p={p} lienSignature={lienSignature} />}
      {p.cgv.trim() ? (
        <article id="cgv" className={`${s.feuille} ${s.compact} ${s.cgv}`}>
          <h2 className={s.titre}>Conditions générales de vente</h2>
          <div className={s.cgvTexte}>{p.cgv}</div>
        </article>
      ) : apercu ? (
        <aside className={s.cgvVide}>
          <b>Emplacement des conditions générales de vente</b>
          <span>Texte à fournir par Bailly (Devis › Paramètres du devis). Tant qu&apos;il est vide, rien n&apos;est imprimé.</span>
        </aside>
      ) : null}
    </>
  );
}

function EnTete({ d, titre, sousTitre }: { d: any; titre: string; sousTitre: React.ReactNode }) {
  return (
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
        <h1>{titre}</h1>
        <p>{sousTitre}</p>
        <p>Dossier {d.ref}</p>
      </div>
    </header>
  );
}

/** Toutes les adresses du dossier (plusieurs chargements ou livraisons comprises), chacune avec tous ses accès. */
function Itineraire({ d }: { d: any }) {
  return (
    <ol className={s.adresses} style={{ gridTemplateColumns: `repeat(${Math.min(Math.max((d.stops as any[]).length, 2), 3)}, minmax(0, 1fr))` }}>
      {(d.stops as any[]).map((e, i) => (
        <li key={e.id}>
          <span className={s.point}>{i + 1}</span>
          <div>
            <small>{GENRE[e.genre] ?? "Étape"}</small>
            <b>{[e.adresse, [e.code_postal, e.ville].filter(Boolean).join(" "), e.pays].filter(Boolean).join(", ")}</b>
            <dl className={s.accesDetail}>
              {accesAdresse(e).map(([k, v]) => (
                <div key={k} data-long={v.length > 26 ? "" : undefined}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Pied() {
  return (
    <footer className={s.pied}>
      <span>
        <b>Bailly Déménagement</b> · BD Moving Group · {TEL_AGENCE} · demenagements-bailly.com
      </span>
      <span>Membre IAM et de la Chambre Syndicale du Déménagement · ISO 9001, 14001, 45001</span>
    </footer>
  );
}

function Accord({ lien, cgv, signeLe }: { lien: string | null; cgv: boolean; signeLe?: unknown }) {
  return (
    <div className={s.accord}>
      <b>Bon pour accord</b>
      {!!signeLe && <span className={s.enLigne}>Devis signé le {dateFr(signeLe as string, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}</span>}
      {!signeLe && <p>Date et signature précédées de la mention « bon pour accord »{cgv ? ", valant acceptation des conditions générales jointes" : ""}.</p>}
      <div className={s.signature} />
      {lien && <div className={s.enLigne}>Ou signez en ligne : {lien}</div>}
    </div>
  );
}

/* ---------- un devis ---------- */

function Detail({ d, v, p, lienSignature }: { d: any; v: any; p: ParametresDocument; lienSignature?: (token: string) => string }) {
  const tvaAssurance = lireAssurance(v.assurance).tva ?? p.tvaAssurance;
  const { ch, c, sansPrix } = chiffrageDe(v, tvaAssurance);
  const ht = ch.saisie === "ht";
  const base = ch.lignes.filter((l) => l.groupe === "base");
  const divers = ch.lignes.filter((l) => l.groupe === "divers" && (l.libelle.trim() || c.montants[l.id]));
  // Forfait, ou devis d'avant dont les lignes ne font pas le montant : un prix global, les lignes sans prix.
  const forfait = (ch.mode === "forfait" || sansPrix) && base.length > 0;
  const lignes = forfait ? divers : [...base, ...divers];
  const montantForfait = base.filter((l) => l.charge !== "client").reduce((a, l) => a + (c.montants[l.id] ?? 0), 0);
  const prestations = lirePrestations(v.prestations).filter((x) => x.libelle.trim() && x.charge !== "so");
  const bailly = prestations.filter((x) => x.charge === "bailly"), client = prestations.filter((x) => x.charge === "client");
  const arrhesPct = v.arrhes_pct != null ? Number(v.arrhes_pct) : p.arrhesPct;
  const a = ch.assurance;
  const contact = [d.prenom, d.nom].filter(Boolean).join(" ");
  const lien = v.token && !v.signe_le && lienSignature ? lienSignature(v.token) : null;
  const tauxUniques = c.parTaux.length;
  const volume = volumeClient(d);
  const primesGarantie = { contractuelle: c.primeContractuelle, dommage: c.primeDommage, luxe: c.primeLuxe };
  const garanties = LIGNES_GARANTIE.filter((g) => primesGarantie[g.cle] > 0);
  const transport = [
    v.distance_km ? `${v.distance_km} km` : null,
    v.deplacement === "urbain" ? "déménagement urbain" : "transport routier",
    v.groupage ? "en groupage avec d'autres clients" : "camion dédié",
  ].filter(Boolean).join(" · ");

  return (
    <article className={`${s.feuille} ${s.compact}`}>
      <EnTete
        d={d}
        titre={`Devis ${v.numero}`}
        sousTitre={<>Établi le {date(v.date_devis ?? v.cree_le)}{v.validite ? ` · valable jusqu’au ${date(v.validite)}` : ""}</>}
      />

      <section className={s.resume}>
        <div className={`${s.case} ${s.client}`}>
          <small>Client</small>
          <b>{nomClient(d)}</b>
          <span>{[contact !== nomClient(d) ? contact : null, d.telephone, d.email].filter(Boolean).join(" · ") || "—"}</span>
        </div>
        <div className={s.case}>
          <small>Conseiller</small>
          <b>{v.commercial_devis ?? d.commercial ?? "Bailly Déménagement"}</b>
          <span>{v.date_visite ? `Visite du ${dateFr(v.date_visite, { day: "numeric", month: "long" })}` : TYPES[d.type] ?? "Déménagement"}</span>
        </div>
        <div className={s.case}>
          <small>Catégorie</small>
          <b>{nomDevis(v)}</b>
          <span>{[volume.valeur != null ? `${volume.droits ? "Droits : " : ""}${m3(volume.valeur)}` : null, v.distance_km ? `${v.distance_km} km` : null].filter(Boolean).join(" · ") || "—"}</span>
        </div>
        <div className={s.case}>
          <small>Date</small>
          <b>{d.date_chargement ? dateFr(d.date_chargement, { day: "numeric", month: "long", year: "numeric" }) : d.periode ?? "À convenir"}</b>
          {d.date_livraison && String(d.date_livraison) !== String(d.date_chargement) && <span>Livraison le {dateFr(d.date_livraison, { day: "numeric", month: "long" })}</span>}
        </div>
      </section>

      <h2 className={s.titre}>Itinéraire et accès</h2>
      <Itineraire d={d} />

      <h2 className={s.titre}>Votre devis</h2>
      <div className={s.chiffrage}>
        <div>
        <table className={s.lignesDevis}>
          <thead>
            <tr>
              <th>Désignation</th>
              {!forfait && <><th className={s.n}>Qté</th><th className={s.n}>PU {ht ? "HT" : "TTC"}</th></>}
              {tauxUniques > 1 && <th className={s.n}>TVA</th>}
              <th className={s.n}>Montant {ht ? "HT" : "TTC"}</th>
            </tr>
          </thead>
          <tbody>
            {forfait && (
              <tr>
                <td>
                  <b>{base.length === 1 && base[0].libelle.trim() ? base[0].libelle : "Forfait déménagement"}</b>
                  <small>Prix global{base.length > 1 ? ` : ${base.filter((l) => l.charge !== "client").map((l) => l.libelle).filter(Boolean).join(", ").toLowerCase()}` : ""}</small>
                </td>
                {tauxUniques > 1 && <td className={s.n}>{[...new Set(base.map((l) => pct(l.tva)))].join(", ")}</td>}
                <td className={s.n}><b>{euros(sansPrix ? c.ttc : montantForfait)}</b></td>
              </tr>
            )}
            {lignes.map((l) => (
              <tr key={l.id} data-client={l.charge === "client" ? "" : undefined}>
                <td>
                  {l.libelle || "—"}
                  {l.detail && <small>{l.detail}</small>}
                </td>
                {!forfait && <><td className={s.n}>{String(l.qte).replace(".", ",")}</td><td className={s.n}>{l.charge === "client" ? "" : euros(l.pu)}</td></>}
                {tauxUniques > 1 && <td className={s.n}>{l.charge === "client" ? "" : pct(l.tva)}</td>}
                <td className={s.n}>{l.charge === "client" ? <em>à votre charge</em> : euros(c.montants[l.id] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
          {garanties.length > 0 && (
            <p className={s.assuranceTexte}>
              {garanties.map((g) => {
                const x = a[g.cle];
                const franchise = !g.franchise ? ", pas de franchise" : "franchise" in x && x.franchise != null ? `, franchise ${euros(x.franchise)}` : "";
                return <span key={g.cle}>{g.libelle} : valeur déclarée {euros(x.valeur)}, taux {pct(x.taux)}{franchise}. </span>;
              })}
            </p>
          )}
        </div>
        <dl className={s.totaux}>
          {c.remise > 0 && (
            <>
              <div><dt>Total brut {ht ? "HT" : "TTC"}</dt><dd>{euros(c.brut)}</dd></div>
              <div><dt>Remise {pct(ch.remisePct)}</dt><dd>− {euros(c.remise)}</dd></div>
            </>
          )}
          <div><dt>Net HT</dt><dd>{euros(c.parTaux.reduce((x, t) => x + t.ht, 0))}</dd></div>
          {c.parTaux.map((t) => <div key={t.taux}><dt>TVA {pct(t.taux)}</dt><dd>{euros(t.tva)}</dd></div>)}
          {garanties.map((g) => <div key={g.cle}><dt>{g.libelle}</dt><dd>{euros(primesGarantie[g.cle])}</dd></div>)}
          {c.assuranceTva > 0 && <div><dt>TVA garantie {pct(tvaAssurance)}</dt><dd>{euros(c.assuranceTva)}</dd></div>}
          <div className={s.ttc}><dt>Total TTC</dt><dd>{euros(c.ttc)}</dd></div>
          {arrhesPct > 0 && <div className={s.arrhes}><dt>Arrhes {pct(arrhesPct)}</dt><dd>{euros(Math.round(c.ttc * arrhesPct) / 100)}</dd></div>}
        </dl>
      </div>


      {prestations.length > 0 && (
        <>
          <h2 className={s.titre}>Nos prestations</h2>
          <div className={s.quiFait}>
            <div>
              <small>Réalisé par Bailly</small>
              <ul>{bailly.map((x) => <li key={x.id}><span className={s.coche}><Coche /></span>{x.libelle}</li>)}</ul>
            </div>
            {client.length > 0 && (
              <div data-client="">
                <small>À votre charge</small>
                <ul>{client.map((x) => <li key={x.id}><span className={s.coche}>–</span>{x.libelle}</li>)}</ul>
              </div>
            )}
          </div>
        </>
      )}

      <section className={s.bas}>
        <div className={s.conditions}>
          <b>Conditions</b>
          <ul>
            {arrhesPct > 0 && <li>Arrhes à la commande : {pct(arrhesPct)} du montant TTC, soit {euros(Math.round(c.ttc * arrhesPct) / 100)}.</li>}
            {v.reglement_solde && <li>Règlement du solde : {v.reglement_solde}.</li>}
            {v.validite && <li>Offre valable jusqu’au {date(v.validite)}.</li>}
            <li>{transport.charAt(0).toUpperCase() + transport.slice(1)}.</li>
            {v.poids_lourds && <li>Poids lourds : {v.poids_lourds}.</li>}
            {v.ref_interne && <li>Votre référence : {v.ref_interne}.</li>}
            {v.conditions && <li className={s.particulieres}>{v.conditions}</li>}
            {p.cgv.trim() && <li>Conditions générales de vente jointes (page 2).</li>}
          </ul>
        </div>
        <Accord lien={lien} cgv={!!p.cgv.trim()} signeLe={v.signe_le} />
      </section>
      <Pied />
    </article>
  );
}

/* ---------- plusieurs devis : la proposition ---------- */

function Proposition({ d, liste, p, lienSignature }: { d: any; liste: any[]; p: ParametresDocument; lienSignature?: (token: string) => string }) {
  const vedette = liste.find((f) => f.formule === "standard")?.id;
  const numeros = liste.map((f) => f.numero).filter(Boolean);
  const aSigner = liste.find((f) => f.token && !f.signe_le);
  const prestationsDe = (f: any) => lirePrestations(f.prestations).filter((x) => x.libelle.trim() && x.charge !== "so");
  const prestations = [...new Set(liste.flatMap((f) => prestationsDe(f).map((x) => x.libelle)))];
  const validite = liste.map((f) => f.validite).filter(Boolean).sort()[0];
  const conditions = [...new Set(liste.map((f) => String(f.conditions ?? "").trim()).filter(Boolean))];
  const soldes = [...new Set(liste.map((f) => String(f.reglement_solde ?? "").trim()).filter(Boolean))];
  const arrhes = [...new Set(liste.map((f) => (f.arrhes_pct != null ? Number(f.arrhes_pct) : p.arrhesPct)))];
  const ref = liste[0] ?? {};
  const transport = [
    ref.distance_km ? `Distance : ${ref.distance_km} km` : null,
    ref.deplacement === "urbain" ? "Déménagement urbain" : ref.deplacement === "route" ? "Déménagement par la route" : null,
    ref.groupage === true ? "En groupage avec d’autres clients" : ref.groupage === false ? "Camion dédié" : null,
  ].filter(Boolean) as string[];
  const contact = [d.prenom, d.nom].filter(Boolean).join(" ");
  const volume = volumeClient(d);

  return (
    <article className={`${s.feuille} ${s.compact}`}>
      <EnTete d={d} titre={`Proposition ${d.ref}`} sousTitre={<>{numeros.length ? `Devis ${numeros.join(", ")} · ` : ""}établie le {date(new Date())}</>} />

      <section className={s.resume}>
        <div className={`${s.case} ${s.client}`}>
          <small>Client</small>
          <b>{nomClient(d)}</b>
          <span>{[contact !== nomClient(d) ? contact : null, d.telephone, d.email].filter(Boolean).join(" · ") || "—"}</span>
        </div>
        <div className={s.case}>
          <small>Période</small>
          <b>{d.periode ?? (d.date_chargement ? dateFr(d.date_chargement, { day: "numeric", month: "long", year: "numeric" }) : "À convenir")}</b>
        </div>
        <div className={s.case}>
          <small>{volume.libelle}</small>
          <b>{volume.valeur != null ? m3(volume.valeur) : "—"}</b>
          <span>{volume.droits ? "Volume accordé" : "Volume estimé"}</span>
        </div>
        <div className={s.case}>
          <small>Conseiller</small>
          <b>{d.commercial ?? "Bailly Déménagement"}</b>
          <span>{TYPES[d.type] ?? "Déménagement"}</span>
        </div>
      </section>

      <h2 className={s.titre}>Itinéraire et accès</h2>
      <Itineraire d={d} />

      <h2 className={s.titre}>{liste.length > 1 ? "Nos formules" : "Votre formule"}</h2>
      {liste.length === 0 ? (
        <p>Aucun devis n&apos;a encore été établi pour ce dossier.</p>
      ) : (
        <div className={s.formules} style={{ gridTemplateColumns: `repeat(${Math.min(liste.length, 4)}, minmax(0, 1fr))` }}>
          {liste.map((f) => {
            const { ch, c } = chiffrageDe(f, lireAssurance(f.assurance).tva ?? p.tvaAssurance);
            const lignes = ch.mode === "forfait" ? ch.lignes.filter((l) => l.groupe === "divers") : ch.lignes;
            return (
              <div key={f.id} className={`${s.formule} ${f.id === vedette && liste.length > 1 ? s.vedette : ""}`}>
                {f.id === vedette && liste.length > 1 && <span className={s.badge}>Le plus choisi</span>}
                <span className={s.nomFormule}>{nomDevis(f)}</span>
                <span className={s.prix}>
                  {euros(c.ttc)} <small>TTC</small>
                </span>
                <span className={s.ht}>
                  {euros(c.ht)} HT · TVA {euros(c.tva)}{c.remise > 0 ? ` · remise ${pct(ch.remisePct)}` : ""}
                </span>
                <ul className={s.lignes}>
                  {ch.mode === "forfait" && <li><span className={s.coche}><Coche /></span><span>Forfait déménagement</span></li>}
                  {lignes.map((l) => (
                    <li key={l.id} className={l.charge === "client" ? s.charge : undefined}>
                      <span className={s.coche}>{l.charge === "client" ? "–" : <Coche />}</span>
                      <span>{l.libelle}</span>
                    </li>
                  ))}
                </ul>
                <span className={s.numeroFormule}>Devis {f.numero}</span>
              </div>
            );
          })}
        </div>
      )}

      {prestations.length > 0 && (
        <>
          <h2 className={s.titre}>Nos prestations</h2>
          <div className={s.quiFaitFormules}>
            {[prestations.slice(0, Math.ceil(prestations.length / 2)), prestations.slice(Math.ceil(prestations.length / 2))].map((moitie, i) => (
              <table key={i} className={s.prestations}>
                <thead>
                  <tr>
                    <th>Prestation</th>
                    {liste.map((f) => <th key={f.id} title={nomDevis(f)}>{f.formule === "economique" && !f.titre && !f.categorie_specifique ? "Éco." : nomDevis(f)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {moitie.map((libelle) => (
                    <tr key={libelle}>
                      <td>{libelle}</td>
                      {liste.map((f) => {
                        const x = prestationsDe(f).find((y) => y.libelle === libelle);
                        return <td key={f.id}>{!x ? "—" : x.charge === "client" ? <span className={s.vous}>vous</span> : <span className={s.coche}><Coche /></span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
          <p className={s.legende}><span className={s.coche}><Coche /></span> réalisé par Bailly · <span className={s.vous}>vous</span> à votre charge</p>
        </>
      )}

      <section className={s.bas}>
        <div className={s.conditions}>
          <b>Conditions</b>
          <ul>
            {arrhes.length === 1 ? (arrhes[0] > 0 && <li>Arrhes à la réservation : {pct(arrhes[0])} du montant de la formule retenue.</li>) : <li>Arrhes à la réservation : selon la formule retenue ({arrhes.map(pct).join(", ")}).</li>}
            {soldes.map((x) => <li key={x}>Règlement du solde : {x}.</li>)}
            {validite && <li>Offre valable jusqu’au {date(validite)}.</li>}
            {transport.length > 0 && <li>{transport.join(" · ")}.</li>}
            {conditions.map((x) => <li key={x} className={s.particulieres}>{x}</li>)}
            {p.cgv.trim() && <li>Conditions générales de vente jointes.</li>}
          </ul>
        </div>
        <Accord lien={aSigner && lienSignature ? lienSignature(aSigner.token) : null} cgv={!!p.cgv.trim()} />
      </section>
      <Pied />
    </article>
  );
}
