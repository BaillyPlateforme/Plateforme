"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import { creerDossier } from "@/lib/actions/espace-client-equipe";
import { photoPourVille } from "@/lib/espace-client/photos";
import type { DemandeResume, DevisDemande } from "@/lib/espace-client/demandes";
import type { vueNouveau } from "@/lib/espace-client/vues-equipe";
import { Bouton, Carte, Champ, Retour, champ, dateFr, euro, useAction, usePorte } from "./socle";

type Donnees = ReturnType<typeof vueNouveau>;

const vide = {
  civilite: "", prenom: "", nom: "", email: "", telephone: "", type: "particulier", societe: "", masquer_devis: true, masquer_factures: true, conseiller_id: "",
  ville_depart: "", ville_arrivee: "", adresse_depart: "", adresse_arrivee: "", periode_debut: "", periode_fin: "", portee: "national", mode_transport: "route",
  pays_destination: "FR", statut: "planifie", volume_m3: "", formule: "", logement: "", photo: "", request_id: "",
};
type Formulaire = typeof vide;

const adresse = (a: string | null, cp: string | null, v: string | null) => [a, [cp, v].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/** Le préremplissage depuis une demande : tout ce qu'on peut reprendre, rien d'inventé. */
function depuisDemande(f: Formulaire, d: DemandeResume): Formulaire {
  const [prenom, ...reste] = (d.client_nom ?? "").trim().split(/\s+/);
  const jour = d.date_souhaitee?.slice(0, 10) ?? "";
  return {
    ...f,
    prenom: reste.length ? prenom : f.prenom,
    nom: reste.length ? reste.join(" ") : (d.client_nom ?? f.nom),
    email: d.client_email ?? f.email,
    telephone: d.client_tel ?? f.telephone,
    type: d.espace_nom ? "grand_compte" : f.type,
    societe: d.espace_nom ?? f.societe,
    ville_depart: d.depart_ville ?? f.ville_depart,
    ville_arrivee: d.arrivee_ville ?? f.ville_arrivee,
    adresse_depart: adresse(d.depart_adresse, d.depart_code_postal, d.depart_ville) || f.adresse_depart,
    adresse_arrivee: adresse(d.arrivee_adresse, d.arrivee_code_postal, d.arrivee_ville) || f.adresse_arrivee,
    periode_debut: jour || f.periode_debut,
    periode_fin: jour || f.periode_fin,
    volume_m3: d.volume_m3 != null ? String(d.volume_m3) : f.volume_m3,
    formule: d.formule ?? f.formule,
    logement: d.type_logement_depart ?? f.logement,
    photo: d.arrivee_ville ? photoPourVille(d.arrivee_ville) : f.photo,
    request_id: d.id,
  };
}

/** « Nouveau dossier » : l'espace d'un client, prérempli au besoin depuis une demande des questionnaires. */
export function Nouveau({ ouvrirApercu }: { ouvrirApercu: (id: string) => void }) {
  const { base, racine } = usePorte();
  const router = useRouter();
  const { donnees, erreur, recharger } = useRessource<Donnees>(`${base}/nouveau`);
  const [chercher, setChercher] = useState(false);
  const demandes = useRessource<{ demandes: DemandeResume[]; erreur: string | null }>(chercher ? `${base}/demandes` : null);
  const [choisie, setChoisie] = useState("");
  const devisDemande = useRessource<{ devis: DevisDemande[]; erreur: string | null }>(choisie ? `${base}/demandes/${choisie}` : null);
  const [f, setF] = useState<Formulaire>(vide);
  const [photoChoisie, setPhotoChoisie] = useState(false);
  const [importer, setImporter] = useState(true);
  const [acces, setAcces] = useState(true);
  const { lancer, enCours, resultat } = useAction();

  if (erreur) return <Echec message={erreur} onRetry={recharger} />;
  if (!donnees) return <Squelette titre={false} lignes={8} />;

  const conseiller = f.conseiller_id || donnees.conseillers[0]?.id || "";
  const photo = f.photo || photoPourVille(f.ville_arrivee);
  const maj = (p: Partial<Formulaire>) => setF((x) => ({ ...x, ...p }));
  const err = (k: string) => (resultat && !resultat.ok ? resultat.erreurs?.[k] : undefined);
  const existant = donnees.clients.find((c) => c.email.toLowerCase() === f.email.trim().toLowerCase());

  const envoyer = () =>
    lancer(
      () =>
        creerDossier({
          client: { civilite: f.civilite, prenom: f.prenom, nom: f.nom, email: f.email.trim(), telephone: f.telephone, type: f.type, societe: f.societe, masquer_devis: f.masquer_devis, masquer_factures: f.masquer_factures, conseiller_id: conseiller },
          dossier: { ville_depart: f.ville_depart, ville_arrivee: f.ville_arrivee, adresse_depart: f.adresse_depart, adresse_arrivee: f.adresse_arrivee, periode_debut: f.periode_debut, periode_fin: f.periode_fin || f.periode_debut, portee: f.portee, mode_transport: f.mode_transport, pays_destination: f.pays_destination, statut: f.statut, volume_m3: f.volume_m3, formule: f.formule, logement: f.logement, photo, request_id: f.request_id },
          importerDevis: importer && !!f.request_id,
          envoyerAcces: acces,
        }),
      (r) => {
        if (r.ok && r.id) {
          if (r.apercu) ouvrirApercu(r.apercu);
          router.push(`${racine}/dossiers/${r.id}?cree=1`);
        }
      },
    );

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <Carte titre="Reprendre une demande des questionnaires" action={!chercher && <Bouton variante="contour" onClick={() => setChercher(true)}>Afficher les demandes récentes</Bouton>}>
          {!chercher ? (
            <p className="text-[13px] text-ink-soft">Facultatif : le dossier se remplit avec ce que le client a saisi (coordonnées, adresses, date, volume), et son estimation peut devenir le devis du dossier.</p>
          ) : demandes.erreur || demandes.donnees?.erreur ? (
            <p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-[13px] text-brand-ink">
              Lecture des demandes impossible ({demandes.erreur ?? demandes.donnees?.erreur}). Le formulaire reste utilisable : remplissez-le à la main.
            </p>
          ) : !demandes.donnees ? (
            <p className="text-[13px] text-ink-soft">Lecture des demandes…</p>
          ) : (
            <div className="space-y-3">
              <select
                className={champ}
                value={choisie}
                onChange={(e) => {
                  setChoisie(e.target.value);
                  const d = demandes.donnees!.demandes.find((x) => x.id === e.target.value);
                  if (d) setF((x) => depuisDemande(x, d));
                }}
                aria-label="Demande à reprendre"
              >
                <option value="">Choisir une demande…</option>
                {demandes.donnees.demandes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {dateFr(d.created_at)} · {d.client_nom ?? d.client_email ?? "Sans nom"} · {d.depart_ville ?? "?"} → {d.arrivee_ville ?? "?"}
                    {d.volume_m3 ? ` · ${d.volume_m3} m³` : ""}
                  </option>
                ))}
              </select>
              {choisie && (
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={importer} onChange={(e) => setImporter(e.target.checked)} />
                  Reprendre l&apos;estimation comme devis du dossier
                  {devisDemande.donnees?.devis?.[0] && <span className="text-ink-soft">({devisDemande.donnees.devis[0].reference} · {euro(devisDemande.donnees.devis[0].montant_ttc)} TTC)</span>}
                  {devisDemande.donnees && !devisDemande.donnees.devis.length && <span className="text-ink-soft">(aucune estimation pour cette demande)</span>}
                </label>
              )}
            </div>
          )}
        </Carte>

        <Carte titre="Le client">
          <div className="grid gap-3 md:grid-cols-2">
            <Champ label="Adresse e-mail (identifiant de connexion)" erreur={err("client.email")} aide={existant ? `Déjà client : le dossier sera rattaché à ${existant.nom}.` : "Le lien d'accès part à cette adresse."} className="md:col-span-2">
              <input className={champ} type="email" value={f.email} onChange={(e) => maj({ email: e.target.value })} list="clients-connus" />
              <datalist id="clients-connus">
                {donnees.clients.map((c) => (
                  <option key={c.email} value={c.email}>
                    {c.nom}
                  </option>
                ))}
              </datalist>
            </Champ>
            <Champ label="Civilité">
              <select className={champ} value={f.civilite} onChange={(e) => maj({ civilite: e.target.value })}>
                <option value="">—</option>
                <option>Madame</option>
                <option>Monsieur</option>
              </select>
            </Champ>
            <Champ label="Téléphone" erreur={err("client.telephone")}>
              <input className={champ} value={f.telephone} onChange={(e) => maj({ telephone: e.target.value })} placeholder="06 12 34 56 78" />
            </Champ>
            <Champ label="Prénom" erreur={err("client.prenom")}>
              <input className={champ} value={f.prenom} onChange={(e) => maj({ prenom: e.target.value })} />
            </Champ>
            <Champ label="Nom" erreur={err("client.nom")}>
              <input className={champ} value={f.nom} onChange={(e) => maj({ nom: e.target.value })} />
            </Champ>
            <Champ label="Type de client">
              <select className={champ} value={f.type} onChange={(e) => maj({ type: e.target.value })}>
                <option value="particulier">Particulier</option>
                <option value="grand_compte">Grand compte</option>
              </select>
            </Champ>
            <Champ label="Conseiller" erreur={err("client.conseiller_id")}>
              <select className={champ} value={conseiller} onChange={(e) => maj({ conseiller_id: e.target.value })}>
                {donnees.conseillers.length === 0 && <option value="">Aucun : ajoutez-en dans Réglages</option>}
                {donnees.conseillers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.prenom} {c.nom}
                  </option>
                ))}
              </select>
            </Champ>
            {f.type === "grand_compte" && (
              <>
                <Champ label="Société" erreur={err("client.societe")} className="md:col-span-2">
                  <input className={champ} value={f.societe} onChange={(e) => maj({ societe: e.target.value })} />
                </Champ>
                <div className="flex flex-wrap gap-4 text-[13px] md:col-span-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={f.masquer_devis} onChange={(e) => maj({ masquer_devis: e.target.checked })} /> Masquer les devis
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={f.masquer_factures} onChange={(e) => maj({ masquer_factures: e.target.checked })} /> Masquer les factures
                  </label>
                </div>
              </>
            )}
          </div>
        </Carte>

        <Carte titre="Le déménagement">
          <div className="grid gap-3 md:grid-cols-2">
            <Champ label="Ville de départ" erreur={err("dossier.ville_depart")}>
              <input className={champ} value={f.ville_depart} onChange={(e) => maj({ ville_depart: e.target.value })} />
            </Champ>
            <Champ label="Ville d'arrivée" erreur={err("dossier.ville_arrivee")}>
              <input className={champ} value={f.ville_arrivee} onChange={(e) => maj({ ville_arrivee: e.target.value, ...(photoChoisie ? {} : { photo: "" }) })} />
            </Champ>
            <Champ label="Adresse de départ" erreur={err("dossier.adresse_depart")}>
              <input className={champ} value={f.adresse_depart} onChange={(e) => maj({ adresse_depart: e.target.value })} />
            </Champ>
            <Champ label="Adresse d'arrivée" erreur={err("dossier.adresse_arrivee")}>
              <input className={champ} value={f.adresse_arrivee} onChange={(e) => maj({ adresse_arrivee: e.target.value })} />
            </Champ>
            <Champ label="Premier jour" erreur={err("dossier.periode_debut")}>
              <input className={champ} type="date" value={f.periode_debut} onChange={(e) => maj({ periode_debut: e.target.value, periode_fin: f.periode_fin && f.periode_fin >= e.target.value ? f.periode_fin : e.target.value })} />
            </Champ>
            <Champ label="Dernier jour" erreur={err("dossier.periode_fin")}>
              <input className={champ} type="date" value={f.periode_fin} onChange={(e) => maj({ periode_fin: e.target.value })} />
            </Champ>
            <Champ label="Portée">
              <select className={champ} value={f.portee} onChange={(e) => maj({ portee: e.target.value, ...(e.target.value === "national" ? { pays_destination: "FR", mode_transport: "route" } : {}) })}>
                <option value="national">National</option>
                <option value="international">International</option>
              </select>
            </Champ>
            {f.portee === "international" && (
              <>
                <Champ label="Pays de destination" erreur={err("dossier.pays_destination")}>
                  <select className={champ} value={f.pays_destination} onChange={(e) => maj({ pays_destination: e.target.value })}>
                    {Object.entries(donnees.pays).map(([code, nom]) => (
                      <option key={code} value={code}>
                        {nom} ({code})
                      </option>
                    ))}
                  </select>
                </Champ>
                <Champ label="Transport">
                  <select className={champ} value={f.mode_transport} onChange={(e) => maj({ mode_transport: e.target.value })}>
                    <option value="route">Route</option>
                    <option value="maritime">Maritime</option>
                    <option value="aerien">Aérien</option>
                  </select>
                </Champ>
              </>
            )}
            <Champ label="Volume (m³)" erreur={err("dossier.volume_m3")}>
              <input className={champ} inputMode="decimal" value={f.volume_m3} onChange={(e) => maj({ volume_m3: e.target.value })} />
            </Champ>
            <Champ label="Formule" erreur={err("dossier.formule")}>
              <input className={champ} value={f.formule} onChange={(e) => maj({ formule: e.target.value })} placeholder="Ex. : Confort" />
            </Champ>
            <Champ label="Logement" aide="Facultatif, affiché à côté du volume (« T3 · 68 m² »).">
              <input className={champ} value={f.logement} onChange={(e) => maj({ logement: e.target.value })} />
            </Champ>
            <Champ label="Statut">
              <select className={champ} value={f.statut} onChange={(e) => maj({ statut: e.target.value })}>
                <option value="en_preparation">En préparation</option>
                <option value="planifie">Planifié</option>
                <option value="en_cours">En cours</option>
              </select>
            </Champ>
          </div>
        </Carte>
      </div>

      <div className="space-y-5">
        <Carte titre="Photo de la page de garde">
          <div className="grid grid-cols-2 gap-2">
            {donnees.photos.map((p) => (
              <button
                key={p.chemin}
                type="button"
                onClick={() => {
                  maj({ photo: p.chemin });
                  setPhotoChoisie(true);
                }}
                className={`relative aspect-[4/3] overflow-hidden rounded-xl bg-subtle bg-cover bg-center ring-offset-2 transition ${photo === p.chemin ? "ring-2 ring-brand" : "opacity-80 hover:opacity-100"}`}
                style={{ backgroundImage: `url('${p.chemin}')` }}
                title={p.libelle}
                aria-label={p.libelle}
                aria-pressed={photo === p.chemin}
              />
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-ink-soft">Choisie d&apos;après la ville d&apos;arrivée, tant qu&apos;on n&apos;en désigne pas une.</p>
        </Carte>
        <Carte titre="Création">
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" className="mt-0.5" checked={acces} onChange={(e) => setAcces(e.target.checked)} />
            <span>Envoyer tout de suite le lien d&apos;accès au client (valable 15 minutes ; il pourra en redemander un depuis la page de connexion).</span>
          </label>
          <Bouton className="mt-4 w-full" onClick={envoyer} disabled={enCours}>
            {enCours ? "Création…" : "Créer le dossier"}
          </Bouton>
          <div className="mt-3">
            <Retour r={resultat} apercu={ouvrirApercu} />
          </div>
        </Carte>
      </div>
    </div>
  );
}
