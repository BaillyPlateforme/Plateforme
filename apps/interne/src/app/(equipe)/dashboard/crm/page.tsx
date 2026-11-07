"use client";

import Link from "next/link";
import { useRessource } from "@/lib/donnees";
import type { ClientSummary } from "@/lib/clients";
import type { DevisRow, RequestRow } from "@/lib/types";

/*
 * BaillyCRM — l'outil métier qui prendra le relais de Créagidem.
 *
 * Pour l'instant, il rassemble ce qui existe déjà dans l'espace équipe : les
 * devis, les clients et l'agenda des déménagements. La suite est celle que
 * l'équipe a décrite à la réunion du 29 octobre 2026 ; elle se précisera
 * avec elle avant d'être construite.
 */

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** Ce que l'équipe a reproché à Créagidem, ou demandé, le 29 octobre — rien d'autre. */
const A_VENIR: { titre: string; detail: string }[] = [
  {
    titre: "Le planning des commerciaux",
    detail: "Relié aux fiches de visite, pour qu'une visite réservée ne tombe jamais sur une autre déjà planifiée.",
  },
  {
    titre: "La prise de rendez-vous en ligne",
    detail: "Le client professionnel choisit son créneau de visite, et il arrive dans les agendas Outlook de l'équipe.",
  },
  {
    titre: "Les devis au nom du payeur",
    detail: "Choisi devis par devis, sans bloquer le travail des autres.",
  },
  {
    titre: "Le dossier sur un seul écran",
    detail: "Le prix et les détails dans la même fenêtre, et l'impression en un clic.",
  },
  {
    titre: "Le chiffre d'affaires suivi de bout en bout",
    detail: "Du lead au devis signé, sans ressaisie dans un tableau à part.",
  },
];

export default function CrmPage() {
  const devis = useRessource<{ devis: DevisRow[] }>("/api/data/devis");
  const clients = useRessource<{ clients: ClientSummary[] }>("/api/data/clients");
  const demandes = useRessource<{ requests: RequestRow[] }>("/api/data/demandes");

  const listeDevis = devis.donnees?.devis;
  const aSigner = listeDevis?.filter((d) => d.status === "envoye").length;
  const acceptes = listeDevis?.filter((d) => d.status === "accepte");
  const caAccepte = acceptes?.reduce((s, d) => s + d.montant_ttc, 0);
  const maintenant = new Date();
  const aVenir = demandes.donnees?.requests.filter((r) => r.date_souhaitee && new Date(r.date_souhaitee) >= maintenant).length;

  return (
    <div className="space-y-5 px-5 py-5 md:px-7 md:py-6">
      <section className="relative overflow-hidden rounded-[22px] bg-[#1b1a18] p-6 text-white md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand/15 blur-2xl" />
        <div className="relative max-w-[640px]">
          <span className="inline-flex rounded-full bg-brand px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#1b1a18]">
            En préparation
          </span>
          <h1 className="mt-4 font-serif text-[clamp(26px,3vw,36px)] font-bold leading-tight">BaillyCRM</h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-white/75">
            L&apos;outil métier de Bailly, construit autour de votre façon de travailler. Il réunit déjà les devis, les
            clients et l&apos;agenda ; le reste se construira avec vous, sur ce que vous avez décrit le 29 octobre.
          </p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Outil
          href="/dashboard/devis"
          titre="Devis"
          chiffre={listeDevis?.length}
          detail={
            listeDevis
              ? `${aSigner} en attente de signature · ${nf.format(caAccepte ?? 0)} € TTC acceptés`
              : devis.erreur ? "Indisponible pour l'instant" : "…"
          }
          icone={<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" />}
        />
        <Outil
          href="/dashboard/clients"
          titre="Clients"
          chiffre={clients.donnees?.clients.length}
          detail={
            clients.donnees
              ? `${clients.donnees.clients.filter((c) => c.societe).length} avec une société`
              : clients.erreur ? "Indisponible pour l'instant" : "…"
          }
          icone={<path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 20v-1a4 4 0 0 0-3-3.9M15 4.1a3.5 3.5 0 0 1 0 6.8" />}
        />
        <Outil
          href="/dashboard/agenda"
          titre="Agenda"
          chiffre={aVenir}
          detail={demandes.donnees ? "déménagements à venir" : demandes.erreur ? "Indisponible pour l'instant" : "…"}
          icone={<path d="M4 6h16v15H4zM4 10h16M8 3v4M16 3v4" />}
        />
      </div>

      <section className="rounded-[18px] bg-card p-5 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[17px] font-semibold">La suite</h2>
          <span className="text-[12px] text-ink-soft">D&apos;après la réunion du 29 octobre 2026 — à préciser ensemble</span>
        </div>
        <ol className="mt-4 grid gap-3 md:grid-cols-2">
          {A_VENIR.map((a, i) => (
            <li key={a.titre} className="flex gap-3.5 rounded-[14px] border border-line p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-subtle text-[12px] font-bold text-ink-mid">
                {i + 1}
              </span>
              <div>
                <div className="text-[14px] font-semibold text-ink">{a.titre}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{a.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Outil({
  href,
  titre,
  chiffre,
  detail,
  icone,
}: {
  href: string;
  titre: string;
  chiffre?: number;
  detail: string;
  icone: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-[18px] bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-18px_rgba(0,0,0,0.35)]"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-brand-soft text-brand-ink">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {icone}
          </svg>
        </span>
        <span className="text-[13px] font-semibold text-ink-soft transition group-hover:translate-x-0.5 group-hover:text-ink">
          Ouvrir →
        </span>
      </div>
      <div className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{titre}</div>
      <div className="mt-1.5 font-serif text-[30px] font-bold leading-none text-ink">{chiffre == null ? "—" : nf.format(chiffre)}</div>
      <div className="mt-2 text-[12px] text-ink-soft">{detail}</div>
    </Link>
  );
}
