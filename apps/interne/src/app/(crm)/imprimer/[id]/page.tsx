import Link from "next/link";
import { notFound } from "next/navigation";
import { getDossier } from "@/crm/lib/data";
import { currentUser } from "@/crm/lib/auth";
import { PrintButton } from "@/crm/components/PrintButton";
import { eur, m3, nomClient, dateFr, TYPES } from "@/crm/lib/format";
import { emballages } from "@/crm/lib/tarif";
import type { Row } from "@/crm/lib/db";
import DevisBailly from "@/crm/documents/DevisBailly";
import FactureBailly, { AvisMentions } from "@/crm/documents/FactureBailly";
import { getSettings } from "@/lib/settings";
import { versInterne } from "@/lib/adresses";

export const dynamic = "force-dynamic";
const GENRE: Record<string, string> = { depart: "Départ", garde_meuble: "Garde-meuble", arrivee: "Arrivée", autre: "Étape" };

export default async function Imprimer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string; lv?: string; f?: string }> }) {
  await currentUser();
  const d = await getDossier(Number((await params).id));
  if (!d) notFound();
  const sp = await searchParams;
  const doc = sp.doc === "devis" ? "devis" : sp.doc === "soustraitance" ? "soustraitance" : sp.doc === "lettre" ? "lettre" : sp.doc === "facture" ? "facture" : "fiche";
  const fa = d.factures.find((f: Row) => String(f.id) === sp.f);
  const lv = d.lettres.find((l: Row) => String(l.id) === sp.lv);
  const emb = emballages(d.volume);
  const pieces = [...new Set(d.inv.map((i: Row) => i.piece))] as string[];
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
    const demont = d.inv.filter((i: Row) => i.demontage);
    const feuilles: [string, string, string][] = [
      ["Ordre de mission", "Document interne : ne pas remettre au client", "mission"],
      ["Lettre de voiture : chargement", "Exemplaire 1 sur 2 · à signer au départ", "charg"], ["Lettre de voiture : chargement", "Exemplaire 2 sur 2 · à signer au départ", "charg"],
      ["Lettre de voiture : livraison", "Exemplaire 1 sur 2 · à signer à l’arrivée", "livr"], ["Lettre de voiture : livraison", "Exemplaire 2 sur 2 · à signer à l’arrivée", "livr"],
    ];
    return (
      <>
        <style>{"body{background:#ececec}.sheet{page-break-after:always}.sheet:last-child{page-break-after:auto}.sig{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px}.sig div{border:1px solid #999;height:110px;padding:8px;font-size:12px;color:#555}"}</style>
        <div className="pdf-bar"><Link href={`/dossiers/${d.id}`}>← Retour au dossier</Link><PrintButton /></div>
        {feuilles.map(([titre, sous, kind], i) => (
          <div className="doc sheet" key={i}>
            <div className="doc-head"><div><h1>{titre}</h1><div>{sous} · {lv.numero}</div></div><i className="logo">B</i></div>
            <table><tbody>
              <tr><th>Client</th><td>{nomClient(d)}</td><th>Dossier</th><td>{d.ref}</td></tr>
              <tr><th>Trajet</th><td colSpan={3}>{lv.trajet}</td></tr>
              <tr><th>Chargement</th><td>{dateFr(lv.date_chargement)}</td><th>Livraison</th><td>{dateFr(lv.date_livraison)}</td></tr>
              <tr><th>Transporteur</th><td>{lv.prestataire}</td><th>Camion</th><td>{lv.immatriculation ?? "—"}</td></tr>
              <tr><th>Équipe</th><td colSpan={3}>{lv.equipe ?? "—"}</td></tr>
            </tbody></table>
            {kind === "mission" ? <>
              <h2>Instructions aux déménageurs</h2><div className="obs">{lv.instructions ?? "—"}{d.observations ? `\n\n${d.observations}` : ""}</div>
              <h2>Démontage / remontage à prévoir</h2>
              {demont.length === 0 ? <p>Aucun.</p> : <table><tbody>{demont.map((i: Row) => <tr key={i.id}><td>{i.piece}</td><td>{i.libelle}</td><td>{i.quantite}</td></tr>)}</tbody></table>}
              <h2>Matériel à emporter</h2><p>{emb.cartonsStandard} cartons standard · {emb.cartonsLivres} cartons livres · {emb.penderies} penderies · {emb.bulle} rouleaux de papier bulle</p>
              {d.vehicule && <p><b>Véhicule à transporter :</b> carte grise et attestation d’assurance à récupérer.</p>}
            </> : <>
              <h2>Objets · {m3(d.volume)}</h2>
              <table><tbody>{d.inv.map((i: Row) => <tr key={i.id}><td>{i.piece}</td><td>{i.libelle}</td><td>{i.quantite}</td><td className="r">{m3(i.volume * i.quantite)}</td></tr>)}</tbody></table>
              <h2>Réserves {kind === "charg" ? "à l’enlèvement" : "à la livraison"}</h2><div className="obs" style={{ minHeight: 70 }}> </div>
              <div className="sig"><div>Signature du client</div><div>Signature du déménageur</div></div>
            </>}
          </div>
        ))}
      </>
    );
  }
  return (
    <>
      <style>{"body{background:#ececec}"}</style>
      <div className="pdf-bar"><Link href={`/dossiers/${d.id}`}>← Retour au dossier</Link><PrintButton /></div>
      <div className="doc">
        <div className="doc-head"><div><h1>{doc === "fiche" ? "Fiche de visite" : "Proposition de sous-traitance"}</h1><div>{d.ref} · {nomClient(d)} · {TYPES[d.type]}</div></div><i className="logo">B</i></div>
        <h2>Client</h2>
        <table><tbody>
          <tr><th>Contact</th><td>{[d.civilite, d.prenom, d.nom].filter(Boolean).join(" ")}</td><th>Téléphone</th><td>{d.telephone ?? "—"}</td></tr>
          <tr><th>E-mail</th><td>{d.email ?? "—"}</td><th>Période</th><td>{d.periode ?? dateFr(d.date_chargement)}</td></tr>
          <tr><th>Commercial</th><td>{d.commercial ?? "—"}</td><th>Traité par</th><td>{d.traite_par ?? "—"}</td></tr>
        </tbody></table>
        <h2>Itinéraire</h2>
        <table><tbody>{d.stops.map((s: Row) => <tr key={s.id}><th>{GENRE[s.genre]}</th><td>{s.adresse}</td><td>{s.etage ? `Étage ${s.etage}` : ""} {s.ascenseur ? "· ascenseur" : "· sans ascenseur"}</td><td>{s.acces ?? ""}</td></tr>)}</tbody></table>
        {doc === "soustraitance" && lv && <>
          <h2>Prestation confiée</h2>
          <table><tbody>
            <tr><th>Lettre de voiture</th><td>{lv.numero}</td><th>Prestataire</th><td>{lv.prestataire}</td></tr>
            <tr><th>Trajet</th><td>{lv.trajet}</td><th>Volume</th><td>{m3(d.volume)}</td></tr>
            <tr><th>Chargement</th><td>{dateFr(lv.date_chargement)}</td><th>Livraison</th><td>{dateFr(lv.date_livraison)}</td></tr>
            <tr><th>Prix proposé</th><td colSpan={3}><b>{lv.prix_sous_traitance != null ? eur(lv.prix_sous_traitance) : "À définir"}</b></td></tr>
          </tbody></table>
          {d.observations && <><h2>Consignes</h2><div className="obs">{d.observations}</div></>}
        </>}
        {doc === "fiche" && <>
          {d.observations && <><h2>Observations</h2><div className="obs">{d.observations}</div></>}
          <h2>Inventaire · {m3(d.volume)}</h2>
          <table><thead><tr><th>Pièce</th><th>Objet</th><th>Qté</th><th>Destination</th><th>Démont.</th><th className="r">Volume</th></tr></thead><tbody>
            {pieces.flatMap((p) => d.inv.filter((i: Row) => i.piece === p).map((i: Row) => <tr key={i.id}><td>{p}</td><td>{i.libelle}</td><td>{i.quantite}</td><td>{i.destination}</td><td>{i.demontage ? "Oui" : "—"}</td><td className="r">{m3(i.volume * i.quantite)}</td></tr>))}
          </tbody></table>
          <h2>Emballages à prévoir</h2>
          <p>{emb.cartonsStandard} cartons standard · {emb.cartonsLivres} cartons livres · {emb.penderies} penderies · {emb.bulle} rouleaux de papier bulle</p>
        </>}
        
      </div>
    </>
  );
}
