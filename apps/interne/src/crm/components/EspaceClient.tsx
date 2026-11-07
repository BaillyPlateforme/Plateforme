import Link from "next/link";
import { envoiReel } from "@/lib/espace-client/config";
import { etatEspaceCrm, paysDeLAdresse, prealablesEspace, type DossierCrmPourEspace } from "@/lib/espace-client/crm";
import { PAYS } from "@/lib/espace-client/format";
import { SEGMENTS, segmentDuCrm } from "@/lib/espace-client/segments";
import { ouvrirEspaceClient, renvoyerLienEspace } from "@/crm/actions-espace";
import { dateFr } from "@/crm/lib/format";
import { Ic } from "@/crm/lib/icons";
import type { Row } from "@/crm/lib/db";

/*
 * L'espace client sur la fiche d'un dossier du CRM : un dossier, deux faces.
 *
 * Pas encore ouvert : ce qu'il faut pour l'ouvrir (l'adresse e-mail, le
 * trajet, la période, le volume, le commercial), complété au besoin dans le
 * même formulaire, et les règles du segment du client. Ouvert : où en est le
 * client — son dernier accès, le dernier lien parti, sa frise —, et de quoi
 * renvoyer un lien ou rejoindre la fiche de l'espace dans le back-office.
 */

const MESSAGES: Record<string, { ton: "ok" | "info" | "ko"; texte: string }> = {
  ouvert: { ton: "ok", texte: "Espace client ouvert : le client, son dossier et ses devis y sont. Le lien d'accès est au journal." },
  deja: { ton: "info", texte: "L'espace client de ce dossier était déjà ouvert : rien n'a été recréé." },
  "lien-journalise": { ton: "ok", texte: "Nouveau lien d'accès journalisé : l'envoi réel des e-mails n'est pas activé." },
  "lien-envoye": { ton: "ok", texte: "Nouveau lien d'accès envoyé au client." },
  "a-completer": { ton: "info", texte: "Le dossier est créé dans le CRM depuis la demande du site. Complétez ce qui manque ci-dessous, puis ouvrez l'espace client." },
};

const ETAT_ETAPE: Record<string, string> = { fait: "ok", a_faire: "todo", en_attente: "later" };

