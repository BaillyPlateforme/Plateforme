import Link from "next/link";
import { notFound } from "next/navigation";
import { getDossier } from "@/crm/lib/data";
import { currentUser } from "@/crm/lib/auth";
import { PrintButton } from "@/crm/components/PrintButton";
import type { Row } from "@/crm/lib/db";
import DevisBailly from "@/crm/documents/DevisBailly";
import { FicheVisiteBailly, LettreVoitureBailly, SousTraitanceBailly } from "@/crm/documents/DocumentsDossier";
import FactureBailly, { AvisMentions, mentionsManquantes } from "@/crm/documents/FactureBailly";
import { factureComplete, mentionsDeLaFacture, mentionsEmetteur } from "@/crm/facturation/donnees";
import { versInterne } from "@/lib/adresses";

export const dynamic = "force-dynamic";

export default async function Imprimer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string; lv?: string; f?: string }> }) {
  await currentUser();
  const idDossier = Number((await params).id);
  const sp = await searchParams;
  // La facture, l'avoir, la facture d'arrhes : un document client aux couleurs de Bailly (src/crm/facturation).
  // Une facture de garde-meuble sans dossier s'ouvre par /imprimer/0?doc=facture&f=….
  if (sp.doc === "facture") {
    const fa = await factureComplete(Number(sp.f));
    if (!fa || (fa.dossierId ?? 0) !== idDossier) notFound();
    const dossier = fa.dossierId ? await getDossier(fa.dossierId) : null;
    const m = mentionsDeLaFacture(await mentionsEmetteur(), fa.mentions);
    return (
      <>
        <style>{"body{background:#ececec}@media print{body{background:#fff}}"}</style>
        <div className="pdf-bar">
          <span style={{ display: "flex", gap: 18 }}>
            <Link href={dossier ? `/factures?dossier=${dossier.id}` : "/factures"}>← Factures</Link>
            {dossier && <Link href={`/dossiers/${dossier.id}#facturation`}>Dossier {dossier.ref}</Link>}
            {fa.origineNumero && fa.factureOrigineId && <Link href={`/imprimer/${idDossier}?doc=facture&f=${fa.factureOrigineId}`}>Facture annulée {fa.origineNumero}</Link>}
            {fa.avoirNumero && fa.avoirId && <Link href={`/imprimer/${idDossier}?doc=facture&f=${fa.avoirId}`}>Avoir {fa.avoirNumero}</Link>}
            <a href={`/api/factures/${fa.id}/facturx`}>Facture électronique (Factur-X)</a>
          </span>
          <PrintButton />
        </div>
        <AvisMentions manques={mentionsManquantes(m, fa)} />
        <FactureBailly d={dossier} f={fa} m={m} />
      </>
    );
  }
  const d = await getDossier(idDossier);
  if (!d) notFound();
  const doc = sp.doc === "devis" ? "devis" : sp.doc === "soustraitance" ? "soustraitance" : sp.doc === "lettre" ? "lettre" : "fiche";
  const lv = d.lettres.find((l: Row) => String(l.id) === sp.lv);
  // Le devis est un document client : il a sa mise en page aux couleurs de Bailly.
  if (doc === "devis") {
    return (
      <>
        <style>{"body{background:#ececec}@media print{body{background:#fff}}"}</style>
        <div className="pdf-bar"><Link href={`/dossiers/${d.id}`}>← Retour au dossier</Link><PrintButton /></div>
        <DevisBailly d={d} lienSignature={(token) => versInterne(`/signature/${token}`)} />
      </>
    );
  }
  if (doc === "lettre" && lv) {
    return (
      <>
        <style>{"body{background:#ececec}"}</style>
        <div className="pdf-bar"><Link href={`/dossiers/${d.id}`}>← Retour au dossier</Link><PrintButton /></div>
        <LettreVoitureBailly d={d} lv={lv} />
      </>
    );
  }
  return (
    <>
      <style>{"body{background:#ececec}"}</style>
      <div className="pdf-bar"><Link href={`/dossiers/${d.id}`}>← Retour au dossier</Link><PrintButton /></div>
      {doc === "soustraitance" ? <SousTraitanceBailly d={d} lv={lv} /> : <FicheVisiteBailly d={d} />}
    </>
  );
}
