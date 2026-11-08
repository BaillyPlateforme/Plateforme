import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { seDeconnecter } from "@/terrain/actions";
import { estPorteur, porteurConnecte } from "@/terrain/lib/acces";
import { Picto } from "@/terrain/composants/Picto";
import Refus from "@/terrain/composants/Refus";
import s from "@/terrain/composants/terrain.module.css";
import MotDePasse from "./MotDePasse";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mon compte" };

/** Le compte : qui est connecté, le choix du mot de passe, la déconnexion. */
export default async function Compte() {
  const p = await porteurConnecte();
  if (!p) redirect("/terrain/connexion");
  if (!estPorteur(p)) return <Refus refus={p.refus} />;
  const initiales = p.nom
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => m[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      <div className={s.barre}>
        <Link href="/terrain" className={s.retour}>
          <Picto nom="retour" />
          Chantiers
        </Link>
      </div>
      <main className={s.contenu}>
        <section className={s.bloc}>
          <div className={s.identite}>
            <span className={s.avatar}>{initiales}</span>
            <span>
              <b>{p.nom}</b>
              {p.genre === "agent" ? (
                <>
                  <small>Identifiant : {p.agent.identifiant}</small>
                  <small>{p.equipe ?? (p.agent.interimaire ? "Intérimaire" : "Sans équipe")}</small>
                </>
              ) : (
                <small>Équipe du bureau</small>
              )}
            </span>
          </div>
        </section>

        {p.genre === "agent" ? (
          <section className={s.bloc}>
            <p className={s.surtitre}>Mot de passe</p>
            {p.agent.mdpProvisoire && <p className={s.aide} style={{ marginTop: 0 }}>Vous utilisez le mot de passe provisoire donné par le bureau.</p>}
            <MotDePasse />
          </section>
        ) : (
          <section className={s.bloc}>
            <p className={s.surtitre}>Bureau</p>
            <p className={s.aide} style={{ marginTop: 0 }}>Vous voyez l&apos;outil tel que le voient les déménageurs, avec tous les chantiers du jour.</p>
            {/* Une autre mise en page racine : Next recharge la page entière, comme le faisait le lien simple. */}
            <Link className={s.boutonContour} href="/partenaires?vue=demenageurs">
              <Picto nom="bureau" taille={20} />
              Retour au CRM
            </Link>
          </section>
        )}

        <form action={seDeconnecter}>
          <button type="submit" className={s.boutonSortie}>
            <Picto nom="sortie" />
            Se déconnecter
          </button>
        </form>
      </main>
    </>
  );
}
