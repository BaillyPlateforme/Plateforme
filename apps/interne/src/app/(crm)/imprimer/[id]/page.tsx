import Link from "next/link";
import { notFound } from "next/navigation";
import { getDossier } from "@/crm/lib/data";
import { currentUser } from "@/crm/lib/auth";
import { PrintButton } from "@/crm/components/PrintButton";
import type { Row } from "@/crm/lib/db";
import DevisBailly from "@/crm/documents/DevisBailly";
import { FicheVisiteBailly, LettreVoitureBailly, SousTraitanceBailly } from "@/crm/documents/DocumentsDossier";
import FactureBailly, { AvisMentions } from "@/crm/documents/FactureBailly";
import { getSettings } from "@/lib/settings";
import { versInterne } from "@/lib/adresses";

export const dynamic = "force-dynamic";

export default async function Imprimer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string; lv?: string; f?: string }> }) {
  await currentUser();
  const d = await getDossier(Number((await params).id));
  if (!d) notFound();
  const sp = await searchParams;
  const doc = sp.doc === "devis" ? "devis" : sp.doc === "soustraitance" ? "soustraitance" : sp.doc === "lettre" ? "lettre" : sp.doc === "facture" ? "facture" : "fiche";
  const fa = d.factures.find((f: Row) => String(f.id) === sp.f);
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
  // La facture aussi est un document client : même mise en page aux couleurs de Bailly que le devis.
  if (doc === "facture") {
    if (!fa) notFound();
    const reglages = await getSettings().catch(() => null);
    const entreprise = { adresse: reglages?.entreprise_adresse?.trim() || null, siret: reglages?.siret?.trim() || null };
    return (
      <>
        <style>{"body{background:#ececec}@media print{body{background:#fff}}"}</style>
        <div className="pdf-bar">
          <span style={{ display: "flex", gap: 18 }}>
            <Link href="/factures">← Factures</Link>
            <Link href={`/dossiers/${d.id}`}>Dossier {d.ref}</Link>
          </span>
          <PrintButton />
        </div>
        <AvisMentions entreprise={entreprise} />
        <FactureBailly d={d} f={fa} entreprise={entreprise} />
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
