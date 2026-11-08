import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceService, type Invoice } from "@e-invoice-eu/core";
import { currentUser } from "@/crm/lib/auth";
import { q1 } from "@/crm/lib/db";
import { getSettings } from "@/lib/settings";
import { factureComplete, mentionsDeLaFacture, mentionsEmetteur } from "@/crm/facturation/donnees";
import { FacturePdf } from "@/crm/facturation/FacturePdf";
import { factureVersEn16931, prealablesFacturX } from "@/crm/facturation/facturx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * GET /api/factures/[id]/facturx : la facture électronique, au format
 * Factur-X (profil EN 16931) — un PDF/A-3 lisible qui embarque le XML CII.
 * ?format=xml rend le XML CII seul. Tant que des données exigées par la
 * norme manquent, la réponse dit lesquelles (409), sans rien produire.
 */
const page = (titre: string, lignes: string[]) =>
  new Response(
    `<!doctype html><html lang="fr"><meta charset="utf-8"><title>${titre}</title><body style="font:15px/1.5 system-ui;max-width:720px;margin:48px auto;padding:0 20px;color:#17142b">
<h1 style="font-size:22px">${titre}</h1><p>La facture électronique (Factur-X, norme EN 16931) exige ces données, absentes aujourd'hui :</p>
<ul>${lignes.map((l) => `<li>${l.replace(/[<>&]/g, "")}</li>`).join("")}</ul>
<p>Elles se complètent dans les Paramètres (Facturation) et dans la fenêtre « Client facturé » du dossier ; aucune n'est inventée.</p>
<p><a href="javascript:history.back()">← Retour à la facture</a></p></body></html>`,
    { status: 409, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await currentUser();
  const f = await factureComplete(Number((await params).id));
  if (!f) return new Response("Facture introuvable", { status: 404 });
  const [actuelles, reglages, dossier] = await Promise.all([
    mentionsEmetteur(),
    getSettings().catch(() => null),
    f.dossierId
      ? q1<{ ref: string; depart: string | null; arrivee: string | null; livraison: string | null }>(`select d.ref, to_char(coalesce(d.date_livraison, d.date_chargement), 'YYYY-MM-DD') as livraison,
          (select adresse from etapes_trajet where dossier_id=d.id and genre='depart' order by ordre limit 1) as depart,
          (select adresse from etapes_trajet where dossier_id=d.id and genre='arrivee' order by ordre desc limit 1) as arrivee
          from dossiers d where d.id=$1`, [f.dossierId])
      : Promise.resolve(undefined),
  ]);
  const m = mentionsDeLaFacture(actuelles, f.mentions);
  const email = reglages?.entreprise_email?.trim() || null;
  const manque = prealablesFacturX(f, m, email);
  if (manque.length) return page(`Facture électronique ${f.numero} : données manquantes`, manque);

  const xmlSeul = new URL(req.url).searchParams.get("format") === "xml";
  const service = new InvoiceService({ log: () => {}, warn: (m: string) => console.warn("Factur-X :", m), error: (m: string) => console.error("Factur-X :", m) });
  const donnees = factureVersEn16931(f, m, email!, f.gardeMeuble ? null : dossier?.livraison ?? null) as unknown as Invoice;
  try {
    if (xmlSeul) {
      const xml = await service.generate(donnees, { format: "CII", lang: "fr-fr" });
      return new Response(typeof xml === "string" ? xml : new Uint8Array(xml), { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${f.numero}.xml"`, "Cache-Control": "no-store" } });
    }
    const trajet = dossier && (dossier.depart || dossier.arrivee) ? `${dossier.depart ?? "—"} → ${dossier.arrivee ?? "—"}` : null;
    const pdf = await renderToBuffer(FacturePdf({ f, m, refDossier: dossier?.ref ?? null, trajet }));
    const sortie = await service.generate(donnees, {
      format: "Factur-X-EN16931",
      lang: "fr-fr",
      pdf: { buffer: new Uint8Array(pdf), filename: `${f.numero}.pdf`, mimetype: "application/pdf" },
    });
    return new Response(typeof sortie === "string" ? sortie : new Uint8Array(sortie), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${f.numero}-facturx.pdf"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return page(`Facture électronique ${f.numero} : refusée par le contrôle de la norme`, [e instanceof Error ? e.message : "erreur inconnue"]);
  }
}
