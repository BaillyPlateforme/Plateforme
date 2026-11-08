import Bandeau, { Pilules } from "@/ui/Bandeau";
import { statsCommerciales, type Rattachement } from "@/crm/statistiques/donnees";
import { PERIODES, PERIODE_PAR_DEFAUT, periodeDe, moisDansPeriode } from "@/crm/statistiques/periodes";
import { couleursUtilisateurs, NEUTRE, SERIES } from "@/crm/statistiques/palette";
import MenuStatistiques, { BasStatistiques } from "@/crm/statistiques/Vues";
import { AvecMenu } from "@/ui/MenuVertical";
import { TYPES_PLURIEL } from "@/crm/lib/format";
import { Carte, Grille, Note, Tuile, Tuiles } from "@/crm/statistiques/Cadre";
import { Aire, BarresClassees, Entonnoir, euros, eurosCourts, nombre, pluriel, pourcent, Repartition } from "@/crm/statistiques/Graphiques";
import u from "@/crm/exploitation/ui/ui.module.css";
import s from "@/crm/statistiques/statistiques.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Statistiques commerciales" };

/*
 * Les statistiques commerciales (Créagidem : « Stats Comm. »), par
 * commercial, sur la période choisie : une rangée de tuiles égales (chacune
 * avec son écart à la période d'avant et ses douze derniers mois), le CA
 * mois par mois contre l'année d'avant, le CA par commercial, l'entonnoir
 * des dossiers ouverts, la transformation par commercial, la répartition
 * des clients, puis le récapitulatif. Une couleur par commercial, la même
 * partout. Les calculs sont décrits dans src/crm/statistiques/donnees.ts.
 */
const part = (a: number, b: number) => (b > 0 ? a / b : null);
/** Une couleur par type de client, toujours la même (l'ordre de TYPES_PLURIEL). */
const COULEUR_CLIENT = Object.fromEntries(Object.keys(TYPES_PLURIEL).map((k, i) => [k, SERIES[i] ?? NEUTRE]));

