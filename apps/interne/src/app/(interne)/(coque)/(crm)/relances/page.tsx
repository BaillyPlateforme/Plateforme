import Link from "next/link";
import { Suspense } from "react";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import Filtres, { type Filtre } from "@/ui/Filtres";
import MenuVertical, { AvecMenu } from "@/ui/MenuVertical";
import type { NomIcone } from "@/ui/icones";
import { etatEnvois } from "@/lib/envois";
import { currentUser } from "@/crm/lib/auth";
import { q1 } from "@/crm/lib/db";
import { jourParis } from "@/crm/envois";
import { RATTRAPAGE_JOURS, relancesEtRegles } from "@/crm/relances/moteur";
import { CANAUX, COLONNES, FAMILLES, jourIso, libelleCanal, plus, RELANCES, STATUT_ENVOI, type Relance, type TypeRelance } from "@/crm/relances/regles";
import { enteteDossier, historiqueRelances, mesurerEffet } from "@/crm/relances/suivi";
import { Colonnes, type Point } from "@/crm/relances/Graphiques";
import Kanban, { BoutonExclusion } from "@/crm/relances/Kanban";
import { dossierDuFiltre, IconeCanal, lienRelances } from "@/crm/relances/Section";
import s from "@/crm/relances/relances.module.css";

export const dynamic = "force-dynamic";

type Vue = "kanban" | "previsions" | "historique";
const VUES: { cle: Vue; libelle: string; icone: NomIcone }[] = [
  { cle: "kanban", libelle: "Kanban", icone: "kanban" },
  { cle: "previsions", libelle: "Prévisions", icone: "calendrier" },
  { cle: "historique", libelle: "Historique", icone: "horloge" },
];
const PERIODES = [
  { valeur: "7", libelle: "7 derniers jours" },
  { valeur: "30", libelle: "30 derniers jours" },
  { valeur: "90", libelle: "90 derniers jours" },
  { valeur: "365", libelle: "12 derniers mois" },
];
const LIMITE = 300;

const jourCourt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
const jourLong = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/**
 * Les relances, en une page (simplification du 08/11/2026 : le tableau de
 * bord, le Kanban et l'historique fusionnés). Trois vues au menu de gauche
 * (choix de David, 08/11/2026 : les vues à gauche, les filtres dans la bande) :
 * - le Kanban (par défaut) : à venir, aujourd'hui, en retard, envoyées,
 *   désactivées ; le bandeau en dit l'essentiel en une ligne ;
 * - les prévisions : les relances prévues jour par jour, par type et par canal ;
 * - l'historique : les relances parties ou tentées, puis les envois des 30
 *   derniers jours et ce que les relances ont donné.
 * Les filtres sont des listes déroulantes dans la rangée du bas du bandeau ;
 * `?dossier=` garde le dossier ouvert. Les règles et les alertes sont dans
 * Réglages.
 */
