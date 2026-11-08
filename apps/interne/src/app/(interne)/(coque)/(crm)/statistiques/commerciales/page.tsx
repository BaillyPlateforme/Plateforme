import Bandeau, { Pilules } from "@/ui/Bandeau";
import { AvecMenu } from "@/ui/MenuVertical";
import { statsCommerciales, type Rattachement } from "@/crm/statistiques/donnees";
import { PERIODES, PERIODE_PAR_DEFAUT, periodeDe, moisDansPeriode } from "@/crm/statistiques/periodes";
import { couleursPar } from "@/crm/statistiques/palette";
import MenuStatistiques from "@/crm/statistiques/Menu";
import { BarresClassees, Courbes, Entonnoirs, euros, eurosCourts, nombre, pourcent, Tuile, Tuiles } from "@/crm/statistiques/Graphiques";
import { BarreBas } from "@/crm/exploitation/ui/Bas";
import u from "@/crm/exploitation/ui/ui.module.css";
import s from "@/crm/statistiques/statistiques.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Statistiques commerciales" };

/*
 * Les statistiques commerciales (Créagidem : « Stats Comm. »), par
 * commercial, sur la période choisie : visites, dossiers devisés, signés,
 * chiffre d'affaires signé, taux de transformation, panier moyen. Le CA se
 * rattache à la signature ou au déménagement (comme le Pilotage). Les
 * calculs sont décrits dans src/crm/statistiques/donnees.ts.
 */
const part = (a: number, b: number) => (b > 0 ? a / b : null);

