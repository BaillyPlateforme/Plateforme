import Link from "next/link";
import { notFound } from "next/navigation";
import { conteneur } from "@/crm/lib/data2";
import { ajouterAuConteneur, retirerDuConteneur, majConteneur } from "@/crm/actions2";
import { m3, nomClient, dateFr } from "@/crm/lib/format";
import type { Row } from "@/crm/lib/db";
import Bandeau from "@/ui/Bandeau";

export const dynamic = "force-dynamic";
const STATUT_TC: Record<string, string> = { preparation: "En préparation", charge: "Chargé", en_mer: "En mer", arrive: "Arrivé", livre: "Livré" };
const COULEURS = ["#7c3aed", "#0ea5e9", "#f59e0b", "#16a34a", "#e11d48", "#14b8a6"];

export default async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const c = await conteneur(id);
  if (!c) notFound();
  const utilise = c.lignes.reduce((a: number, l: Row) => a + l.volume, 0);
  const villes = [...new Set(c.lignes.map((l: Row) => l.ville_livraison ?? "Sans ville"))] as string[];
  const iso = (d: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  return (
    <div className="view">
      <Bandeau surtitre="Conteneur" titre={c.numero} texte={`${c.sens === "export" ? "Export" : "Import"} · ${c.destination} · ${c.taille} · plomb ${c.plomb ?? "—"}`} secondaire={{ label: "Tous les conteneurs", href: "/conteneurs" }} />
      <div className="d-grid">
        <section className="card" style={{ gridColumn: "span 8" }}>
          <div className="card-h"><h3>Clients du conteneur</h3><b>{m3(utilise)} / {m3(c.capacite)} · {m3(c.capacite - utilise)} libres</b></div>
          <div className="tcbar big"><i style={{ width: `${Math.min(100, (utilise / c.capacite) * 100)}%` }} /></div>
          {villes.map((v, vi) => (
            <div key={v} style={{ marginTop: 16 }}>
              <span className="lbl">{v} · {m3(c.lignes.filter((l: Row) => (l.ville_livraison ?? "Sans ville") === v).reduce((a: number, l: Row) => a + l.volume, 0))}</span>
              <div className="bulles">
                {c.lignes.filter((l: Row) => (l.ville_livraison ?? "Sans ville") === v).map((l: Row) => (
                  <div key={l.id} className="bulle" style={{ borderColor: COULEURS[vi % 6], background: `color-mix(in srgb, ${COULEURS[vi % 6]} 12%, var(--surface))` }}>
                    <Link href={`/dossiers/${l.dossier_id}`}><b>{nomClient(l)}</b></Link><small>{l.ref}</small><span>{m3(l.volume)}</span>
                    <form action={retirerDuConteneur.bind(null, id, l.id)}><button className="x" title="Retirer">×</button></form>
                  </div>))}
              </div>
            </div>))}
          {c.lignes.length === 0 && <div className="empty">Aucun client dans ce conteneur.</div>}
          <form action={ajouterAuConteneur.bind(null, id)} className="rowform" style={{ marginTop: 20 }}>
            <div className="fld" style={{ flex: 3 }}><label>Ajouter un client</label><select name="dossier_id" required><option value="">Choisir un dossier confirmé…</option>{c.dispo.map((d: Row) => <option key={d.id} value={d.id}>{d.ref} · {nomClient(d)}</option>)}</select></div>
            <div className="fld"><label>Volume (m³)</label><input type="number" step="0.1" name="volume" required /></div>
            <div className="fld"><label>Ville de livraison</label><input type="text" name="ville" placeholder="Fort-de-France" /></div>
            <button className="btn primary sm">Ajouter</button>
          </form>
        </section>
        <section className="card" style={{ gridColumn: "span 4" }}>
          <h3>Suivi du conteneur</h3>
          <form action={majConteneur.bind(null, id)} className="form-grid">
            <div className="fld w12"><label>Statut</label><select name="statut" defaultValue={c.statut}>{Object.entries(STATUT_TC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="fld w12"><label>Numéro de plomb</label><input type="text" name="plomb" defaultValue={c.plomb ?? ""} /></div>
            <div className="fld w12"><label>Départ prévu</label><input type="date" name="depart_prevu" defaultValue={iso(c.depart_prevu)} /></div>
            <div className="fld w12"><label>Arrivée prévue</label><input type="date" name="arrivee_prevue" defaultValue={iso(c.arrivee_prevue)} /></div>
            <div className="fld w12"><button className="btn primary sm">Enregistrer</button></div>
          </form>
          <p className="sub" style={{ marginTop: 14 }}>Groupeur : {c.groupeur ?? "—"}<br />Départ prévu : {dateFr(c.depart_prevu)}</p>
        </section>
      </div>
    </div>
  );
}
