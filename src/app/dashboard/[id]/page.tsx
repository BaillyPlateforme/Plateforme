import { notFound } from "next/navigation";
import Link from "next/link";
import { getRequestDetail } from "@/lib/requests";
import { listGrids } from "@/lib/grids";
import { createServiceClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import RequestDetail from "./RequestDetail";

export const dynamic = "force-dynamic";

export default async function RequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, grids] = await Promise.all([getRequestDetail(id), listGrids()]);
  if (!detail) notFound();

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
