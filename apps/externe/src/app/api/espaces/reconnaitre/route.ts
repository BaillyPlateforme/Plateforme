import { NextResponse } from "next/server";
import { reconnaitreEspace } from "@/lib/espaces-pro";
import { versPublic } from "@/lib/espaces";

export const dynamic = "force-dynamic";

// GET /api/espaces/reconnaitre?nom=Carrefour
// Le formulaire public demande si la société que le client vient de saisir a
// son espace pro. Si oui, il reçoit de quoi basculer dans cet espace : son
// habillage et ses règles — jamais la cote sur le volume, ni le code du lien
// (un jeton à part le remplace, qui n'ouvre pas la page de l'espace).
export async function GET(req: Request) {
  const nom = (new URL(req.url).searchParams.get("nom") ?? "").slice(0, 80);
  if (nom.trim().length < 3) return NextResponse.json({ espace: null });
  try {
    const espace = await reconnaitreEspace(nom);
    return NextResponse.json({ espace: espace ? versPublic(espace) : null });
  } catch {
    // Une configuration illisible ne doit pas empêcher de remplir le formulaire.
    return NextResponse.json({ espace: null });
  }
}
