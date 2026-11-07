import { NextResponse } from "next/server";
import { currentUser } from "@/crm/lib/auth";
import { repondre, type Message } from "@/crm/copilote/moteur";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
 * Le Copilote : une question (et la conversation qui précède) → une réponse
 * construite à partir des lectures du CRM. Réservé à l'équipe : le proxy le
 * vérifie, `currentUser()` le revérifie (membre actif de l'équipe).
 */
export async function POST(request: Request) {
  let prenom = "l'équipe";
  try {
    const u = await currentUser();
    prenom = u.nom.split(" ")[0] || prenom;
  } catch {
    return NextResponse.json({ erreur: "Réservé à l'équipe Bailly." }, { status: 403 });
  }

  const corps = (await request.json().catch(() => null)) as { messages?: unknown } | null;
  const brut = Array.isArray(corps?.messages) ? corps.messages : [];
  const messages: Message[] = brut
    .slice(-20)
    .map((m) => m as { role?: unknown; texte?: unknown })
    .filter((m) => (m.role === "utilisateur" || m.role === "copilote") && typeof m.texte === "string" && m.texte.trim())
    .map((m) => ({ role: m.role as Message["role"], texte: String(m.texte).slice(0, 4000) }));
  if (!messages.length || messages[messages.length - 1].role !== "utilisateur") {
    return NextResponse.json({ erreur: "Posez une question." }, { status: 400 });
  }

  try {
    return NextResponse.json(await repondre(messages, prenom));
  } catch (e) {
    console.error("Copilote :", e);
    const m = e instanceof Error ? e.message : "";
    const lisible = /GEMINI_API_KEY/.test(m) ? m : "Le Copilote n'a pas pu répondre. Réessayez dans un instant.";
    return NextResponse.json({ erreur: lisible }, { status: 502 });
  }
}
