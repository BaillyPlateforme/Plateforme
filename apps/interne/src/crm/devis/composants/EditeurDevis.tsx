"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import MenuVertical, { AvecMenu, type GroupeMenu } from "@/ui/MenuVertical";
import type { NomIcone } from "@/ui/icones";
import { estInternational, nomDevis, type EtatDevis } from "../modele";
import { calculer, marge, totauxAchats } from "../calcul";
import { enregistrerDevis } from "../actions";
import OngletChiffrage, { Recapitulatif } from "./OngletChiffrage";
import OngletPrestations from "./OngletPrestations";
import { OngletAchats, OngletInternational } from "./OngletAchats";
import { OngletAdresses, OngletContrat, OngletDivers, OngletMoyens } from "./OngletsFiche";
import OngletCommande from "./OngletCommande";
import FenetreQuitter from "./FenetreQuitter";
import { euros } from "./champs";
import { CLES_ONGLETS, type Onglet } from "../onglets";
import s from "../editeur.module.css";

/*
 * La fenêtre Devis (Créagidem, section I) : ses onglets dans le menu
 * vertical, un seul état pour tous, enregistré d'un geste. Changer d'onglet
 * ne recharge rien : la saisie en cours suit d'un onglet à l'autre, et
 * l'adresse garde l'onglet ouvert (?onglet=). Quitter la fenêtre par un
 * lien de l'app avec des modifications non enregistrées ouvre la boîte
 * « Enregistrer · Quitter sans enregistrer · Annuler » (FenetreQuitter) ;
 * fermer l'onglet ou recharger la page garde la confirmation du navigateur,
 * qui n'admet aucun bouton à soi.
 */

/** L'ordre des onglets, celui de Céline (16/11/2026). */
const ONGLETS: { cle: Onglet; label: string; icone: NomIcone }[] = [
  { cle: "adresses", label: "Adresses et accès", icone: "parcours" },
  { cle: "contrat", label: "Données contractuelles", icone: "devis" },
  { cle: "prestations", label: "Prestations", icone: "coche" },
  { cle: "achats", label: "Achats", icone: "facture" },
  { cle: "chiffrage", label: "Chiffrage", icone: "euro" },
  { cle: "divers", label: "Divers", icone: "questionnaires" },
  { cle: "moyens", label: "Moyens", icone: "camion" },
];

type Props = {
  devis: { id: number; numero: string; statut: string; token: string | null; envoye_le: string | null; signe_le: string | null; retire_le: string | null; maj_le: string | null; validation: Record<string, unknown> | null; montant: number; ancien: boolean };
  dossier: { id: number; ref: string; volume: number; client: string; email: string | null };
  initial: EtatDevis;
  onglet: Onglet;
  defauts: { tva: number; tvaAssurance: number; arrhesPct: number; validiteJours: number | null };
  utilisateurs: { id: number; nom: string; role: string }[];
  autres: { id: number; numero: string; formule: string; titre: string | null; statut: string; retire_le: string | null; categorie_specifique: boolean; categorie_libelle: string | null }[];
  historique: { libelle: string; le: string; nom: string | null }[];
  suggestions: { fournisseurs: string[]; comptes: string[]; origines: string[]; reglementsSolde: string[]; modesReglement: string[] };
  lienSignature: string | null;
  postesTarif: string[];
  retour: { ok?: string; erreur?: string };
  /** Client CIMOB/DICOM : jamais de devis, rien ne part au client (devis/cimob.ts). */
  cimob?: boolean;
};

