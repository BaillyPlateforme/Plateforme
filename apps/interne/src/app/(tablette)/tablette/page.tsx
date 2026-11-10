import { PastilleEnvironnement } from "@/components/PastilleEnvironnement";
import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/crm/lib/auth";
import { q } from "@/crm/lib/db";
import { nomClient } from "@/crm/lib/format";
import { commencerVisite } from "@/crm/visites/actions";
import { visitesDuJour, type VisiteDuJour } from "@/crm/visites/donnees";
import { duree, heureParis, jourVisite, m3, TYPE_VISITE, type TypeVisite } from "@/lib/visite/regles";
import { Picto } from "@/terrain/composants/Picto";
import s from "@/crm/visites/tablette/tablette.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mes visites" };

/*
 * L'accueil de la tablette : les visites d'aujourd'hui et de demain, lues
 * dans le planning commercial. Un commercial voit les siennes (et peut voir
 * toute l'équipe) ; la direction et l'exploitation voient tout. Une visite
 * sans rendez-vous s'ouvre aussi, sur un dossier à visiter.
 */

const initiales = (nom: string) =>
  nom
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => m[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function Carte({ v, montrerCommercial }: { v: VisiteDuJour; montrerCommercial: boolean }) {
  return (
    <article className={s.carte}>
      <div className={s.carteHeure}>
        {v.debut ? (
          <>
            <b>{heureParis(v.debut)}</b>
            <small>{v.duree ? duree(v.duree) : ""}</small>
          </>
        ) : (
          <>
            <Picto nom="plume" taille={24} />
            <small>Sans RDV</small>
          </>
        )}
      </div>
      <div className={s.carteCorps}>
        <h3>{v.client}</h3>
        <p>{v.adresse ?? "Adresse à préciser"}</p>
        <p>
          {v.ref} · {TYPE_VISITE[(v.type as TypeVisite) ?? "phys"] ?? "Visite"} · {m3(v.volume)}
          {montrerCommercial && v.commercial ? ` · ${v.commercial}` : ""}
        </p>
        <div className={s.carteBas}>
          <span className={`${s.pastille} ${v.statut === "signee" ? s.ok : v.statut === "en_cours" ? s.encours : ""}`}>
            {v.statut === "signee" ? (
              <>
                <Picto nom="coche" taille={15} /> Compte-rendu signé
              </>
            ) : v.statut === "en_cours" ? (
              "Saisie en cours"
            ) : (
              "À faire"
            )}
          </span>
          {v.statut === "signee" && v.visiteId ? (
            <Link className={s.boutonDoux} href={`/tablette/${v.visiteId}/signature`}>
              Voir
            </Link>
          ) : v.statut === "en_cours" && v.visiteId ? (
            <Link className={s.boutonPlein} href={`/tablette/${v.visiteId}`}>
              Reprendre <Picto nom="suite" taille={18} />
            </Link>
          ) : (
            <form action={commencerVisite.bind(null, v.dossierId, v.rdvId)}>
              <button className={s.boutonPlein}>
                Commencer <Picto nom="suite" taille={18} />
              </button>
            </form>
          )}
        </div>
      </div>
    </article>
  );
}

function Jour({ titre, jour, liste, montrerCommercial }: { titre: string; jour: string; liste: VisiteDuJour[]; montrerCommercial: boolean }) {
  return (
    <section aria-label={titre}>
      <div className={s.rubrique}>
        <h2>{titre}</h2>
        <small>{jourVisite(`${jour}T12:00:00Z`)}</small>
      </div>
      {liste.length ? (
        <div className={s.cartes}>
          {liste.map((v) => (
            <Carte key={`${v.rdvId ?? "v"}-${v.visiteId ?? v.dossierId}`} v={v} montrerCommercial={montrerCommercial} />
          ))}
        </div>
      ) : (
        <div className={s.videAccueil}>
          <i>
            <Picto nom="calendrier" taille={24} />
          </i>
          <span>
            <b>Aucune visite {titre === "Aujourd'hui" ? "aujourd'hui" : "demain"}</b>
            Les visites viennent du planning commercial du CRM.
          </span>
        </div>
      )}
    </section>
  );
}

export default async function Tablette({ searchParams }: { searchParams: Promise<{ tous?: string }> }) {
  const u = await currentUser();
  const sp = await searchParams;
  const commercial = u.role === "commercial";
  const tous = !commercial || sp.tous === "1";
  const [v, dossiers] = await Promise.all([
    visitesDuJour(tous ? null : u.id),
    q(
      `select d.id, d.ref, c.nom, c.prenom, c.societe from dossiers d join clients c on c.id = d.client_id
        where d.statut in ('prospect', 'visite') order by d.maj_le desc limit 80`,
    ),
  ]);

  return (
    <div className={s.accueil}>
      <header className={s.entete}>
        <div className={s.enteteHaut}>
          <span className={s.marque}>
            {/* eslint-disable-next-line @next/next/no-img-element -- le logo vectoriel de Bailly, servi tel quel */}
            <img src="/marque/bailly-logo-blanc.svg" alt="Bailly Déménagement" width={94} height={30} className={s.logo} />
            Visite technique
            <PastilleEnvironnement />
          </span>
          <nav className={s.enteteLiens} aria-label="Affichage">
            {commercial && (
              <>
                <Link href="/tablette" aria-current={!tous}>
                  Mes visites
                </Link>
                <Link href="/tablette?tous=1" aria-current={tous}>
                  Toute l&apos;équipe
                </Link>
              </>
            )}
            <Link href="/planning?vue=visites">
              <Picto nom="bureau" taille={18} /> CRM
            </Link>
            <span className={s.monogramme} title={u.nom} style={{ background: "rgba(255,255,255,.16)", color: "#fff", fontSize: 14 }}>
              {initiales(u.nom)}
            </span>
          </nav>
        </div>
        <h1 className={s.salut}>Bonjour {u.nom.split(" ")[0]}</h1>
        <p className={s.dateDuJour}>{jourVisite(`${v.jour}T12:00:00Z`, true)}</p>
      </header>

      <main className={s.contenu}>
        <Jour titre="Aujourd'hui" jour={v.jour} liste={v.aujourdhui} montrerCommercial={tous} />
        <Jour titre="Demain" jour={v.jourDemain} liste={v.demain} montrerCommercial={tous} />
        <form
          className={s.autre}
          action={async (f: FormData) => {
            "use server";
            const id = Number(f.get("dossier"));
            if (Number.isSafeInteger(id) && id > 0) await commencerVisite(id, null);
          }}
        >
          <p>
            <b>Une visite sans rendez-vous</b>
            Sur un dossier à visiter : l&apos;inventaire du dossier est repris tel quel.
          </p>
          <select name="dossier" required defaultValue="" aria-label="Dossier">
            <option value="" disabled>
              Choisir un dossier…
            </option>
            {dossiers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.ref} · {nomClient(d)}
              </option>
            ))}
          </select>
          <button className={s.boutonPlein}>
            <Picto nom="plume" taille={18} /> Ouvrir la visite
          </button>
        </form>
      </main>
    </div>
  );
}
