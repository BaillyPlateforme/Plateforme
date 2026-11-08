import { redirect } from "next/navigation";
import { lireJeton } from "@/lib/alertes-equipe";
import { alerteDe } from "@/lib/alertes-equipe/catalogue";
import { desabonnerParJeton } from "@/crm/alertes/actions";
import s from "@/crm/alertes/alertes.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: { absolute: "Alertes de l’équipe — Bailly Déménagement" },
  robots: { index: false, follow: false },
};

/*
 * Le désabonnement d'une alerte de l'équipe, depuis le lien de l'e-mail.
 * Page publique (le proxy la laisse passer, voir proxy.ts) : le jeton signé
 * du lien est la seule clé. Le lien seul ne désabonne pas — un antivirus de
 * messagerie qui « ouvre » les liens ne doit rien changer : il faut cliquer
 * sur le bouton.
 */
export default async function Desabonnement({ params, searchParams }: { params: Promise<{ jeton: string }>; searchParams: Promise<{ fait?: string }> }) {
  const { jeton } = await params;
  const { fait } = await searchParams;
  const j = lireJeton(jeton);
  const def = j ? alerteDe(j.alerte) : null;

  async function changer(formData: FormData) {
    "use server";
    const abonne = formData.get("abonne") === "1";
    const r = await desabonnerParJeton(jeton, abonne);
    redirect(`/desabonnement/${jeton}?fait=${r.ok ? (abonne ? "abonne" : "desabonne") : "erreur"}`);
  }

  return (
    <main className={s.desabo}>
      <div className={s.desaboCarte}>
        {/* eslint-disable-next-line @next/next/no-img-element -- le logo de Bailly, servi tel quel */}
        <img src="/marque/bailly-logo.svg" alt="Bailly Déménagement" />
        {!j || !def ? (
          <>
            <h1>Lien non valide</h1>
            <p>Ce lien de désabonnement n’est pas reconnu. Les abonnements se règlent aussi dans BaillyCRM : Relances › Alertes de l’équipe.</p>
          </>
        ) : (
          <>
            <h1>Alerte « {def.titre} »</h1>
            <p>
              Adresse : <b>{j.email}</b>
              <br />
              {def.quand}
            </p>
            {fait === "desabonne" && <p className={s.desaboOk}>C’est fait : cette adresse ne recevra plus cette alerte.</p>}
            {fait === "abonne" && <p className={s.desaboOk}>C’est fait : cette adresse reçoit de nouveau cette alerte.</p>}
            {fait === "erreur" && <p className={s.desaboKo}>Le changement n’a pas pu être enregistré. Réessayez, ou réglez-le dans BaillyCRM.</p>}
            <form action={changer}>
              {fait === "desabonne" ? (
                <button type="submit" name="abonne" value="1" data-ton="contour">
                  Me réabonner
                </button>
              ) : (
                <button type="submit" name="abonne" value="0">
                  Ne plus recevoir cette alerte
                </button>
              )}
            </form>
            <p style={{ fontSize: 13, color: "#8b889c" }}>Les autres alertes ne changent pas. Tout se règle aussi dans BaillyCRM : Relances › Alertes de l’équipe.</p>
          </>
        )}
      </div>
    </main>
  );
}
