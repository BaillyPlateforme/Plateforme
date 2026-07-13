import { notFound } from "next/navigation";
import { getRequestByToken } from "@/lib/completion";
import { listLibraryPhotos } from "@/lib/library";
import CompletionForm from "./CompletionForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compléter ma demande — Bailly" };

export default async function CompleterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const req = await getRequestByToken(token);
  if (!req) notFound();
  const library = await listLibraryPhotos();

  return (
    <CompletionForm
      token={token}
      library={library}
      client={req.client_nom}
      manque={{
        volume: req.volume_m3 == null,
        depart: !req.depart_ville,
        arrivee: !req.arrivee_ville,
      }}
      villes={{ depart: req.depart_ville, arrivee: req.arrivee_ville }}
    />
  );
}