export default async function StatistiquesCommerciales({ searchParams }: { searchParams: Promise<{ periode?: string; ca?: string }> }) {
  const sp = await searchParams;
  const periode = periodeDe(sp.periode);
  const rattachement: Rattachement = sp.ca === "demenagement" ? "demenagement" : "signature";
  const x = await statsCommerciales(periode, rattachement);
  const { lignes, totaux: t, mois, serie, mensuel, comparaison: cmp } = x;
  const couleurs = couleursUtilisateurs(x.utilisateurs);
  const couleur = (id: number | null) => couleurs.get(id) ?? NEUTRE;
  const lien = (p: { periode?: string; ca?: string }) => {
    const q = new URLSearchParams();
    const per = p.periode ?? periode.cle;
    if (per !== PERIODE_PAR_DEFAUT) q.set("periode", per);
    if ((p.ca ?? rattachement) === "demenagement") q.set("ca", "demenagement");
    return `/statistiques/commerciales${q.size ? `?${q}` : ""}`;
  };
  const retenus = mois.map((m) => moisDansPeriode(m, periode));
  const actifs = lignes.filter((l) => l.visites + l.devises + l.signes > 0);
  const totalClients = x.clients.reduce((a, c) => a + c.n, 0);
  const cohorte = x.cohorte.reduce((a, c) => ({ ouverts: a.ouverts + c.ouverts, visites: a.visites + c.visites, devises: a.devises + c.devises, signes: a.signes + c.signes }), { ouverts: 0, visites: 0, devises: 0, signes: 0 });
  const anPasse = mensuel.caAnPasse.some((v) => v > 0);
  const caLibelle = rattachement === "signature" ? "CA signé" : "CA au déménagement";
  const ecart = (avant: number | null, courant: number | null, format: (n: number) => string, plus?: { taux?: boolean; aDate?: boolean }) => ({ avant, courant, libelle: cmp.libelle, precis: cmp.precis, format, ...plus });

  return (
    <div className="view">
      <Bandeau
        surtitre="Accueil · Statistiques"
        titre="Statistiques"
        texte={`Commercial · ${periode.phrase} · CA rattaché ${rattachement === "signature" ? "à la signature" : "au déménagement"}`}
        bas={
          <BasStatistiques>
            <Pilules label="Période" items={PERIODES.map((p) => ({ href: lien({ periode: p.cle }), label: p.libelle, actif: periode.cle === p.cle }))} />
            <Pilules
              label="Rattachement du chiffre d'affaires"
              items={[
                { href: lien({ ca: "signature" }), label: "À la signature", actif: rattachement === "signature" },
                { href: lien({ ca: "demenagement" }), label: "Au déménagement", actif: rattachement === "demenagement" },
              ]}
            />
          </BasStatistiques>
        }
      />
      <AvecMenu menu={<MenuStatistiques actif="commerciales" periode={periode} />}>
        <div className={s.ecran}>
          <Tuiles>
            <Tuile
              icone="euro"
              label={`${caLibelle} (TTC)`}
              valeur={euros(t.ca)}
              detail={pluriel(t.signes, "dossier signé", "dossiers signés")}
              ecart={ecart(cmp.avant.ca, cmp.courant.ca, eurosCourts, { aDate: cmp.courant.ca !== t.ca })}
              tendance={{ valeurs: mensuel.ca, retenus, libelle: `${caLibelle}, douze derniers mois` }}
            />
            <Tuile
              icone="oeil"
              label="Visites"
              valeur={nombre(t.visites)}
              detail={pluriel(t.vd, "dossier visité", "dossiers visités")}
              ecart={ecart(cmp.avant.visites, cmp.courant.visites, nombre, { aDate: cmp.courant.visites !== t.visites })}
              tendance={{ valeurs: mensuel.visites, retenus, libelle: "Visites, douze derniers mois" }}
            />
            <Tuile
              icone="devis"
              label="Dossiers devisés"
              valeur={nombre(t.devises)}
              detail={`${pourcent(part(t.vdv, t.vd))} des visités devisés`}
              ecart={ecart(cmp.avant.devises, cmp.courant.devises, nombre)}
              tendance={{ valeurs: mensuel.devises, retenus, libelle: "Dossiers devisés, douze derniers mois" }}
            />
            <Tuile
              icone="coche"
              label="Transformation"
              valeur={pourcent(part(t.ds, t.devises))}
              detail="des devisés sont signés"
              ecart={ecart(part(cmp.avant.ds, cmp.avant.devises), part(cmp.courant.ds, cmp.courant.devises), (n) => pourcent(n), { taux: true })}
              tendance={{ valeurs: mensuel.devises.map((d, i) => (d ? mensuel.devisesSignes[i] / d : 0)), retenus, libelle: "Transformation, douze derniers mois" }}
            />
            <Tuile
              icone="caisse"
              label="Panier moyen"
              valeur={t.signes ? euros(t.ca / t.signes) : "—"}
              detail="par dossier signé"
              ecart={ecart(cmp.avant.signes ? cmp.avant.ca / cmp.avant.signes : null, cmp.courant.signes ? cmp.courant.ca / cmp.courant.signes : null, euros)}
              tendance={{ valeurs: mensuel.ca.map((c, i) => (mensuel.signes[i] ? c / mensuel.signes[i] : 0)), retenus, libelle: "Panier moyen, douze derniers mois" }}
            />
            {/* Repris du Pilotage, l'ancienne page d'accueil. */}
            <Tuile
              icone="signature"
              label="Arrhes encaissées"
              valeur={euros(x.arrhes.total)}
              detail={pluriel(x.arrhes.n, "règlement reçu", "règlements reçus")}
              ecart={ecart(cmp.avant.arrhes, cmp.courant.arrhes, eurosCourts)}
              tendance={{ valeurs: mensuel.arrhes, retenus, libelle: "Arrhes encaissées, douze derniers mois" }}
            />
          </Tuiles>

          <Grille>
            <Carte
              largeur={8}
              titre={`${caLibelle}, mois par mois`}
              sousTitre="Les douze derniers mois, TTC ; la période choisie est teintée. Au survol, la part de chaque commercial."
              pied={
                anPasse ? (
                  <>
                    En gris, le même chiffre un an plus tôt : <b>{euros(mensuel.caAnPasse.reduce((a, b) => a + b, 0))}</b> sur ces douze mois-là, contre{" "}
                    <b>{euros(mensuel.ca.reduce((a, b) => a + b, 0))}</b>.
                  </>
                ) : (
                  "Un an plus tôt, aucun devis signé dans la base : la comparaison viendra avec l'historique."
                )
              }
            >
              <Aire
                mois={mois}
                valeurs={mensuel.ca}
                libelle={caLibelle}
                comparaison={anPasse ? { libelle: "Un an plus tôt", valeurs: mensuel.caAnPasse } : undefined}
                details={(i) =>
                  lignes
                    .map((l) => ({ libelle: l.nom, couleur: couleur(l.id), valeur: serie.filter((v) => v.cid === l.id && v.mois === mois[i]).reduce((a, v) => a + v.ca, 0) }))
                    .sort((a, b) => b.valeur - a.valeur)
                }
                retenus={retenus}
                format={euros}
                formatAxe={eurosCourts}
              />
            </Carte>
            <Carte largeur={4} titre={`${caLibelle} par commercial`} sousTitre={`${periode.phrase[0].toUpperCase()}${periode.phrase.slice(1)}, TTC`} pied={t.ca > 0 ? <>Total <b>{euros(t.ca)}</b> sur {pluriel(t.signes, "dossier signé", "dossiers signés")}.</> : undefined}>
              <BarresClassees
                disposition="pile"
                format={euros}
                vide="Aucun devis signé sur la période."
                barres={actifs
                  .filter((l) => l.ca > 0)
                  .sort((a, b) => b.ca - a.ca)
                  .map((l) => ({ cle: String(l.id ?? "aucun"), libelle: l.nom, valeur: l.ca, couleur: couleur(l.id), detail: `${pluriel(l.signes, "signé")} · ${pourcent(part(l.ca, t.ca))} du total` }))}
              />
            </Carte>

            <Carte
              largeur={4}
              titre="De l'ouverture à la signature"
              sousTitre="Les dossiers ouverts sur la période : devisés depuis, signés à ce jour"
              pied={cohorte.ouverts ? <>Dont <b>{pluriel(cohorte.visites, "dossier visité", "dossiers visités")}</b> (un rendez-vous de visite ou de visio).</> : undefined}
            >
              <Entonnoir
                vide="Aucun dossier ouvert sur la période."
                etapes={[
                  { cle: "ouverts", libelle: "Ouverts", n: cohorte.ouverts },
                  { cle: "devises", libelle: "Devisés", n: cohorte.devises },
                  { cle: "signes", libelle: "Signés", n: cohorte.signes },
                ]}
              />
            </Carte>
            <Carte largeur={4} titre="Transformation par commercial" sousTitre="Dossiers devisés sur la période, signés à ce jour">
              <BarresClassees
                disposition="pile"
                format={(n) => pourcent(n)}
                vide="Aucun dossier devisé sur la période."
                barres={actifs
                  .filter((l) => l.devises > 0)
                  .sort((a, b) => (part(b.devisesSignes, b.devises) ?? 0) - (part(a.devisesSignes, a.devises) ?? 0))
                  .map((l) => ({ cle: String(l.id ?? "aucun"), libelle: l.nom, valeur: part(l.devisesSignes, l.devises) ?? 0, couleur: couleur(l.id), detail: `${nombre(l.devisesSignes)} signés sur ${nombre(l.devises)} devisés` }))}
              />
            </Carte>
            {/* Repris du Pilotage (« Répartition clients ») : les dossiers ouverts sur la période, par type de client. */}
            <Carte largeur={4} titre="Répartition clients" sousTitre="Dossiers ouverts sur la période, par type de client">
              <Repartition
                libelle="Répartition des clients"
                vide="Aucun dossier ouvert sur la période."
                parts={x.clients.map((c) => ({ cle: c.type, libelle: TYPES_PLURIEL[c.type] ?? c.type, n: c.n, couleur: COULEUR_CLIENT[c.type] ?? NEUTRE }))}
              />
            </Carte>

            <Carte largeur={12} serree titre="Récapitulatif par commercial" sousTitre={`${periode.phrase[0].toUpperCase()}${periode.phrase.slice(1)} · ${pluriel(totalClients, "dossier ouvert", "dossiers ouverts")}`}>
              <div className={u.defile}>
                <table className={u.tableau}>
                  <thead>
                    <tr>
                      <th>Commercial</th>
                      <th className={u.droite}>Visites</th>
                      <th className={u.droite}>Devisés</th>
                      <th className={u.droite}>Signés</th>
                      <th className={u.droite}>{caLibelle}</th>
                      <th className={u.droite}>Transformation</th>
                      <th className={u.droite}>Visites → devis</th>
                      <th className={u.droite}>Panier moyen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => (
                      <tr key={String(l.id)}>
                        <td>
                          <i className={s.pastilleSerie} style={{ background: couleur(l.id) }} />
                          <b>{l.nom}</b>
                        </td>
                        <td className={u.droite}>{nombre(l.visites)}</td>
                        <td className={u.droite}>{nombre(l.devises)}</td>
                        <td className={u.droite}>{nombre(l.signes)}</td>
                        <td className={u.droite}>
                          <b>{euros(l.ca)}</b>
                        </td>
                        <td className={u.droite}>{pourcent(part(l.devisesSignes, l.devises))}</td>
                        <td className={u.droite}>{pourcent(part(l.visitesDevisees, l.visitesDossiers))}</td>
                        <td className={u.droite}>{l.signes ? euros(l.ca / l.signes) : "—"}</td>
                      </tr>
                    ))}
                    <tr className={s.total}>
                      <td>Total</td>
                      <td className={u.droite}>{nombre(t.visites)}</td>
                      <td className={u.droite}>{nombre(t.devises)}</td>
                      <td className={u.droite}>{nombre(t.signes)}</td>
                      <td className={u.droite}>{euros(t.ca)}</td>
                      <td className={u.droite}>{pourcent(part(t.ds, t.devises))}</td>
                      <td className={u.droite}>{pourcent(part(t.vdv, t.vd))}</td>
                      <td className={u.droite}>{t.signes ? euros(t.ca / t.signes) : "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Carte>
          </Grille>
          <Note>
            <b>Comment lire ces chiffres.</b> Une visite est un rendez-vous de visite (sur place ou en visio) du commercial, daté de son début. Un dossier « devisé » a reçu au moins un devis
            envoyé (Bailly en envoie trois formules par dossier : on compte le dossier, pas les formules), daté du premier envoi. Le CA est la somme des devis signés, TTC comme sur les
            devis ; le commercial est celui du dossier. Transformation : parmi les dossiers devisés sur la période, ceux qui sont signés aujourd&apos;hui. L&apos;entonnoir suit les dossiers
            ouverts sur la période, du devis à la signature. Chaque tuile se compare à la période d&apos;avant{rattachement === "signature" ? ", arrêtée au même jour quand la période est en cours" : ", entière (le CA au déménagement compte aussi le planning à venir)"} ; ses
            petites colonnes sont les douze derniers mois.
            {x.sansDate && ` ${pluriel(x.sansDate.n, "devis signé", "devis signés")} (${euros(x.sansDate.ca)}) n'ont ni date de chargement ni mois prévu : ils n'entrent pas dans le CA rattaché au déménagement.`}
          </Note>
        </div>
      </AvecMenu>
    </div>
  );
}
