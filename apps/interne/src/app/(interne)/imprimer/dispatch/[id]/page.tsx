import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/crm/components/PrintButton";
import s from "@/crm/dispatch/composants/impression.module.css";
import { plan as lirePlan } from "@/crm/dispatch/donnees";
import { dateCourte, dateLongue, jauge, lignesDe, m3, somme } from "@/crm/dispatch/outils";
import { GENRES, type Colonne, type Ligne, type Plan } from "@/crm/dispatch/types";
import { currentUser } from "@/crm/lib/auth";
import { TEL_AGENCE } from "@/lib/messaging";

export const dynamic = "force-dynamic";
export const metadata = { title: "Impression du dispatch" };

/*
 * Les documents imprimables du dispatch, hors de la coque : une feuille par
 * colonne (conteneur ou tournée), ou le récapitulatif par conteneur. Le
 * bouton du haut imprime, ou enregistre en PDF depuis la fenêtre
 * d'impression du navigateur.
 */

const STATUTS: Record<string, string> = { preparation: "en préparation", charge: "chargé", en_mer: "en mer", arrive: "arrivé", livre: "livré" };
const horodatage = (d: Date | string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(d));

function Entete({ etiquette, titre, sous }: { etiquette: string; titre: string; sous: string }) {
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
        <span className={s.etiquette}>{etiquette}</span>
        <h1>{titre}</h1>
        <p>{sous}</p>
      </div>
    </header>
  );
}

function Pied({ plan, gauche, page }: { plan: Plan; gauche: string; page: string }) {
  return (
    <footer className={s.pied}>
      <span>
        <b>{plan.nom}</b> · {gauche}
      </span>
      <span>{page}</span>
    </footer>
  );
}

function FeuilleColonne({ plan, c, lignes, imprime, page }: { plan: Plan; c: Colonne; lignes: Ligne[]; imprime: string; page: string }) {
  const v = somme(lignes);
  const j = jauge(v, c.capacite);
  return (
    <article className={s.feuille}>
      <Entete
        etiquette={GENRES[c.genre].feuille}
        titre={c.libelle}
        sous={`${plan.sens === "export" ? "Export" : "Import"}${plan.port ? ` · ${plan.port}` : ""} · ${plan.nom}`}
      />
      <section className={s.resume}>
        <div className={`${s.case} ${s.noire}`}>
          <small>Destination</small>
          <b>{c.zone ?? ([...new Set(lignes.map((l) => l.pays).filter(Boolean))].join(", ") || "—")}</b>
          <span>{[...new Set(lignes.map((l) => l.ville).filter(Boolean))].join(", ") || "Aucune ville"}</span>
        </div>
        <div className={s.case}>
          <small>{c.genre === "conteneur" ? "Départ prévu" : "Date"}</small>
          <b>{c.jour ? dateLongue(c.jour) : plan.dateReference && c.genre === "conteneur" ? dateLongue(plan.dateReference) : "À fixer"}</b>
          <span>{c.conteneur ? `${c.conteneur.numero} · ${STATUTS[c.conteneur.statut] ?? c.conteneur.statut}` : c.taille ? `${c.taille} pieds` : GENRES[c.genre].nom}</span>
        </div>
        <div className={s.case}>
          <small>Volume</small>
          <b>{m3(v)}</b>
          <span>{c.capacite ? `sur ${m3(c.capacite)} · ${Math.round(j.pct ?? 0)} %` : "sans limite de volume"}</span>
        </div>
        <div className={s.case}>
          <small>Statut</small>
          <b>{c.verrouilleeLe ? "Validée" : "Non validée"}</b>
          <span>{c.verrouilleeLe ? `le ${horodatage(c.verrouilleeLe)}${c.verrouilleePar ? `, ${c.verrouilleePar}` : ""}` : "peut encore évoluer"}</span>
        </div>
      </section>
      {c.capacite && (
        <div className={`${s.jauge} ${j.etat === "depasse" ? s.depasse : ""}`}>
          <i style={{ width: `${Math.min(100, j.pct ?? 0)}%` }} />
        </div>
      )}
      <h2 className={s.titre}>
        Clients · {lignes.length}
        <em>dans l&apos;ordre de {c.genre === "conteneur" ? "la liste" : "livraison"}</em>
      </h2>
      {lignes.length === 0 ? (
        <p className={s.vide}>Aucun client dans cette colonne.</p>
      ) : (
        <table className={s.table}>
          <thead>
            <tr>
              <th>N°</th>
              <th>Client</th>
              <th>Destination</th>
              <th className={s.n}>Volume</th>
              <th>Remarques</th>
              <th>Dossier</th>
              <th className={s.visa}>Visa</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={l.id}>
                <td>
                  <span className={s.rang}>{i + 1}</span>
                </td>
                <td className={s.colClient}>
                  <span className={s.client}>{l.client}</span>
                  {l.telephone && <div className={s.petit}>{l.telephone}</div>}
                </td>
                <td className={s.colLieu}>
                  {l.ville ?? "—"}
                  {l.pays && <div className={s.petit}>{l.pays}</div>}
                </td>
                <td className={s.n}>{m3(l.volume)}</td>
                <td className={s.petit}>{l.remarques ?? ""}</td>
                <td className={s.petit}>{l.dossierRef ?? ""}</td>
                <td className={s.visa}>
                  <span />
                </td>
              </tr>
            ))}
            <tr className={s.total}>
              <td />
              <td>Total</td>
              <td>
                {lignes.length} client{lignes.length > 1 ? "s" : ""}
              </td>
              <td className={s.n}>{m3(v)}</td>
              <td colSpan={3}>{j.etat === "depasse" ? `Dépasse la capacité de ${m3(-(j.reste ?? 0))}` : c.capacite ? `Reste ${m3(j.reste)}` : ""}</td>
            </tr>
          </tbody>
        </table>
      )}
      <div className={s.notes}>Observations</div>
      <Pied plan={plan} gauche={`Édité le ${imprime}`} page={page} />
    </article>
  );
}

