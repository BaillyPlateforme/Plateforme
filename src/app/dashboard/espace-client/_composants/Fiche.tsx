"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import {
  ajouterDevis, ajouterFacture, changerStatutDevis, deposerDocumentEquipe, envoyerAcces, marquerFacturePayee, marquerRealise,
  modifierClient, modifierConteneur, modifierDossier, revoquerSessions, supprimerDocument,
} from "@/lib/actions/espace-client-equipe";
import { CATEGORIES_DOCUMENT_EQUIPE, ESCALIER, MODELES_MESSAGE, MONTE_MEUBLE, POIDS_LOURD, STATIONNEMENT, STATUT_DOSSIER, STATUT_LIVRAISON, STATUT_SAV, TYPE_FACTURE, libelleEtage } from "@/lib/espace-client/libelles";
import { TYPES_DOCUMENTS, verifierFichier } from "@/lib/espace-client/schemas";
import type { StatutDevis } from "@/lib/espace-client/types";
import type { vueDossier } from "@/lib/espace-client/vues-equipe";
import { BandeauMode, Bouton, Carte, Champ, LienBouton, Pastille, Retour, champ, dateFr, dateHeureFr, euro, useAction, usePorte, zoneTexte } from "./socle";

type Donnees = NonNullable<ReturnType<typeof vueDossier>>;
type Ouvrir = (id: string) => void;

const TYPE_ACCEPTATION: Record<string, string> = {
  cgv: "Conditions générales de vente",
  rgpd: "Politique de confidentialité",
  conditions_livraison: "Conditions de livraison certifiées",
  declaration_valeurs: "Déclaration de valeurs certifiée",
  devis: "Acceptation du devis",
};

