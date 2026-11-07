import Link from "next/link";
import Bandeau from "@/ui/Bandeau";
import { commerciaux, lundiDe, semaineCourante } from "@/crm/lib/data";
import { Ic } from "@/crm/lib/icons";
import { dateFr } from "@/crm/lib/format";
import { ETATS_VISITE } from "@/crm/visites/cycle";
import { planningSemaine } from "@/crm/planning/donnees";
import GrillePlanning from "@/crm/planning/GrillePlanning";
import MiniCalendrier from "@/crm/planning/MiniCalendrier";
import { jourParis } from "@/lib/visite/regles";
import s from "@/crm/planning/planning.module.css";

export const dynamic = "force-dynamic";

/*
 * Le planning commercial : la semaine entière, du lundi au dimanche, de 7 h
 * à 20 h, et les journées entières au-dessus (comme dans Créagidem). Un
 * rendez-vous se déplace au glisser-déposer et s'ouvre d'un clic pour être
 * modifié ou supprimé ; chaque visite montre où elle en est de son cycle.
 * Les fiches de visite s'impriment par journée (en tête de chaque jour) ou
 * pour la semaine du commercial choisi.
 */

const NOMS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const OK: Record<string, string> = { modifie: "Rendez-vous enregistré.", supprime: "Rendez-vous supprimé." };

export default async function Planning({ searchParams }: { searchParams: Promise<{ semaine?: string; com?: string; ok?: string }> }) {
  const sp = await searchParams;
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
  const num = (d: Date) => Math.ceil(((+d - +new Date(d.getFullYear(), 0, 1)) / 864e5 + 1) / 7);
  const visites = evenements.filter((e) => e.etat);
  const grilleJours = jours.map((cle, i) => ({
    cle, nom: NOMS[i], numero: Number(cle.slice(8)), aujourdhui: cle === auj, visites: visites.filter((e) => e.jour === cle).length,
  }));

  return (
    <div className="view planning">
      <Bandeau
        surtitre={`Commercial · Semaine ${num(lun)}`}
        titre={`Semaine du ${dateFr(lun, { day: "numeric", month: "long" })}`}
        texte={com ? coms.find((c) => c.id === com)?.nom : "Toute l’équipe commerciale"}
        action={{ label: "Nouveau RDV", href: "/planning/nouveau", icone: "plus" }}
      />
      {sp.ok && OK[sp.ok] && <p className={`${s.message} ${s.messageOk}`}>{OK[sp.ok]}</p>}
      <div className={s.outils}>
        <div className="seg" role="navigation" aria-label="Commercial">
          <Link className={!com ? "on" : ""} href={`/planning?semaine=${lundi}`}>
            <button className={!com ? "on" : ""}>Tous</button>
          </Link>
          {coms.map((c) => (
            <Link key={c.id} href={`/planning?semaine=${lundi}&com=${c.id}`}>
              <button className={com === c.id ? "on" : ""}>{c.nom.split(" ")[0]}</button>
            </Link>
          ))}
        </div>
        <div className={s.outilsDroite}>
          <Link href={nav(-7)} className={`btn ghost ${s.fleche}`} aria-label="Semaine précédente">
            <Ic n="left" />
          </Link>
          <Link href={`/planning?semaine=${auj}${suffixe}`} className="btn ghost">
            Aujourd&apos;hui
          </Link>
          <Link href={nav(7)} className={`btn ghost ${s.fleche}`} aria-label="Semaine suivante">
            <Ic n="right" />
          </Link>
          <MiniCalendrier semaine={lundi} aujourdhui={auj} prefixe={`/planning?${com ? `com=${com}&` : ""}semaine=`} />
          {visites.length > 0 && (
            <a className="btn ghost" href={`/imprimer/visites?semaine=${lundi}${suffixe}`} target="_blank" rel="noopener">
              <Ic n="pdf" />
              Fiches de visite de la semaine
            </a>
          )}
        </div>
      </div>
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
      <GrillePlanning jours={grilleJours} evenements={evenements} creneaux={creneaux} filtre={com} />
    </div>
  );
}
