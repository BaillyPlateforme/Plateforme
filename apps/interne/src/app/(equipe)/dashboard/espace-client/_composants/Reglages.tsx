"use client";

import { useState } from "react";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import { ajouterConseiller, ajouterService, ajouterTuto, basculerContenu, reinitialiserDemoEquipe, supprimerConseiller } from "@/lib/actions/espace-client-equipe";
import type { vueReglages } from "@/lib/espace-client/vues-equipe";
import { BandeauMode, Bouton, Carte, Champ, Pastille, Retour, champ, useAction, usePorte, zoneTexte } from "./socle";

type Donnees = ReturnType<typeof vueReglages>;

/** Les conseillers présentés aux clients, les tutos et les services de l'espace. */
export function Reglages() {
  const { base } = usePorte();
  const { donnees, erreur, recharger } = useRessource<Donnees>(`${base}/reglages`);
  const action = useAction(recharger);
  const [conseiller, setConseiller] = useState({ prenom: "", nom: "", email: "", telephone: "" });
  const [tuto, setTuto] = useState({ titre: "", resume: "", categorie: "", etapes: "", url_video: "" });
  const [service, setService] = useState({ titre: "", accroche: "", contenu: "", prix_indicatif: "" });
  if (erreur) return <Echec message={erreur} onRetry={recharger} />;
  if (!donnees) return <Squelette titre={false} lignes={6} />;
  const erreurs = action.resultat && !action.resultat.ok ? action.resultat.erreurs ?? {} : {};

  return (
    <div className="space-y-5">
      <BandeauMode mode={donnees.mode} />
      <Retour r={action.resultat} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Carte titre="Conseillers">
          <p className="mb-3 text-[12.5px] text-ink-soft">Le conseiller d&apos;un dossier signe ses e-mails et apparaît dans l&apos;espace du client, avec sa ligne directe.</p>
          <ul className="divide-y divide-line/70">
            {donnees.conseillers.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <span>
                  <span className="font-medium">
                    {c.prenom} {c.nom}
                  </span>
                  <span className="block text-[12px] text-ink-soft">
                    {c.email} · {c.telephone} · {c.dossiers} client{c.dossiers > 1 ? "s" : ""}
                  </span>
                </span>
                <button className="text-ink-soft hover:text-danger disabled:opacity-40" disabled={c.dossiers > 0} title={c.dossiers ? "Suit encore des clients" : undefined} onClick={() => action.lancer(() => supprimerConseiller(c.id))}>
                  Retirer
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-3 rounded-xl bg-subtle/60 p-4 sm:grid-cols-2">
            {(
              [
                ["prenom", "Prénom"],
                ["nom", "Nom"],
                ["email", "E-mail"],
                ["telephone", "Ligne directe"],
              ] as const
            ).map(([k, l]) => (
              <Champ key={k} label={l} erreur={erreurs[k]}>
                <input className={champ} value={conseiller[k]} onChange={(e) => setConseiller({ ...conseiller, [k]: e.target.value })} />
              </Champ>
            ))}
            <Bouton className="sm:col-span-2 sm:justify-self-start" disabled={action.enCours} onClick={() => action.lancer(() => ajouterConseiller(conseiller), (r) => r.ok && setConseiller({ prenom: "", nom: "", email: "", telephone: "" }))}>
              Ajouter le conseiller
            </Bouton>
          </div>
        </Carte>

        <Carte titre="Mes tutos">
          <ul className="divide-y divide-line/70">
            {donnees.tutos.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <span>
                  <span className="font-medium">{t.titre}</span> <Pastille>{t.categorie}</Pastille>
                  <span className="block text-[12px] text-ink-soft">{t.resume}</span>
                </span>
                <button onClick={() => action.lancer(() => basculerContenu("tutos", t.id))} className="shrink-0">
                  {t.actif ? <Pastille ton="ok">Publié</Pastille> : <Pastille>Masqué</Pastille>}
                </button>
              </li>
            ))}
          </ul>
          <details className="mt-3">
            <summary className="cursor-pointer text-[13px] font-medium">+ Ajouter un tuto</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Champ label="Titre">
                <input className={champ} value={tuto.titre} onChange={(e) => setTuto({ ...tuto, titre: e.target.value })} />
              </Champ>
              <Champ label="Catégorie">
                <input className={champ} value={tuto.categorie} onChange={(e) => setTuto({ ...tuto, categorie: e.target.value })} />
              </Champ>
              <Champ label="Résumé" className="sm:col-span-2">
                <input className={champ} value={tuto.resume} onChange={(e) => setTuto({ ...tuto, resume: e.target.value })} />
              </Champ>
              <Champ label="Étapes, une par ligne" className="sm:col-span-2">
                <textarea className={zoneTexte} value={tuto.etapes} onChange={(e) => setTuto({ ...tuto, etapes: e.target.value })} />
              </Champ>
              <Champ label="Vidéo (lien https intégrable, facultatif)" className="sm:col-span-2">
                <input className={champ} value={tuto.url_video} onChange={(e) => setTuto({ ...tuto, url_video: e.target.value })} />
              </Champ>
              <Bouton className="sm:justify-self-start" disabled={action.enCours} onClick={() => action.lancer(() => ajouterTuto(tuto), (r) => r.ok && setTuto({ titre: "", resume: "", categorie: "", etapes: "", url_video: "" }))}>
                Publier le tuto
              </Bouton>
            </div>
          </details>
        </Carte>

        <Carte titre="Services complémentaires">
          <ul className="divide-y divide-line/70">
            {donnees.services.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <span>
                  <span className="font-medium">{s.titre}</span> <span className="text-ink-soft">· {s.prix_indicatif ?? "sur devis"}</span>
                  <span className="block text-[12px] text-ink-soft">{s.accroche}</span>
                </span>
                <button onClick={() => action.lancer(() => basculerContenu("services", s.id))} className="shrink-0">
                  {s.actif ? <Pastille ton="ok">Proposé</Pastille> : <Pastille>Masqué</Pastille>}
                </button>
              </li>
            ))}
          </ul>
          <details className="mt-3">
            <summary className="cursor-pointer text-[13px] font-medium">+ Ajouter un service</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Champ label="Titre">
                <input className={champ} value={service.titre} onChange={(e) => setService({ ...service, titre: e.target.value })} />
              </Champ>
              <Champ label="Prix indicatif (facultatif)">
                <input className={champ} value={service.prix_indicatif} onChange={(e) => setService({ ...service, prix_indicatif: e.target.value })} placeholder="à partir de 49 € / mois" />
              </Champ>
              <Champ label="Accroche" className="sm:col-span-2">
                <input className={champ} value={service.accroche} onChange={(e) => setService({ ...service, accroche: e.target.value })} />
              </Champ>
              <Champ label="Description" className="sm:col-span-2">
                <textarea className={zoneTexte} value={service.contenu} onChange={(e) => setService({ ...service, contenu: e.target.value })} />
              </Champ>
              <Bouton className="sm:justify-self-start" disabled={action.enCours} onClick={() => action.lancer(() => ajouterService(service), (r) => r.ok && setService({ titre: "", accroche: "", contenu: "", prix_indicatif: "" }))}>
                Ajouter le service
              </Bouton>
            </div>
          </details>
        </Carte>

        <Carte titre="Où vivent les données">
          <ul className="space-y-2 text-[13px]">
            <li>
              <b>Données :</b> {donnees.mode.donnees === "demo" ? "démonstration en mémoire, amorcée par les profils A à D (perdue au redémarrage)." : "tables ec_* de Supabase, cloisonnées par client (RLS) ; fichiers dans le seau privé « espace-client », servis par liens signés de courte durée. Les clients se connectent par lien magique, sans mot de passe."}
            </li>
            <li>
              <b>Envois :</b> {donnees.mode.envoi ? "e-mails et SMS envoyés par Brevo." : "e-mails et SMS journalisés seulement (ESPACE_CLIENT_ENVOI=1 pour envoyer)."}
            </li>
          </ul>
          {donnees.mode.donnees === "demo" && (
            <Bouton variante="danger" className="mt-4" disabled={action.enCours} onClick={() => confirm("Remettre la démonstration à son état de départ ?") && action.lancer(() => reinitialiserDemoEquipe())}>
              Réinitialiser la démonstration
            </Bouton>
          )}
        </Carte>
      </div>
    </div>
  );
}