export async function EspaceClient({ d, commerciaux, espace, message }: { d: Row; commerciaux: Row[]; espace?: string; message?: string }) {
  const etat = await etatEspaceCrm(d.id).catch(() => null);
  const segment = SEGMENTS[segmentDuCrm(d.type)];
  const flash = espace ? MESSAGES[espace] ?? (message ? { ton: espace === "avertissement" ? "info" : "ko", texte: message } : null) : null;
  const precision = espace && MESSAGES[espace] && message ? message : null;

  const regles = (
    <aside className="ec-seg">
      <small>Segment · {segment.libelle}</small>
      <ul>{segment.regles.map((r) => <li key={r}>{r}</li>)}</ul>
    </aside>
  );

  const bandeau = flash && (
    <p className={`ec-flash ${flash.ton}`} role="status">
      {flash.texte}
      {precision && <small>{precision}</small>}
    </p>
  );

  if (etat) {
    const lien = etat.dernierLien;
    return (
      <section className="card ec" id="espace-client" style={{ gridColumn: "span 12" }}>
        <div className="card-h">
          <h3><Ic n="globe" />Espace client <i className="st g">Ouvert</i></h3>
          <div className="sec-actions" style={{ marginTop: 0 }}>
            <form action={renvoyerLienEspace.bind(null, d.id)}><button className="btn ghost sm"><Ic n="link" />Renvoyer le lien d&apos;accès</button></form>
            <Link className="btn primary sm" href={`/dashboard/espace-client/dossiers/${etat.dossierId}`}><Ic n="eye" />Fiche de l&apos;espace</Link>
          </div>
        </div>
        {bandeau}
        <div className="ec-grid">
          <div>
            <div className="ec-kpis">
              <div><small>Identifiant du client</small><b className="mail">{etat.email.split("@")[0]}<wbr />@{etat.email.split("@")[1]}</b><span>Conseiller présenté : {etat.conseiller}</span></div>
              <div><small>Dernier accès</small><b>{etat.dernierAcces ? dateFr(etat.dernierAcces, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "Pas encore connecté"}</b><span>{etat.sessions ? `${etat.sessions} session${etat.sessions > 1 ? "s" : ""} ouverte${etat.sessions > 1 ? "s" : ""} par un lien` : "Le client entre par le lien de son e-mail"}</span></div>
              <div><small>Dernier lien d&apos;accès</small><b>{lien ? dateFr(lien.le, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "Aucun"}</b><span>{lien ? (lien.statut === "envoyee" ? "Envoyé par e-mail" : lien.statut === "echec" ? "Échec de l'envoi : voir le journal" : "Journalisé, pas envoyé (envoi réel désactivé)") : "—"}</span></div>
              <div><small>Dossier du client</small><b>{etat.avancement.pourcent} %</b><span className="ec-bar"><i style={{ width: `${etat.avancement.pourcent}%` }} /></span><span>{etat.avancement.faites} étape{etat.avancement.faites > 1 ? "s" : ""} sur {etat.avancement.total}</span></div>
            </div>
            <ol className="ec-frise">
              {etat.frise.map((e) => (
                <li key={e.cle} className={ETAT_ETAPE[e.statut]}>
                  <i>{e.statut === "fait" ? <Ic n="check" /> : null}</i>
                  <span><b>{e.titre}{e.bloquante && e.statut !== "fait" ? " · obligatoire" : ""}</b><small>{e.detail}</small></span>
                </li>
              ))}
            </ol>
            <p className="sub">
              Le CRM tient le client, le trajet, les dates, les devis et les factures : un devis envoyé ici apparaît dans l&apos;espace, une acceptation ou des arrhes réglées
              là-bas reviennent ici. L&apos;espace garde les documents, les conditions de livraison, les cartons et le SAV.
              {etat.bailleur ? ` Bailleur : ${etat.bailleur}.` : ""}
            </p>
          </div>
          {regles}
        </div>
      </section>
    );
  }

  const dossier: DossierCrmPourEspace = {
    email: d.email, depart: d.stops.find((s: Row) => s.genre === "depart" && s.adresse)?.adresse ?? null,
    arrivee: [...d.stops].reverse().find((s: Row) => s.genre === "arrivee" && s.adresse)?.adresse ?? null,
    date_chargement: d.date_chargement, mois_ca: d.mois_ca, volume: Number(d.volume) || 0, commercial_id: d.commercial_id ?? null,
    type: d.type, type_demenagement: d.type_demenagement,
  };
  const prealables = prealablesEspace(dossier);
  // Ce qui manque et ne se saisit pas ici (le trajet, le volume) bloque le bouton.
  const bloque = prealables.some((p) => !p.ok && !p.enLigne);
  const international = ["international", "maritime", "aerien"].includes(d.type_demenagement);
  const paysPropose = paysDeLAdresse(dossier.arrivee) ?? "";
  const valeur: Record<string, string> = {
    email: d.email ?? "",
    trajet: `${dossier.depart ?? "—"} → ${dossier.arrivee ?? "—"}`,
    periode: d.date_chargement ? `Chargement le ${dateFr(d.date_chargement, { day: "numeric", month: "long", year: "numeric" })}` : d.mois_ca ? `Mois prévu : ${dateFr(d.mois_ca, { month: "long", year: "numeric" })}` : "",
    volume: `${String(Math.round((Number(d.volume) || 0) * 10) / 10).replace(".", ",")} m³`,
    commercial: d.commercial ?? "",
  };

  return (
    <section className="card ec" id="espace-client" style={{ gridColumn: "span 12" }}>
      <div className="card-h">
        <h3><Ic n="globe" />Espace client <i className="st i">Pas encore ouvert</i></h3>
      </div>
      {bandeau}
      <div className="ec-grid">
        <form action={ouvrirEspaceClient.bind(null, d.id)}>
          <p className="ec-lead">
            Le client y retrouve son dossier : ses devis à accepter, ses arrhes, les pièces à fournir, ses conditions de livraison, ses cartons et le SAV. Le CRM reste la
            référence : ce qui change ici apparaît chez lui.
          </p>
          <ul className="ec-pre">
            {prealables.map((p) => (
              <li key={p.cle} className={p.ok ? "ok" : "ko"}>
                <i>{p.ok ? "✓" : "!"}</i>
                <span>
                  <b>{p.libelle}</b>
                  <small>{p.ok ? valeur[p.cle] : p.aide}</small>
                </span>
                {!p.ok && p.cle === "email" && <input type="email" name="email" placeholder="client@exemple.fr" required aria-label="Adresse e-mail du client" />}
                {!p.ok && p.cle === "periode" && <input type="month" name="mois_ca" required aria-label="Mois prévu" />}
                {!p.ok && p.cle === "commercial" && (
                  <select name="commercial_id" required defaultValue="" aria-label="Commercial du dossier">
                    <option value="" disabled>Choisir…</option>
                    {commerciaux.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                )}
              </li>
            ))}
            {international && (
              <li className={paysPropose ? "ok" : "ko"}>
                <i>{paysPropose ? "✓" : "!"}</i>
                <span><b>Pays de destination</b><small>Il fixe les pièces que la douane demande au client.</small></span>
                <select name="pays" defaultValue={paysPropose} required aria-label="Pays de destination">
                  <option value="" disabled>Choisir…</option>
                  {Object.entries(PAYS).filter(([code]) => code !== "FR").map(([code, nom]) => <option key={code} value={code}>{nom}</option>)}
                </select>
              </li>
            )}
          </ul>
          <div className="sec-actions">
            <button className="btn primary" disabled={bloque}><Ic n="globe" />Ouvrir l&apos;espace client</button>
            <span className="sub" style={{ alignSelf: "center" }}>
              {envoiReel() ? "Le lien d'accès part aussitôt par e-mail, valable 15 minutes." : "Le lien d'accès est journalisé : aucun e-mail ne part tant que l'envoi réel n'est pas activé."}
            </span>
          </div>
        </form>
        {regles}
      </div>
    </section>
  );
}
