import { NextResponse } from "next/server";

/**
 * Le corps JSON d'une requête publique, plafonné : sans plafond, un robot
 * pouvait enregistrer des mégaoctets par demande (champs libres, détails). La
 * plus grosse demande légitime — douze photos analysées et leurs objets — tient
 * en quelques dizaines de kilo-octets.
 */
export const CORPS_MAX = 300_000;

export async function lireJsonBorne(req: Request, max = CORPS_MAX): Promise<{ ok: true; corps: unknown } | { ok: false; reponse: NextResponse }> {
  const annonce = Number(req.headers.get("content-length"));
  if (Number.isFinite(annonce) && annonce > max) return { ok: false, reponse: NextResponse.json({ error: "Demande trop volumineuse." }, { status: 413 }) };
  const texte = await req.text();
  if (texte.length > max) return { ok: false, reponse: NextResponse.json({ error: "Demande trop volumineuse." }, { status: 413 }) };
  try {
    return { ok: true, corps: JSON.parse(texte) };
  } catch {
    return { ok: false, reponse: NextResponse.json({ error: "JSON invalide" }, { status: 400 }) };
  }
}
