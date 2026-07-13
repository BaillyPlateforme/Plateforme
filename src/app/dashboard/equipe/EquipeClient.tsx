"use client";

import { useState, useTransition } from "react";
import type { TeamMemberRow } from "@/lib/types";
import { addMember, updateMember, removeMember } from "@/lib/actions/team";

export default function EquipeClient({ members }: { members: TeamMemberRow[] }) {
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");
  const [role, setRole] = useState("agent");
  const [flash, setFlash] = useState<string | null>(null);

  function add() {
    if (!email.trim()) return;
    start(async () => {
      const res = await addMember({ email, nom, role });
      setFlash(
        res.tempPassword
          ? `Accès créé — mot de passe temporaire : ${res.tempPassword}`
          : "Membre ajouté (compte déjà existant).",
      );
      setEmail(""); setNom(""); setRole("agent");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Liste */}
      <div className="rounded-2xl border border-line bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">Membre</th>
              <th className="px-4 py-3 font-medium">Rôle</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-soft">
                  Aucun membre. Ajoutez le premier à droite.
                </td>
              </tr>
            )}
            {members.map((m) => (
              <tr key={m.id} className="hover:bg-accent-soft/20">
                <td className="px-4 py-3">
                  <div className="font-medium">{m.nom ?? "—"}</div>
                  <div className="text-xs text-ink-soft">{m.email}</div>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={m.role}
                    disabled={pending}
                    onChange={(e) => start(() => updateMember(m.id, { role: e.target.value }))}
                    className="rounded-lg border border-line bg-paper px-2 py-1 text-sm outline-none focus:border-accent"
                  >
                    <option value="admin">Admin</option>
                    <option value="agent">Agent</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => start(() => updateMember(m.id, { actif: !m.actif }))}
                    disabled={pending}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      m.actif ? "bg-accent-soft text-accent-dark" : "bg-subtle text-ink-soft"
                    }`}
                  >
                    {m.actif ? "Actif" : "Inactif"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => start(() => removeMember(m.id, m.email))}
                    disabled={pending}
                    className="text-xs text-ink-soft transition hover:text-accent"
                  >
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ajout */}
      <div className="h-fit rounded-2xl border border-line bg-card p-5">
        <h3 className="eyebrow mb-4 text-ink-soft">Ajouter un membre</h3>
        <div className="space-y-3">
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom"
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@bailly.fr"
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" />
          <select value={role} onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent">
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={add}
            disabled={pending || !email.trim()}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
          >
            {pending ? "…" : "Créer l'accès"}
          </button>
          {flash && (
            <div className="rounded-lg bg-accent-soft/60 px-3 py-2 text-xs text-accent-dark">{flash}</div>
          )}
          <p className="text-xs text-ink-soft">
            Un compte de connexion est créé avec un mot de passe temporaire à transmettre au membre.
          </p>
        </div>
      </div>
    </div>
  );
}
