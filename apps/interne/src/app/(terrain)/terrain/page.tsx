import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { estPorteur, porteurConnecte, type Porteur } from "@/terrain/lib/acces";
import { chantiersDuJour, jourParis, type Chantier } from "@/terrain/lib/planning";
import { jourLong } from "@/terrain/regles";
import CarteChantier from "@/terrain/composants/CarteChantier";
import { Picto } from "@/terrain/composants/Picto";
import Refus from "@/terrain/composants/Refus";
import s from "@/terrain/composants/terrain.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mes chantiers" };

/*
 * L'accueil de l'outil terrain : les chantiers d'aujourd'hui et de demain,
 * lus dans le planning d'exploitation. Un déménageur rattaché à une équipe
 * voit d'abord les siens, puis ceux des autres équipes (un renfort, un
 * intérimaire change d'équipe d'un jour à l'autre) ; l'équipe du bureau voit
 * tout, équipe par équipe.
 */

const cleEquipe = (e: string | null) => (e ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const initiales = (nom: string) =>
  nom
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => m[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function Jour({ titre, jour, liste, porteur }: { titre: string; jour: string; liste: Chantier[]; porteur: Porteur }) {
  const equipe = porteur.genre === "agent" ? porteur.equipe : null;
  const miens = equipe ? liste.filter((c) => cleEquipe(c.equipeCourte) === cleEquipe(equipe)) : liste;
  const autres = equipe ? liste.filter((c) => cleEquipe(c.equipeCourte) !== cleEquipe(equipe)) : [];
  return (
    <section aria-label={titre}>
      <div className={s.rubrique}>
        <h2>
          {titre}
          <small>{jourLong(jour)}</small>
        </h2>
        <span className={s.nombre} aria-label={`${miens.length} chantier${miens.length > 1 ? "s" : ""}`}>
          {miens.length}
        </span>
      </div>
      {miens.length === 0 ? (
        <div className={s.vide}>
          <span className={s.videPicto}>
            <Picto nom="calendrier" taille={26} />
          </span>
          <b>{equipe ? `Rien pour ${equipe} ${titre === "Aujourd'hui" ? "aujourd'hui" : "demain"}` : `Aucun chantier ${titre === "Aujourd'hui" ? "aujourd'hui" : "demain"}`}</b>
          <p>{autres.length ? "Les chantiers des autres équipes sont juste en dessous." : "Rien n'est inscrit au planning d'exploitation pour ce jour."}</p>
        </div>
      ) : (
        <div className={s.pile}>
          {miens.map((c) => (
            <CarteChantier key={c.cle} c={c} montrerEquipe={!equipe} />
          ))}
        </div>
      )}
      {autres.length > 0 && (
        <>
          <p className={s.sousTitre}>Autres équipes · {autres.length}</p>
          <div className={s.pile}>
            {autres.map((c) => (
              <CarteChantier key={c.cle} c={c} montrerEquipe />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default async function Terrain() {
  const p = await porteurConnecte();
  if (!p) redirect("/terrain/connexion");
  if (!estPorteur(p)) return <Refus refus={p.refus} />;

  const [chantiers, auj] = await Promise.all([chantiersDuJour(), jourParis()]);
  const demain = new Date(`${auj}T12:00:00Z`);
  demain.setUTCDate(demain.getUTCDate() + 1);
  const dem = demain.toISOString().slice(0, 10);
  const prenom = p.genre === "agent" ? p.agent.prenom : p.nom.split(" ")[0];

  return (
    <>
      <header className={s.entete}>
        <div className={s.enteteHaut}>
          <span className={s.marque}>
            {/* eslint-disable-next-line @next/next/no-img-element -- le logo vectoriel de Bailly, servi tel quel */}
            <img src="/marque/bailly-logo-blanc.svg" alt="Bailly Déménagement" width={94} height={30} className={s.logo} />
            Terrain
          </span>
          <Link href="/terrain/compte" className={s.avatar} aria-label="Mon compte">
            {initiales(p.nom)}
          </Link>
        </div>
        <h1 className={s.salut}>Bonjour {prenom}</h1>
        <p className={s.dateDuJour}>{jourLong(auj)}</p>
        <div className={s.puces}>
          {p.genre === "agent" ? (
            <span className={s.puceVerre}>
              <Picto nom="equipe" taille={17} />
              {p.equipe ?? (p.agent.interimaire ? "Intérimaire" : "Sans équipe")}
            </span>
          ) : (
            <span className={s.puceVerre}>
              <Picto nom="bureau" taille={17} />
              Bureau · tous les chantiers
            </span>
          )}
        </div>
      </header>

      <main className={s.contenu}>
        {p.genre === "agent" && p.agent.mdpProvisoire && (
          <div className={s.avis} style={{ marginBottom: 8 }}>
            <Picto nom="cle" />
            <b>Mot de passe provisoire</b>
            <p>C&apos;est celui que le bureau vous a donné. Choisissez le vôtre.</p>
            <Link href="/terrain/compte">Choisir mon mot de passe</Link>
          </div>
        )}
        <Jour titre="Aujourd'hui" jour={auj} liste={chantiers.filter((c) => c.decalage === 0)} porteur={p} />
        <Jour titre="Demain" jour={dem} liste={chantiers.filter((c) => c.decalage === 1)} porteur={p} />
      </main>
    </>
  );
}
