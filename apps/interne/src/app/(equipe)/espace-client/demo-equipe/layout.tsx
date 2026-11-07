import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { demoEquipeActive } from "@/lib/espace-client/config";

export const metadata = { title: "Back-office de démonstration — Espace client Bailly", robots: { index: false, follow: false } };

/**
 * Le back-office de démonstration : les écrans de /dashboard/espace-client,
 * sans la session Supabase, sur les données fictives seulement. Il n'existe
 * qu'en démonstration (ESPACE_CLIENT_DONNEES=demo, données en mémoire), en
 * développement ou quand ESPACE_CLIENT_DEMO_EQUIPE=1 — jamais en mode « base »,
 * où les tables contiennent de vrais clients. Le bandeau le dit en toutes
 * lettres.
 */
export default function DemoEquipeLayout({ children }: { children: React.ReactNode }) {
  if (!demoEquipeActive()) notFound();
  return (
    <div className="min-h-dvh bg-shell">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1b1a18] px-5 py-3 text-[13px] text-white md:px-7">
        <div className="flex items-center gap-4">
          <Image src="/marque/bailly-logo-blanc.svg" alt="Bailly Déménagement" width={130} height={42} />
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-[11.5px] font-bold text-[#1b1a18]">DÉMONSTRATION</span>
          <span className="hidden text-white/70 md:inline">Back-office de l&apos;espace client, sans connexion, sur des données fictives. En production : /dashboard/espace-client.</span>
        </div>
        <Link href="/espace-client/connexion" className="font-medium text-brand hover:underline">
          Côté client →
        </Link>
      </div>
      {children}
    </div>
  );
}
