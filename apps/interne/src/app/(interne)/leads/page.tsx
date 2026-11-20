import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PastilleEnvironnement } from "@/components/PastilleEnvironnement";
import SuiviLeads from "@/crm/demandes/SuiviLeads";
import { signOut } from "@/lib/actions/auth";
import { accesLeads } from "@/lib/marketing";
import { listLeads } from "@/lib/suivi";
import { anonymiser } from "@/lib/suivi-commun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Suivi des leads" };

/*
 * Le suivi des leads d'une agence de marketing (Noiise, demande de Margaux du
 * 20/11/2026 ; choix de David : un accès limité aux leads, en lecture seule).
 *
 * La seule page qu'ouvre un compte « marketing » (lib/marketing.ts, et le
 * proxy de l'app). Hors de la coque du CRM : ni menu, ni alertes, ni compteurs
 * — rien de ce que la coque lit pour l'équipe. Chaque lead est anonymisé ICI,
 * côté serveur, avant de partir au navigateur : nom, e-mail, téléphone,
 * société, espace pro et note de l'équipe n'en sortent jamais. Un membre de
 * l'équipe peut l'ouvrir aussi, pour voir ce que voit l'agence.
 */
export default async function PageLeads() {
  const acces = await accesLeads();
  if (!acces) redirect("/login");
  const leads = await listLeads()
    .then((ls) => ls.map(anonymiser))
    .catch(() => null);
  // Le jour de Paris, lu par le serveur : le même pour son rendu et celui du navigateur.
  const aujourdhui = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

  return (
    <div className="vue-equipe min-h-screen">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-3 md:px-8">
          <div className="flex min-w-0 items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- le logo vectoriel de Bailly, servi tel quel */}
            <img src="/marque/bailly-logo.svg" alt="Bailly Déménagement" width={94} height={30} />
            <PastilleEnvironnement />
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-[12.5px] text-ink-soft md:block">{acces.email}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="whitespace-nowrap rounded-full border border-line px-3.5 py-1.5 text-[12.5px] font-medium text-ink transition hover:bg-subtle"
              >
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 py-6 md:px-8 md:py-8">
        <div className="mb-6">
          <h1 className="text-[26px] font-bold tracking-tight text-ink">Suivi des leads</h1>
          <p className="mt-1 max-w-[720px] text-[14px] text-ink-mid">
            Les demandes arrivées par le site de Bailly, leur avancement et leur chiffre d&apos;affaires. Les coordonnées des
            clients n&apos;y figurent pas.
          </p>
          {acces.role === "equipe" && (
            <p className="mt-3 inline-flex rounded-full bg-brand-soft px-3 py-1 text-[12px] font-medium text-brand-ink">
              Aperçu de l&apos;équipe : c&apos;est exactement ce que voit une agence de marketing.
            </p>
          )}
        </div>
        {leads ? (
          <SuiviLeads leads={leads} aujourdhui={aujourdhui} lectureSeule />
        ) : (
          <p role="alert" className="rounded-[18px] bg-card px-5 py-8 text-center text-[14px] text-ink-soft">
            Le suivi des leads ne se lit pas pour le moment : réessayez dans un instant.
          </p>
        )}
      </main>
    </div>
  );
}
