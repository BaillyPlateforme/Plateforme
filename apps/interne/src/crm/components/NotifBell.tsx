"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Ic } from "@/crm/lib/icons";

export interface Notif { id: string; kind: "todo" | "activite"; titre: string; sous: string; quand?: string; href: string }

export function NotifBell({ items }: { items: Notif[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Un lien qui finit par #notifs ouvre le panneau. Le serveur ne voit pas ce
    // fragment de l'adresse : on le lit juste après le premier affichage.
    const t = window.setTimeout(() => { if (location.hash === "#notifs") setOpen(true); });
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { window.clearTimeout(t); document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);
  const todo = items.filter((i) => i.kind === "todo"), act = items.filter((i) => i.kind === "activite");
  const Row = ({ n }: { n: Notif }) => (
    <Link href={n.href} className={`nt ${n.kind}`} onClick={() => setOpen(false)}>
      <i className="nt-dot" /><span><b>{n.titre}</b><small>{n.sous}</small></span>{n.quand && <em>{n.quand}</em>}
    </Link>
  );
  return (
    <div className="bell-wrap" ref={ref}>
      <button className="bell-btn" onClick={() => setOpen(!open)} aria-label="Notifications" aria-expanded={open}>
        <Ic n="bell" />{todo.length > 0 && <u className="bell-badge">{todo.length}</u>}
      </button>
      {open && (
        <div className="notif" role="dialog" aria-label="Notifications">
          <div className="notif-h"><b>Notifications</b><small>{todo.length} à traiter</small></div>
          {todo.length > 0 && <><div className="notif-s">À traiter</div>{todo.map((n) => <Row key={n.id} n={n} />)}</>}
          <div className="notif-s">Activité récente</div>
          {act.length === 0 ? <div className="empty" style={{ padding: 16 }}>Rien pour le moment.</div> : act.map((n) => <Row key={n.id} n={n} />)}
        </div>
      )}
    </div>
  );
}
