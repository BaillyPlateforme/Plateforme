import Link from "next/link";
import Bandeau from "@/ui/Bandeau";
import { AvecMenu } from "@/ui/MenuVertical";
import { etatEnvois } from "@/lib/envois";
import { currentUser } from "@/crm/lib/auth";
import { jourParis } from "@/crm/envois";
import { entree, lignesCatalogue, raisonDeNePasEnvoyer } from "@/crm/messages/catalogue";
import { RATTRAPAGE_JOURS, relancesEtRegles } from "@/crm/relances/moteur";
import { CANAUX, heureVeilleParis, RELANCES } from "@/crm/relances/regles";
import { dossiersChoisissables, exclusions, journalRegles } from "@/crm/relances/suivi";
import Configuration, { ExclusionsGlobales, type VueRegle } from "@/crm/relances/Configuration";
import { dossierDuFiltre, MenuRelances } from "@/crm/relances/Section";
import s from "@/crm/relances/relances.module.css";

export const dynamic = "force-dynamic";

const quand = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/**
 * La configuration des relances : le circuit d'une relance, une grande carte
 * par type (activation, délais et repère, canaux et cartes, jours et heures,
 * exclusions, simulation), les dossiers à ne pas relancer et le journal des
 * modifications. Tout est lu par le moteur et par la tâche de la veille.
 */
