"use client";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
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
import { euros } from "./champs";
import { CLES_ONGLETS, type Onglet } from "../onglets";
import s from "../editeur.module.css";

/*
 * La fenêtre Devis (Créagidem, section I) : ses onglets dans le menu
 * vertical, un seul état pour tous, enregistré d'un geste. Changer d'onglet
 * ne recharge rien : la saisie en cours suit d'un onglet à l'autre, et
 * l'adresse garde l'onglet ouvert (?onglet=). Quitter la page avec des
 * modifications non enregistrées demande confirmation.
 */

const ONGLETS: { cle: Onglet; label: string; icone: NomIcone }[] = [
  { cle: "adresses", label: "Adresses et accès", icone: "parcours" },
  { cle: "contrat", label: "Données contractuelles", icone: "devis" },
  { cle: "divers", label: "Divers", icone: "questionnaires" },
  { cle: "chiffrage", label: "Chiffrage", icone: "euro" },
  { cle: "prestations", label: "Prestations", icone: "coche" },
  { cle: "achats", label: "Achats", icone: "facture" },
  { cle: "moyens", label: "Moyens", icone: "camion" },
];

type Props = {
  devis: { id: number; numero: string; statut: string; token: string | null; envoye_le: string | null; signe_le: string | null; retire_le: string | null; maj_le: string | null; validation: Record<string, unknown> | null; montant: number; ancien: boolean };
  dossier: { id: number; ref: string; volume: number; client: string; email: string | null };
  initial: EtatDevis;
  onglet: Onglet;
  defauts: { tva: number; tvaAssurance: number; arrhesPct: number; validiteJours: number };
  utilisateurs: { id: number; nom: string; role: string }[];
  autres: { id: number; numero: string; formule: string; titre: string | null; statut: string; retire_le: string | null; categorie_specifique: boolean; categorie_libelle: string | null }[];
  historique: { libelle: string; le: string; nom: string | null }[];
  suggestions: { fournisseurs: string[]; comptes: string[]; origines: string[]; reglementsSolde: string[]; modesReglement: string[] };
  lienSignature: string | null;
  postesTarif: string[];
  retour: { ok?: string; erreur?: string };
};

export default function EditeurDevis(p: Props) {
  const router = useRouter();
  const [etat, setEtat] = useState<EtatDevis>(p.initial);
  const [sauve, setSauve] = useState(() => JSON.stringify(p.initial));
  const [maj, setMaj] = useState(p.devis.maj_le);
  const [onglet, setOnglet] = useState<Onglet>(p.onglet);
  const [message, setMessage] = useState<{ ton: "ok" | "erreur"; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const modifie = useMemo(() => JSON.stringify(etat) !== sauve, [etat, sauve]);

  const calcul = useMemo(() => calculer(etat.chiffrage, p.defauts.tvaAssurance), [etat.chiffrage, p.defauts.tvaAssurance]);
  const tvaAssurance = etat.chiffrage.assurance.tva ?? p.defauts.tvaAssurance;
  const achats = totauxAchats(etat.achats);
  const margePrevue = achats.prevu > 0 ? { ...marge(calcul.ht, achats.prevu), libelle: "Marge prévue (HT)" } : null;

  const enregistrer = useCallback((ensuite?: () => void) => {
    const instantane = JSON.stringify(etat);
    demarrer(async () => {
      const r = await enregistrerDevis(p.devis.id, etat, maj);
      if (!r.ok) { setMessage({ ton: "erreur", texte: r.erreur }); return; }
      setSauve(instantane);
      setMaj(r.maj);
      setMessage({ ton: "ok", texte: `Enregistré à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` });
      router.refresh();
      ensuite?.();
    });
  }, [etat, maj, p.devis.id, router]);

  // ⌘S / Ctrl+S enregistre ; quitter la page avec des modifications demande confirmation.
  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (modifie && !enCours) enregistrer(); }
    };
    const quitter = (e: BeforeUnloadEvent) => { if (modifie) { e.preventDefault(); } };
    const lien = (e: MouseEvent) => {
      if (!modifie) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.dataset.onglet) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      if (!confirm("Des modifications du devis ne sont pas enregistrées. Quitter sans les enregistrer ?")) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("keydown", clavier);
    window.addEventListener("beforeunload", quitter);
    document.addEventListener("click", lien, true);
    return () => { window.removeEventListener("keydown", clavier); window.removeEventListener("beforeunload", quitter); document.removeEventListener("click", lien, true); };
  }, [modifie, enCours, enregistrer]);

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
            autreSigne={autreSigne} modifie={modifie} modes={p.suggestions.modesReglement} comptes={p.suggestions.comptes} historique={p.historique} retour={p.retour}
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
