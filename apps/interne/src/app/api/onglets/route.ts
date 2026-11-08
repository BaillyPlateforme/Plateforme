import { NextResponse } from "next/server";
import { currentUser } from "@/crm/lib/auth";
import { q } from "@/crm/lib/db";
import { nomClient } from "@/crm/lib/format";

export const dynamic = "force-dynamic";

/*
 * Le titre des onglets de travail : pour chaque dossier ouvert, sa référence
 * et le nom du client, lus dans le CRM — jamais devinés depuis la page à
 * l'écran (un trajet ou un titre de devis s'y glissait). Réservé à l'équipe.
 */
export async function GET(request: Request) {
  try {
    await currentUser();
  } catch {
    return NextResponse.json({ erreur: "Réservé à l'équipe Bailly." }, { status: 403 });
  }
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isSafeInteger(n) && n > 0)
    .slice(0, 50);
  if (!ids.length) return NextResponse.json({ titres: {} });
  const rows = await q<{ id: number; ref: string; nom: string | null; prenom: string | null; societe: string | null }>(
    "select d.id, d.ref, c.nom, c.prenom, c.societe from dossiers d join clients c on c.id = d.client_id where d.id = any($1)",
    [ids],
  );
  return NextResponse.json({ titres: Object.fromEntries(rows.map((r) => [r.id, `${r.ref} · ${nomClient(r) || "Client"}`])) });
}
