"use client";

import { useState, useTransition } from "react";
import type { TeamMemberRow } from "@/lib/types";
import { addMember, lienMotDePasse, updateMember, removeMember, type IssueEquipe } from "@/lib/actions/team";
import { estRoleAdmin, LIBELLES_ROLES, peutGererSuperAdmin, porteSuperAdmin, ROLES_EQUIPE } from "@/lib/roles-equipe";

type Etat = { role: string; actif: boolean } | null;

/*
 * Les règles du droit de super admin, montrées à l'écran (boutons grisés,
 * explication) ; les actions serveur les appliquent de toute façon
 * (lib/actions/team.ts). Textes provisoires, à valider.
 */
const REFUS_DROIT = "Seul un super admin peut donner ou retirer le droit de super admin.";
const REFUS_DERNIER = "Dernier super admin actif : nommez-en un autre avant de le retirer.";

export default function EquipeClient({
  members,
  moi,
  superAdminsActifs,
  recharger,
}: {
  members: TeamMemberRow[];
  moi: { id: string; role: string } | null;
  superAdminsActifs: number;
  recharger: () => void;
}) {
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");
  const [role, setRole] = useState("agent");
  const [flash, setFlash] = useState<{ ton: "ok" | "ko"; texte: string } | null>(null);
  // Le lien à usage unique fabriqué pour un membre : montré une fois, à transmettre de la main à la main.
  const [lienMdp, setLienMdp] = useState<{ pour: string; lien: string; copie: boolean } | null>(null);

  const moiEtat = moi ? { role: moi.role, actif: true } : null;
  const peutGerer = peutGererSuperAdmin(moiEtat, superAdminsActifs);
  const jeSuisSuperAdmin = porteSuperAdmin(moiEtat);
  const jeSuisAdmin = estRoleAdmin(moi?.role);

  /** Le même contrôle que le serveur pour le lien du mot de passe : le refus, ou null. */
  function refusLien(m: TeamMemberRow): string | null {
    if (!m.actif) return "Membre inactif : réactivez-le d'abord.";
    if (porteSuperAdmin(m) && !jeSuisSuperAdmin) return "Seul un super admin peut fabriquer le lien d'un super admin.";
    return null;
  }

  function fabriquerLien(m: TeamMemberRow) {
    setFlash(null);
    setLienMdp(null);
    start(async () => {
      const r = await lienMotDePasse(m.id);
      if (r.erreur || !r.lien) setFlash({ ton: "ko", texte: r.erreur ?? "Le lien n'a pas pu être fabriqué." });
      else setLienMdp({ pour: r.pour ?? m.email, lien: r.lien, copie: false });
    });
  }

  async function copierLien() {
    if (!lienMdp) return;
    try {
      await navigator.clipboard.writeText(lienMdp.lien);
      setLienMdp({ ...lienMdp, copie: true });
    } catch {
      // Presse-papiers refusé : le lien reste sélectionnable dans le champ.
    }
  }

  /** Le même contrôle que le serveur : le refus, ou null. */
  function refus(avant: Etat, apres: Etat): string | null {
    const roleAvant = avant?.role === "super_admin", roleApres = apres?.role === "super_admin";
    const actifAvant = porteSuperAdmin(avant), actifApres = porteSuperAdmin(apres);
    if (roleAvant === roleApres && actifAvant === actifApres) return null;
    if (!peutGerer || (!jeSuisSuperAdmin && actifAvant)) return REFUS_DROIT;
    if (actifAvant && !actifApres && superAdminsActifs <= 1) return REFUS_DERNIER;
    return null;
  }

  function lancer(action: () => Promise<IssueEquipe>, ok?: string) {
    setFlash(null);
    start(async () => {
      const r = await action();
      if (r.erreur) setFlash({ ton: "ko", texte: r.erreur });
      else if (ok) setFlash({ ton: "ok", texte: ok });
      recharger();
    });
  }

  function add() {
    if (!email.trim()) return;
    setFlash(null);
    start(async () => {
      const res = await addMember({ email, nom, role });
      if (res.erreur) {
        setFlash({ ton: "ko", texte: res.erreur });
        return;
      }
      setFlash({
        ton: "ok",
        texte: res.tempPassword ? `Accès créé — mot de passe temporaire : ${res.tempPassword}` : "Membre ajouté (compte déjà existant).",
      });
      setEmail(""); setNom(""); setRole("agent");
      recharger();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {/* Le droit de super admin, dit en clair. */}
        <div className="rounded-[18px] bg-card px-5 py-4 text-sm" data-droit-super-admin>
          <p className="font-medium">Super admin</p>
          <p className="mt-1 text-ink-soft">
            Le super admin peut ouvrir l&apos;espace d&apos;un client en édition, pour le modifier en son nom. Il est aussi admin. Seul un super admin peut
            donner ou retirer ce droit, et le dernier super admin actif ne peut pas être retiré.
          </p>
          {superAdminsActifs === 0 && (
            <p className="mt-2 rounded-xl bg-accent-soft/60 px-3 py-2 text-accent-dark">
              Aucun super admin pour l&apos;instant : un admin peut nommer le premier.
              {moi?.role === "admin" ? " Vous êtes admin : vous pouvez le faire." : " Demandez-le à un admin."}
            </p>
          )}
        </div>

        {flash && (
          <div role={flash.ton === "ko" ? "alert" : "status"} className={`rounded-xl px-4 py-2 text-sm ${flash.ton === "ko" ? "bg-red-50 text-red-700" : "bg-accent-soft/60 text-accent-dark"}`}>
            {flash.texte}
          </div>
        )}

        {lienMdp && (
          <div className="rounded-[18px] bg-card px-5 py-4 text-sm" data-lien-mot-de-passe>
            <p className="font-medium">Lien pour que {lienMdp.pour} choisisse son mot de passe</p>
            <p className="mt-1 text-ink-soft">
              Valable une heure, il ne sert qu&apos;une fois et ouvre le compte : transmettez-le directement à la personne (SMS, messagerie). Il n&apos;est
              gardé nulle part.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                readOnly
                value={lienMdp.lien}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Lien à usage unique"
                className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2 font-mono text-xs outline-none focus:border-accent"
              />
              <button onClick={copierLien} className="rounded-xl bg-accent px-3 py-2 text-xs font-medium text-white transition hover:bg-accent-dark">
                {lienMdp.copie ? "Copié" : "Copier"}
              </button>
              <button onClick={() => setLienMdp(null)} className="rounded-xl px-3 py-2 text-xs text-ink-soft transition hover:text-accent">
                Fermer
              </button>
            </div>
          </div>
        )}

        {/* Liste */}
        <div className="rounded-[18px] bg-card">
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
              {members.map((m) => {
                // Ce que chaque geste ferait au droit de super admin : grisé s'il serait refusé.
                const refusRole = m.role === "super_admin" ? refus(m, { role: "admin", actif: m.actif }) : null;
                const refusActif = refus(m, { role: m.role, actif: !m.actif });
                const refusRetrait = refus(m, null);
                return (
                  <tr key={m.id} className="hover:bg-accent-soft/20" data-membre={m.email}>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {m.nom ?? "—"}
                        {m.id === moi?.id && <span className="ml-2 text-xs text-ink-soft">(vous)</span>}
                      </div>
                      <div className="text-xs text-ink-soft">{m.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={m.role}
                        disabled={pending || !!refusRole}
                        title={refusRole ?? undefined}
                        onChange={(e) => lancer(() => updateMember(m.id, { role: e.target.value }), `Rôle de ${m.nom ?? m.email} : ${LIBELLES_ROLES[e.target.value as keyof typeof LIBELLES_ROLES] ?? e.target.value}.`)}
                        className="rounded-xl border border-line bg-paper px-2 py-1 text-sm outline-none focus:border-accent disabled:opacity-60"
                      >
                        {ROLES_EQUIPE.map((r) => (
                          <option key={r} value={r} disabled={r === "super_admin" && m.role !== "super_admin" && !!refus(m, { role: r, actif: m.actif })}>
                            {LIBELLES_ROLES[r]}
                          </option>
                        ))}
                        {!ROLES_EQUIPE.some((r) => r === m.role) && <option value={m.role}>{m.role}</option>}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => lancer(() => updateMember(m.id, { actif: !m.actif }))}
                        disabled={pending || !!refusActif}
                        title={refusActif ?? undefined}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                          m.actif ? "bg-accent-soft text-accent-dark" : "bg-subtle text-ink-soft"
                        }`}
                      >
                        {m.actif ? "Actif" : "Inactif"}
                      </button>
                    </td>
                    <td className="space-x-3 whitespace-nowrap px-4 py-3 text-right">
                      {jeSuisAdmin && (
                        <button
                          onClick={() => fabriquerLien(m)}
                          disabled={pending || !!refusLien(m)}
                          title={refusLien(m) ?? "Fabriquer un lien à usage unique pour que ce membre choisisse son mot de passe"}
                          className="text-xs text-ink-soft transition hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Lien mot de passe
                        </button>
                      )}
                      <button
                        onClick={() => lancer(() => removeMember(m.id, m.email))}
                        disabled={pending || !!refusRetrait}
                        title={refusRetrait ?? undefined}
                        className="text-xs text-ink-soft transition hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Retirer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ajout */}
      <div className="h-fit rounded-[18px] bg-card p-5">
        <h3 className="eyebrow mb-4 text-ink-soft">Ajouter un membre</h3>
        <div className="space-y-3">
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom"
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@bailly.fr"
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" />
          <select value={role} onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent">
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
            {peutGerer && <option value="super_admin">Super admin</option>}
          </select>
          <button
            onClick={add}
            disabled={pending || !email.trim()}
            className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
          >
            {pending ? "…" : "Créer l'accès"}
          </button>
          <p className="text-xs text-ink-soft">
            Un compte de connexion est créé avec un mot de passe temporaire à transmettre au membre.
          </p>
        </div>
      </div>
    </div>
  );
}