export default async function Relances({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; type?: string; dossier?: string; horizon?: string; periode?: string; canal?: string; issue?: string; origine?: string }>;
}) {
  await currentUser();
  const sp = await searchParams;
  const vue: Vue = VUES.some((v) => v.cle === sp.vue) ? (sp.vue as Vue) : "kanban";
  const dossier = dossierDuFiltre(sp.dossier);
  const type = RELANCES.some((r) => r.type === sp.type) ? (sp.type as TypeRelance) : null;
  const horizon = sp.horizon === "30" ? 30 : 14;
  const aujourdhui = jourParis();

  const [{ relances: toutes, regles }, ouvert, exclu, histoTout] = await Promise.all([
    relancesEtRegles(aujourdhui),
    enteteDossier(dossier),
    dossier ? q1("select 1 from relances_exclusions where dossier_id=$1 and type='*'", [dossier]) : Promise.resolve(undefined),
    vue === "kanban" ? Promise.resolve([]) : historiqueRelances(),
  ]);
  const duDossier = toutes.filter((r) => !dossier || r.dossierId === dossier);
  const relances = duDossier.filter((r) => !type || r.type === type);
  const col = (c: Relance["colonne"]) => relances.filter((r) => r.colonne === c);
  const dues = col("aujourdhui").length + col("retard").length;
  const j7 = col("avenir").filter((r) => r.prevue <= plus(aujourdhui, 7)).length;
  const envoi = etatEnvois();

  const lien = (p: Record<string, string | number | null | undefined> = {}) => lienRelances("/relances", dossier, { vue: vue === "kanban" ? null : vue, type, ...p });

  // ── L'historique : les relances parties ou tentées (filtres de la vue Historique) ──
  const histo = histoTout.filter((l) => (!dossier || l.dossierId === dossier) && (!type || l.type === type));
  const periode = PERIODES.some((p) => p.valeur === sp.periode) ? Number(sp.periode) : null;
  const debutPeriode = periode ? plus(aujourdhui, -periode + 1) : null;
  // Tous les filtres sauf l'issue : la liste des issues en donne le compte, comme le faisaient les tuiles de l'ancien historique.
  const avantIssue =
    vue === "historique"
      ? histo.filter(
          (l) =>
            (!debutPeriode || jourParis(new Date(l.date)) >= debutPeriode) &&
            (!sp.canal || l.canaux.some((c) => c.canal === sp.canal)) &&
            (!sp.origine || l.origine === sp.origine),
        )
      : [];
  const lignes = avantIssue.filter((l) => !sp.issue || l.famille === sp.issue);
  const tentatives = histo.flatMap((l) => l.canaux.map((c) => ({ ...c, date: l.date })));
  const effets = vue === "historique" ? await mesurerEffet(histo) : [];

  // ── Le bandeau ──
  // Un seul titre pour les trois vues : changer de vue ne change pas de page (David) ; la vue est au menu.
  const titre = "Relances";
  const texte =
    vue === "historique"
      ? `${pluriel(lignes.length, "relance")} partie${lignes.length > 1 ? "s" : ""} ou tentée${lignes.length > 1 ? "s" : ""}${periode ? ` · ${PERIODES.find((p) => Number(p.valeur) === periode)!.libelle}` : ""}`
      : `${dues ? `${pluriel(dues, "relance")} à faire aujourd’hui ou en retard` : "Aucune relance à faire aujourd’hui"} · ${j7} dans les 7 prochains jours`;

  // Le Kanban porte le nombre des relances à faire aujourd'hui ou en retard (celui du bandeau).
  const menu = (
    <MenuVertical
      titre="Relances"
      groupes={[
        {
          items: VUES.map((v) => ({
            href: lienRelances("/relances", dossier, { vue: v.cle === "kanban" ? null : v.cle, type }),
            label: v.libelle,
            icone: v.icone,
            actif: vue === v.cle,
            nombre: v.cle === "kanban" ? dues : undefined,
          })),
        },
      ]}
    />
  );
  const parType = (n: (t: TypeRelance) => number | null): Filtre => ({
    cle: "type",
    libelle: "Tous les types",
    options: RELANCES.map((d) => {
      const nombre = n(d.type);
      return { valeur: d.type, libelle: nombre == null ? d.libelle : `${d.libelle} · ${nombre}` };
    }),
  });
  const filtres: Filtre[] =
    vue === "historique"
      ? [
          { cle: "periode", libelle: "Toute la période", options: PERIODES },
          parType(() => null),
          { cle: "canal", libelle: "Tous les canaux", options: CANAUX.map((c) => ({ valeur: c.cle, libelle: c.libelle })) },
          { cle: "issue", libelle: "Toutes les issues", options: FAMILLES.map((f) => ({ valeur: f.cle, libelle: `${f.libelle} · ${avantIssue.filter((l) => l.famille === f.cle).length}` })) },
          { cle: "origine", libelle: "Veille et équipe", options: [{ valeur: "veille", libelle: "Par la veille" }, { valeur: "equipe", libelle: "Par l’équipe" }] },
        ]
      : [parType((t) => (vue === "kanban" ? duDossier.filter((r) => r.type === t).length : null))];

  return (
    <div className="view">
      <Bandeau
        surtitre={ouvert ? `Dossiers · Relances · ${ouvert.ref}${ouvert.client ? ` · ${ouvert.client}` : ""}` : "Dossiers · Relances"}
        titre={titre}
        texte={texte}
        etiquettes={[vue !== "historique" && `Envoi : ${envoi.libelle.toLowerCase()}`, vue !== "historique" && "Délais provisoires", exclu ? "Dossier marqué « ne pas relancer »" : null]}
        bas={
          <div className={s.basBandeau}>
            {/* Les filtres lisent l'adresse côté navigateur : une frontière Suspense. */}
            <Suspense>
              <Filtres filtres={filtres} garder={["dossier", "vue", "horizon"]} />
            </Suspense>
            {vue === "previsions" && (
              <Pilules
                label="Horizon des prévisions"
                items={[
                  { href: lien({ horizon: null }), label: "14 jours", actif: horizon === 14 },
                  { href: lien({ horizon: 30 }), label: "30 jours", actif: horizon === 30 },
                ]}
              />
            )}
          </div>
        }
      >
        {dossier && <Link href={`/dossiers/${dossier}`} data-ton="contour">Fiche du dossier</Link>}
        {dossier && <BoutonExclusion dossierId={dossier} exclu={!!exclu} />}
        {dossier && <Link href={lienRelances("/relances", null, { vue: vue === "kanban" ? null : vue })} data-ton="contour">Toutes les relances</Link>}
      </Bandeau>

      <AvecMenu menu={menu}>
        <div className={s.page}>
          {vue === "kanban" && <Kanban relances={relances} aujourdhui={aujourdhui} borneRattrapage={plus(aujourdhui, -RATTRAPAGE_JOURS)} />}
          {vue === "previsions" && <Previsions relances={relances} regles={regles} tentatives={tentatives} type={type} horizon={horizon} aujourdhui={aujourdhui} />}
          {vue === "historique" && (
            <>
              <TableHistorique lignes={lignes} filtre={!!(sp.type || sp.canal || sp.issue || sp.origine || periode)} />
              <div className={s.grille}>
                <EnvoisTrenteJours tentatives={tentatives} aujourdhui={aujourdhui} />
                <section className={`${s.carte} ${s.c4}`}>
                  <div className={s.carteTete}>
                    <div>
                      <p className={s.surtitre}>Effet</p>
                      <h2 className={s.titre}>Ce que les relances ont donné</h2>
                    </div>
                  </div>
                  <ul className={s.effets}>
                    {effets
                      .filter((e) => !type || e.type === type)
                      .map((e) => (
                        <li key={e.type} className={s.effet} data-mesurable={e.mesurable} style={{ ["--c" as string]: RELANCES.find((d) => d.type === e.type)!.couleur }}>
                          <i />
                          <span>{e.libelle}</span>
                          <b>{e.mesurable ? `${e.suivis} / ${e.relances}` : "—"}</b>
                          <p>{e.mesurable ? `${e.texte}${e.delaiMedian != null ? ` · délai médian ${e.delaiMedian} j` : ""}` : e.texte}</p>
                        </li>
                      ))}
                  </ul>
                  <p className={s.mise}>
                    Seuls comptent les envois réellement partis (statut « envoyé »). Un dossier réglé après une relance ne l’a pas forcément été grâce à elle : c’est une
                    corrélation, pas une preuve.
                  </p>
                </section>
              </div>
            </>
          )}
        </div>
      </AvecMenu>
    </div>
  );
}

