import Link from "next/link";
import { Suspense } from "react";
import Bandeau from "@/ui/Bandeau";
import { Icone } from "@/ui/icones";
import { AvecMenu } from "@/ui/MenuVertical";
import { currentUser } from "@/crm/lib/auth";
import { jourParis } from "@/crm/envois";
import { listerRelances } from "@/crm/relances/moteur";
import { CANAUX, FAMILLES, libelleCanal, plus, RELANCES, STATUT_ENVOI } from "@/crm/relances/regles";
import { enteteDossier, historiqueRelances } from "@/crm/relances/suivi";
import Filtres from "@/crm/relances/Filtres";
import { dossierDuFiltre, IconeCanal, MenuRelances } from "@/crm/relances/Section";
import s from "@/crm/relances/relances.module.css";

export const dynamic = "force-dynamic";

const PERIODES = [
  { valeur: "7", libelle: "7 derniers jours" },
  { valeur: "30", libelle: "30 derniers jours" },
  { valeur: "90", libelle: "90 derniers jours" },
  { valeur: "365", libelle: "12 derniers mois" },
];
const LIMITE = 300;

/**
 * L'historique des relances parties ou tentées : une ligne par relance, avec
 * l'issue de chaque canal (réussi, retenu par les garde-fous, en échec).
 * Filtres dans la rangée du bas du bandeau ; `?dossier=` garde le dossier.
 */
