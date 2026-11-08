"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import { MODELES_MESSAGE } from "@/lib/espace-client/libelles";
import type { vueJournal } from "@/lib/espace-client/vues-equipe";
import { BandeauMode, Carte, EtatDesEnvois, PastilleEnvoi, champ, dateHeureFr, usePorte } from "./socle";

type Donnees = Awaited<ReturnType<typeof vueJournal>>;

/** Le journal : chaque e-mail et chaque SMS, envoyé ou non, avec son aperçu. */
export function Journal({ ouvrirApercu }: { ouvrirApercu: (id: string) => void }) {
  const { base, racine } = usePorte();
  const { donnees, erreur, recharger } = useRessource<Donnees>(`${base}/journal`);
  const [q, setQ] = useState("");
  const lignes = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (donnees?.notifications ?? []).filter((n) => !t || `${n.destinataire} ${n.sujet} ${n.reference ?? ""} ${MODELES_MESSAGE[n.modele] ?? n.modele}`.toLowerCase().includes(t));
  }, [donnees, q]);
  if (erreur) return <Echec message={erreur} onRetry={recharger} />;
  if (!donnees) return <Squelette titre={false} lignes={8} />;

  return (
    <div className="space-y-5">
      <BandeauMode mode={donnees.mode} />
      <EtatDesEnvois envois={donnees.mode.envois} />
      <Carte titre={`${lignes.length} message${lignes.length > 1 ? "s" : ""}`} action={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Destinataire, dossier, modèle…" className={`${champ} !w-64`} aria-label="Rechercher dans le journal" />}>
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead className="border-y border-line text-left text-[11px] text-ink-soft">
              <tr>
                {["Date", "Canal", "Message", "Dossier", "Destinataire", "Statut", ""].map((h) => (
                  <th key={h} className="px-5 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {lignes.map((n) => (
                <tr key={n.id} className="align-top">
                  <td className="whitespace-nowrap px-5 py-2.5 tabular-nums text-ink-soft">{dateHeureFr(n.sent_at)}</td>
                  <td className="whitespace-nowrap px-5 py-2.5">{n.canal === "sms" ? "SMS" : "E-mail"}</td>
                  <td className="max-w-[320px] px-5 py-2.5">
                    <span className="font-medium">{MODELES_MESSAGE[n.modele] ?? n.modele}</span>
                    <span className="block truncate text-[12px] text-ink-soft">{n.canal === "sms" ? String(n.payload.texte ?? "") : n.sujet}</span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5">
                    {n.reference && n.dossier_id ? (
                      <Link href={`${racine}/dossiers/${n.dossier_id}`} className="tabular-nums hover:text-brand-ink">
                        {n.reference}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-ink-soft">{n.destinataire}</td>
                  <td className="max-w-[260px] px-5 py-2.5">
                    {/* Le statut du module d'envoi quand il est connu (bloqué, bac à sable…), sinon celui du journal de l'espace. */}
                    <PastilleEnvoi statut={n.envoi?.statut ?? (n.statut === "envoyee" ? "envoye" : n.statut === "echec" ? "echec" : "journalise")} />
                    {(n.envoi?.motif ?? n.erreur) && (
                      <span className={`mt-1 block text-[11px] ${n.statut === "echec" ? "text-danger" : "text-ink-soft"}`}>{n.envoi?.motif ?? n.erreur}</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <button onClick={() => ouvrirApercu(n.id)} className="font-medium hover:text-brand-ink">
                      Aperçu
                    </button>
                  </td>
                </tr>
              ))}
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-ink-soft">
                    Aucun message.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Carte>
    </div>
  );
}
