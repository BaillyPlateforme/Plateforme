import Link from "next/link";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import { Icone, type NomIcone } from "@/ui/icones";
import { AvecMenu } from "@/ui/MenuVertical";
import { etatEnvois } from "@/lib/envois";
import { currentUser } from "@/crm/lib/auth";
import { jourParis } from "@/crm/envois";
import { lignesCatalogue, raisonDeNePasEnvoyer } from "@/crm/messages/catalogue";
import { duesPourLaVeille, relancesEtRegles } from "@/crm/relances/moteur";
import {
  CANAUX, COLONNES, creneauEnClair, delaiEnClair, FAMILLES, jourIso, libelleCanal, plus, RELANCES,
  type Relance, type TypeRelance,
} from "@/crm/relances/regles";
import { enteteDossier, historiqueRelances, mesurerEffet } from "@/crm/relances/suivi";
import { Colonnes, type Point } from "@/crm/relances/Graphiques";
import { dossierDuFiltre, IconeCanal, lienRelances, MenuRelances } from "@/crm/relances/Section";
import s from "@/crm/relances/relances.module.css";

export const dynamic = "force-dynamic";

const jourCourt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
const jourLong = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const jourCarte = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

/**
 * Le tableau de bord des relances, page d'entrée de la section : ce qui va
 * partir, ce qui attend, ce qui est parti, et ce qu'on en sait. Filtres (type,
 * horizon des prévisions) dans la rangée du bas du bandeau ; `?dossier=`
 * garde le dossier ouvert.
 */
