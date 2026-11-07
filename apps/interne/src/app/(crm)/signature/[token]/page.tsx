import { notFound } from "next/navigation";
import { devisParToken } from "@/crm/lib/data2";
import { signerParToken } from "@/crm/actions2";
import { eur, m3, nomClient } from "@/crm/lib/format";

export const dynamic = "force-dynamic";

/*
 * La signature du devis par le client, depuis le lien qu'on lui envoie.
 * Page publique : le client n'a pas de compte, le proxy de l'app la laisse
 * passer sans session (voir proxy.ts) et elle est rangée hors de la coque du
 * CRM. Le jeton du lien est la seule clé : un jeton inconnu ou mal formé
 * mène à une page introuvable.
 */
export default async function Signature({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const v = await devisParToken(token);
  if (!v) notFound();
  const signe = v.statut === "signe";
  return (
    <div className="signature">
      <div className="signature-carte" style={{ maxWidth: 640 }}>
        <i className="logo" style={{ width: 48, height: 48, fontSize: 24 }}>B</i>
        <h1>Bonjour {nomClient(v)}</h1>
        <p>Bailly Déménagement vous a envoyé un document pour signature électronique : votre devis {v.numero} ({v.ref}).</p>
        <table className="tbl mini"><tbody>
          <tr><td>Trajet</td><td><b>{v.depart} → {v.arrivee}</b></td></tr>
          <tr><td>Volume</td><td>{m3(v.volume)}</td></tr>
          <tr><td>Formule</td><td style={{ textTransform: "capitalize" }}>{v.formule}</td></tr>
          <tr><td>Montant</td><td><b style={{ fontSize: 20 }}>{eur(v.montant)}</b></td></tr>
          <tr><td>Arrhes à la signature (30 %)</td><td>{eur(Math.round(v.montant * 0.3))}</td></tr>
        </tbody></table>
        {signe ? <div className="alert" style={{ background: "#dcfce7", color: "#166534", marginTop: 20 }}>Devis signé. Merci, votre conseiller vous contactera pour fixer les dates.</div> : (
          <form action={signerParToken.bind(null, token)} style={{ marginTop: 22 }}>
            <label className="chk"><input type="checkbox" required />J’ai lu le devis et les conditions générales, et je les accepte.</label>
            <button className="btn primary" style={{ marginTop: 16, width: "100%", justifyContent: "center" }}>Signer le devis</button>
          </form>)}
      </div>
    </div>
  );
}
