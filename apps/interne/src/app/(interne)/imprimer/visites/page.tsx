import Link from "next/link";
import { currentUser } from "@/crm/lib/auth";
import { getDossier } from "@/crm/lib/data";
import { q, q1, type Row } from "@/crm/lib/db";
import { dateFr, m3, nomClient, TYPES } from "@/crm/lib/format";
import { emballages } from "@/crm/lib/tarif";
import { PrintButton } from "@/crm/components/PrintButton";
import { etapesDossier } from "@/crm/planning/donnees";
import { telLisible } from "@/crm/clients/telephones";
import { GENRE_ETAPE, instantParis, jourParis, jourVisite, lendemain, plageVisite, resumeAcces } from "@/lib/visite/regles";

export const dynamic = "force-dynamic";

/*
 * L'impression groupée des fiches de visite, depuis le planning : celles
 * d'une journée (?jour=AAAA-MM-JJ) ou d'une semaine (?semaine=<lundi>), pour
 * toute l'équipe ou pour un commercial (&com=<id>). Une fiche par visite et
 * par page, sur le modèle de la fiche de visite d'un dossier : le rendez-vous,
 * le client, les adresses avec leurs accès, les observations, l'inventaire
 * déjà saisi, les emballages à prévoir, et la place des notes.
 */
