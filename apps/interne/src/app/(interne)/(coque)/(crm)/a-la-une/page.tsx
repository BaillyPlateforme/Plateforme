import Link from "next/link";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import { Icone } from "@/ui/icones";
import Radar from "@/crm/demandes/Radar";
import { eur, ilYa, m3 } from "@/crm/lib/format";
import { alaUne, SEUIL_FORT, TRANCHES } from "@/crm/statistiques/a-la-une";
import { Carte, Grille, Note, Tuile, Tuiles } from "@/crm/statistiques/Cadre";
import { BarresClassees, Colonnes, Entonnoir, euros, eurosCourts, nombre, pluriel, pourcent, Repartition } from "@/crm/statistiques/Graphiques";
import { NEUTRE, RAMPE, RETRAIT, SERIES, UNIQUE } from "@/crm/statistiques/palette";
import { PERIODES, PERIODE_PAR_DEFAUT, moisDansPeriode, periodeDe } from "@/crm/statistiques/periodes";
import { BasStatistiques } from "@/crm/statistiques/Vues";
import s from "@/crm/statistiques/statistiques.module.css";
import a from "@/crm/statistiques/a-la-une.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "À la une" };

/*
 * Accueil › À la une (demande de David, 08/11/2026 : « un sous-onglet À la
 * une avec justement le pilotage des demandes ») : la porte d'entrée
 * commerciale d'un coup d'œil — ce qui arrive du site, ce qui attend
 * l'équipe, ce qui avance jusqu'à la signature, et les cinq demandes du
 * moment. Chaque bloc mène à sa vue de Demandes (Kanban, Feed, Top, À
 * rappeler, Statistiques). Chiffres réels, lus en direct
 * (src/crm/statistiques/a-la-une.ts) ; le dessin est celui des
 * Statistiques, pour un seul produit.
 */

const D = {
  kanban: "/demandes",
  feed: "/demandes?vue=feed",
  top: "/demandes?vue=top",
  rappels: "/demandes?vue=rappels",
  stats: (analyse?: string) => `/demandes?vue=statistiques${analyse ? `&analyse=${analyse}` : ""}`,
};
const niveau = (p: number | null) => (p == null ? "vide" : p >= SEUIL_FORT ? "haut" : p >= 40 ? "moyen" : "bas");
const jours = (iso: string) => Math.max(0, Math.floor((Date.now() - +new Date(iso)) / 86_400_000));
const depuis = (iso: string) => {
  const j = jours(iso);
  return j === 0 ? "aujourd’hui" : j === 1 ? "depuis hier" : `depuis ${j} jours`;
};
/** L'attente la plus longue, courte (elle tient dans une tuile) : « 117 jours », « hier ». */
const attente = (iso: string) => {
  const j = jours(iso);
  return j === 0 ? "aujourd’hui" : j === 1 ? "hier" : `${j} jours`;
};
/** Une couleur par parcours, toujours la même, dans l'ordre validé de la palette (indigo, vert, ambre, ciel, rose). */
const COULEUR_PARCOURS: Record<string, string> = {
  "Particulier · express": SERIES[0],
  "Particulier · complet": SERIES[1],
  Entreprise: SERIES[2],
  "Entreprise · petit transfert": SERIES[2],
  "Entreprise · projet important": SERIES[4],
  Mutation: SERIES[3],
};