export default async function HistoriqueRelances({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string; type?: string; canal?: string; issue?: string; periode?: string; origine?: string }>;
}) {
  await currentUser();
  const sp = await searchParams;
  const dossier = dossierDuFiltre(sp.dossier);
  const aujourdhui = jourParis();
  const periode = PERIODES.some((p) => p.valeur === sp.periode) ? Number(sp.periode) : null;
  const [toutes, relances, ouvert] = await Promise.all([historiqueRelances(periode ? plus(aujourdhui, -periode + 1) : undefined), listerRelances(aujourdhui), enteteDossier(dossier)]);
  const lignes = toutes.filter(
    (l) =>
      (!dossier || l.dossierId === dossier) &&
      (!sp.type || l.type === sp.type) &&
      (!sp.canal || l.canaux.some((c) => c.canal === sp.canal)) &&
      (!sp.issue || l.famille === sp.issue) &&
      (!sp.origine || l.origine === sp.origine),
  );
  const compte = (f: string) => lignes.filter((l) => l.famille === f).length;
  const dues = relances.filter((r) => (!dossier || r.dossierId === dossier) && (r.colonne === "aujourdhui" || r.colonne === "retard")).length;

  return (
    <div className="view">
      <Bandeau
        surtitre={ouvert ? `Commercial · Relances · ${ouvert.ref}${ouvert.client ? ` · ${ouvert.client}` : ""}` : "Commercial · Relances"}
        titre="Historique des relances"
        texte={`${lignes.length} relance${lignes.length > 1 ? "s" : ""} partie${lignes.length > 1 ? "s" : ""} ou tentée${lignes.length > 1 ? "s" : ""}${periode ? ` · ${PERIODES.find((p) => Number(p.valeur) === periode)!.libelle}` : ""}`}
        bas={
          <Suspense>
            <Filtres
              filtres={[
                { cle: "periode", libelle: "Toute la période", options: PERIODES },
                { cle: "type", libelle: "Tous les types", options: RELANCES.map((d) => ({ valeur: d.type, libelle: d.libelle })) },
                { cle: "canal", libelle: "Tous les canaux", options: CANAUX.map((c) => ({ valeur: c.cle, libelle: c.libelle })) },
                { cle: "issue", libelle: "Toutes les issues", options: FAMILLES.map((f) => ({ valeur: f.cle, libelle: f.libelle })) },
                { cle: "origine", libelle: "Veille et équipe", options: [{ valeur: "veille", libelle: "Par la veille" }, { valeur: "equipe", libelle: "Par l’équipe" }] },
              ]}
            />
          </Suspense>
        }
      >
        {dossier && <Link href={`/dossiers/${dossier}`} data-ton="contour">Fiche du dossier</Link>}
        {dossier && <Link href="/relances/historique" data-ton="contour">Tout l’historique</Link>}
        <Link href="/dashboard/envois" data-ton="contour">Journal des envois</Link>
      </Bandeau>
      <AvecMenu menu={<MenuRelances page="historique" dossier={dossier} aFaire={dues} />}>
        <div className={s.page}>
          <div className={s.bilan}>
            <div style={{ ["--c" as string]: "linear-gradient(135deg,#4b2fe0,#7a52ff)" }}>
              <i>
                <Icone nom="horloge" taille={17} />
              </i>
              <b>{lignes.length}</b>
              <small>relances au total</small>
            </div>
            {FAMILLES.map((f) => (
              <div key={f.cle} style={{ ["--c" as string]: f.couleur }}>
                <i>
                  <Icone nom={f.cle === "reussi" ? "coche" : f.cle === "garde_fou" ? "cloche" : "sortie"} taille={17} />
                </i>
                <b>{compte(f.cle)}</b>
                <small>{f.libelle.toLowerCase()}</small>
              </div>
            ))}
          </div>

          <section className={s.carte} style={{ padding: 0, overflow: "hidden" }}>
            {lignes.length === 0 ? (
              <div className={s.vide} style={{ margin: 20 }}>
                Aucune relance partie ou tentée{sp.type || sp.canal || sp.issue || sp.origine || periode ? " pour ces filtres" : ""}. Les relances apparaissent ici dès leur premier envoi, par la veille ou depuis le Kanban.
              </div>
            ) : (
              <table className={s.tableau}>
                <thead>
                  <tr>
                    <th>Quand</th>
                    <th>Dossier</th>
                    <th>Relance</th>
                    <th>Canaux et issue</th>
                    <th>Par</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.slice(0, LIMITE).map((l) => {
                    const def = RELANCES.find((d) => d.type === l.type)!;
                    const d = new Date(l.date);
                    return (
                      <tr key={l.cle}>
                        <td>
                          <b>{d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" })}</b>
                          <small>{d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}</small>
                        </td>
                        <td>
                          {l.dossierId ? (
                            <Link href={`/dossiers/${l.dossierId}`}>
                              <b>{l.client || l.ref}</b>
                              <small>{l.ref}</small>
                            </Link>
                          ) : (
                            <>
                              <b>{l.ref || "—"}</b>
                              <small>dossier introuvable</small>
                            </>
                          )}
                        </td>
                        <td>
                          <span className={s.typeBadge} style={{ ["--c" as string]: def.couleur }}>
                            <i />
                            {def.libelle}
                          </span>
                          <small>
                            relance {l.rang}
                            {l.envoyee ? "" : " · non inscrite comme partie"}
                          </small>
                        </td>
                        <td>
                          <div className={s.issues}>
                            {l.canaux.map((c) => (
                              <span key={c.canal} className={s.issue} data-famille={c.famille} title={c.motif ?? undefined}>
                                <IconeCanal canal={c.canal} />
                                {libelleCanal(c.canal)} · {STATUT_ENVOI[c.statut]?.libelle ?? c.statut}
                              </span>
                            ))}
                          </div>
                          {l.canaux.find((c) => c.motif) && <small style={{ marginTop: 4 }}>{l.canaux.find((c) => c.motif)!.motif}</small>}
                        </td>
                        <td>
                          <b>{l.origine === "veille" ? "La veille" : (l.par ?? "L’équipe")}</b>
                          <small>{l.origine === "veille" ? "tâche planifiée" : "depuis le Kanban"}</small>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {lignes.length > LIMITE && <p className={s.aide} style={{ padding: "12px 20px" }}>Les {LIMITE} plus récentes sont affichées : affinez les filtres pour remonter plus loin.</p>}
          </section>
        </div>
      </AvecMenu>
    </div>
  );
}