/** La fiche d'un dossier, vue de l'équipe : tout ce que voit le client, et tout ce qu'on peut y faire. */
export function Fiche({ id, ouvrirApercu }: { id: string; ouvrirApercu: Ouvrir }) {
  const { base, racine } = usePorte();
  const { donnees, erreur, recharger } = useRessource<Donnees>(`${base}/dossier/${id}`);
  const cree = useSearchParams().get("cree");
  const action = useAction(recharger);

  if (erreur) return <Echec message={erreur} onRetry={recharger} />;
  if (!donnees) return <Squelette lignes={10} />;
  const { dossier, client } = donnees;
  const termine = dossier.statut === "termine";

  return (
    <div className="space-y-5">
      <Link href={racine} className="text-[13px] text-ink-soft hover:text-ink">
        ← Tous les dossiers
      </Link>
      <BandeauMode mode={donnees.mode} />

      <header className="relative isolate overflow-hidden rounded-[18px] bg-[#1b1a18] p-6 text-white">
        <div className="absolute inset-0 -z-20 bg-cover bg-center opacity-45" style={{ backgroundImage: `url('${dossier.photo}')` }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#1b1a18] via-[#1b1a18]/85 to-[#1b1a18]/30" />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap gap-1.5">
              <Pastille ton="attente">{dossier.reference}</Pastille>
              <Pastille>{client.type === "grand_compte" ? "Grand compte" : "Particulier"}</Pastille>
              <Pastille>{STATUT_DOSSIER[dossier.statut]}</Pastille>
              {(client.masquer_devis || client.masquer_factures) && <Pastille ton="attente">{[client.masquer_devis && "devis", client.masquer_factures && "factures"].filter(Boolean).join(" et ")} masqués</Pastille>}
            </div>
            <h2 className="mt-3 text-[30px] font-bold leading-tight tracking-tight">
              {dossier.ville_depart} → {dossier.ville_arrivee}
            </h2>
            <p className="mt-1 text-[13.5px] text-white/80">
              {client.societe ? `${client.societe} · ` : ""}
              {[client.civilite, client.prenom, client.nom].filter(Boolean).join(" ")} · {client.email} · du {dateFr(dossier.periode_debut)} au {dateFr(dossier.periode_fin)} · {dossier.volume_m3} m³
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Bouton variante="jaune" disabled={action.enCours} onClick={() => action.lancer(() => envoyerAcces(id), (r) => r.ok && r.apercu && ouvrirApercu(r.apercu))}>
              Envoyer le lien d&apos;accès
            </Bouton>
            <Bouton variante="contour" className="!border-white/30 !bg-transparent !text-white" disabled={action.enCours} onClick={() => confirm("Couper toutes les sessions ouvertes de ce client ?") && action.lancer(() => revoquerSessions(id))}>
              Couper les sessions
            </Bouton>
            {!termine && (
              <Bouton variante="contour" className="!border-white/30 !bg-transparent !text-white" disabled={action.enCours} onClick={() => confirm("Marquer le déménagement comme réalisé ? La demande d'avis partira au client.") && action.lancer(() => marquerRealise(id))}>
                Fin de chantier signée
              </Bouton>
            )}
          </div>
        </div>
      </header>
      {cree && !action.resultat && <p className="rounded-xl bg-good-soft px-3.5 py-2.5 text-[13px] font-medium text-good">✓ Dossier créé. L&apos;espace du client est prêt.</p>}
      <Retour r={action.resultat} apercu={ouvrirApercu} />

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          <Frise d={donnees} />
          <Documents d={donnees} recharger={recharger} ouvrirApercu={ouvrirApercu} />
          {!client.masquer_devis || !client.masquer_factures ? <DevisFactures d={donnees} recharger={recharger} /> : null}
          {(client.masquer_devis || client.masquer_factures) && (
            <Carte titre="Devis et factures">
              <p className="text-[13px] text-ink-soft">Masqués pour ce grand compte : le client ne les voit pas. Décochez le masquage dans « Client et réglages » pour les gérer ici.</p>
            </Carte>
          )}
          <Engagements d={donnees} />
        </div>
        <div className="space-y-5">
          <ReglagesClient d={donnees} recharger={recharger} />
          <InfosDossier d={donnees} recharger={recharger} />
          {donnees.suiviConteneur && <SuiviConteneur d={donnees} recharger={recharger} />}
          <CartonsSav d={donnees} />
          <Carte titre="Messages du dossier">
            <ul className="space-y-2.5">
              {donnees.notifications.map((n) => (
                <li key={n.id} className="text-[12.5px]">
                  <button onClick={() => ouvrirApercu(n.id)} className="text-left font-medium hover:text-brand-ink">
                    {n.canal === "sms" ? "SMS · " : ""}
                    {MODELES_MESSAGE[n.modele] ?? n.modele}
                  </button>
                  <p className="text-ink-soft">
                    {dateHeureFr(n.sent_at)} · {n.destinataire} · {n.statut === "journalisee" ? "journalisé" : n.statut === "envoyee" ? "envoyé" : "échec"}
                  </p>
                </li>
              ))}
              {donnees.notifications.length === 0 && <li className="text-[13px] text-ink-soft">Aucun message pour l&apos;instant.</li>}
            </ul>
          </Carte>
        </div>
      </div>
    </div>
  );
}

function Frise({ d }: { d: Donnees }) {
  return (
    <Carte titre="La frise du client" action={<span className="text-[12px] text-ink-soft">{d.avancement.faites} étape{d.avancement.faites > 1 ? "s" : ""} sur {d.avancement.total} · {d.avancement.pourcent} %</span>}>
      <ol className="grid gap-2 sm:grid-cols-2">
        {d.frise.map((e, i) => (
          <li key={e.cle} className={`flex items-start gap-3 rounded-xl p-3 ${e.statut === "a_faire" ? (e.bloquante ? "bg-danger-soft/60" : "bg-brand-soft/60") : "bg-subtle/60"}`}>
            <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${e.statut === "fait" ? "bg-ink text-white" : e.statut === "a_faire" ? "bg-brand text-[#1b1a18]" : "bg-line text-ink-soft"}`}>{e.statut === "fait" ? "✓" : i + 1}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold leading-tight">
                {e.titre} {e.bloquante && e.statut !== "fait" && <span className="text-[10.5px] font-bold uppercase tracking-wider text-danger">· bloquant</span>}
              </span>
              <span className="text-[12px] text-ink-soft">{e.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </Carte>
  );
}

function Documents({ d, recharger, ouvrirApercu }: { d: Donnees; recharger: () => void; ouvrirApercu: Ouvrir }) {
  const action = useAction(recharger);
  const form = useRef<HTMLFormElement>(null);
  const [locale, setLocale] = useState<string | null>(null);
  const erreurs = action.resultat && !action.resultat.ok ? action.resultat.erreurs ?? {} : {};
  return (
    <Carte titre="Documents">
      <ul className="divide-y divide-line/70">
        {d.pieces.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
            <span className="flex items-center gap-2">
              <span className={p.depot ? "text-good" : p.obligatoire ? "text-danger" : "text-ink-soft"}>{p.depot ? "✓" : "•"}</span>
              {p.libelle}
              {p.pays && <Pastille>{p.pays}</Pastille>}
            </span>
            {p.depot ? (
              <a href={p.depot.lien} target="_blank" rel="noopener" className="font-medium hover:text-brand-ink">
                Ouvrir · {dateFr(p.depot.le)}
              </a>
            ) : (
              <span className="text-ink-soft">{p.obligatoire ? "Manquante" : "Facultative"}</span>
            )}
          </li>
        ))}
        {d.documents.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
            <span className="flex items-center gap-2">
              {x.libelle} <Pastille ton={x.source === "equipe" ? "noir" : "neutre"}>{x.source === "equipe" ? "Équipe" : "Client"}</Pastille>
            </span>
            <span className="flex items-center gap-3">
              <a href={x.lien} target="_blank" rel="noopener" className="font-medium hover:text-brand-ink">
                Ouvrir
              </a>
              {x.source === "equipe" && (
                <button className="text-ink-soft hover:text-danger" onClick={() => confirm(`Retirer « ${x.libelle} » de l'espace du client ?`) && action.lancer(() => supprimerDocument(x.id))}>
                  Retirer
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <form
        ref={form}
        className="mt-4 space-y-3 rounded-xl bg-subtle/60 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const f = fd.get("fichier");
          const m = verifierFichier(f instanceof File ? f : null, TYPES_DOCUMENTS);
          setLocale(m);
          if (m) return;
          action.lancer(() => deposerDocumentEquipe(d.dossier.id, fd), (r) => {
            if (r.ok) form.current?.reset();
            if (r.ok && r.apercu) ouvrirApercu(r.apercu);
          });
        }}
      >
        <p className="text-[13px] font-semibold">Déposer un document pour le client</p>
        <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
          <Champ label="Nom du document" erreur={erreurs.libelle}>
            <input name="libelle" className={champ} placeholder="Ex. : Lettre de voiture" />
          </Champ>
          <Champ label="Catégorie">
            <select name="categorie" className={champ}>
              {CATEGORIES_DOCUMENT_EQUIPE.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Champ>
        </div>
        <Champ label="Fichier (PDF ou image, 10 Mo au plus)" erreur={locale ?? erreurs.fichier}>
          <input type="file" name="fichier" accept={TYPES_DOCUMENTS.join(",")} className="block w-full text-[13px] file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-white" />
        </Champ>
        <Bouton disabled={action.enCours}>{action.enCours ? "Dépôt…" : "Déposer et prévenir le client"}</Bouton>
        <Retour r={action.resultat} apercu={ouvrirApercu} />
      </form>
    </Carte>
  );
}

function DevisFactures({ d, recharger }: { d: Donnees; recharger: () => void }) {
  const action = useAction(recharger);
  const [nouveauDevis, setNouveauDevis] = useState(false);
  const [nouvelleFacture, setNouvelleFacture] = useState(false);
  const enDeux = (n: number) => new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + n)).toISOString().slice(0, 10);
  const [devis, setDevis] = useState({ formule: d.dossier.formule, lignes: "", inclus: "", arrhes_pourcentage: d.client.type === "particulier" ? "30" : "0", valide_jusqu_au: enDeux(30), statut: "envoye" });
  const [facture, setFacture] = useState({ type: "solde", libelle: `Solde du déménagement ${d.dossier.ville_depart} → ${d.dossier.ville_arrivee}`, montant_ttc: "", echeance: enDeux(14), periode: "" });
  const erreurs = action.resultat && !action.resultat.ok ? action.resultat.erreurs ?? {} : {};

  return (
    <Carte titre="Devis et factures">
      {!d.client.masquer_devis && (
        <>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-soft">Devis</p>
          <ul className="divide-y divide-line/70">
            {d.devis.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[13px]">
                <span>
                  <span className="font-semibold">{v.numero}</span> · {v.formule} · {euro(v.montant_ttc)} TTC
                  {v.arrhes_pourcentage > 0 && <span className="text-ink-soft"> · arrhes {v.arrhes_pourcentage} %</span>}
                </span>
                <span className="flex items-center gap-2">
                  <select value={v.statut} onChange={(e) => action.lancer(() => changerStatutDevis(v.id, e.target.value as StatutDevis))} className={`${champ} !h-8 !w-auto !py-0`} aria-label={`Statut du devis ${v.numero}`}>
                    <option value="envoye">Envoyé</option>
                    <option value="accepte">Accepté</option>
                    <option value="refuse">Non retenu</option>
                    <option value="expire">Expiré</option>
                  </select>
                  <a href={v.lien} target="_blank" rel="noopener" className="font-medium hover:text-brand-ink">
                    PDF
                  </a>
                </span>
              </li>
            ))}
            {d.devis.length === 0 && <li className="py-2 text-[13px] text-ink-soft">Aucun devis : le client voit « devis en préparation ».</li>}
          </ul>
          {nouveauDevis ? (
            <div className="mt-3 space-y-3 rounded-xl bg-subtle/60 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Champ label="Formule" erreur={erreurs.formule}>
                  <input className={champ} value={devis.formule} onChange={(e) => setDevis({ ...devis, formule: e.target.value })} />
                </Champ>
                <Champ label="Arrhes (%)" erreur={erreurs.arrhes_pourcentage}>
                  <input className={champ} inputMode="numeric" value={devis.arrhes_pourcentage} onChange={(e) => setDevis({ ...devis, arrhes_pourcentage: e.target.value })} />
                </Champ>
                <Champ label="Valable jusqu'au" erreur={erreurs.valide_jusqu_au}>
                  <input className={champ} type="date" value={devis.valide_jusqu_au} onChange={(e) => setDevis({ ...devis, valide_jusqu_au: e.target.value })} />
                </Champ>
              </div>
              <Champ label="Prestations, une par ligne : « Libellé ; montant HT ; détail »" erreur={erreurs.lignes ?? Object.entries(erreurs).find(([k]) => k.startsWith("lignes."))?.[1]}>
                <textarea className={zoneTexte} value={devis.lignes} onChange={(e) => setDevis({ ...devis, lignes: e.target.value })} placeholder={"Déménagement Paris → Lyon ; 2150 ; 32 m³, équipe de 4\nEmballage du fragile ; 290"} />
              </Champ>
              <Champ label="Ce que la formule comprend (séparé par des virgules)">
                <input className={champ} value={devis.inclus} onChange={(e) => setDevis({ ...devis, inclus: e.target.value })} placeholder="Emballage du fragile, Démontage / remontage" />
              </Champ>
              <div className="flex flex-wrap items-center gap-2">
                <select className={`${champ} !w-auto`} value={devis.statut} onChange={(e) => setDevis({ ...devis, statut: e.target.value })} aria-label="Statut du nouveau devis">
                  <option value="envoye">À accepter par le client</option>
                  <option value="accepte">Déjà accepté</option>
                </select>
                <Bouton disabled={action.enCours} onClick={() => action.lancer(() => ajouterDevis(d.dossier.id, devis), (r) => r.ok && setNouveauDevis(false))}>
                  Ajouter le devis
                </Bouton>
                <Bouton variante="discret" onClick={() => setNouveauDevis(false)}>
                  Annuler
                </Bouton>
              </div>
            </div>
          ) : (
            <Bouton variante="contour" className="mt-3" onClick={() => setNouveauDevis(true)}>
              + Ajouter un devis
            </Bouton>
          )}
        </>
      )}

      {!d.client.masquer_factures && (
        <>
          <p className="mb-2 mt-6 text-[12px] font-semibold uppercase tracking-wider text-ink-soft">Factures</p>
          <ul className="divide-y divide-line/70">
            {d.factures.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[13px]">
                <span>
                  <span className="font-semibold">{f.numero}</span> · {TYPE_FACTURE[f.type]} · {euro(f.montant_ttc)}
                  <span className="text-ink-soft"> · {f.statut === "payee" ? `réglée le ${dateFr(f.payee_le!)}` : `échéance ${dateFr(f.echeance)}`}</span>
                </span>
                <span className="flex items-center gap-2">
                  {f.statut === "payee" ? <Pastille ton="ok">Payée</Pastille> : <Pastille ton="attente">À régler</Pastille>}
                  {f.statut !== "payee" && (
                    <button className="text-[12px] text-ink-soft hover:text-ink" onClick={() => confirm("Marquer cette facture comme réglée hors ligne (virement, chèque) ?") && action.lancer(() => marquerFacturePayee(f.id))}>
                      Réglée hors ligne
                    </button>
                  )}
                  <a href={f.lien} target="_blank" rel="noopener" className="font-medium hover:text-brand-ink">
                    PDF
                  </a>
                </span>
              </li>
            ))}
            {d.factures.length === 0 && <li className="py-2 text-[13px] text-ink-soft">Aucune facture.</li>}
          </ul>
          {nouvelleFacture ? (
            <div className="mt-3 space-y-3 rounded-xl bg-subtle/60 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Champ label="Type">
                  <select className={champ} value={facture.type} onChange={(e) => setFacture({ ...facture, type: e.target.value })}>
                    <option value="solde">Solde</option>
                    <option value="arrhes">Arrhes</option>
                    <option value="garde_meubles">Garde-meubles</option>
                  </select>
                </Champ>
                <Champ label="Montant TTC (€)" erreur={erreurs.montant_ttc}>
                  <input className={champ} inputMode="decimal" value={facture.montant_ttc} onChange={(e) => setFacture({ ...facture, montant_ttc: e.target.value.replace(",", ".") })} />
                </Champ>
                <Champ label="Libellé" erreur={erreurs.libelle} className="sm:col-span-2">
                  <input className={champ} value={facture.libelle} onChange={(e) => setFacture({ ...facture, libelle: e.target.value })} />
                </Champ>
                <Champ label="Échéance" erreur={erreurs.echeance}>
                  <input className={champ} type="date" value={facture.echeance} onChange={(e) => setFacture({ ...facture, echeance: e.target.value })} />
                </Champ>
                {facture.type === "garde_meubles" && (
                  <Champ label="Mois couvert (AAAA-MM)" erreur={erreurs.periode}>
                    <input className={champ} value={facture.periode} onChange={(e) => setFacture({ ...facture, periode: e.target.value })} placeholder="2026-12" />
                  </Champ>
                )}
              </div>
              <div className="flex gap-2">
                <Bouton disabled={action.enCours} onClick={() => action.lancer(() => ajouterFacture(d.dossier.id, facture), (r) => r.ok && setNouvelleFacture(false))}>
                  Émettre la facture
                </Bouton>
                <Bouton variante="discret" onClick={() => setNouvelleFacture(false)}>
                  Annuler
                </Bouton>
              </div>
            </div>
          ) : (
            <Bouton variante="contour" className="mt-3" onClick={() => setNouvelleFacture(true)}>
              + Émettre une facture
            </Bouton>
          )}
        </>
      )}
      <div className="mt-3">
        <Retour r={action.resultat} />
      </div>
    </Carte>
  );
}

