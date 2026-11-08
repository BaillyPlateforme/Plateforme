import Link from "next/link";
import { etatEnvois } from "@/lib/envois";
import { estInternationalCrm, etatEspaceCrm, paysDeLAdresse, prealablesEspace, type DossierCrmPourEspace } from "@/lib/espace-client/crm";
import { PAYS } from "@/lib/espace-client/format";
import { SEGMENTS, segmentDuCrm } from "@/lib/espace-client/segments";
import { ouvrirEspaceClient, renvoyerLienEspace } from "@/crm/actions-espace";
import { espaceDuDossier } from "@/crm/lib/espace";
import { dateFr } from "@/crm/lib/format";
import { Ic } from "@/crm/lib/icons";
import type { Row } from "@/crm/lib/db";
import ChoixMois, { moisDuTexte } from "@/crm/components/ChoixMois";
import SuiviEspaceCrm from "@/app/(interne)/(coque)/dashboard/espace-client/_composants/suivi/SuiviEspaceCrm";

/*
 * L'espace client sur la fiche d'un dossier du CRM : un dossier, deux faces.
 * Un client, un espace : tous ses dossiers sont dans le même espace.
 *
 * Pas encore ouvert : ce qu'il faut pour l'ouvrir (l'adresse e-mail, le
 * trajet, la période, le volume, le commercial), complété au besoin dans le
 * même formulaire, et les règles du segment du client. Son client a déjà un
 * espace (un autre dossier) : le même formulaire, pour l'y AJOUTER — sans
 * nouveau lien d'accès ; le dossier le rejoint d'ailleurs de lui-même dès
 * que tout est renseigné (crm/lib/espace.ts). Dans l'espace : son dernier
 * accès et le dernier lien parti, les autres dossiers de son espace, puis
 * l'avancement de ce dossier (ce qui manque, de quoi le relancer) et ses
 * pièces jointes — les composants de la fiche de l'espace (SuiviEspaceCrm).
 */

const MESSAGES: Record<string, { ton: "ok" | "info" | "ko"; texte: string }> = {
  ouvert: { ton: "ok", texte: "Espace client ouvert : le client, son dossier et ses devis y sont. Le lien d'accès est au journal." },
  ajoute: {
    ton: "ok",
    texte: "Ajouté à son espace client : il y retrouve ce dossier à côté des autres. Aucun nouveau lien d'accès ; l'avis « Un nouveau dossier a été ajouté à votre espace » est au journal.",
  },
  deja: { ton: "info", texte: "Ce dossier était déjà dans son espace client : rien n'a été recréé." },
  "lien-journalise": { ton: "ok", texte: "Nouveau lien d'accès journalisé : l'envoi réel des e-mails n'est pas activé." },
  "lien-envoye": { ton: "ok", texte: "Nouveau lien d'accès envoyé au client." },
  "a-completer": { ton: "info", texte: "Le dossier est créé dans le CRM depuis la demande du site. Complétez ce qui manque ci-dessous, puis ouvrez l'espace client." },
  "a-ajouter": { ton: "info", texte: "Ce client a déjà son espace client : ce dossier est à ajouter à son espace." },
};

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

