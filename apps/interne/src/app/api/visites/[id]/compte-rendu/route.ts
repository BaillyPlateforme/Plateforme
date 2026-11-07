import { NextResponse } from "next/server";
import { q1 } from "@/crm/lib/db";
import { equipier, identifiant } from "@/crm/visites/acces";
import { pdfALaVolee, urlDocument } from "@/crm/visites/compte-rendu";
import { reponsePdf } from "@/lib/espace-client/pdf";

export const dynamic = "force-dynamic";

/*
 * GET /api/visites/<id>/compte-rendu[?telecharger=1] — le PDF d'un
 * compte-rendu signé, pour l'équipe. Le fichier rangé à la signature est
 * servi par une URL signée d'une minute ; s'il manque (dépôt échoué), il est
 * produit à la volée depuis le contenu figé, qui ne change pas.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await equipier())) return new NextResponse(null, { status: 401 });
  const id = identifiant((await params).id);
  if (!id) return new NextResponse(null, { status: 404 });
  const v = await q1<{ statut: string; document_chemin: string | null; ref: string; signe_le: Date | null }>(
    "select v.statut, v.document_chemin, d.ref, v.signe_le from visites v join dossiers d on d.id = v.dossier_id where v.id = $1",
    [id],
  );
  if (!v || v.statut !== "signee") return new NextResponse(null, { status: 404 });
  const telecharger = new URL(req.url).searchParams.has("telecharger");
  const nom = `compte-rendu-visite-${v.ref}-${new Date(v.signe_le!).toISOString().slice(0, 10)}.pdf`;
  try {
    if (v.document_chemin) {
      const cible = await urlDocument(v.document_chemin, telecharger ? nom : undefined);
      return NextResponse.redirect(cible, { status: 302, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
    }
    const pdf = await pdfALaVolee(id);
    return pdf ? reponsePdf(pdf, nom, telecharger) : new NextResponse(null, { status: 404 });
  } catch (e) {
    console.error("Visite technique : compte-rendu", e);
    return new NextResponse(null, { status: 502 });
  }
}