export default async function ConfigurationRelances({ searchParams }: { searchParams: Promise<{ dossier?: string }> }) {
  await currentUser();
  const sp = await searchParams;
  const dossier = dossierDuFiltre(sp.dossier);
  const aujourdhui = jourParis();
  const [{ relances, regles }, cartes, exclus, dossiers, journal] = await Promise.all([
    relancesEtRegles(aujourdhui), lignesCatalogue(), exclusions(), dossiersChoisissables(), journalRegles(),
  ]);
  const envoi = etatEnvois();
  const veille = !!process.env.TACHES_SECRET?.trim();

  const vues: VueRegle[] = RELANCES.map((def) => {
    const g = regles.get(def.type)!;
    const l = relances.filter((r) => r.type === def.type);
    return {
      def,
      regle: {
        actif: g.actif, premier_delai_jours: g.premier_delai_jours, intervalle_jours: g.intervalle_jours, nombre_max: g.nombre_max, repere: g.repere,
        canaux: g.canaux, jours_envoi: g.jours_envoi, heure_debut: g.heure_debut, heure_fin: g.heure_fin, segments_exclus: g.segments_exclus,
      },
      majLe: g.maj_par ? g.maj_le : null,
      majPar: g.maj_par,
      cartes: CANAUX.map((c) => {
        const m = cartes.get(def.cartes[c.cle]) ?? null;
        return {
          canal: c.cle, cle: def.cartes[c.cle], titre: entree(def.cartes[c.cle])?.titre ?? def.libelle,
          etat: !raisonDeNePasEnvoyer(m) ? "pret" : m?.corps.trim() ? "desactivee" : "a_valider",
        };
      }),
      compte: {
        avenir: l.filter((r) => r.colonne === "avenir").length, aujourdhui: l.filter((r) => r.colonne === "aujourdhui").length,
        retard: l.filter((r) => r.colonne === "retard").length, envoyees: l.filter((r) => r.colonne === "envoyee").length,
        desactivees: l.filter((r) => r.colonne === "desactivee").length,
      },
      exclus: exclus.filter((e) => e.type === def.type || e.type === "*"),
    };
  });
  const actives = vues.filter((v) => v.regle.actif).length;
  const pretes = vues.filter((v) => v.regle.actif && v.cartes.some((c) => c.etat === "pret" && v.regle.canaux.includes(c.canal))).length;
  const libelleType = (t: string | null) => (t ? (RELANCES.find((d) => d.type === t)?.libelle ?? t) : "Tous les types");

  return (
    <div className="view">
      <Bandeau
        surtitre="Commercial · Relances · Configuration"
        titre="Règles des relances"
        texte={`${actives} type${actives > 1 ? "s" : ""} actif${actives > 1 ? "s" : ""} sur ${RELANCES.length} · ${pretes} prêt${pretes > 1 ? "s" : ""} à partir`}
        etiquettes={[`Envoi : ${envoi.libelle.toLowerCase()}`, "Délais provisoires"]}
      >
        <Link href="/modeles" data-ton="contour">Courriers et SMS</Link>
        <Link href="#journal" data-ton="contour">Journal</Link>
      </Bandeau>
      <AvecMenu menu={<MenuRelances page="configuration" dossier={dossier} aFaire={relances.filter((r) => r.colonne === "aujourdhui" || r.colonne === "retard").length} />}>
        <div className={s.page}>
          <section className={s.carte}>
            <div className={s.carteTete}>
              <div>
                <p className={s.surtitre}>Le circuit d’une relance</p>
                <h2 className={s.titre}>De la règle au journal des envois</h2>
              </div>
            </div>
            <ol className={s.flux}>
              <li>
                <i>1</i>
                <b>La règle</b>
                <span>Délai, repère, nombre, canaux, jours et heures, exclusions : ci-dessous.</span>
              </li>
              <li>
                <i>2</i>
                <b>Le calcul</b>
                <span>Chaque dossier concerné reçoit sa prochaine relance. Elle disparaît d’elle-même quand son objet est réglé.</span>
              </li>
              <li>
                <i>3</i>
                <b>Le Kanban</b>
                <span>L’équipe peut envoyer, repousser, annuler ou exclure un dossier.</span>
              </li>
              <li data-ton={veille ? "ok" : "attention"}>
                <i>4</i>
                <b>La veille, vers {heureVeilleParis(aujourdhui)} h</b>
                <span>
                  Envoie les relances du jour et celles en retard de {RATTRAPAGE_JOURS} jours au plus.{veille ? "" : " Le secret TACHES_SECRET manque ici : elle ne passe pas sur ce serveur."}
                </span>
              </li>
              <li data-ton={envoi.mode === "actif" ? "ok" : "attention"}>
                <i>5</i>
                <b>Les garde-fous : {envoi.libelle.toLowerCase()}</b>
                <span>{envoi.detail}</span>
              </li>
              <li>
                <i>6</i>
                <b>Le journal</b>
                <span>Chaque message, parti ou retenu, est au journal des envois ; l’historique le reprend.</span>
              </li>
            </ol>
          </section>

          <div className={s.provisoire}>
            <i>!</i>
            <span>
              <b>Les délais par défaut sont provisoires</b>, posés en attendant la décision de Bailly (devis : le seuil de la cloche ; pièces et conditions : l’alerte de l’espace client) —{" "}
              {RELANCES.map((d) => `${d.libelle.toLowerCase()} : ${d.defaut.premier_delai_jours} j ${d.reperes[0].libelle}, puis tous les ${d.defaut.intervalle_jours} j, ${d.defaut.nombre_max} au plus`).join(" ; ")}.
              Aucun jour ni aucune heure d’envoi n’est imposé. Les textes viennent de « Courriers et SMS » : une carte vide ou désactivée n’envoie rien.
            </span>
          </div>

          <Configuration vues={vues} dossiers={dossiers} heureVeille={heureVeilleParis(aujourdhui)} />

          <div className={s.grille}>
            <section className={`${s.carte} ${s.c5}`}>
              <div className={s.carteTete}>
                <div>
                  <p className={s.surtitre}>Exclusions</p>
                  <h2 className={s.titre}>Dossiers à ne pas relancer</h2>
                  <p className={s.sous}>Pour tous les types de relance. Se marque aussi depuis le Kanban d’un dossier.</p>
                </div>
              </div>
              <ExclusionsGlobales exclus={exclus.filter((e) => e.type === "*")} dossiers={dossiers} />
            </section>
            <section id="journal" className={`${s.carte} ${s.c7}`} style={{ scrollMarginTop: 190 }}>
              <div className={s.carteTete}>
                <div>
                  <p className={s.surtitre}>Journal</p>
                  <h2 className={s.titre}>Les modifications de règles</h2>
                  <p className={s.sous}>Qui a changé quoi, et quand : règles et exclusions.</p>
                </div>
              </div>
              {journal.length === 0 ? (
                <p className={s.aide}>Aucune modification depuis la mise en place du journal.</p>
              ) : (
                <table className={s.journal}>
                  <thead>
                    <tr>
                      <th>Quand</th>
                      <th>Type</th>
                      <th>Changement</th>
                      <th>Par</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journal.map((j) => (
                      <tr key={j.id}>
                        <td>{quand(j.cree_le)}</td>
                        <td>
                          <b>{libelleType(j.type)}</b>
                        </td>
                        <td>{j.resume}</td>
                        <td>{j.par ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </div>
      </AvecMenu>
    </div>
  );
}
