import Link from "next/link";
import { getClientDetail } from "@/lib/clients";
import { listDevisForClient } from "@/lib/devis";
import ClientProfileEditor from "./ClientProfileEditor";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ email: string }> }) {
  const { email: raw } = await params;
  const email = decodeURIComponent(raw);
  const [detail, devis] = await Promise.all([getClientDetail(email), listDevisForClient(email)]);

  return (
    <div className="px-6 py-8 md:px-10">
      <Link href="/dashboard/clients" className="text-sm text-ink-soft transition hover:text-accent">
        ← Tous les clients
      </Link>
      <h1 className="mt-3 font-serif text-3xl">{detail.profile?.nom ?? email}</h1>
      <p className="text-sm text-ink-soft">{email}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-2xl border border-line bg-card p-5">
            <h3 className="eyebrow mb-4 text-ink-soft">Demandes ({detail.requests.length})</h3>
            {detail.requests.length === 0 ? (
              <p className="text-sm text-ink-soft">Aucune demande.</p>
            ) : (
              <div className="divide-y divide-line/70">
                {detail.requests.map((r) => (
                  <Link
                    key={r.id}
                    href={`/dashboard/${r.id}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:text-accent"
                  >
                    <span>
                      {r.depart_ville ?? "?"} → {r.arrivee_ville ?? "?"}
                      <span className="ml-2 text-xs text-ink-soft">
                        {new Date(r.created_at).toLocaleDateString("fr-FR")}
                      </span>
                    </span>
                    <span className="tabular-nums text-ink-soft">
                      {r.volume_m3 != null ? `${r.volume_m3} m³` : "—"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-card p-5">
            <h3 className="eyebrow mb-4 text-ink-soft">Devis ({devis.length})</h3>
            {devis.length === 0 ? (
              <p className="text-sm text-ink-soft">Aucun devis.</p>
            ) : (
              <div className="divide-y divide-line/70">
                {devis.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="font-medium">{d.reference}</span>
                    <span className="tabular-nums">{Math.round(d.montant_ttc).toLocaleString("fr-FR")} € TTC</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <ClientProfileEditor email={email} profile={detail.profile} />
      </div>
    </div>
  );
}
