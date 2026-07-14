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
      data={{
        client_nom: req.client_nom,
        client_email: req.client_email,
        client_tel: req.client_tel,
        date_souhaitee: req.date_souhaitee,
        volume_m3: req.volume_m3,
        depart: {
          adresse: req.depart_adresse,
          code_postal: req.depart_code_postal,
          ville: req.depart_ville,
          etage: req.depart_etage,
          ascenseur: req.depart_ascenseur,
        },
        arrivee: {
          adresse: req.arrivee_adresse,
          code_postal: req.arrivee_code_postal,
          ville: req.arrivee_ville,
          etage: req.arrivee_etage,
          ascenseur: req.arrivee_ascenseur,
        },
      }}
    />
  );
}
