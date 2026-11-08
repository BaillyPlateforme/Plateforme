import { NextResponse } from "next/server";
import { currentUser } from "@/crm/lib/auth";
import { repondreEnFlux, type Message } from "@/crm/copilote/moteur";
import type { Evenement } from "@/crm/copilote/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
 * Le Copilote : une question (et la conversation qui précède) → une réponse
 * construite à partir des lectures du CRM, envoyée en flux : une ligne JSON
 * par événement (types.ts : outil consulté, éléments trouvés, texte, fin).
 * Réservé à l'équipe : le proxy le vérifie, `currentUser()` le revérifie
 * (membre actif de l'équipe). Quitter la page ou « Arrêter » coupe le flux,
 * et Gemini avec lui.
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

  const encodeur = new TextEncoder();
  const flux = new ReadableStream<Uint8Array>({
    async start(controller) {
      let ouvert = true;
      const emettre = (e: Evenement, bourrage = "") => {
        if (!ouvert) return;
        try {
          controller.enqueue(encodeur.encode(JSON.stringify(e) + bourrage + "\n"));
        } catch {
          ouvert = false;
        }
      };
      // Safari attend 1 Ko avant d'afficher un flux : la première ligne le remplit.
      emettre({ t: "debut" }, " ".repeat(1024));
      try {
        await repondreEnFlux(messages, prenom, emettre, request.signal);
      } catch (e) {
        if (!request.signal.aborted) {
          console.error("Copilote :", e);
          const m = e instanceof Error ? e.message : "";
          emettre({ t: "erreur", message: /GEMINI_API_KEY/.test(m) ? m : "Le Copilote n'a pas pu répondre. Réessayez dans un instant." });
        }
      } finally {
        ouvert = false;
        try {
          controller.close();
        } catch {
          /* déjà fermé par le client */
        }
      }
    },
  });

  return new Response(flux, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // no-transform : la compression ne retient pas les morceaux.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