function Recap({ plan, imprime }: { plan: Plan; imprime: string }) {
  const colonnes = [...plan.colonnes].sort((a, b) => Number(b.genre === "conteneur") - Number(a.genre === "conteneur") || a.ordre - b.ordre);
  const tcs = colonnes.filter((c) => c.genre === "conteneur");
  const volTc = somme(plan.lignes.filter((l) => tcs.some((c) => c.id === l.colonneId)));
  const capTc = tcs.reduce((n, c) => n + (c.capacite ?? 0), 0);
  const reste = lignesDe(plan.lignes, null);
  return (
    <article className={s.feuille}>
      <Entete
        etiquette="Récapitulatif par conteneur"
        titre={plan.nom}
        sous={`${plan.sens === "export" ? "Export" : "Import"}${plan.port ? ` · ${plan.port}` : ""}${plan.dateReference ? ` · départ le ${dateLongue(plan.dateReference)}` : ""}`}
      />
      <section className={s.resume}>
        <div className={`${s.case} ${s.noire}`}>
          <small>Conteneurs</small>
          <b>
            {tcs.length} conteneur{tcs.length > 1 ? "s" : ""}
          </b>
          <span>
            {tcs.filter((c) => c.verrouilleeLe).length} validé{tcs.filter((c) => c.verrouilleeLe).length > 1 ? "s" : ""} · {tcs.filter((c) => c.taille === "20").length} × 20&apos; ·{" "}
            {tcs.filter((c) => c.taille === "40").length} × 40&apos;
          </span>
        </div>
        <div className={s.case}>
          <small>Volume chargé</small>
          <b>{m3(volTc)}</b>
          <span>
            sur {m3(capTc)}
            {capTc ? ` · ${Math.round((volTc / capTc) * 100)} %` : ""}
          </span>
        </div>
        <div className={s.case}>
          <small>Clients placés</small>
          <b>
            {plan.lignes.length - reste.length} / {plan.lignes.length}
          </b>
          <span>{m3(somme(plan.lignes))} au total</span>
        </div>
        <div className={s.case}>
          <small>À répartir</small>
          <b>{reste.length}</b>
          <span>{reste.length ? m3(somme(reste)) : "tout est placé"}</span>
        </div>
      </section>

      <h2 className={s.titre}>Synthèse</h2>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Colonne</th>
            <th>Destination</th>
            <th>Date</th>
            <th className={s.n}>Clients</th>
            <th className={s.n}>Volume</th>
            <th>Remplissage</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {colonnes.map((c) => {
            const ls = lignesDe(plan.lignes, c.id);
            const v = somme(ls);
            const j = jauge(v, c.capacite);
            return (
              <tr key={c.id}>
                <td className={s.colClient}>
                  <span className={s.client}>{c.libelle}</span>
                  <div className={s.petit}>
                    {GENRES[c.genre].nom}
                    {c.taille ? ` ${c.taille} pieds` : ""}
                    {c.conteneur ? ` · ${c.conteneur.numero}` : ""}
                  </div>
                </td>
                <td>{c.zone ?? "—"}</td>
                <td className={s.nowrap}>{c.jour ? dateCourte(c.jour) : "—"}</td>
                <td className={s.n}>{ls.length}</td>
                <td className={s.n}>{m3(v)}</td>
                <td className={s.nowrap}>
                  {c.capacite ? (
                    <>
                      <span className={`${s.barre} ${j.etat === "depasse" ? s.depasse : ""}`}>
                        <i style={{ width: `${Math.min(100, j.pct ?? 0)}%` }} />
                      </span>
                      {Math.round(j.pct ?? 0)} %<div className={s.petit}>sur {m3(c.capacite)}</div>
                    </>
                  ) : (
                    "sans limite"
                  )}
                </td>
                <td>
                  <span className={`${s.statut} ${c.verrouilleeLe ? s.valide : ""}`}>{c.verrouilleeLe ? "Validé" : "Ouvert"}</span>
                </td>
              </tr>
            );
          })}
          <tr className={s.total}>
            <td>Total</td>
            <td />
            <td />
            <td className={s.n}>{plan.lignes.length - reste.length}</td>
            <td className={s.n}>{m3(somme(plan.lignes) - somme(reste))}</td>
            <td colSpan={2}>{reste.length ? `${reste.length} client${reste.length > 1 ? "s" : ""} à répartir (${m3(somme(reste))})` : "Tous les clients sont placés"}</td>
          </tr>
        </tbody>
      </table>

      <h2 className={s.titre}>Détail par colonne</h2>
      {colonnes.map((c) => {
        const ls = lignesDe(plan.lignes, c.id);
        return (
          <div key={c.id} className={s.bloc}>
            <h3>
              {c.libelle}
              <span>
                {ls.length} client{ls.length > 1 ? "s" : ""} · {m3(somme(ls))}
              </span>
            </h3>
            {ls.length ? (
              <table className={s.table}>
                <tbody>
                  {ls.map((l, i) => (
                    <tr key={l.id}>
                      <td style={{ width: "8mm" }}>{i + 1}</td>
                      <td>
                        <span className={s.client}>{l.client}</span>
                      </td>
                      <td>{[l.ville, l.pays].filter(Boolean).join(", ")}</td>
                      <td className={s.n}>{m3(l.volume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className={s.petit}>Aucun client.</p>
            )}
          </div>
        );
      })}
      <Pied plan={plan} gauche={`Édité le ${imprime}`} page="Récapitulatif" />
    </article>
  );
}

export default async function ImprimerDispatch({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string; colonne?: string }> }) {
  const u = await currentUser();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const plan = await lirePlan(Number(id));
  if (!plan) notFound();
  const imprime = `${horodatage(new Date())} par ${u.nom}`;
  const colonnes = sp.colonne ? plan.colonnes.filter((c) => String(c.id) === sp.colonne) : plan.colonnes;
  if (sp.doc !== "recap" && sp.colonne && colonnes.length === 0) notFound();

  return (
    <>
      <style>{"body{background:#ececec;overflow:auto;height:auto}@page{size:A4;margin:0}@media print{body{background:#fff}}"}</style>
      <div className="pdf-bar">
        <Link href={`/conteneurs/dispatch/${plan.id}`}>← Retour au planning</Link>
        <span style={{ color: "#77738f", fontSize: 13 }}>
          {sp.doc === "recap" ? "Récapitulatif par conteneur" : `${colonnes.length} feuille${colonnes.length > 1 ? "s" : ""}`} · « Enregistrer en PDF » dans la fenêtre d&apos;impression
        </span>
        <PrintButton />
      </div>
      {sp.doc === "recap" ? (
        <Recap plan={plan} imprime={imprime} />
      ) : colonnes.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center" }}>Ce plan n&apos;a encore aucune colonne à imprimer.</div>
      ) : (
        colonnes.map((c, i) => (
          <FeuilleColonne key={c.id} plan={plan} c={c} lignes={lignesDe(plan.lignes, c.id)} imprime={imprime} page={`Feuille ${i + 1} sur ${colonnes.length}`} />
        ))
      )}
    </>
  );
}