export default async function FichesDeVisite({ searchParams }: { searchParams: Promise<{ jour?: string; semaine?: string; com?: string; rdv?: string }> }) {
  await currentUser();
  const sp = await searchParams;
  const jourOk = (j?: string) => (j && /^\d{4}-\d{2}-\d{2}$/.test(j) ? j : null);
  // Une seule visite (?rdv=<id>, depuis le dossier qui vient de la planifier) : sa fiche, quel que soit son jour.
  const rdvSeul = /^\d+$/.test(sp.rdv ?? "") ? Number(sp.rdv) : null;
  const seul = rdvSeul ? await q1<{ debut: Date }>("select debut from rendez_vous where id = $1", [rdvSeul]) : undefined;
  const debut = (seul ? jourParis(seul.debut) : null) ?? jourOk(sp.jour) ?? jourOk(sp.semaine) ?? new Date().toISOString().slice(0, 10);
  const fin = lendemain(debut, sp.jour || seul ? 1 : 7);
  const com = Number(sp.com) || null;
  const rdvs = await q(
    `select r.id, r.dossier_id, r.debut, r.duree_min, r.type, r.notes, r.titre, u.nom as commercial
       from rendez_vous r join utilisateurs u on u.id = r.commercial_id
      where r.type in ('phys', 'visio') and r.dossier_id is not null and not r.journee
        and r.debut >= $1 and r.debut < $2 and ($3::int is null or r.commercial_id = $3) and ($4::int is null or r.id = $4)
      order by u.nom, r.debut`,
    [instantParis(debut, "00:00").toISOString(), instantParis(fin, "00:00").toISOString(), com, rdvSeul],
  );
  const fiches = await Promise.all(rdvs.map(async (r) => ({ r, d: await getDossier(r.dossier_id), etapes: await etapesDossier(r.dossier_id) })));
  const periode = sp.jour || seul ? jourVisite(`${debut}T12:00:00Z`, true) : `semaine du ${jourVisite(`${debut}T12:00:00Z`, true)}`;

  return (
    <>
      <style>{"body{background:#ececec}.sheet{page-break-after:always}.sheet:last-child{page-break-after:auto}.notes{height:170px;border:1px solid #bbb;border-radius:6px;background:repeating-linear-gradient(#fff 0 27px,#e5e5e5 27px 28px)}.doc-head img{width:150px;height:auto}"}</style>
      <div className="pdf-bar">
        {rdvSeul && fiches[0] ? (
          <Link href={`/dossiers/${fiches[0].r.dossier_id}#demenagements-visites`}>← Retour au dossier</Link>
        ) : (
          <Link href={`/planning?semaine=${debut}${com ? `&com=${com}` : ""}`}>← Retour au planning</Link>
        )}
        <span>
          {fiches.length} fiche{fiches.length > 1 ? "s" : ""} de visite · {periode}
          {com && fiches[0] ? ` · ${fiches[0].r.commercial}` : ""}
        </span>
        <PrintButton />
      </div>
      {fiches.length === 0 && <div className="doc">Aucune visite au planning pour cette période.</div>}
      {fiches.map(({ r, d, etapes }) => {
        if (!d) return null;
        const pieces = [...new Set(d.inv.map((i: Row) => i.piece))] as string[];
        const emb = emballages(d.volume);
        return (
          <div className="doc sheet" key={r.id}>
            <div className="doc-head">
              <div>
                <h1>Fiche de visite</h1>
                <div>
                  {jourVisite(r.debut, true)} · {plageVisite(r.debut, r.duree_min)} · {r.type === "visio" ? "Visio" : "Sur place"} · {r.commercial}
                </div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- l'image doit s'imprimer telle quelle */}
              <img src="/marque/bailly-logo.svg" alt="Bailly Déménagement" />
            </div>
            <h2>Client · dossier {d.ref}</h2>
            <table>
              <tbody>
                <tr>
                  <th>Client</th>
                  <td>{nomClient(d)}</td>
                  <th>Type</th>
                  <td>{TYPES[d.type] ?? d.type}</td>
                </tr>
                <tr>
                  <th>Contact</th>
                  <td>{[d.civilite, d.prenom, d.nom].filter(Boolean).join(" ")}</td>
                  <th>Téléphone</th>
                  <td>{telLisible(d.telephone) || "—"}</td>
                </tr>
                <tr>
                  <th>E-mail</th>
                  <td>{d.email ?? "—"}</td>
                  <th>Période</th>
                  <td>{d.periode ?? (d.date_chargement ? dateFr(d.date_chargement) : "—")}</td>
                </tr>
              </tbody>
            </table>
            <h2>Adresses et accès</h2>
            <table>
              <tbody>
                {etapes.map((e: Row) => (
                  <tr key={e.id}>
                    <th>{GENRE_ETAPE[e.genre] ?? "Étape"}</th>
                    <td>
                      {e.adresse ?? "—"}
                      {[e.code_postal, e.ville, e.pays].some(Boolean) ? <><br />{[e.code_postal, e.ville, e.pays].filter(Boolean).join(" ")}</> : null}
                      {e.telephone ? <><br />Tél. {telLisible(e.telephone)}</> : null}
                    </td>
                    <td>{resumeAcces(e as Parameters<typeof resumeAcces>[0]) || "Accès à préciser"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r.notes && (
              <>
                <h2>Commentaire du rendez-vous</h2>
                <div className="obs">{r.notes}</div>
              </>
            )}
            {d.observations && (
              <>
                <h2>Observations commerciales</h2>
                <div className="obs">{d.observations}</div>
              </>
            )}
            <h2>Inventaire déjà saisi · {m3(d.volume)}</h2>
            {d.inv.length === 0 ? (
              <p>Aucun objet saisi : le métré se fait pendant la visite.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Pièce</th>
                    <th>Objets</th>
                    <th className="r">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {pieces.map((p) => {
                    const objets = d.inv.filter((i: Row) => i.piece === p);
                    return (
                      <tr key={p}>
                        <td>{p}</td>
                        <td>{objets.map((i: Row) => `${i.quantite > 1 ? `${i.quantite} × ` : ""}${i.libelle}`).join(", ")}</td>
                        <td className="r">{m3(objets.reduce((a: number, i: Row) => a + i.volume * i.quantite, 0))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <h2>Emballages à prévoir</h2>
            <p>
              {emb.cartonsStandard} cartons standard · {emb.cartonsLivres} cartons livres · {emb.penderies} penderies · {emb.bulle} rouleaux de papier bulle
            </p>
            <h2>Notes de visite</h2>
            <div className="notes" />
          </div>
        );
      })}
    </>
  );
}