export async function EspaceClient({ d, commerciaux, espace, message }: { d: Row; commerciaux: Row[]; espace?: string; message?: string }) {
  const [etat, sien] = await Promise.all([etatEspaceCrm(d.id).catch(() => null), espaceDuDossier(d.id)]);
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
    const total = etat.autres.length + 1;
    return (
      <section className="card ec" id="espace-client" style={{ gridColumn: "span 12" }}>
        <div className="card-h">
          <h3><Ic n="globe" />Espace client <i className="st g">{total > 1 ? "Dans son espace" : "Ouvert"}</i></h3>
          <div className="sec-actions" style={{ marginTop: 0 }}>
            <form action={renvoyerLienEspace.bind(null, d.id)}><button className="btn ghost sm"><Ic n="link" />Renvoyer le lien d&apos;accès</button></form>
            <Link className="btn primary sm" href={`/dashboard/espace-client/dossiers/${etat.dossierId}`}><Ic n="eye" />Fiche de l&apos;espace</Link>
          </div>
        </div>
        {bandeau}
        {/* Un client, un espace : les autres dossiers qui y sont, quand il y en a. */}
        {total > 1 && (
          <p className="ec-multi">
            <b>Son espace client réunit {pluriel(total, "dossier")} : ce dossier y est.</b>
            <span>
              Avec{" "}
              {etat.autres.map((a, n) => (
                <span key={a.reference}>
                  {n > 0 && (n === etat.autres.length - 1 ? " et " : ", ")}
                  {a.crmDossierId ? <Link href={`/dossiers/${a.crmDossierId}`}>{a.reference}</Link> : a.reference}
                </span>
              ))}
              . Une seule connexion, un seul lien d&apos;accès : le client passe d&apos;un dossier à l&apos;autre par « Mes déménagements ».
            </span>
          </p>
        )}
        {/* Qui, et quand : une ligne. Puis l'avancement et les pièces jointes, les mêmes que dans la fiche de l'espace. */}
        <p className="sub" style={{ margin: "0 0 14px" }}>
          Identifiant <b>{etat.email}</b> · conseiller présenté : {etat.conseiller} · dernier accès :{" "}
          {etat.dernierAcces ? dateFr(etat.dernierAcces, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "pas encore connecté"} · dernier lien d&apos;accès :{" "}
          {lien ? `${dateFr(lien.le, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} (${lien.statut === "envoyee" ? "envoyé" : lien.statut === "echec" ? "échec de l'envoi" : "journalisé, pas envoyé"})` : "aucun"}
          {etat.bailleur ? ` · bailleur : ${etat.bailleur}` : ""}
        </p>
        <SuiviEspaceCrm id={etat.dossierId} />
      </section>
    );
  }

  const dossier: DossierCrmPourEspace = {
    email: d.email, depart: d.stops.find((s: Row) => s.genre === "depart" && s.adresse)?.adresse ?? null,
    arrivee: [...d.stops].reverse().find((s: Row) => s.genre === "arrivee" && s.adresse)?.adresse ?? null,
    date_chargement: d.date_chargement, mois_ca: d.mois_ca, volume: Number(d.volume) || 0, commercial_id: d.commercial_id ?? null,
    type: d.type, type_demenagement: d.type_demenagement,
  };
  // Son client a déjà un espace : l'adresse e-mail est celle de l'espace, et ce dossier est « à ajouter ».
  const existant = sien && !sien.dedans ? sien : null;
  const prealables = prealablesEspace(existant ? { ...dossier, email: existant.email } : dossier);
  // Ce qui manque et ne se saisit pas ici (le trajet, le volume) bloque le bouton.
  const bloque = prealables.some((p) => !p.ok && !p.enLigne);
  const international = estInternationalCrm(d.type_demenagement);
  const paysPropose = paysDeLAdresse(dossier.arrivee) ?? "";
  const valeur: Record<string, string> = {
    email: d.email ?? "",
    trajet: `${dossier.depart ?? "—"} → ${dossier.arrivee ?? "—"}`,
    periode: d.date_chargement ? `Chargement le ${dateFr(d.date_chargement, { day: "numeric", month: "long", year: "numeric" })}` : d.mois_ca ? `Mois prévu : ${dateFr(d.mois_ca, { month: "long", year: "numeric" })}` : "",
    volume: `${String(Math.round((Number(d.volume) || 0) * 10) / 10).replace(".", ",")} m³`,
    commercial: d.commercial ?? "",
  };

  const valeurEmail = existant ? `${existant.email} · l'identifiant de son espace` : valeur.email;

  return (
    <section className="card ec" id="espace-client" style={{ gridColumn: "span 12" }}>
      <div className="card-h">
        <h3><Ic n="globe" />Espace client <i className="st i">{existant ? "Pas encore dans son espace" : "Pas encore ouvert"}</i></h3>
      </div>
      {bandeau}
      {existant && (
        <p className="ec-multi">
          <b>Son espace client existe ({pluriel(existant.references.length, "dossier")} : {existant.references.join(", ")}) : ce dossier n&apos;y est pas encore.</b>
          <span>
            {existant.horsCours
              ? "Ce dossier est terminé, perdu ou archivé : il ne rejoint pas son espace de lui-même. Ajoutez-le ici si le client doit le retrouver."
              : prealables.every((p) => p.ok) && (!international || paysPropose)
                ? "Tout est renseigné : il rejoindra son espace au prochain enregistrement du dossier, ou tout de suite avec le bouton ci-dessous."
                : "Il le rejoindra de lui-même dès que ce qui manque ci-dessous sera renseigné, ou tout de suite avec le bouton ci-dessous."}{" "}
            Même compte, même connexion : aucun nouveau lien d&apos;accès.
          </span>
        </p>
      )}
      <div className="ec-grid">
        <form action={ouvrirEspaceClient.bind(null, d.id)}>
          <p className="ec-lead">
            {existant
              ? "Le client retrouvera ce dossier dans son espace, à côté des autres : ses devis à accepter, ses arrhes, les pièces à fournir, ses conditions de livraison, ses cartons et le SAV. Le CRM reste la référence."
              : "Le client y retrouve son dossier : ses devis à accepter, ses arrhes, les pièces à fournir, ses conditions de livraison, ses cartons et le SAV. Le CRM reste la référence : ce qui change ici apparaît chez lui."}
          </p>
          <ul className="ec-pre">
            {prealables.map((p) => (
              <li key={p.cle} className={p.ok ? "ok" : "ko"}>
                <i>{p.ok ? "✓" : "!"}</i>
                <span>
                  <b>{p.libelle}</b>
                  <small>{p.ok ? (p.cle === "email" ? valeurEmail : valeur[p.cle]) : p.aide}</small>
                </span>
                {!p.ok && p.cle === "email" && <input type="email" name="email" placeholder="client@exemple.fr" required aria-label="Adresse e-mail du client" />}
                {/* Le mois prévu, proposé d'après la date souhaitée par le client (« Souhaitée le 19 novembre 2026 »). */}
                {!p.ok && p.cle === "periode" && <ChoixMois name="mois_ca" required defaultValue={moisDuTexte(d.periode)} ariaLabel="Mois prévu" />}
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
            <button className="btn primary" disabled={bloque}><Ic n="globe" />{existant ? "Ajouter à son espace" : "Ouvrir l'espace client"}</button>
            <span className="sub" style={{ alignSelf: "center" }}>
              {existant
                ? etatEnvois().mode === "actif"
                  ? "Aucun nouveau lien d'accès : le client reçoit l'avis « Un nouveau dossier a été ajouté à votre espace »."
                  : "Aucun nouveau lien d'accès : l'avis « Un nouveau dossier a été ajouté à votre espace » est journalisé, rien ne part tant que l'envoi réel n'est pas activé."
                : etatEnvois().mode === "actif"
                  ? "Le lien d'accès part aussitôt par e-mail, valable 15 minutes."
                  : etatEnvois().mode === "recette"
                    ? "Recette : le lien d'accès ne part par e-mail que si l'adresse du client est sur la liste blanche ; sinon il est journalisé."
                    : "Le lien d'accès est journalisé : aucun e-mail ne part tant que l'envoi réel n'est pas activé."}
            </span>
          </div>
        </form>
        {regles}
      </div>
    </section>
  );
}
