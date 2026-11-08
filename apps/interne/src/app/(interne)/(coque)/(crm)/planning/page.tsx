import Link from "next/link";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import { AvecMenu } from "@/ui/MenuVertical";
import { commerciaux, lundiDe, semaineCourante } from "@/crm/lib/data";
import { Ic } from "@/crm/lib/icons";
import { dateFr } from "@/crm/lib/format";
import { ETATS_VISITE } from "@/crm/visites/cycle";
import { planningSemaine } from "@/crm/planning/donnees";
import GrillePlanning from "@/crm/planning/GrillePlanning";
import MiniCalendrier from "@/crm/planning/MiniCalendrier";
import { jourParis } from "@/lib/visite/regles";
import s from "@/crm/planning/planning.module.css";
import { etatsRdv } from "@/crm/rdv/sms";
// Le numéro de semaine ISO, le même que le planning d'exploitation (l'ancien calcul donnait 45 pour la semaine 46).
import { semaineIso } from "@/crm/exploitation/planning";
import MenuPlanning, { BasPlanning, vuePlanning } from "@/crm/planning/Vues";
import VueVisites from "@/crm/visites/VueVisites";
import VueDates from "@/crm/planning/VueDates";

export const dynamic = "force-dynamic";

/*
 * Le planning commercial : la semaine entière, du lundi au dimanche, de 7 h
 * à 20 h, et les journées entières au-dessus (comme dans Créagidem). Un
 * rendez-vous se déplace au glisser-déposer et s'ouvre d'un clic pour être
 * modifié ou supprimé ; chaque visite montre où elle en est de son cycle.
 * Les fiches de visite s'impriment par journée (en tête de chaque jour) ou
 * pour la semaine du commercial choisi.
 *
 * Un seul planning commercial (simplification du 08/11/2026) : la semaine,
 * les visites techniques (?vue=visites, l'ancienne page /visites) et les
 * dates souhaitées par les clients du site (?vue=dates, l'ancien agenda des
 * questionnaires), au menu de gauche ; les commerciaux restent un filtre,
 * dans la rangée du bas du bandeau.
 */

const NOMS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const OK: Record<string, string> = { modifie: "Rendez-vous enregistré.", supprime: "Rendez-vous supprimé." };

export default async function Planning({ searchParams }: { searchParams: Promise<{ semaine?: string; com?: string; ok?: string; vue?: string }> }) {
  const sp = await searchParams;
  const vue = vuePlanning(sp.vue);
  if (vue === "visites") return <VueVisites />;
  if (vue === "dates") return <VueDates />;
  const lun = sp.semaine ? lundiDe(new Date(sp.semaine)) : semaineCourante();
  const com = sp.com ? Number(sp.com) : null;
  const [{ jours, evenements, creneaux }, coms] = await Promise.all([planningSemaine(lun, com), commerciaux()]);
  const auj = jourParis(new Date());
  const lundi = jours[0];
  const suffixe = com ? `&com=${com}` : "";
  const nav = (delta: number) => {
    const d = new Date(`${lundi}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return `/planning?semaine=${d.toISOString().slice(0, 10)}${suffixe}`;
  };
  const visites = evenements.filter((e) => e.etat);
  // L'état des SMS de rendez-vous : une pastille par rendez-vous (src/crm/rdv).
  const etatsSms = Object.fromEntries(await etatsRdv(evenements.map((e) => e.id)));
  const grilleJours = jours.map((cle, i) => ({
    cle, nom: NOMS[i], numero: Number(cle.slice(8)), aujourdhui: cle === auj, visites: visites.filter((e) => e.jour === cle).length,
  }));

  return (
    <div className="view planning">
      <Bandeau
        surtitre="Dossiers · Planning"
        // Un seul titre pour les trois vues du planning ; la semaine passe dans le texte.
        titre="Planning"
        texte={`Semaine ${semaineIso(lundi)} · du ${dateFr(lun, { day: "numeric", month: "long" })} · ${com ? coms.find((c) => c.id === com)?.nom : "toute l’équipe commerciale"}`}
        action={{ label: "Nouveau RDV", href: "/planning/nouveau", icone: "plus" }}
        bas={
          <BasPlanning>
            <Pilules
              label="Commercial"
              items={[
                { href: `/planning?semaine=${lundi}`, label: "Tous", actif: !com },
                ...coms.map((c) => ({ href: `/planning?semaine=${lundi}&com=${c.id}`, label: c.nom.split(" ")[0], actif: com === c.id })),
              ]}
            />
          </BasPlanning>
        }
      >
        <Link href={nav(-7)} data-ton="fleche" aria-label="Semaine précédente"><Ic n="left" /></Link>
        <Link href={`/planning?semaine=${auj}${suffixe}`} data-ton="contour">Aujourd&apos;hui</Link>
        <Link href={nav(7)} data-ton="fleche" aria-label="Semaine suivante"><Ic n="right" /></Link>
        <MiniCalendrier semaine={lundi} aujourdhui={auj} prefixe={`/planning?${com ? `com=${com}&` : ""}semaine=`} />
        {visites.length > 0 && (
          <a data-ton="contour" href={`/imprimer/visites?semaine=${lundi}${suffixe}`} target="_blank" rel="noopener">
            <Ic n="pdf" />&nbsp;Fiches de visite
          </a>
        )}
      </Bandeau>
      <AvecMenu menu={<MenuPlanning actif="semaine" />}>
        {sp.ok && OK[sp.ok] && <p className={`${s.message} ${s.messageOk}`}>{OK[sp.ok]}</p>}
        <div className={s.legende}>
          <span>
            <i className="dot t-phys" />
            Visite physique
          </span>
          <span>
            <i className="dot t-visio" />
            Visio
          </span>
          <span>
            <i className="dot t-tache" />
            Tâche
          </span>
          <span>
            <i className="dot t-perso" />
            Perso / règle
          </span>
          <span>
            <i className="dot" style={{ border: "1.5px dashed var(--accent)", background: "transparent" }} />
            Créneau proposé au client
          </span>
          <i className={s.sep} />
          {(["planifiee", "effectuee", "devis", "sans_suite"] as const).map((k) => (
            <span key={k}>
              <i className={`st ${ETATS_VISITE[k].ton}`}>{ETATS_VISITE[k].libelle}</i>
            </span>
          ))}
        </div>
        <GrillePlanning jours={grilleJours} evenements={evenements} creneaux={creneaux} filtre={com} etatsSms={etatsSms} />
      </AvecMenu>
    </div>
  );
}
