import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/crm/lib/auth";
import { q } from "@/crm/lib/db";
import { emettreJetonApercu } from "@/lib/espace-client/apercu";
import { adressePublique } from "@/lib/espace-client/config";
import { depot } from "@/lib/espace-client/depot";
import { nomClient } from "@/lib/espace-client/format";
import { getAcces } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * « Voir son espace » : un membre de l'équipe ouvre, depuis le CRM, l'espace
 * d'un client tel que le client le voit — en lecture seule
 * (lib/espace-client/apercu.ts). `id` : le dossier de l'espace (ec_dossiers).
 *
 *   1. l'équipe seule : sans session, la connexion ; un autre compte, refusé.
 *      Une navigation venue d'un autre site est refusée aussi (Sec-Fetch-Site) :
 *      l'aperçu s'ouvre depuis le CRM, pas depuis un lien posé ailleurs ;
 *   2. l'ouverture est notée au fil d'activité du dossier du CRM (qui, quand) ;
 *      un espace sans dossier du CRM est noté dans le journal du serveur. Le
 *      journal de l'espace (ec_notifications) n'est pas pris : il ne contient
 *      que des messages, que l'équipe prévisualise comme tels ;
 *   3. un jeton de deux minutes, lié au client, part vers l'app externe dans
 *      le corps d'un formulaire POST, envoyé aussitôt — jamais dans une
 *      adresse, donc dans aucun historique ni journal HTTP.
 *
 * Rien n'est touché côté client : ni session (ec_sessions), ni lien d'accès.
 */

const UUID_OU_ID = /^[\w-]{1,64}$/;

const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Une page minimale, sans rien charger d'ailleurs : style en ligne, script seulement avec le nonce. */
function page(titre: string, corps: string, statut = 200, csp: { nonce?: string; formAction?: string } = {}) {
  const politique = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    csp.nonce ? `script-src 'nonce-${csp.nonce}'` : "script-src 'none'",
    `form-action ${csp.formAction ?? "'none'"}`,
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><title>${echapper(titre)}</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#12110f;color:#fff;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px;box-sizing:border-box}
main{max-width:460px;text-align:center}h1{font-size:20px;margin:0 0 8px}p{margin:0 0 18px;color:rgba(255,255,255,.75)}
button,a{display:inline-block;border:0;border-radius:999px;padding:10px 20px;background:#f5d033;color:#1b1a18;font:600 15px system-ui,sans-serif;cursor:pointer;text-decoration:none}
</style></head><body><main>${corps}</main></body></html>`;
  return new NextResponse(html, {
    status: statut,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": politique,
    },
  });
}

const message = (titre: string, texte: string, statut: number) =>
  page(titre, `<h1>${echapper(titre)}</h1><p>${echapper(texte)}</p><a href="/parcours">Revenir au CRM</a>`, statut);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // 1. L'équipe, et elle seule. Le proxy l'a déjà vérifié ; on le refait ici.
  const acces = await getAcces().catch(() => null);
  // Relative : derrière le proxy de Railway, req.url est l'adresse interne du conteneur.
  if (!acces) return new NextResponse(null, { status: 307, headers: { Location: `/login?redirect=${encodeURIComponent(req.nextUrl.pathname)}` } });
  if (acces.role !== "equipe") return message("Accès réservé à l'équipe", "L'aperçu de l'espace client est réservé à l'équipe Bailly.", 403);
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return message("Ouvrez l'aperçu depuis le CRM", "Pour votre sécurité, l'espace d'un client ne s'ouvre que depuis la fiche de son dossier, bouton « Voir son espace ».", 403);
  }
  const utilisateur = await currentUser();
  const par = utilisateur.nom?.trim() || acces.email;

  // 2. Le dossier de l'espace, et son client.
  const { id } = await params;
  const dossier = UUID_OU_ID.test(id) ? await depot().trouver("dossiers", id).catch(() => null) : null;
  const client = dossier ? await depot().trouver("clients", dossier.client_id).catch(() => null) : null;
  if (!dossier || !client) return message("Espace introuvable", "Ce dossier n'a pas (ou plus) d'espace client.", 404);

  // 3. Qui ouvre l'espace de qui, et quand : au fil d'activité du dossier du CRM.
  // Sans `maj_le` : regarder un dossier ne le modifie pas.
  const libelle = `Espace client ouvert en aperçu (lecture seule) par ${par}`;
  let note = false;
  if (typeof dossier.crm_dossier_id === "number") {
    const r = await q<{ id: number }>(
      "insert into activite(dossier_id, utilisateur_id, libelle) select $1, $2, $3 where exists (select 1 from dossiers where id = $1) returning id",
      [dossier.crm_dossier_id, utilisateur.id, libelle],
    ).catch((e) => {
      console.error("Aperçu de l'espace client : note au CRM impossible", e instanceof Error ? e.message : e);
      return null;
    });
    // Une ouverture qui ne se note pas ne se fait pas.
    if (!r) return message("Aperçu indisponible", "L'ouverture n'a pas pu être notée dans le dossier : réessayez dans un instant.", 503);
    note = r.length > 0;
  }
  if (!note) console.info(`Aperçu de l'espace client ${dossier.reference} ouvert par ${par} (sans dossier du CRM où le noter).`);

  // 4. Le jeton, porté par un formulaire envoyé aussitôt à l'app externe.
  const externe = await adressePublique();
  const cible = `${externe}/espace-client/apercu`;
  const jeton = emettreJetonApercu({ clientId: client.id, reference: dossier.reference, par });
  const nonce = randomBytes(16).toString("base64");
  const nom = client.societe || nomClient(client);
  return page(
    "Ouverture de l'espace client…",
    `<form id="apercu" method="post" action="${echapper(cible)}"><input type="hidden" name="jeton" value="${echapper(jeton)}">` +
      `<h1>Espace de ${echapper(nom)}</h1><p>Ouverture de l'aperçu, en lecture seule…</p>` +
      `<noscript><button type="submit">Ouvrir l'aperçu</button></noscript></form>` +
      `<script nonce="${nonce}">document.getElementById("apercu").submit();</script>`,
    200,
    { nonce, formAction: new URL(externe).origin },
  );
}