export default async function StatistiquesCommerciales({ searchParams }: { searchParams: Promise<{ periode?: string; ca?: string }> }) {
  const sp = await searchParams;
  const periode = periodeDe(sp.periode);
  const rattachement: Rattachement = sp.ca === "demenagement" ? "demenagement" : "signature";
  const { lignes, mois, serie, sansDate } = await statsCommerciales(periode, rattachement);
  const couleurs = couleursPar(lignes);
  const t = lignes.reduce(
    (a, l) => ({ visites: a.visites + l.visites, vd: a.vd + l.visitesDossiers, vdv: a.vdv + l.visitesDevisees, devises: a.devises + l.devises, ds: a.ds + l.devisesSignes, signes: a.signes + l.signes, ca: a.ca + l.ca }),
    { visites: 0, vd: 0, vdv: 0, devises: 0, ds: 0, signes: 0, ca: 0 },
  );
  const lien = (p: { periode?: string; ca?: string }) => {
    const x = new URLSearchParams();
    const per = p.periode ?? periode.cle;
    if (per !== PERIODE_PAR_DEFAUT) x.set("periode", per);
    if ((p.ca ?? rattachement) === "demenagement") x.set("ca", "demenagement");
    return `/statistiques/commerciales${x.size ? `?${x}` : ""}`;
  };
  const retenus = mois.map((m) => moisDansPeriode(m, periode));
  const actifs = lignes.filter((l) => l.visites + l.devises + l.signes > 0 || serie.some((x) => x.cid === l.id));
  const series = actifs.map((l) => ({
    cle: String(l.id ?? "aucun"),
    libelle: l.nom,
    couleur: couleurs.get(l.id) ?? "#a7a3b8",
    valeurs: mois.map((m) => serie.filter((x) => x.cid === l.id && x.mois === m).reduce((a, x) => a + x.ca, 0)),
  }));

  return (
    <div className="view">
      <Bandeau
        surtitre="Statistiques · Commercial"
        titre="Statistiques commerciales"
        texte={`Par commercial · ${periode.phrase} · CA rattaché ${rattachement === "signature" ? "à la signature" : "au déménagement"}`}
        bas={
          <BarreBas>
            <Pilules label="Période" items={PERIODES.map((p) => ({ href: lien({ periode: p.cle }), label: p.libelle, actif: periode.cle === p.cle }))} />
            <Pilules
              label="Rattachement du chiffre d'affaires"
              items={[
                { href: lien({ ca: "signature" }), label: "CA à la signature", actif: rattachement === "signature" },
                { href: lien({ ca: "demenagement" }), label: "Au déménagement", actif: rattachement === "demenagement" },
              ]}
            />
          </BarreBas>
        }
      />
      <AvecMenu menu={<MenuStatistiques actif="commerciales" periode={periode} />}>
        <div className={u.ecran}>
          <Tuiles>
            <Tuile heros label="CA signé (TTC)" valeur={euros(t.ca)} detail={`${nombre(t.signes)} dossier${t.signes > 1 ? "s" : ""} signé${t.signes > 1 ? "s" : ""}`} />
            <Tuile label="Visites" valeur={nombre(t.visites)} detail={`${nombre(t.vd)} dossier${t.vd > 1 ? "s" : ""} visité${t.vd > 1 ? "s" : ""}`} />
            <Tuile label="Dossiers devisés" valeur={nombre(t.devises)} detail={`${pourcent(part(t.vdv, t.vd))} des visités ont un devis`} />
            <Tuile label="Taux de transformation" valeur={pourcent(part(t.ds, t.devises))} detail="devisés sur la période, signés à ce jour" ton="vert" />
            <Tuile label="Panier moyen" valeur={t.signes ? euros(t.ca / t.signes) : "—"} detail="CA signé ÷ dossiers signés" />
          </Tuiles>

          <div className={s.duoEgal}>
            <section className={u.carte}>
              <div className={u.carteTete}>
                <div>
                  <h3>Chiffre d&apos;affaires signé par commercial</h3>
                  <p className={u.sousTitre}>{periode.phrase}, montants TTC des devis signés</p>
                </div>
              </div>
              <BarresClassees
                format={euros}
                vide="Aucun devis signé sur la période."
                barres={[...actifs]
                  .sort((a, b) => b.ca - a.ca)
                  .map((l) => ({ cle: String(l.id ?? "aucun"), libelle: l.nom, valeur: l.ca, couleur: couleurs.get(l.id), detail: `${nombre(l.signes)} signé${l.signes > 1 ? "s" : ""} · panier ${l.signes ? euros(l.ca / l.signes) : "—"}` }))}
              />
            </section>
            <section className={u.carte}>
              <div className={u.carteTete}>
                <div>
                  <h3>Taux de transformation</h3>
                  <p className={u.sousTitre}>Dossiers devisés sur la période et signés à ce jour</p>
                </div>
              </div>
              <BarresClassees
                format={(n) => pourcent(n)}
                vide="Aucun dossier devisé sur la période."
                barres={[...actifs]
                  .filter((l) => l.devises > 0)
                  .sort((a, b) => (part(b.devisesSignes, b.devises) ?? 0) - (part(a.devisesSignes, a.devises) ?? 0))
                  .map((l) => ({ cle: String(l.id ?? "aucun"), libelle: l.nom, valeur: part(l.devisesSignes, l.devises) ?? 0, couleur: couleurs.get(l.id), detail: `${nombre(l.devisesSignes)} signé${l.devisesSignes > 1 ? "s" : ""} sur ${nombre(l.devises)} devisé${l.devises > 1 ? "s" : ""}` }))}
              />
            </section>
          </div>

          <section className={u.carte}>
            <div className={u.carteTete}>
              <div>
                <h3>De la visite à la signature</h3>
                <p className={u.sousTitre}>Visites, dossiers devisés et signés, par commercial, sur la période</p>
              </div>
            </div>
            {actifs.length ? (
              <Entonnoirs entonnoirs={actifs.map((l) => ({ cle: String(l.id ?? "aucun"), libelle: l.nom, couleur: couleurs.get(l.id) ?? "#a7a3b8", etapes: [l.visites, l.devises, l.signes] }))} />
            ) : (
              <p className={u.aide}>Aucune activité commerciale sur la période.</p>
            )}
          </section>

          <section className={u.carte}>
            <div className={u.carteTete}>
              <div>
                <h3>CA signé mois par mois</h3>
                <p className={u.sousTitre}>Les douze derniers mois, par commercial ; les mois de la période choisie sont teintés.</p>
              </div>
            </div>
            <Courbes mois={mois} series={series} format={euros} formatAxe={eurosCourts} retenus={retenus} />
          </section>

          <section className={`${u.carte} ${u.carteSerree}`}>
            <div className={u.carteTete}>
              <h3>Récapitulatif par commercial</h3>
            </div>
            <div className={u.defile}>
              <table className={u.tableau}>
                <thead>
                  <tr>
                    <th>Commercial</th>
                    <th className={u.droite}>Visites</th>
                    <th className={u.droite}>Devisés</th>
                    <th className={u.droite}>Signés</th>
                    <th className={u.droite}>CA signé</th>
                    <th className={u.droite}>Transformation</th>
                    <th className={u.droite}>Visites → devis</th>
                    <th className={u.droite}>Panier moyen</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={String(l.id)}>
                      <td>
                        <i className={s.pastilleSerie} style={{ background: couleurs.get(l.id) }} />
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
          </section>
          <p className={s.note}>
            <b>Comment lire ces chiffres.</b> Une visite est un rendez-vous de visite (sur place ou en visio) du commercial, daté de son début. Un dossier « devisé » a reçu au moins un devis
            envoyé (Bailly en envoie trois formules par dossier : on compte le dossier, pas les formules), daté du premier envoi. Le CA est la somme des devis signés, TTC comme sur les
            devis ; le commercial est celui du dossier. Transformation : parmi les dossiers devisés sur la période, ceux qui sont signés aujourd&apos;hui.
            {sansDate && ` ${nombre(sansDate.n)} devis signé${sansDate.n > 1 ? "s" : ""} (${euros(sansDate.ca)}) n'ont ni date de chargement ni mois prévu : ils n'entrent pas dans le CA rattaché au déménagement.`}
          </p>
        </div>
      </AvecMenu>
    </div>
  );
}