function Engagements({ d }: { d: Donnees }) {
  const c = d.conditions;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Carte titre="Conditions de livraison">
        {c?.valide_at ? (
          <div className="space-y-1.5 text-[13px]">
            <p className="font-medium">{c.adresse_livraison}</p>
            <p>
              {libelleEtage(c.etage)} · {c.ascenseur ? `ascenseur${c.ascenseur_dimensions ? ` ${c.ascenseur_dimensions.largeur}×${c.ascenseur_dimensions.profondeur}×${c.ascenseur_dimensions.hauteur} cm` : ""}` : "sans ascenseur"} · escalier {ESCALIER[c.escalier].toLowerCase()}
            </p>
            <p>
              Portage {c.distance_portage_m} m · poids lourd : {POIDS_LOURD[c.acces_poids_lourd].toLowerCase()} · {STATIONNEMENT[c.stationnement]}
            </p>
            <p>
              Rue : {c.particularites_rue.join(", ") || "—"} · monte-meuble : {MONTE_MEUBLE[c.monte_meuble].toLowerCase()}
            </p>
            {c.horaires_restreints && <p>Horaires : {c.horaires_restreints}</p>}
            {c.commentaire && <p className="text-ink-soft">« {c.commentaire} »</p>}
            {c.photos.length > 0 && (
              <p className="flex flex-wrap gap-2 pt-1">
                {c.photos.map((p) => (
                  <a key={p.id} href={p.lien} target="_blank" rel="noopener" className="rounded-full bg-subtle px-2.5 py-0.5 text-[12px] hover:bg-brand-soft">
                    📷 {p.nom}
                  </a>
                ))}
              </p>
            )}
            <p className="pt-1 text-[12px] text-good">Certifiées le {dateHeureFr(c.valide_at)}</p>
          </div>
        ) : (
          <p className="text-[13px] text-danger">Questionnaire non rempli : étape bloquante.</p>
        )}
      </Carte>
      <Carte titre="Déclaration de valeurs">
        {d.declaration?.statut === "soumise" ? (
          <div className="text-[13px]">
            <p className="text-[26px] font-bold tabular-nums">{euro(d.declaration.total)}</p>
            <ul className="mt-2 space-y-1 text-ink-soft">
              {d.declaration.contenu.objets.map((o, i) => (
                <li key={i}>
                  {o.designation} · {o.categorie} · × {o.quantite} · {euro(o.quantite * o.valeur_unitaire)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-good">Transmise le {dateHeureFr(d.declaration.soumise_at!)}</p>
          </div>
        ) : (
          <p className="text-[13px] text-ink-soft">Pas encore transmise.</p>
        )}
      </Carte>
      <Carte titre="Traçabilité des acceptations" className="md:col-span-2">
        {d.acceptations.length ? (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead className="border-y border-line text-left text-[11px] text-ink-soft">
                <tr>
                  {["Engagement", "Version", "Date et heure", "Adresse IP", "Navigateur"].map((h) => (
                    <th key={h} className="px-5 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {d.acceptations.map((a) => (
                  <tr key={a.id}>
                    <td className="px-5 py-2">{TYPE_ACCEPTATION[a.type] ?? a.type}</td>
                    <td className="px-5 py-2 tabular-nums">{a.version_texte}</td>
                    <td className="px-5 py-2 tabular-nums">{dateHeureFr(a.accepted_at)}</td>
                    <td className="px-5 py-2 tabular-nums">{a.ip}</td>
                    <td className="max-w-[220px] truncate px-5 py-2 text-ink-soft" title={a.user_agent}>
                      {a.user_agent}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-ink-soft">Aucune acceptation enregistrée.</p>
        )}
      </Carte>
    </div>
  );
}

function ReglagesClient({ d, recharger }: { d: Donnees; recharger: () => void }) {
  const action = useAction(recharger);
  const c = d.client;
  const [v, setV] = useState({ civilite: c.civilite ?? "", prenom: c.prenom, nom: c.nom, email: c.email, telephone: c.telephone, type: c.type as string, societe: c.societe ?? "", masquer_devis: c.masquer_devis, masquer_factures: c.masquer_factures, conseiller_id: c.conseiller_id });
  const erreurs = action.resultat && !action.resultat.ok ? action.resultat.erreurs ?? {} : {};
  return (
    <Carte titre="Client et réglages">
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ label="Prénom" erreur={erreurs.prenom}>
          <input className={champ} value={v.prenom} onChange={(e) => setV({ ...v, prenom: e.target.value })} />
        </Champ>
        <Champ label="Nom" erreur={erreurs.nom}>
          <input className={champ} value={v.nom} onChange={(e) => setV({ ...v, nom: e.target.value })} />
        </Champ>
        <Champ label="E-mail" erreur={erreurs.email} className="sm:col-span-2">
          <input className={champ} value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </Champ>
        <Champ label="Téléphone" erreur={erreurs.telephone}>
          <input className={champ} value={v.telephone} onChange={(e) => setV({ ...v, telephone: e.target.value })} />
        </Champ>
        <Champ label="Conseiller">
          <select className={champ} value={v.conseiller_id} onChange={(e) => setV({ ...v, conseiller_id: e.target.value })}>
            {d.conseillers.map((k) => (
              <option key={k.id} value={k.id}>
                {k.prenom} {k.nom}
              </option>
            ))}
          </select>
        </Champ>
        <Champ label="Type de client" className="sm:col-span-2">
          <div className="grid grid-cols-2 gap-2">
            {[
              ["particulier", "Particulier"],
              ["grand_compte", "Grand compte"],
            ].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setV({ ...v, type: k })} className={`rounded-xl border px-3 py-2 text-[13px] font-medium transition ${v.type === k ? "border-ink bg-ink text-white" : "border-line-strong hover:border-ink"}`}>
                {l}
              </button>
            ))}
          </div>
        </Champ>
        {v.type === "grand_compte" && (
          <>
            <Champ label="Société" className="sm:col-span-2">
              <input className={champ} value={v.societe} onChange={(e) => setV({ ...v, societe: e.target.value })} />
            </Champ>
            {(
              [
                ["masquer_devis", "Masquer les devis"],
                ["masquer_factures", "Masquer les factures"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex cursor-pointer items-center justify-between rounded-xl border border-line px-3 py-2 text-[13px] font-medium">
                {l}
                <input type="checkbox" checked={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />
              </label>
            ))}
            <p className="text-[11.5px] text-ink-soft sm:col-span-2">Une rubrique masquée disparaît de l&apos;espace du client et de sa frise.</p>
          </>
        )}
      </div>
      <Bouton className="mt-4" disabled={action.enCours} onClick={() => action.lancer(() => modifierClient(d.dossier.id, v))}>
        Enregistrer le client
      </Bouton>
      <div className="mt-3">
        <Retour r={action.resultat} />
      </div>
    </Carte>
  );
}

function InfosDossier({ d, recharger }: { d: Donnees; recharger: () => void }) {
  const action = useAction(recharger);
  const x = d.dossier;
  const [v, setV] = useState({ ville_depart: x.ville_depart, ville_arrivee: x.ville_arrivee, adresse_depart: x.adresse_depart, adresse_arrivee: x.adresse_arrivee, periode_debut: x.periode_debut, periode_fin: x.periode_fin, portee: x.portee as string, mode_transport: x.mode_transport as string, pays_destination: x.pays_destination, statut: x.statut as string, volume_m3: String(x.volume_m3), formule: x.formule, logement: x.logement ?? "", photo: x.photo, request_id: x.request_id ?? "" });
  const erreurs = action.resultat && !action.resultat.ok ? action.resultat.erreurs ?? {} : {};
  const champs: [keyof typeof v, string, string?][] = [
    ["ville_depart", "Ville de départ"],
    ["ville_arrivee", "Ville d'arrivée"],
    ["adresse_depart", "Adresse de départ"],
    ["adresse_arrivee", "Adresse d'arrivée"],
    ["periode_debut", "Premier jour", "date"],
    ["periode_fin", "Dernier jour", "date"],
    ["volume_m3", "Volume (m³)"],
    ["formule", "Formule"],
    ["logement", "Logement"],
  ];
  return (
    <Carte titre="Le dossier">
      <div className="grid gap-3 sm:grid-cols-2">
        {champs.map(([k, l, type]) => (
          <Champ key={k} label={l} erreur={erreurs[k]}>
            <input className={champ} type={type ?? "text"} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </Champ>
        ))}
        <Champ label="Statut">
          <select className={champ} value={v.statut} onChange={(e) => setV({ ...v, statut: e.target.value })}>
            {Object.entries(STATUT_DOSSIER).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Champ>
        <Champ label="Portée">
          <select className={champ} value={v.portee} onChange={(e) => setV({ ...v, portee: e.target.value, ...(e.target.value === "national" ? { pays_destination: "FR", mode_transport: "route" } : {}) })}>
            <option value="national">National</option>
            <option value="international">International</option>
          </select>
        </Champ>
        {v.portee === "international" && (
          <>
            <Champ label="Pays" erreur={erreurs.pays_destination}>
              <select className={champ} value={v.pays_destination} onChange={(e) => setV({ ...v, pays_destination: e.target.value })}>
                {Object.entries(d.pays).map(([code, nom]) => (
                  <option key={code} value={code}>
                    {nom}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ label="Transport">
              <select className={champ} value={v.mode_transport} onChange={(e) => setV({ ...v, mode_transport: e.target.value })}>
                <option value="route">Route</option>
                <option value="maritime">Maritime</option>
                <option value="aerien">Aérien</option>
              </select>
            </Champ>
          </>
        )}
        <Champ label="Photo de la page de garde" className="sm:col-span-2">
          <select className={champ} value={v.photo} onChange={(e) => setV({ ...v, photo: e.target.value })}>
            {d.photos.map((p) => (
              <option key={p.chemin} value={p.chemin}>
                {p.libelle}
              </option>
            ))}
          </select>
        </Champ>
      </div>
      <Bouton className="mt-4" disabled={action.enCours} onClick={() => action.lancer(() => modifierDossier(d.dossier.id, v))}>
        Enregistrer le dossier
      </Bouton>
      <div className="mt-3">
        <Retour r={action.resultat} />
      </div>
    </Carte>
  );
}

function SuiviConteneur({ d, recharger }: { d: Donnees; recharger: () => void }) {
  const action = useAction(recharger);
  const x = d.dossier;
  const [v, setV] = useState({ compagnie: x.compagnie ?? "", numero_conteneur: x.numero_conteneur ?? "", url_tracking: x.url_tracking ?? "", statut_conteneur: x.statut_conteneur ?? "", navire: x.navire ?? "", port_depart: x.port_depart ?? "", port_arrivee: x.port_arrivee ?? "", eta: x.eta ?? "" });
  const erreurs = action.resultat && !action.resultat.ok ? action.resultat.erreurs ?? {} : {};
  const champs: [keyof typeof v, string, string?][] = [
    ["compagnie", "Compagnie"],
    ["numero_conteneur", "N° de conteneur"],
    ["navire", "Navire ou vol"],
    ["eta", "Arrivée prévue", "date"],
    ["port_depart", "Port de départ"],
    ["port_arrivee", "Port d'arrivée"],
  ];
  return (
    <Carte titre="Suivi du conteneur">
      <div className="grid gap-3 sm:grid-cols-2">
        {champs.map(([k, l, type]) => (
          <Champ key={k} label={l} erreur={erreurs[k]}>
            <input className={champ} type={type ?? "text"} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </Champ>
        ))}
        <Champ label="Lien de suivi de la compagnie" erreur={erreurs.url_tracking} className="sm:col-span-2">
          <input className={champ} value={v.url_tracking} onChange={(e) => setV({ ...v, url_tracking: e.target.value })} placeholder="https://…" />
        </Champ>
        <Champ label="Statut affiché au client" className="sm:col-span-2">
          <input className={champ} value={v.statut_conteneur} onChange={(e) => setV({ ...v, statut_conteneur: e.target.value })} />
        </Champ>
      </div>
      <Bouton className="mt-4" disabled={action.enCours} onClick={() => action.lancer(() => modifierConteneur(d.dossier.id, v))}>
        Enregistrer le suivi
      </Bouton>
      <div className="mt-3">
        <Retour r={action.resultat} />
      </div>
    </Carte>
  );
}

function CartonsSav({ d }: { d: Donnees }) {
  const { racine } = usePorte();
  return (
    <Carte titre="Cartons et SAV">
      <ul className="space-y-2 text-[13px]">
        {d.livraisons.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-2">
            <Link href={`${racine}/cartons?samedi=${l.date_samedi}`} className="hover:text-brand-ink">
              Samedi {dateFr(l.date_samedi)} · {l.nb_cartons ?? "?"} cartons
              {l.creneau_debut ? ` · ${l.creneau_debut}–${l.creneau_fin}` : ""}
            </Link>
            <Pastille ton={STATUT_LIVRAISON[l.statut].ton === "ok" ? "ok" : STATUT_LIVRAISON[l.statut].ton === "todo" ? "attente" : "neutre"}>{STATUT_LIVRAISON[l.statut].label}</Pastille>
          </li>
        ))}
        {d.sav.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2">
            <Link href={`${racine}/sav`} className="hover:text-brand-ink">
              {s.numero} · {s.objets}
            </Link>
            <Pastille ton={s.statut === "cloturee" ? "ok" : "attente"}>{STATUT_SAV[s.statut].label}</Pastille>
          </li>
        ))}
        {!d.livraisons.length && !d.sav.length && <li className="text-ink-soft">{d.dossier.cartons_non_necessaires ? "Le client n'a pas besoin de cartons." : "Rien pour l'instant."}</li>}
      </ul>
      {d.dossier.avis_demande_le && <p className="mt-3 text-[12px] text-ink-soft">Demande d&apos;avis partie le {dateHeureFr(d.dossier.avis_demande_le)}.</p>}
      <div className="mt-3">
        <LienBouton href={`${racine}/cartons`}>Cartons du samedi</LienBouton>
      </div>
    </Carte>
  );
}
