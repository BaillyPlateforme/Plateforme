import type { Metadata } from "next";
import Connexion from "./Connexion";
import s from "@/terrain/composants/terrain.module.css";

export const metadata: Metadata = { title: "Connexion" };

/*
 * La connexion des déménageurs : un identifiant court et un mot de passe,
 * donnés par le bureau. Ouverte sans session (le proxy la laisse passer) ; un
 * déménageur déjà connecté va droit à ses chantiers.
 */
export default async function ConnexionTerrain({ searchParams }: { searchParams: Promise<{ redirect?: string }> }) {
  const { redirect } = await searchParams;
  // Un retour dans l'outil seulement, jamais ailleurs.
  const cible = redirect && /^\/terrain(\/[\w/-]*)?$/.test(redirect) && redirect !== "/terrain/connexion" ? redirect : "/terrain";
  return (
    <div className={s.connexion}>
      <header className={s.connexionHaut}>
        <span className={s.marque}>
          {/* eslint-disable-next-line @next/next/no-img-element -- le logo vectoriel de Bailly, servi tel quel */}
          <img src="/marque/bailly-logo-blanc.svg" alt="Bailly Déménagement" width={94} height={30} className={s.logo} />
          Terrain
        </span>
        <h1>Vos chantiers et vos photos, sur le téléphone.</h1>
        <p>Les dossiers du jour, l&apos;adresse, l&apos;équipe, et les photos avant, après et de détail.</p>
      </header>
      <main className={s.feuille}>
        <h2>Connexion</h2>
        <Connexion cible={cible} />
      </main>
    </div>
  );
}
