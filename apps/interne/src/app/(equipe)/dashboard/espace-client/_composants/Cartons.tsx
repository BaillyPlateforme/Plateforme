"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import { calculerTournee, enregistrerNbCartons, envoyerCreneaux, marquerCartonsLivres } from "@/lib/actions/espace-client-equipe";
import { STATUT_LIVRAISON } from "@/lib/espace-client/libelles";
import type { vueCartons } from "@/lib/espace-client/vues-equipe";
import { BandeauMode, Bouton, Carte, EtatDesEnvois, LienBouton, Pastille, Retour, champ, dateFr, useAction, usePorte } from "./socle";

// Leaflet touche à `window` : la carte ne se rend que dans le navigateur.
const CarteTournee = dynamic(() => import("./CarteTournee").then((m) => m.CarteTournee), { ssr: false, loading: () => <div className="h-[400px] animate-pulse rounded-xl bg-subtle" /> });

type Donnees = ReturnType<typeof vueCartons>;

const jourLong = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Les cartons du samedi : le nombre à saisir pour chaque client (l'e-mail de
 * l'équipe y renvoie), l'ordre de passage optimisé et sa carte, les bons PDF
 * de la veille, le récapitulatif à préparer, et le message de la veille.
 */
export function Cartons() {
  const { base } = usePorte();
  const params = useSearchParams();
  const router = useRouter();
  const chemin = usePathname();
  const demande = params.get("samedi");
  const url = `${base}/cartons${demande ? `?samedi=${demande}` : ""}`;
  const { donnees, erreur, recharger } = useRessource<Donnees>(url);
  const action = useAction(recharger);
  const [saisie, setSaisie] = useState<Record<string, string>>({});

  if (erreur) return <Echec message={erreur} onRetry={recharger} />;
  if (!donnees) return <Squelette lignes={8} />;
  const samedi = donnees.samedi;
  const valeur = (id: string, n: number | null) => saisie[id] ?? (n ? String(n) : "");
  const points = donnees.livraisons
    .filter((l) => l.lat != null && l.lng != null && !l.horsZone)
    .map((l) => ({ id: l.id, lat: l.lat!, lng: l.lng!, ordre: l.ordre_passage, label: l.contact_nom, creneau: l.creneau_debut ? `${l.creneau_debut}–${l.creneau_fin}` : null }));
  const horsZone = donnees.livraisons.filter((l) => l.horsZone);

  return (
    <div className="space-y-5">
      <BandeauMode mode={donnees.mode} />
      <EtatDesEnvois envois={donnees.mode.envois} />
      {donnees.samedis.length === 0 ? (
        <Carte>
          <p className="text-[13px] text-ink-soft">Aucune livraison de cartons à venir. Les clients choisissent leur samedi depuis leur espace ; l&apos;équipe reçoit un e-mail à chaque demande.</p>
        </Carte>
      ) : (
        <>
          <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Samedis">
            {donnees.samedis.map((s) => (
              <Link
                key={s.date}
                href={`${chemin}?samedi=${s.date}`}
                onClick={(e) => {
                  e.preventDefault();
                  setSaisie({});
                  router.replace(`${chemin}?samedi=${s.date}`, { scroll: false });
                }}
                className={`shrink-0 rounded-2xl px-4 py-2.5 transition ${s.date === samedi ? "bg-ink text-white" : "bg-card hover:-translate-y-0.5"}`}
              >
                <span className="block text-[14px] font-semibold">{majuscule(jourLong(s.date))}</span>
                <span className={`text-[12px] ${s.date === samedi ? "text-white/70" : "text-ink-soft"}`}>
                  {s.n} livraison{s.n > 1 ? "s" : ""}
                  {s.complet ? " · complet" : ""}
                </span>
              </Link>
            ))}
          </nav>

          {samedi && (
            <>
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="rounded-[18px] bg-ink p-5 text-white">
                  <p className="text-[12px] text-white/60">Cartons à préparer</p>
                  <p className="mt-2 text-[38px] font-bold leading-none tabular-nums text-brand-clair">{donnees.total}</p>
                </div>
                <div className="rounded-[18px] bg-card p-5">
                  <p className="text-[12px] text-ink-soft">Clients à livrer</p>
                  <p className="mt-2 text-[38px] font-bold leading-none tabular-nums">{donnees.livraisons.length}</p>
                </div>
                <div className="rounded-[18px] bg-card p-5">
                  <p className="text-[12px] text-ink-soft">Nombres à saisir</p>
                  <p className={`mt-2 text-[38px] font-bold leading-none tabular-nums ${donnees.aSaisir ? "text-danger" : "text-good"}`}>{donnees.aSaisir}</p>
                </div>
                <div className="rounded-[18px] bg-card p-5">
                  <p className="text-[12px] text-ink-soft">Messages de la veille partis</p>
                  <p className="mt-2 text-[38px] font-bold leading-none tabular-nums">
                    {donnees.envoyes}/{donnees.livraisons.length}
                  </p>
                </div>
              </div>
              <Retour r={action.resultat} />

              <div className="grid gap-5 2xl:grid-cols-[1.25fr_1fr]">
                <Carte
                  titre={`Clients du ${jourLong(samedi)}`}
                  action={
                    <div className="flex flex-wrap gap-2">
                      <LienBouton href={`${base}/bons/${samedi}`} cible="_blank">
                        Bons de livraison (PDF)
                      </LienBouton>
                      <Bouton variante="contour" disabled={action.enCours} onClick={() => confirm("Marquer toutes les livraisons de ce samedi comme livrées ?") && action.lancer(() => marquerCartonsLivres(samedi))}>
                        Marquer livrées
                      </Bouton>
                    </div>
                  }
                >
                  <div className="-mx-5 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-[13px]">
                      <thead className="border-y border-line text-left text-[11px] text-ink-soft">
                        <tr>
                          {["#", "Client", "Adresse", "Créneau", "Cartons"].map((h) => (
                            <th key={h} className="px-5 py-2 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/70">
                        {donnees.livraisons.map((l) => (
                          <tr key={l.id}>
                            <td className="px-5 py-2.5">
                              <span className={`grid size-7 place-items-center rounded-full text-[12px] font-bold ${l.ordre_passage ? "bg-brand text-nuit" : "bg-subtle text-ink-soft"}`}>{l.ordre_passage ?? "–"}</span>
                            </td>
                            <td className="px-5 py-2.5">
                              <span className="font-medium">{l.contact_nom}</span>
                              <p className="text-[11.5px] text-ink-soft">
                                {l.reference} · {l.volume} m³ · <span className={l.statut === "demandee" ? "text-brand-ink" : ""}>{STATUT_LIVRAISON[l.statut].label}</span>
                              </p>
                            </td>
                            <td className="px-5 py-2.5 text-ink-soft">
                              {l.adresse}
                              {l.code_acces && <span className="block text-[11.5px]">Code {l.code_acces}</span>}
                              {l.lat == null && <span className="block text-[11.5px] text-brand-ink">Adresse à localiser</span>}
                            </td>
                            <td className="px-5 py-2.5 tabular-nums">{l.horsZone ? <Pastille ton="alerte">Hors zone</Pastille> : l.creneau_debut ? `${l.creneau_debut} – ${l.creneau_fin}` : <span className="text-ink-soft">à calculer</span>}</td>
                            <td className="px-5 py-2.5">
                              <input
                                value={valeur(l.id, l.nb_cartons)}
                                onChange={(e) => setSaisie({ ...saisie, [l.id]: e.target.value.replace(/\D/g, "") })}
                                inputMode="numeric"
                                placeholder={String(Math.round(l.volume * 1.25))}
                                aria-label={`Nombre de cartons pour ${l.contact_nom}`}
                                className={`${champ} !w-20 text-center ${l.nb_cartons ? "" : "!border-danger"}`}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Bouton
                    className="mt-4"
                    disabled={action.enCours || Object.keys(saisie).length === 0}
                    onClick={() => action.lancer(() => enregistrerNbCartons(Object.fromEntries(Object.entries(saisie).map(([k, v]) => [k, v === "" ? null : Number(v)]))), (r) => r.ok && setSaisie({}))}
                  >
                    Enregistrer les nombres
                  </Bouton>
                  <p className="mt-2 text-[11.5px] text-ink-soft">En grisé, une estimation d&apos;après le volume (1,25 carton par m³).</p>
                </Carte>

                <Carte
                  titre="Ordre de passage et itinéraire"
                  action={
                    <Bouton variante="jaune" disabled={action.enCours} onClick={() => action.lancer(() => calculerTournee(samedi))}>
                      {donnees.planifiee ? "Recalculer la tournée" : "Calculer la tournée"}
                    </Bouton>
                  }
                >
                  <CarteTournee depot={donnees.depot} points={points} />
                  {horsZone.length > 0 && (
                    <p className="mt-3 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[12.5px] font-medium text-brand-ink">
                      {horsZone.length} livraison{horsZone.length > 1 ? "s" : ""} à plus de {donnees.params.rayonMaxKm} km du dépôt ({horsZone.map((l) => l.contact_nom).join(", ")}) : hors tournée, à organiser à part.
                    </p>
                  )}
                  <p className="mt-3 text-[12px] text-ink-soft">
                    Départ {donnees.depot.nom} à {donnees.params.heureDepart.replace(":", " h ")} · {donnees.params.minutesParArret} min par arrêt · créneaux d&apos;une heure · {donnees.params.capacite} livraisons au plus par samedi. Paramètres provisoires, à fixer avec Bailly.
                  </p>
                </Carte>
              </div>

              <Carte
                titre="Le message de la veille"
                action={
                  <Bouton disabled={action.enCours || !donnees.planifiee || donnees.aSaisir > 0} onClick={() => action.lancer(() => envoyerCreneaux(samedi))}>
                    Envoyer les créneaux maintenant
                  </Bouton>
                }
              >
                <p className="mb-4 text-[12.5px] text-ink-soft">
                  Il part automatiquement la veille par SMS et par e-mail (tâche de la veille, avec les bons de livraison et le récapitulatif pour l&apos;équipe), dès que le nombre de cartons et le créneau sont connus. Le bouton l&apos;envoie tout de suite ; un client déjà prévenu ne l&apos;est pas deux fois. Ce qui part vraiment dépend du réglage des envois, ci-dessus.
                </p>
                {!donnees.planifiee || donnees.aSaisir > 0 ? (
                  <p className="text-[13px] text-ink-soft">Saisissez tous les nombres de cartons et calculez la tournée pour voir les messages.</p>
                ) : (
                  <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {donnees.livraisons
                      .filter((l) => l.sms)
                      .map((l) => (
                        <li key={l.id} className="rounded-2xl bg-subtle/70 p-4">
                          <p className="mb-2 flex items-center justify-between text-[12.5px] font-semibold">
                            <span>{l.contact_nom}</span>
                            <span className="tabular-nums text-ink-soft">{l.contact_tel}</span>
                          </p>
                          <p className="max-w-[92%] rounded-2xl rounded-bl-md bg-card p-3 text-[12.5px] leading-snug">{l.sms}</p>
                          <p className="mt-2 text-[11.5px] text-ink-soft">
                            + e-mail à {l.email}
                            {l.creneau_envoye_le ? ` · parti le ${dateFr(l.creneau_envoye_le)}` : ""}
                          </p>
                        </li>
                      ))}
                  </ul>
                )}
              </Carte>
            </>
          )}
        </>
      )}
    </div>
  );
}