type Tentative = { canal: string; famille: string; date: string };

/** Les prévisions : les relances prévues jour par jour, par type ; et leurs volumes, par type et par canal. */
function Previsions({
  relances,
  regles,
  tentatives,
  type,
  horizon,
  aujourdhui,
}: {
  relances: Relance[];
  regles: Awaited<ReturnType<typeof relancesEtRegles>>["regles"];
  tentatives: Tentative[];
  type: TypeRelance | null;
  horizon: number;
  aujourdhui: string;
}) {
  const retard = relances.filter((r) => r.colonne === "retard").length;
  const enCours = (r: Relance) => ["avenir", "aujourdhui", "retard"].includes(r.colonne);
  // Les prévisions jour par jour, par type (ordre fixe des couleurs).
  const series = RELANCES.filter((d) => !type || d.type === type).map((d) => ({ cle: d.type, libelle: d.libelle, couleur: d.couleur }));
  const points: Point[] = Array.from({ length: horizon }, (_, i) => {
    const jour = plus(aujourdhui, i);
    const valeurs: Record<string, number> = {};
    for (const r of relances) if ((r.colonne === "avenir" || r.colonne === "aujourdhui") && r.prevue === jour) valeurs[r.type] = (valeurs[r.type] ?? 0) + 1;
    return { cle: jour, etiquette: horizon > 14 ? String(Number(jour.slice(8))) : jourCourt(jour), detail: jourLong(jour), valeurs, fond: jourIso(jour) >= 6, aujourdhui: i === 0 };
  });
  return (
    <div className={s.grille}>
      <section className={`${s.carte} ${s.c8}`}>
        <div className={s.carteTete}>
          <div>
            <p className={s.surtitre}>Prévisions · {horizon} jours</p>
            <h2 className={s.titre}>Relances prévues, jour par jour</h2>
            <p className={s.sous}>
              Les relances calculées par les règles en vigueur, à partir d’aujourd’hui.
              {retard ? ` S’y ajoutent ${pluriel(retard, "relance")} en retard.` : ""}
            </p>
          </div>
        </div>
        <Colonnes series={series} points={points} vide={`Aucune relance prévue dans les ${horizon} prochains jours.`} />
      </section>

      <section className={`${s.carte} ${s.c4}`}>
        <div className={s.carteTete}>
          <div>
            <p className={s.surtitre}>Volumes</p>
            <h2 className={s.titre}>Par type et par canal</h2>
          </div>
        </div>
        <ul className={s.types}>
          {RELANCES.filter((d) => !type || d.type === type).map((d) => {
            const l = relances.filter((r) => r.type === d.type);
            return (
              <li key={d.type} className={s.typeLigne}>
                <div className={s.typeHaut} style={{ ["--c" as string]: d.couleur }}>
                  <i />
                  <span>
                    {d.libelle} {!regles.get(d.type)?.actif && <small>· désactivée</small>}
                  </span>
                  <b>{l.filter(enCours).length}</b>
                  <small>en cours</small>
                </div>
                <div className={s.barreSeg} role="img" aria-label={COLONNES.map((c) => `${c.titre} ${l.filter((r) => r.colonne === c.cle).length}`).join(", ")}>
                  {COLONNES.map((c) => {
                    const n = l.filter((r) => r.colonne === c.cle).length;
                    return n ? <i key={c.cle} title={`${c.titre} : ${n}`} style={{ flexGrow: n, ["--c" as string]: c.couleur }} /> : null;
                  })}
                </div>
              </li>
            );
          })}
        </ul>
        <ul className={s.legende}>
          {COLONNES.map((c) => (
            <li key={c.cle} style={{ ["--c" as string]: c.couleur }}>
              <i />
              {c.titre}
            </li>
          ))}
        </ul>
        <div className={s.canaux}>
          {CANAUX.map((c) => {
            const prevues = relances.filter((r) => enCours(r) && r.canaux.includes(c.cle)).length;
            const parties = tentatives.filter((t) => t.canal === c.cle).length;
            return (
              <div key={c.cle} className={s.canal}>
                <header>
                  <IconeCanal canal={c.cle} /> {c.libelle}
                </header>
                <b>{prevues}</b>
                <small>
                  prévue{prevues > 1 ? "s" : ""} · {parties} au journal
                </small>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** Les envois de relances des 30 derniers jours, par issue. */
function EnvoisTrenteJours({ tentatives, aujourdhui }: { tentatives: Tentative[]; aujourdhui: string }) {
  const debut = plus(aujourdhui, -29);
  const points: Point[] = Array.from({ length: 30 }, (_, i) => {
    const jour = plus(debut, i);
    const valeurs: Record<string, number> = {};
    for (const t of tentatives) if (jourParis(new Date(t.date)) === jour) valeurs[t.famille] = (valeurs[t.famille] ?? 0) + 1;
    return { cle: jour, etiquette: String(Number(jour.slice(8))), detail: jourLong(jour), valeurs, fond: jourIso(jour) >= 6, aujourdhui: jour === aujourdhui };
  });
  const trente = tentatives.filter((t) => jourParis(new Date(t.date)) >= debut);
  return (
    <section className={`${s.carte} ${s.c8}`}>
      <div className={s.carteTete}>
        <div>
          <p className={s.surtitre}>Historique · 30 jours</p>
          <h2 className={s.titre}>Les envois de relances</h2>
          <p className={s.sous}>Un message par canal : réussi, retenu par les garde-fous (envoi désactivé, recette, destinataire fictif, bac à sable) ou en échec.</p>
        </div>
      </div>
      <div className={s.chiffresGraphe}>
        {FAMILLES.map((f) => (
          <div key={f.cle}>
            <b>{trente.filter((t) => t.famille === f.cle).length}</b>
            <span style={{ ["--c" as string]: f.couleur }}>
              <i />
              {f.libelle}
            </span>
          </div>
        ))}
      </div>
      <Colonnes
        series={FAMILLES.map((f) => ({ cle: f.cle, libelle: f.libelle, couleur: f.couleur }))}
        points={points}
        petit
        unite="message"
        vide="Aucun envoi de relance au journal sur les 30 derniers jours."
      />
    </section>
  );
}

/** L'historique : une ligne par relance partie ou tentée, avec l'issue de chaque canal. */
function TableHistorique({ lignes, filtre }: { lignes: Awaited<ReturnType<typeof historiqueRelances>>; filtre: boolean }) {
  return (
    <section className={s.carte} style={{ padding: 0, overflow: "hidden" }}>
      {lignes.length === 0 ? (
        <div className={s.vide} style={{ margin: 20 }}>
          Aucune relance partie ou tentée{filtre ? " pour ces filtres" : ""}. Les relances apparaissent ici dès leur premier envoi, par la veille ou depuis le Kanban.
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
  );
}
