import Link from "next/link";
import { conteneurs } from "@/crm/lib/data2";
import { dateFr, m3 } from "@/crm/lib/format";
import Bandeau from "@/ui/Bandeau";

export const dynamic = "force-dynamic";
const STATUT_TC: Record<string, string> = { preparation: "En préparation", charge: "Chargé", en_mer: "En mer", arrive: "Arrivé", livre: "Livré" };
export default async function Conteneurs() {
  const rows = await conteneurs();
  return (
    <div className="view">
      <Bandeau surtitre="Exploitation" titre="Conteneurs" texte="Groupage par destination : chaque conteneur regroupe plusieurs clients, avec la place restante." />
      <div className="tcgrid">
        {rows.map((c) => {
          const pct = Math.min(100, Math.round((c.utilise / c.capacite) * 100));
          return (
            <Link key={c.id} href={`/conteneurs/${c.id}`} className="card tc">
              <div className="card-h"><h3>{c.numero}</h3><i className={`st ${c.sens === "export" ? "i" : "p"}`}>{c.sens === "export" ? "Export" : "Import"}</i></div>
              <p className="big" style={{ fontSize: 22 }}>{c.destination}</p>
              <div className="tcbar"><i style={{ width: `${pct}%` }} /></div>
              <div className="sub">{m3(c.utilise)} chargés sur {m3(c.capacite)} · <b>{m3(c.capacite - c.utilise)} libres</b> · {c.nb} client{c.nb > 1 ? "s" : ""}</div>
              <div className="sub" style={{ marginTop: 6 }}>{STATUT_TC[c.statut]} · départ {dateFr(c.depart_prevu)}</div>
            </Link>);
        })}
      </div>
    </div>
  );
}
