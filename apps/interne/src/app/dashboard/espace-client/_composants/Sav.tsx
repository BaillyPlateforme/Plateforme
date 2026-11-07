"use client";

import Link from "next/link";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import { changerStatutSav } from "@/lib/actions/espace-client-equipe";
import type { StatutSav } from "@/lib/espace-client/types";
import type { vueSav } from "@/lib/espace-client/vues-equipe";
import { BandeauMode, Carte, Pastille, Retour, champ, dateFr, useAction, usePorte } from "./socle";

type Donnees = ReturnType<typeof vueSav>;

/** Les déclarations d'avarie : les deux parcours, les photos, et le statut que voit le client. */
export function Sav() {
  const { base, racine } = usePorte();
  const { donnees, erreur, recharger } = useRessource<Donnees>(`${base}/sav`);
  const action = useAction(recharger);
  if (erreur) return <Echec message={erreur} onRetry={recharger} />;
  if (!donnees) return <Squelette titre={false} lignes={6} />;

  return (
    <div className="space-y-5">
      <BandeauMode mode={donnees.mode} />
      <Retour r={action.resultat} />
      {donnees.declarations.length === 0 && (
        <Carte>
          <p className="text-[13px] text-ink-soft">Aucune déclaration. L&apos;équipe reçoit un e-mail à chaque nouvelle avarie.</p>
        </Carte>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {donnees.declarations.map((s) => (
          <Carte
            key={s.id}
            titre={
              <span>
                {s.numero} · {s.objets}
              </span>
            }
            action={
              <select value={s.statut} onChange={(e) => action.lancer(() => changerStatutSav(s.id, e.target.value as StatutSav))} className={`${champ} !h-8 !w-auto !py-0`} aria-label={`Statut de ${s.numero}`}>
                <option value="recue">Reçue</option>
                <option value="en_analyse">En cours d&apos;analyse</option>
                <option value="cloturee">Clôturée</option>
              </select>
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {s.reserves_emises ? <Pastille ton="ok">Réserves émises à la livraison</Pastille> : <Pastille ton="alerte">Sans réserves à la livraison</Pastille>}
              <Pastille>Constatée le {dateFr(s.date_constat)}</Pastille>
              <Pastille>Déclarée le {dateFr(s.created_at)}</Pastille>
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed">{s.description}</p>
            {s.photos.length > 0 && (
              <p className="mt-3 flex flex-wrap gap-2">
                {s.photos.map((p) => (
                  <a key={p.id} href={p.lien} target="_blank" rel="noopener" className="rounded-full bg-subtle px-2.5 py-0.5 text-[12px] hover:bg-brand-soft">
                    📷 {p.nom}
                  </a>
                ))}
              </p>
            )}
            <p className="mt-3 text-[12.5px] text-ink-soft">
              {s.client} ·{" "}
              <Link href={`${racine}/dossiers/${s.dossierId}`} className="font-medium text-ink hover:text-brand-ink">
                {s.reference}
              </Link>
            </p>
          </Carte>
        ))}
      </div>
    </div>
  );
}
