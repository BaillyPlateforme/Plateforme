import { modeles } from "@/crm/lib/data2";
import { majModele } from "@/crm/actions2";

export const dynamic = "force-dynamic";
export default async function Modeles() {
  const rows = await modeles();
  const bloc = (canal: string, titre: string) => (
    <section className="card" style={{ marginBottom: 18 }}>
      <h3>{titre}</h3>
      {rows.filter((r) => r.canal === canal).map((r) => (
        <form key={r.id} action={majModele.bind(null, r.id)} className="form-grid" style={{ padding: "14px 0", borderBottom: "1px dashed var(--line)" }}>
          <div className="fld w4"><label>Nom du modèle</label><input type="text" name="nom" defaultValue={r.nom} /></div>
          {canal === "email" && <div className="fld w8"><label>Objet</label><input type="text" name="objet" defaultValue={r.objet ?? ""} /></div>}
          <div className="fld w12"><label>Texte (variables : {"{client} {commercial} {date} {heure} {ref}"})</label><textarea name="corps" defaultValue={r.corps} style={{ minHeight: canal === "sms" ? 60 : 110 }} /></div>
          <div className="fld w12"><button className="btn ghost sm">Enregistrer le modèle</button></div>
        </form>))}
    </section>);
  return (
    <div className="view">
      <div className="page-h"><div><h1>Courriers & SMS</h1><p>Des modèles à volonté, utilisables depuis chaque dossier. Le SMS de confirmation de rendez-vous demande de répondre 1 ou 2. L&apos;envoi réel est simulé dans cette version.</p></div></div>
      {bloc("sms", "Modèles de SMS")}
      {bloc("email", "Modèles d'e-mails")}
    </div>
  );
}
