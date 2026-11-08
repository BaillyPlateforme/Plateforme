import { commerciaux } from "@/crm/lib/data";
import { q } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { creerRdv } from "@/crm/actions";
import { nomClient } from "@/crm/lib/format";
import Bandeau from "@/ui/Bandeau";
import ChampAdresse from "@/ui/ChampAdresse";

export const dynamic = "force-dynamic";

/** La date proposée par défaut : demain. */
function lendemain() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default async function NouveauRdv({ searchParams }: { searchParams: Promise<{ dossier?: string }> }) {
  const sp = await searchParams;
  const [coms, dossiers, u] = await Promise.all([
    commerciaux(),
    // Le dossier demandé (« Planifier une visite » depuis sa fiche) est toujours proposé, même terminé ou ancien :
    // absent de la liste, il n'était pas présélectionné et le rendez-vous se créait sans dossier.
    q(
      `select d.id,d.ref,c.nom,c.prenom,c.societe from dossiers d join clients c on c.id=d.client_id
        where d.statut not in ('termine','perdu') or d.id = $1 order by (d.id = $1) desc, d.maj_le desc limit 101`,
      [/^\d+$/.test(sp.dossier ?? "") ? Number(sp.dossier) : 0],
    ),
    currentUser(),
  ]);
  const demain = lendemain();
  return (
    <div className="view">
      <Bandeau surtitre="Planning commercial" titre="Nouveau rendez-vous" texte="Visite physique, visio ou tâche : les couleurs du planning suivent le type." secondaire={{ label: "Retour au planning", href: "/planning" }} />
      <form action={creerRdv} className="card"><div className="form-grid">
        <div className="fld"><label>Type</label><select name="type" defaultValue="phys"><option value="phys">Visite physique</option><option value="visio">Visio</option><option value="tache">Tâche (livraison de cartons, RDV…)</option><option value="perso">Perso / règle (semaine des enfants…)</option></select></div>
        <div className="fld"><label>Commercial</label><select name="commercial_id" defaultValue={u.role === "commercial" ? u.id : coms[0]?.id}>{coms.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></div>
        <div className="fld w8"><label>Titre</label><input type="text" name="titre" required placeholder="M. Dupuis" /></div>
        <div className="fld w4"><label>Durée (min)</label><input type="number" name="duree_min" defaultValue={60} min={15} step={15} /></div>
        <div className="fld w4"><label>Date</label><input type="date" name="date" defaultValue={demain} required /></div>
        <div className="fld w4"><label>Heure</label><input type="time" name="heure" defaultValue="09:00" required /></div>
        <div className="fld w4"><label htmlFor="lieu">Lieu</label><ChampAdresse id="lieu" name="lieu" placeholder="Adresse ou « Visio »" /></div>
        <div className="fld w12"><label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="journee" />Toute la journée (une « journée visio », par exemple) : posée au-dessus de la grille, sans dossier ni horaire</label></div>
        <div className="fld w12"><label>Dossier lié (facultatif)</label>
          <select name="dossier_id" defaultValue={sp.dossier ?? ""}><option value="">— Aucun —</option>{dossiers.map((d) => <option key={d.id} value={d.id}>{d.ref} · {nomClient(d)}</option>)}</select></div>
        <div className="fld w12"><label>Notes</label><textarea name="notes" placeholder="Accès, particularités, ce que le client a déjà vu…" /></div>
      </div><div className="form-actions"><button className="btn primary">Planifier</button></div></form>
    </div>
  );
}