export default async function TableauRelances({ searchParams }: { searchParams: Promise<{ type?: string; dossier?: string; horizon?: string }> }) {
  await currentUser();
  const sp = await searchParams;
  const dossier = dossierDuFiltre(sp.dossier);
  const type = RELANCES.some((r) => r.type === sp.type) ? (sp.type as TypeRelance) : null;
  const horizon = sp.horizon === "30" ? 30 : 14;
  const aujourdhui = jourParis();

  const [{ relances: toutes, regles }, histoTout, cartes, ouvert] = await Promise.all([
    relancesEtRegles(aujourdhui), historiqueRelances(), lignesCatalogue(), enteteDossier(dossier),
  ]);
  const garder = <T extends { type: string; dossierId: number | null }>(l: T[]) => l.filter((r) => (!type || r.type === type) && (!dossier || r.dossierId === dossier));
  const relances = garder(toutes);
  const histo = garder(histoTout);
  const effets = await mesurerEffet(histo);
  const envoi = etatEnvois();

  const col = (c: Relance["colonne"]) => relances.filter((r) => r.colonne === c);
  const avenir = col("avenir");
  const j7 = avenir.filter((r) => r.prevue <= plus(aujourdhui, 7)).length;
  const j30 = avenir.filter((r) => r.prevue <= plus(aujourdhui, 30)).length;
  const veille = duesPourLaVeille(relances, regles, new Date(`${aujourdhui}T16:00:00Z`));
  const envoyees = col("envoyee");
  const tentatives = histo.flatMap((l) => l.canaux.map((c) => ({ ...c, date: l.date })));
  const reussis = tentatives.filter((t) => t.famille === "reussi").length;
  const retenus = tentatives.filter((t) => t.famille === "garde_fou").length;
  const enCours = (r: Relance) => ["avenir", "aujourdhui", "retard"].includes(r.colonne);

  const lien = (chemin: string, p: Record<string, string | number | null | undefined> = {}) => lienRelances(chemin, dossier, p);
  const kanban = (ancre?: string) => `${lien("/relances/kanban", { type })}${ancre ? `#${ancre}` : ""}`;

  // Les prévisions jour par jour, par type (ordre fixe des couleurs).
  const series = RELANCES.filter((d) => !type || d.type === type).map((d) => ({ cle: d.type, libelle: d.libelle, couleur: d.couleur }));
  const previsions: Point[] = Array.from({ length: horizon }, (_, i) => {
    const jour = plus(aujourdhui, i);
    const valeurs: Record<string, number> = {};
    for (const r of relances) if ((r.colonne === "avenir" || r.colonne === "aujourdhui") && r.prevue === jour) valeurs[r.type] = (valeurs[r.type] ?? 0) + 1;
    return { cle: jour, etiquette: horizon > 14 ? String(Number(jour.slice(8))) : jourCourt(jour), detail: jourLong(jour), valeurs, fond: jourIso(jour) >= 6, aujourdhui: i === 0 };
  });
  // L'historique des envois, 30 jours, par issue.
  const debutHisto = plus(aujourdhui, -29);
  const historique: Point[] = Array.from({ length: 30 }, (_, i) => {
    const jour = plus(debutHisto, i);
    const valeurs: Record<string, number> = {};
    for (const t of tentatives) if (jourParis(new Date(t.date)) === jour) valeurs[t.famille] = (valeurs[t.famille] ?? 0) + 1;
    return { cle: jour, etiquette: String(Number(jour.slice(8))), detail: jourLong(jour), valeurs, fond: jourIso(jour) >= 6, aujourdhui: jour === aujourdhui };
  });
  const tentatives30 = tentatives.filter((t) => jourParis(new Date(t.date)) >= debutHisto);

  const tuiles: { libelle: string; valeur: number; sous: string; icone: NomIcone; ton: string; ombre: string; href: string }[] = [
    { libelle: "Aujourd'hui", valeur: col("aujourdhui").length, sous: `${veille.dues.length} partiront à la veille de ce soir`, icone: "horloge", ton: "linear-gradient(135deg,#7a52ff,#b9a8ff)", ombre: "rgba(122,82,255,.8)", href: kanban("col-aujourdhui") },
    { libelle: "7 prochains jours", valeur: j7, sous: "hors aujourd'hui", icone: "calendrier", ton: "linear-gradient(135deg,#4b2fe0,#7a52ff)", ombre: "rgba(75,47,224,.8)", href: kanban("col-avenir") },
    { libelle: "30 prochains jours", valeur: j30, sous: `${avenir.length} à venir en tout`, icone: "tendance", ton: "linear-gradient(135deg,#2e1f9e,#4b2fe0)", ombre: "rgba(46,31,158,.8)", href: kanban("col-avenir") },
    { libelle: "En retard", valeur: col("retard").length, sous: veille.enAttente ? `${veille.enAttente} attendent une décision` : "rattrapées par la veille sous 3 jours", icone: "cloche", ton: "linear-gradient(135deg,#e1306c,#ff6b9a)", ombre: "rgba(225,48,108,.8)", href: kanban("col-retard") },
    { libelle: "Envoyées", valeur: envoyees.length, sous: `${reussis} message${reussis > 1 ? "s" : ""} parti${reussis > 1 ? "s" : ""} · ${retenus} retenu${retenus > 1 ? "s" : ""}`, icone: "coche", ton: "linear-gradient(135deg,#10a86b,#14c27d)", ombre: "rgba(16,168,107,.8)", href: lien("/relances/historique", { type }) },
    { libelle: "Désactivées", valeur: col("desactivee").length, sous: "règle, carte, exclusion ou annulation", icone: "reglages", ton: "linear-gradient(135deg,#8b889c,#b8b5c6)", ombre: "rgba(110,106,128,.6)", href: kanban("col-desactivee") },
  ];

  const dues = col("aujourdhui").length + col("retard").length;
  return (
    <div className="view">
      <Bandeau
        surtitre={ouvert ? `Commercial · Relances · ${ouvert.ref}${ouvert.client ? ` · ${ouvert.client}` : ""}` : "Commercial · Relances"}
        titre="Tableau de bord des relances"
        texte={dues ? `${dues} relance${dues > 1 ? "s" : ""} à faire aujourd’hui ou en retard` : "Aucune relance à faire aujourd’hui"}
        etiquettes={[`Envoi : ${envoi.libelle.toLowerCase()}`, "Délais provisoires"]}
        bas={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Pilules
              label="Type de relance"
              items={[
                { href: lien("/relances", { horizon: horizon === 30 ? 30 : null }), label: "Toutes", actif: !type },
                ...RELANCES.map((d) => ({ href: lien("/relances", { type: d.type, horizon: horizon === 30 ? 30 : null }), label: d.libelle, actif: type === d.type })),
              ]}
            />
            <Pilules
              label="Horizon des prévisions"
              items={[
                { href: lien("/relances", { type }), label: "14 jours", actif: horizon === 14 },
                { href: lien("/relances", { type, horizon: 30 }), label: "30 jours", actif: horizon === 30 },
              ]}
            />
          </div>
        }
      >
        {dossier && <Link href={`/dossiers/${dossier}`} data-ton="contour">Fiche du dossier</Link>}
        {dossier && <Link href="/relances" data-ton="contour">Toutes les relances</Link>}
        <Link href={kanban()} data-ton="plein">Ouvrir le Kanban</Link>
      </Bandeau>

      <AvecMenu menu={<MenuRelances page="bord" dossier={dossier} aFaire={dues} />}>
        <div className={s.page}>
          <div className={s.tuiles}>
            {tuiles.map((t) => (
              <Link key={t.libelle} href={t.href} className={s.tuile}>
                <span className={s.tuileIcone} style={{ ["--ton" as string]: t.ton, ["--ombre" as string]: t.ombre }}>
                  <Icone nom={t.icone} taille={17} />
                </span>
                <span className={s.tuileLibelle}>{t.libelle}</span>
                <span className={s.tuileValeur}>{t.valeur}</span>
                <span className={s.tuileSous}>{t.sous}</span>
              </Link>
            ))}
          </div>

          <div className={s.grille}>
            <section className={`${s.carte} ${s.c8}`}>
              <div className={s.carteTete}>
                <div>
                  <p className={s.surtitre}>Prévisions · {horizon} jours</p>
                  <h2 className={s.titre}>Relances prévues, jour par jour</h2>
                  <p className={s.sous}>
                    Les relances calculées par les règles en vigueur, à partir d’aujourd’hui.
                    {col("retard").length ? ` S’y ajoutent ${col("retard").length} relance${col("retard").length > 1 ? "s" : ""} en retard.` : ""}
                  </p>
                </div>
                <Link className={s.lien} href={kanban("col-avenir")}>Kanban</Link>
              </div>
              <Colonnes series={series} points={previsions} vide={`Aucune relance prévue dans les ${horizon} prochains jours.`} />
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
                  const ouvertes = l.filter(enCours).length;
                  return (
                    <li key={d.type} className={s.typeLigne}>
                      <div className={s.typeHaut} style={{ ["--c" as string]: d.couleur }}>
                        <i />
                        <span>
                          {d.libelle} {!regles.get(d.type)?.actif && <small>· désactivée</small>}
                        </span>
                        <b>{ouvertes}</b>
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

            <section className={`${s.carte} ${s.c12}`}>
              <div className={s.carteTete}>
                <div>
                  <p className={s.surtitre}>Mini-Kanban</p>
                  <h2 className={s.titre}>Les cinq colonnes, en un coup d’œil</h2>
                </div>
                <Link className={s.lien} href={kanban()}>Ouvrir le Kanban</Link>
              </div>
              <div className={s.mini}>
                {COLONNES.map((c) => {
                  const l = col(c.cle);
                  const premieres = c.cle === "envoyee" ? [...l].sort((a, b) => (b.envoyeeLe ?? "").localeCompare(a.envoyeeLe ?? "")) : l;
                  return (
                    <div key={c.cle} className={s.miniCol} style={{ ["--c" as string]: c.couleur }}>
                      <Link href={kanban(`col-${c.cle}`)} className={s.miniTete}>
                        <i />
                        <span>{c.titre}</span>
                        <b>{l.length}</b>
                      </Link>
                      {l.length === 0 && <p className={s.miniVide}>{c.vide}</p>}
                      {premieres.slice(0, 3).map((r) => (
                        <Link
                          key={r.cle}
                          href={`${lienRelances("/relances/kanban", r.dossierId)}#${r.cle}`}
                          className={s.miniCarte}
                          style={{ ["--c" as string]: RELANCES.find((d) => d.type === r.type)!.couleur }}
                        >
                          <b>{r.client || r.ref}</b>
                          <small>
                            {r.libelle} · {r.rang}/{r.sur}
                          </small>
                          <small>
                            {c.cle === "envoyee" && r.envoyeeLe ? `Partie le ${jourCarte(r.envoyeeLe.slice(0, 10))}` : c.cle === "desactivee" ? (r.motif ?? "") : `Prévue le ${jourCarte(r.prevue)}`}
                          </small>
                        </Link>
                      ))}
                      {l.length > 3 && (
                        <Link href={kanban(`col-${c.cle}`)} className={s.miniPlus}>
                          + {l.length - 3} autre{l.length - 3 > 1 ? "s" : ""}
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={`${s.carte} ${s.c8}`}>
              <div className={s.carteTete}>
                <div>
                  <p className={s.surtitre}>Historique · 30 jours</p>
                  <h2 className={s.titre}>Les envois de relances</h2>
                  <p className={s.sous}>Un message par canal : réussi, retenu par les garde-fous (envoi désactivé, recette, destinataire fictif, bac à sable) ou en échec.</p>
                </div>
                <Link className={s.lien} href={lien("/relances/historique", { type })}>Historique</Link>
              </div>
              <div className={s.chiffresGraphe}>
                {FAMILLES.map((f) => (
                  <div key={f.cle}>
                    <b>{tentatives30.filter((t) => t.famille === f.cle).length}</b>
                    <span style={{ ["--c" as string]: f.couleur }}>
                      <i />
                      {f.libelle}
                    </span>
                  </div>
                ))}
              </div>
              <Colonnes
                series={FAMILLES.map((f) => ({ cle: f.cle, libelle: f.libelle, couleur: f.couleur }))}
                points={historique}
                petit
                unite="message"
                vide="Aucun envoi de relance au journal sur les 30 derniers jours."
              />
            </section>

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
                      <p>
                        {e.mesurable
                          ? `${e.texte}${e.delaiMedian != null ? ` · délai médian ${e.delaiMedian} j` : ""}`
                          : e.texte}
                      </p>
                    </li>
                  ))}
              </ul>
              <p className={s.mise}>
                Seuls comptent les envois réellement partis (statut « envoyé »). Un dossier réglé après une relance ne l’a pas forcément été grâce à elle : c’est une
                corrélation, pas une preuve.
              </p>
            </section>

            <section className={`${s.carte} ${s.c12}`}>
              <div className={s.carteTete}>
                <div>
                  <p className={s.surtitre}>Règles en vigueur</p>
                  <h2 className={s.titre}>Ce qui déclenche chaque relance</h2>
                  <p className={s.sous}>Délais provisoires, à fixer avec Bailly : ils se règlent dans la configuration.</p>
                </div>
                <Link className={s.lien} href={lien("/relances/configuration")}>Configurer</Link>
              </div>
              <div className={s.resumes}>
                {RELANCES.map((d) => {
                  const g = regles.get(d.type)!;
                  return (
                    <Link key={d.type} href={`${lien("/relances/configuration")}#${d.type}`} className={s.resume} data-actif={g.actif} style={{ ["--c" as string]: d.couleur }}>
                      <header>
                        <i />
                        {d.libelle}
                      </header>
                      <span className="puce-ligne">
                        <span className={s.puce} data-ton={g.actif ? "ok" : "neutre"}>
                          <i />
                          {g.actif ? "Active" : "Désactivée"}
                        </span>
                      </span>
                      <p>{delaiEnClair(d, g)}</p>
                      <p>{creneauEnClair(g)}</p>
                      <p>
                        {g.canaux
                          .map((k) => `${libelleCanal(k)} : ${raisonDeNePasEnvoyer(cartes.get(d.cartes[k]) ?? null) ? (cartes.get(d.cartes[k])?.corps.trim() ? "carte désactivée" : "texte à valider") : "prêt"}`)
                          .join(" · ")}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </AvecMenu>
    </div>
  );
}