export default function EditeurDevis(p: Props) {
  const router = useRouter();
  const [etat, setEtat] = useState<EtatDevis>(p.initial);
  const [sauve, setSauve] = useState(() => JSON.stringify(p.initial));
  const [maj, setMaj] = useState(p.devis.maj_le);
  const [onglet, setOnglet] = useState<Onglet>(p.onglet);
  const [message, setMessage] = useState<{ ton: "ok" | "erreur"; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  /** La navigation interrompue (un lien de l'app, ou « Retour »), en attendant la réponse de la boîte « Quitter ». */
  const [sortie, setSortie] = useState<{ reprendre: () => void } | null>(null);
  /** « Quitter sans enregistrer » : la navigation qui suit ne redemande rien. */
  const quitte = useRef(false);
  const modifie = useMemo(() => JSON.stringify(etat) !== sauve, [etat, sauve]);

  const calcul = useMemo(() => calculer(etat.chiffrage, p.defauts.tvaAssurance), [etat.chiffrage, p.defauts.tvaAssurance]);
  const tvaAssurance = etat.chiffrage.assurance.tva ?? p.defauts.tvaAssurance;
  const achats = totauxAchats(etat.achats);
  const margePrevue = achats.prevu > 0 ? { ...marge(calcul.ht, achats.prevu), libelle: "Marge prévue (HT)" } : null;

  const enregistrer = useCallback((ensuite?: () => void, echec?: () => void) => {
    const instantane = JSON.stringify(etat);
    demarrer(async () => {
      const r = await enregistrerDevis(p.devis.id, etat, maj);
      if (!r.ok) { setMessage({ ton: "erreur", texte: r.erreur }); echec?.(); return; }
      setSauve(instantane);
      setMaj(r.maj);
      setMessage({ ton: "ok", texte: `Enregistré à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` });
      router.refresh();
      ensuite?.();
    });
  }, [etat, maj, p.devis.id, router]);

  // ⌘S / Ctrl+S enregistre. Quitter la fenêtre avec des modifications : la boîte de l'app pour un lien
  // de l'app (Enregistrer, Quitter sans enregistrer, Annuler) ; celle du navigateur pour l'onglet fermé
  // ou la page rechargée, la seule qu'il permette.
  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (modifie && !enCours) enregistrer(); }
    };
    const quitter = (e: BeforeUnloadEvent) => { if (modifie && !quitte.current) { e.preventDefault(); } };
    const lien = (e: MouseEvent) => {
      if (!modifie || quitte.current || e.defaultPrevented) return;
      // Un lien ouvert ailleurs (nouvel onglet, nouvelle fenêtre) ne quitte pas la fenêtre Devis.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      // « Retour » du bandeau (ui/BoutonRetour) : un bouton, pas un lien ; il est recliqué une fois la réponse donnée.
      const retour = (e.target as HTMLElement | null)?.closest?.('button[aria-label="Retour à la page précédente"]') as HTMLButtonElement | null;
      if (retour) {
        e.preventDefault();
        e.stopPropagation();
        setSortie({ reprendre: () => retour.click() });
        return;
      }
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.dataset.onglet) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      const adresse = `${url.pathname}${url.search}${url.hash}`;
      setSortie({ reprendre: () => router.push(adresse) });
    };
    window.addEventListener("keydown", clavier);
    window.addEventListener("beforeunload", quitter);
    document.addEventListener("click", lien, true);
    return () => { window.removeEventListener("keydown", clavier); window.removeEventListener("beforeunload", quitter); document.removeEventListener("click", lien, true); };
  }, [modifie, enCours, enregistrer, router]);

  const chemin = `/dossiers/${p.dossier.id}/devis/${p.devis.id}`;
  /** Les onglets du menu changent l'onglet sans navigation : la saisie reste en mémoire. */
  function intercepter(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const url = new URL(a.href, location.href);
    const k = url.searchParams.get("onglet") as Onglet | null;
    if (url.pathname !== chemin || !k || !CLES_ONGLETS.includes(k)) return;
    e.preventDefault();
    e.stopPropagation();
    setOnglet(k);
    window.history.replaceState(null, "", `${chemin}?onglet=${k}`);
    // Si le haut de la fenêtre est passé sous la barre du haut, on y revient.
    const haut = document.getElementById("editeur-devis")?.getBoundingClientRect().top;
    if (haut != null && haut < 180) window.scrollTo({ top: window.scrollY + haut - 180, behavior: "smooth" });
  }

  const compteLignes = etat.chiffrage.lignes.length;
  const groupes: GroupeMenu[] = [
    { titre: "Fenêtre devis", items: ONGLETS.map((o) => ({ href: `${chemin}?onglet=${o.cle}`, label: o.label, icone: o.icone, actif: onglet === o.cle, nombre: o.cle === "chiffrage" ? compteLignes : o.cle === "achats" ? etat.achats.length : o.cle === "adresses" ? etat.etapes.length : undefined })) },
    { titre: "Compléments", items: [
      { href: `${chemin}?onglet=international`, label: "International", icone: "bateau", actif: onglet === "international" },
      { href: `${chemin}?onglet=commande`, label: "Commande et signature", icone: "commande", actif: onglet === "commande" },
    ] },
    { titre: "Devis du dossier", items: [
      ...p.autres.map((a) => ({ href: `/dossiers/${p.dossier.id}/devis/${a.id}?onglet=${onglet}`, label: `${a.numero.replace(/^DV-\d{4}-/, "N° ")} · ${nomDevis(a)}`, icone: "devis" as NomIcone, actif: a.id === p.devis.id })),
      { href: `/devis?dossier=${p.dossier.id}`, label: "Tous les devis · nouveau", icone: "plus" as NomIcone },
    ] },
  ];

  const majEtat = <K extends keyof EtatDevis>(k: K, v: EtatDevis[K]) => setEtat((e) => ({ ...e, [k]: v }));
  /** La réponse de la boîte « Quitter » : la navigation interrompue reprend, sans plus rien demander. */
  const poursuivre = (s: { reprendre: () => void }) => { quitte.current = true; setSortie(null); s.reprendre(); };
  const signe = p.devis.statut === "signe";
  const autreSigne = !signe && p.autres.some((a) => a.statut === "signe");

  return (
    <AvecMenu menu={<div onClickCapture={intercepter}><MenuVertical titre={`Devis ${p.devis.numero}`} groupes={groupes} /></div>}>
      <div className={s.ecran} id="editeur-devis">
        {signe && onglet !== "commande" && <p className={s.bandeauInfo}>Ce devis est signé : toute modification change le montant de la commande, et l&apos;espace client du dossier la montre.</p>}
        {p.devis.retire_le && <p className={s.bandeauInfo}>Ce devis a été retiré de la proposition : il ne se signe plus.</p>}

        {onglet === "chiffrage" && p.devis.ancien && Math.abs(calcul.ttc - p.devis.montant) >= 0.005 && (
          <p className={s.bandeauAlerte}>
            Devis établi avant la fenêtre Devis : son montant enregistré, celui envoyé au client et imprimé, est de {euros(p.devis.montant)} TTC. Ses lignes totalisent {euros(calcul.ttc)} : l&apos;enregistrer remplacera le montant par celui des lignes.
          </p>
        )}
        {onglet === "chiffrage" && (
          <div className={s.avecRecap}>
            <OngletChiffrage chiffrage={etat.chiffrage} calcul={calcul} onChange={(c) => majEtat("chiffrage", c)} tvaDefaut={p.defauts.tva} tvaAssurance={p.defauts.tvaAssurance} postesTarif={p.postesTarif} />
            <Recapitulatif calcul={calcul} saisie={etat.chiffrage.saisie} remisePct={etat.chiffrage.remisePct} arrhesPct={etat.contrat.arrhesPct} tvaAssurance={tvaAssurance} marge={margePrevue} />
          </div>
        )}
        {onglet === "adresses" && <OngletAdresses etapes={etat.etapes} onChange={(e) => majEtat("etapes", e)} />}
        {onglet === "contrat" && (
          <OngletContrat
            contrat={etat.contrat} onChange={(c) => majEtat("contrat", c)} utilisateurs={p.utilisateurs} volume={p.dossier.volume} ttc={calcul.ttc}
            suggestionsReglement={p.suggestions.reglementsSolde} parDefaut={{ arrhesPct: p.defauts.arrhesPct, validiteJours: p.defauts.validiteJours }}
          />
        )}
        {onglet === "divers" && <OngletDivers dossier={etat.dossier} onChange={(d) => majEtat("dossier", d)} volume={p.dossier.volume} origines={p.suggestions.origines} />}
        {onglet === "prestations" && (
          <OngletPrestations prestations={etat.prestations} onChange={(x) => majEtat("prestations", x)} contrat={etat.contrat} onContrat={(c) => majEtat("contrat", { ...etat.contrat, ...c })} />
        )}
        {onglet === "achats" && <OngletAchats achats={etat.achats} onChange={(a) => majEtat("achats", a)} ventes={calcul.ht} />}
        {onglet === "moyens" && <OngletMoyens moyens={etat.moyens} onChange={(m) => majEtat("moyens", m)} />}
        {onglet === "international" && (
          <OngletInternational
            achats={etat.achats} onAchats={(a) => majEtat("achats", a)} international={etat.international} onInternational={(i) => majEtat("international", i)}
            lignes={etat.chiffrage.lignes} onLignes={(l) => majEtat("chiffrage", { ...etat.chiffrage, lignes: l })} tvaDefaut={p.defauts.tva} ventes={calcul.ht}
            typeInternational={estInternational(etat.dossier.typeDemenagement)} saisie={etat.chiffrage.saisie}
          />
        )}
        {onglet === "commande" && (
          <OngletCommande
            devis={p.devis} lienSignature={p.lienSignature} ttc={calcul.ttc} arrhesPct={etat.contrat.arrhesPct} titulaire={p.dossier.client} emailClient={p.dossier.email}
            autreSigne={autreSigne} modifie={modifie} modes={p.suggestions.modesReglement} comptes={p.suggestions.comptes} historique={p.historique} retour={p.retour} cimob={p.cimob}
          />
        )}

        {sortie && (
          <FenetreQuitter
            onEnregistrer={() => enregistrer(() => poursuivre(sortie), () => setSortie(null))}
            onQuitter={() => poursuivre(sortie)}
            onAnnuler={() => setSortie(null)}
          />
        )}

        <datalist id="fournisseurs-devis">{p.suggestions.fournisseurs.map((f) => <option key={f} value={f} />)}</datalist>
        <datalist id="comptes-devis">{p.suggestions.comptes.map((c) => <option key={c} value={c} />)}</datalist>

        <div className={s.barre} data-modifie={modifie ? "" : undefined} role="region" aria-label="Enregistrement du devis">
          <span className={s.etat} data-ton={message?.ton === "erreur" ? "erreur" : modifie ? "attente" : "ok"}>
            <i aria-hidden />
            {message?.ton === "erreur" ? message.texte : modifie ? "Modifications non enregistrées" : message?.texte ?? "Tout est enregistré"}
          </span>
          <span className={s.barreTotal}>
            <small>Total TTC</small>
            <b>{euros(calcul.ttc)}</b>
          </span>
          <span className={s.barreActions}>
            {modifie && <button type="button" className={s.boutonFantome} onClick={() => { setEtat(JSON.parse(sauve)); setMessage(null); }}>Annuler les modifications</button>}
            <a
              className={s.boutonDoux}
              href={`/imprimer/${p.dossier.id}?doc=devis&v=${p.devis.id}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => { if (modifie) { e.preventDefault(); const w = window.open("", "_blank"); enregistrer(() => { if (w) w.location.href = `/imprimer/${p.dossier.id}?doc=devis&v=${p.devis.id}`; }); } }}
            >
              {modifie ? "Enregistrer et voir le PDF" : "Voir le PDF"}
            </a>
            <button type="button" className={s.boutonPlein} disabled={!modifie || enCours} onClick={() => enregistrer()}>
              {enCours ? "Enregistrement…" : "Enregistrer"} <kbd>⌘S</kbd>
            </button>
          </span>
        </div>
      </div>
    </AvecMenu>
  );
}