export default async function ALaUne({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const periode = periodeDe((await searchParams).periode);
  const x = await alaUne(periode);
  const lien = (p: string) => `/a-la-une${p === PERIODE_PAR_DEFAUT ? "" : `?periode=${p}`}`;
  const retenus = x.mois.map((m) => moisDansPeriode(m, periode));
  const qualifiees = x.entonnoir[1].n;
  const pas = periode.cle === "mois" || periode.cle === "mois-dernier" ? "jour" : periode.cle === "trimestre" ? "semaine" : "mois";
  const ecart = { libelle: x.comparaison.libelle, precis: x.comparaison.precis };
  const rappelAncien = x.rappels.reduce<string | null>((m, r) => (!m || r.le < m ? r.le : m), null);
  // Le montant du devis du site attaché à chaque rappel (sa priorité vient de là).
  const enJeu = x.rappels.reduce((t, r) => t + (r.montant ?? 0), 0);
  const phrase = `${periode.phrase[0].toUpperCase()}${periode.phrase.slice(1)}`;

  return (
    <div className="view">
      <Bandeau
        surtitre="Accueil · À la une"
        titre="À la une"
        texte={`Les demandes du site, d’un coup d’œil · ${periode.phrase}${x.recues.derniere ? ` · dernière reçue ${ilYa(x.recues.derniere).toLowerCase()}` : ""}`}
        action={{ label: "Kanban des demandes", href: D.kanban, icone: "kanban" }}
        bas={
          <BasStatistiques>
            <Pilules label="Période" items={PERIODES.map((p) => ({ href: lien(p.cle), label: p.libelle, actif: periode.cle === p.cle }))} />
          </BasStatistiques>
        }
      />
      <Tuiles chevauche colonnes={6}>
        <Tuile
          href={D.feed}
          icone="questionnaires"
          label="Demandes reçues"
          valeur={nombre(x.recues.n)}
          detail={`Aujourd’hui ${nombre(x.recues.aujourdhui)} · 7 jours ${nombre(x.recues.septJours)}`}
          ecart={{ ...ecart, avant: x.recues.avant, courant: x.recues.courant, format: nombre }}
          tendance={{ valeurs: x.recues.parMois, retenus, libelle: "Demandes reçues, douze derniers mois" }}
        />
        <Tuile
          href={D.stats("conversion")}
          icone="coche"
          label="Qualifiées"
          valeur={pourcent(x.qualification.part)}
          detail={x.recues.n ? `${nombre(qualifiees)} sur ${pluriel(x.recues.n, "reçue")}` : "aucune reçue"}
          ecart={{ ...ecart, avant: x.qualification.avant, courant: x.qualification.courant, format: (n) => pourcent(n), taux: true }}
          tendance={{ valeurs: x.qualification.parMois, retenus, libelle: "Part des demandes qualifiées, douze derniers mois" }}
        />
        <Tuile
          href={D.top}
          icone="euro"
          label="Estimations du site"
          valeur={eurosCourts(x.estimations.total)}
          detail="particuliers, TTC"
          ecart={{ ...ecart, avant: x.estimations.avant, courant: x.estimations.courant, format: eurosCourts }}
          tendance={{ valeurs: x.estimations.parMois, retenus, libelle: "Estimations du site, douze derniers mois" }}
        />
        {/* Les trois états du jour : ce qui attend l'équipe, maintenant (la période n'y change rien). */}
        <Tuile
          href={D.kanban}
          icone="cloche"
          ton={x.aOuvrir.n ? "ambre" : undefined}
          label="À ouvrir"
          valeur={nombre(x.aOuvrir.n)}
          detail={x.aOuvrir.plusAncienne ? `plus ancienne : ${attente(x.aOuvrir.plusAncienne)}` : "aucune en attente"}
          jauge={x.ouvertes ? { part: x.aOuvrir.n / x.ouvertes, libelle: `${nombre(x.aOuvrir.n)} sur ${pluriel(x.ouvertes, "ouverte")}` } : undefined}
        />
        <Tuile
          href={D.rappels}
          icone="horloge"
          ton={x.rappels.length ? "ambre" : undefined}
          label="À rappeler"
          valeur={nombre(x.rappels.length)}
          detail={rappelAncien ? `plus ancien : ${attente(rappelAncien)}` : "personne n’attend"}
          note={enJeu > 0 ? `${eurosCourts(enJeu)} de devis du site en jeu` : undefined}
        />
        <Tuile
          href={`${D.top}&portee=ouvertes&potentiel=fort`}
          icone="etoile"
          label="Fort potentiel"
          valeur={nombre(x.fortPotentiel)}
          detail={`potentiel de ${SEUIL_FORT}/100 et plus`}
          jauge={x.ouvertes ? { part: x.fortPotentiel / x.ouvertes, libelle: `${nombre(x.fortPotentiel)} sur ${pluriel(x.ouvertes, "ouverte")}` } : undefined}
        />
      </Tuiles>

      <div className={s.ecran}>
        <Grille>
          <Carte
            largeur={8}
            titre="Le flux des demandes"
            sousTitre={`${phrase}, par ${pas} : les qualifiées en indigo, les autres en clair`}
            lien={{ href: D.stats(), label: "Statistiques" }}
            pied={
              <>
                <b>{pluriel(x.recues.n, "demande reçue", "demandes reçues")}</b> · {nombre(qualifiees)} qualifiées · formulaire {nombre(x.sources.formulaire)}, e-mail {nombre(x.sources.email)}
                {x.recues.derniere && <> · la dernière le {new Date(x.recues.derniere).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })}</>}
              </>
            }
          >
            <Colonnes
              colonnes={x.creneaux.map((c) => ({ cle: c.cle, libelle: c.libelle, detail: c.detail }))}
              series={[
                { libelle: "Qualifiées", couleur: UNIQUE, valeurs: x.creneaux.map((c) => c.qualifiees) },
                { libelle: "Pas encore qualifiées", couleur: RETRAIT, valeurs: x.creneaux.map((c) => c.recues - c.qualifiees) },
              ]}
              format={nombre}
              vide="Aucune demande reçue sur la période."
              hauteur={190}
            />
          </Carte>
          <Carte largeur={4} titre="Du site à la signature" sousTitre="Les demandes reçues sur la période, suivies jusqu’au contrat" lien={{ href: D.kanban, label: "Kanban" }} pied="Une seule cohorte : chaque étape compte les demandes de la précédente qui l’ont atteinte.">
            <Entonnoir etapes={x.entonnoir} vide="Aucune demande reçue sur la période." />
          </Carte>

          <Carte largeur={8} haut titre="Les cinq demandes du moment" sousTitre="Ouvertes, rangées comme Top demandes : potentiel, estimation, puis la plus récente" lien={{ href: D.top, label: "Top demandes" }}>
            {x.top.length === 0 ? (
              <p className={a.calme}>Aucune demande ouverte.</p>
            ) : (
              <ol className={a.top}>
                {x.top.map(({ demande: d, araignee, etape }, i) => (
                  <li key={d.id}>
                    <Link href={`${D.top}&sel=${d.id}`} aria-label={`${i + 1}. ${d.client}, potentiel ${d.potentiel ?? "non noté"}`}>
                      <span className={a.rang}>{i + 1}</span>
                      <Radar araignee={araignee} taille={56} />
                      <span className={a.qui}>
                        <b>{d.client}</b>
                        <span>
                          {d.parcoursLabel}
                          {d.depart || d.arrivee ? ` · ${d.depart ?? "?"} → ${d.arrivee ?? "?"}` : ""}
                        </span>
                        <span className={a.etape}>
                          <i style={{ background: etape.couleur }} />
                          {etape.label} · reçue {ilYa(d.recueLe).toLowerCase()}
                        </span>
                      </span>
                      <span className={a.montant}>
                        {d.estimation != null ? eur(d.estimation) : "Sans prix"}
                        <small>{d.volume != null ? m3(d.volume) : "volume à venir"}</small>
                      </span>
                      <span className={a.score} data-niveau={niveau(d.potentiel)} title="Potentiel, sur 100">
                        {d.potentiel ?? "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Carte>
          <Carte largeur={4} haut titre="Ils attendent un appel" sousTitre="Rappels demandés, les plus prioritaires d’abord" lien={{ href: D.rappels, label: "À rappeler" }} pied={x.rappels.length > 5 ? `Et ${pluriel(x.rappels.length - 5, "autre")} dans À rappeler.` : undefined}>
            {x.rappels.length === 0 ? (
              <p className={a.calme}>
                <Icone nom="coche" taille={22} />
                Personne n’attend d’appel.
              </p>
            ) : (
              <ul className={a.rappels}>
                {x.rappels.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <Link href={`/dashboard/${r.requestId}`}>
                      <i data-statut={r.statut}>
                        <Icone nom="horloge" taille={16} />
                      </i>
                      <span className={a.qui}>
                        <b>{r.client}</b>
                        <span>{r.trajet ?? "Trajet à préciser"}</span>
                      </span>
                      <span className={a.attente}>
                        {r.montant != null ? eur(r.montant) : "—"}
                        <small>{r.statut === "en_cours" ? "en cours" : depuis(r.le)}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Carte>

          <Carte
            largeur={4}
            titre="Par où elles arrivent"
            sousTitre="Les trois portes du site, sur la période"
            lien={{ href: D.stats("formules"), label: "Analyse" }}
            pied={
              <>
                Formulaire <b>{nombre(x.sources.formulaire)}</b> · e-mail <b>{nombre(x.sources.email)}</b>
                {x.espacesPro > 0 && <> · dont {pluriel(x.espacesPro, "venue", "venues")} d’un espace pro</>}
              </>
            }
          >
            <Repartition
              libelle="Demandes par parcours"
              vide="Aucune demande reçue sur la période."
              parts={x.segments.map((p) => ({ cle: p.libelle, libelle: p.libelle, n: p.n, couleur: COULEUR_PARCOURS[p.libelle] ?? NEUTRE }))}
            />
          </Carte>
          <Carte
            largeur={4}
            titre="Le potentiel des demandes"
            sousTitre="La note de la qualification, sur 100"
            lien={{ href: D.stats("analyse"), label: "Analyse" }}
            pied={
              x.potentiel.sansNote
                ? `${pluriel(x.potentiel.sansNote, "demande")} pas encore ${x.potentiel.sansNote > 1 ? "notées" : "notée"}.`
                : x.recues.n
                  ? "Toutes les demandes de la période sont notées."
                  : undefined
            }
          >
            <Colonnes
              colonnes={TRANCHES.map((t) => ({ cle: t, libelle: t, detail: `Potentiel ${t}` }))}
              series={[{ libelle: "Demandes", couleur: UNIQUE, valeurs: x.potentiel.tranches }]}
              couleurs={RAMPE}
              etiquettes="toutes"
              format={nombre}
              vide="Aucune demande notée sur la période."
              hauteur={150}
            />
          </Carte>
          <Carte
            largeur={4}
            titre="Communes de départ"
            sousTitre="Les plus demandées ; prix médian au m² des ventes (DVF)"
            lien={{ href: D.stats("geographie"), label: "Géographie" }}
          >
            <BarresClassees
              format={nombre}
              vide="Aucune ville de départ sur la période."
              barres={x.communes.map((c) => ({
                cle: c.cle,
                libelle: c.nom,
                valeur: c.n,
                couleur: UNIQUE,
                detail: c.prix != null ? `${euros(c.prix)}/m²` : "prix DVF inconnu",
              }))}
            />
          </Carte>
        </Grille>
        <Note>
          <b>Comment lire ces chiffres.</b> Une demande compte le jour où elle arrive du site (formulaire ou e-mail). « Qualifiée » : évaluée par l’équipe (potentiel, difficulté,
          estimation), ou devenue dossier. À ouvrir : les demandes nouvelles, pas encore évaluées ; à rappeler : les rappels demandés encore ouverts. L’entonnoir suit les demandes reçues
          sur la période jusqu’au dossier, au devis envoyé depuis ce dossier, puis signé. Les estimations sont celles que le site a données, pour les seuls particuliers (la mutation et
          l’entreprise n’ont pas de prix en ligne). Chaque tuile se compare à la période d’avant, arrêtée au même jour quand la période est en cours ; ses petites colonnes sont les douze
          derniers mois.
        </Note>
      </div>
    </div>
  );
}
