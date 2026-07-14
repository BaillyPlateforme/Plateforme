import { notFound } from "next/navigation";
import Link from "next/link";
import { getRequestDetail } from "@/lib/requests";
import { listGrids } from "@/lib/grids";
import { createServiceClient } from "@/lib/supabase/server";
import { qualifyRequest } from "@/lib/qualification";
import { env } from "@/lib/env";
import RequestDetail from "./RequestDetail";

export const dynamic = "force-dynamic";

export default async function RequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let detail = await getRequestDetail(id);
  if (!detail) notFound();

  // Filet de sécurité : si la demande est complète mais pas encore analysée
  // (ancienne demande), on génère l'estimation + l'évaluation automatiquement.
  const r = detail.request;
  const complete = r.volume_m3 != null && !!r.depart_ville && !!r.arrivee_ville;
  const hasAnalysis = detail.events.some((e) => e.type === "analysis");
  if (complete && !hasAnalysis) {
    await qualifyRequest(id);
    detail = (await getRequestDetail(id)) ?? detail;
  }

  const grids = await listGrids();

  // URLs signées pour afficher les photos du bucket privé.
  const supabase = createServiceClient();
  const bucket = env.storageBucket();
  const photoUrls: Record<string, string> = {};
  await Promise.all(
    detail.photos.map(async (p) => {
      const { data } = await supabase.storage.from(bucket).createSignedUrl(p.storage_path, 3600);
      if (data?.signedUrl) photoUrls[p.id] = data.signedUrl;
    }),
  );

  return (
    <div className="px-6 py-8 md:px-10">
      <Link href="/dashboard" className="text-sm text-ink-soft transition hover:text-accent">
        ← Toutes les demandes
      </Link>
      <RequestDetail detail={detail} grids={grids} photoUrls={photoUrls} />
    </div>
  );
}
