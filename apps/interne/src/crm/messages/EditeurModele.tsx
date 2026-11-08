"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MESSAGE_EVENTS, PIECES_JOINTES, TEMPLATE_BLOCS, TEMPLATE_VARIABLES, type Channel } from "@/lib/messaging";
import { apercuModele, enregistrerMessage, supprimerModele, supprimerRegle, type Apercu, type Retour, type SaisieModele, type SaisieRegle } from "./actions";
import type { CarteVue, GabaritVue } from "./donnees";
import { Fenetre, PanneauApercu } from "./elements";
import type { DepartTest } from "./TestEnvoi";
import s from "./messages.module.css";

/*
 * L'éditeur d'un modèle des questionnaires et de la règle qui l'envoie —
 * ce que faisaient les onglets « Templates » et « Alertes » de l'ancienne
 * messagerie, dans Courriers et SMS depuis le 08/11/2026. Il sert aux cartes
 * des questionnaires (une règle et son modèle, ou un modèle sans règle) et à
 * la création d'un modèle.
 */

const NOUVEAU_MODELE: SaisieModele = { name: "Nouveau modèle", channel: "email", event: "manual", sujet: "", contenu: "", pieceJointe: "", active: true };
// Les valeurs de départ d'une règle, celles de l'ancien onglet « Alertes ».
const NOUVELLE_REGLE: SaisieRegle = {
  id: null, name: "Nouvelle alerte", event: "devis_envoye", montant_min: "", condition_champ: "volume", condition_source: "",
  destinataire: "custom", destinataire_custom: "", active: true,
};

const versSaisie = (g: GabaritVue): SaisieModele => ({ name: g.name, channel: g.channel, event: g.event, sujet: g.sujet, contenu: g.contenu, pieceJointe: g.pieceJointe, active: g.active });

export default function EditeurModele({
  carte,
  regleNeuve = false,
  modeles,
  autresRegles,
  tester,
  autreRegle,
  bloquee,
  fermer,
}: {
  /** La carte ouverte ; rien pour un nouveau modèle. */
  carte: CarteVue | null;
  /** Une règle de plus pour le modèle de la carte (comme « Nouvelle alerte » dans l'ancien onglet Alertes, qui laissait choisir n'importe quel modèle). */
  regleNeuve?: boolean;
  modeles: GabaritVue[];
  /** Les autres règles qui envoient le même modèle (son texte vaut pour elles aussi). */
  autresRegles: string[];
  tester: (d: DepartTest) => void;
  /** Ouvre une règle de plus pour ce modèle. */
  autreRegle?: (g: GabaritVue) => void;
  /** Une fenêtre est ouverte par-dessus (le test d'envoi). */
  bloquee: boolean;
  fermer: () => void;
}) {
  const regleInitiale = regleNeuve ? null : carte?.regle;
  const [modeleId, setModeleId] = useState<string | null>(carte?.gabarit?.id ?? null);
  const [m, setM] = useState<SaisieModele>(carte?.gabarit ? versSaisie(carte.gabarit) : { ...NOUVEAU_MODELE, channel: carte?.canal ?? "email" });
  const [r, setR] = useState<SaisieRegle | null>(
    regleInitiale
      ? {
          id: regleInitiale.id, name: regleInitiale.name, event: regleInitiale.event, montant_min: regleInitiale.montant_min?.toString() ?? "",
          condition_champ: regleInitiale.condition_champ ?? "volume", condition_source: regleInitiale.condition_source ?? "",
          destinataire: regleInitiale.destinataire, destinataire_custom: regleInitiale.destinataire_custom ?? "", active: regleInitiale.active,
        }
      : regleNeuve
        ? { ...NOUVELLE_REGLE }
        : null,
  );
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [retour, setRetour] = useState<Retour | null>(null);
  const [enCours, demarrer] = useTransition();
  const zone = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  const changer = <K extends keyof SaisieModele>(k: K, v: SaisieModele[K]) => setM((x) => ({ ...x, [k]: v }));
  const changerRegle = <K extends keyof SaisieRegle>(k: K, v: SaisieRegle[K]) => setR((x) => (x ? { ...x, [k]: v } : x));

  // L'aperçu suit la saisie, rendu par le serveur comme à l'envoi.
  useEffect(() => {
    const t = setTimeout(async () => setApercu(await apercuModele({ canal: m.channel, nom: m.name, sujet: m.sujet || null, contenu: m.contenu, pieceJointe: m.pieceJointe })), 350);
    return () => clearTimeout(t);
  }, [m.channel, m.name, m.sujet, m.contenu, m.pieceJointe]);

  const inserer = (jeton: string) => {
    const z = zone.current;
    if (!z) return changer("contenu", m.contenu + jeton);
    const debut = z.selectionStart ?? m.contenu.length;
    const fin = z.selectionEnd ?? m.contenu.length;
    changer("contenu", m.contenu.slice(0, debut) + jeton + m.contenu.slice(fin));
    requestAnimationFrame(() => {
      z.focus();
      z.setSelectionRange(debut + jeton.length, debut + jeton.length);
    });
  };

  // La règle envoie un autre modèle : l'éditeur passe à ce modèle (c'est lui qu'on modifie désormais).
  const choisirModele = (id: string) => {
    const g = modeles.find((x) => x.id === id);
    if (!g) return;
    setModeleId(g.id);
    setM(versSaisie(g));
  };

  const enregistrer = () =>
    demarrer(async () => {
      const res = await enregistrerMessage(modeleId, m, r);
      setRetour(res);
      if (!res.ok) return;
      router.refresh();
      // Un modèle ou une règle de plus : sa carte apparaît dans la page, la fenêtre se ferme.
      if (!carte || regleNeuve) fermer();
      else if (res.modeleId) setModeleId(res.modeleId);
    });

  const supprimer = () => {
    const question = carte?.regle
      ? `Supprimer la règle « ${carte.regle.name} » ? Le modèle « ${m.name} » reste dans Courriers et SMS, sans règle.`
      : `Supprimer le modèle « ${m.name} » ?`;
    if (!confirm(question)) return;
    demarrer(async () => {
      const res = carte?.regle ? await supprimerRegle(carte.regle.id) : await supprimerModele(modeleId!);
      setRetour(res);
      if (res.ok) {
        router.refresh();
        fermer();
      }
    });
  };

  const variables = [
    ...TEMPLATE_VARIABLES.map((v) => ({ jeton: v.token, libelle: v.label })),
    ...(m.channel === "email" ? TEMPLATE_BLOCS.map((b) => ({ jeton: b.token, libelle: `Bloc : ${b.label} — ${b.aide}` })) : []),
  ];
  const memeCanal = modeles.filter((g) => g.channel === m.channel);

  return (
    <Fenetre
      canal={m.channel}
      titre={regleNeuve ? "Nouvelle règle d'envoi" : carte ? carte.titre : "Nouveau modèle"}
      phrase={
        regleNeuve
          ? `Pour le modèle « ${m.name} »`
          : carte
            ? `${carte.declencheur}${carte.delai ? ` · ${carte.delai}` : ""} · ${carte.destinataire}`
            : "Un e-mail ou un SMS des questionnaires, et s'il le faut la règle qui l'envoie."
      }
      fermer={fermer}
      bloquee={bloquee}
    >
      <div className={s.corps}>
        <div className={s.edition}>
          <p className={s.rubrique}>Le modèle</p>
          <div className={s.ligneTitre}>
            <div>
              <label htmlFor="modele-nom">Nom du modèle</label>
              <input id="modele-nom" value={m.name} onChange={(e) => changer("name", e.target.value)} />
            </div>
            <label className={s.coche}>
              <input type="checkbox" checked={m.active} onChange={(e) => changer("active", e.target.checked)} />
              Actif
            </label>
          </div>
          <div className={s.deux}>
            <div>
              <label htmlFor="modele-canal">Canal</label>
              <select id="modele-canal" value={m.channel} onChange={(e) => changer("channel", e.target.value as Channel)}>
                <option value="email">E-mail</option>
                <option value="sms">SMS</option>
              </select>
            </div>
            <div>
              <label htmlFor="modele-evenement">Déclencheur associé</label>
              <select id="modele-evenement" value={m.event} onChange={(e) => changer("event", e.target.value)}>
                {MESSAGE_EVENTS.map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {m.channel === "email" && (
            <div>
              <label htmlFor="modele-objet">Objet</label>
              <input id="modele-objet" value={m.sujet} onChange={(e) => changer("sujet", e.target.value)} placeholder="Votre devis {{reference}}" />
            </div>
          )}
          <div>
            <label htmlFor="modele-texte">Texte</label>
            <textarea id="modele-texte" ref={zone} value={m.contenu} onChange={(e) => changer("contenu", e.target.value)} placeholder="Bonjour {{client_nom}}, …" />
          </div>
          <div>
            <label>Insérer une variable</label>
            <div className={s.jetons}>
              {variables.map((v) => (
                <button key={v.jeton} type="button" className={s.jeton} title={v.libelle} onClick={() => inserer(v.jeton)}>
                  {v.jeton}
                </button>
              ))}
            </div>
          </div>
          {m.channel === "email" && (
            <div>
              <label htmlFor="modele-piece">Pièce jointe</label>
              <select id="modele-piece" value={m.pieceJointe} onChange={(e) => changer("pieceJointe", e.target.value as "" | "estimation")}>
                {PIECES_JOINTES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className={s.aide}>{PIECES_JOINTES.find((p) => p.key === m.pieceJointe)?.aide}</p>
            </div>
          )}
          <p className={s.aide}>
            Une ligne qui ne contient qu&apos;un bloc devient ce bloc (carte de l&apos;estimation, bouton…). Le texte est celui des questionnaires : il vaut pour toutes les règles qui
            l&apos;emploient.
            {autresRegles.length > 0 && <> Il sert aussi à : {autresRegles.map((n) => `« ${n} »`).join(", ")}.</>}
          </p>

          <p className={s.rubrique}>Règle d&apos;envoi</p>
          {!r ? (
            <div className={s.sansRegle}>
              <p className={s.aide}>Aucune règle n&apos;envoie ce modèle : il ne part pas de lui-même.</p>
              <button type="button" className="btn ghost" onClick={() => setR({ ...NOUVELLE_REGLE })}>
                + Ajouter une règle d&apos;envoi
              </button>
            </div>
          ) : (
            <>
              <div className={s.ligneTitre}>
                <div>
                  <label htmlFor="regle-nom">Nom de la règle</label>
                  <input id="regle-nom" value={r.name} onChange={(e) => changerRegle("name", e.target.value)} />
                </div>
                <label className={s.coche}>
                  <input type="checkbox" checked={r.active} onChange={(e) => changerRegle("active", e.target.checked)} />
                  Active
                </label>
              </div>
              <div>
                <label htmlFor="regle-evenement">Quand ? (événement)</label>
                <select id="regle-evenement" value={r.event} onChange={(e) => changerRegle("event", e.target.value)}>
                  {MESSAGE_EVENTS.filter((e) => e.key !== "manual").map((e) => (
                    <option key={e.key} value={e.key}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>
              {r.event === "demande_incomplete" && (
                <div className={s.encadre}>
                  <label htmlFor="regle-champ">Se déclenche quand ce champ manque</label>
                  <select id="regle-champ" value={r.condition_champ} onChange={(e) => changerRegle("condition_champ", e.target.value)}>
                    <option value="volume">Le volume est manquant</option>
                    <option value="depart">L&apos;adresse de départ manque</option>
                    <option value="arrivee">L&apos;adresse d&apos;arrivée manque</option>
                  </select>
                  <p className={s.aide}>
                    Insérez la variable <code>{"{{lien_completion}}"}</code> dans le texte : le client recevra un lien pour compléter sa demande (volume + 3 options, adresses).
                  </p>
                </div>
              )}
              <div className={s.deux}>
                <div>
                  <label htmlFor="regle-montant">Condition — montant TTC minimal (optionnel)</label>
                  <input
                    id="regle-montant"
                    inputMode="decimal"
                    value={r.montant_min}
                    onChange={(e) => changerRegle("montant_min", e.target.value)}
                    placeholder="Ex : 3000 — déclenche uniquement au-delà"
                  />
                </div>
                <div>
                  <label htmlFor="regle-source">Condition — origine de la demande</label>
                  <select id="regle-source" value={r.condition_source} onChange={(e) => changerRegle("condition_source", e.target.value)}>
                    <option value="">Toutes les demandes</option>
                    <option value="form">Venues du formulaire</option>
                    <option value="email">Venues par e-mail</option>
                  </select>
                </div>
              </div>
              <div className={s.deux}>
                <div>
                  <label htmlFor="regle-dest">Destinataire</label>
                  <select id="regle-dest" value={r.destinataire} onChange={(e) => changerRegle("destinataire", e.target.value as "client" | "custom")}>
                    <option value="client">Le client</option>
                    <option value="custom">Adresse / numéro fixe (équipe)</option>
                  </select>
                </div>
                {r.destinataire === "custom" && (
                  <div>
                    <label htmlFor="regle-adresse">{m.channel === "sms" ? "Numéro" : "Adresse"}</label>
                    <input
                      id="regle-adresse"
                      value={r.destinataire_custom}
                      onChange={(e) => changerRegle("destinataire_custom", e.target.value)}
                      placeholder={m.channel === "sms" ? "06 12 34 56 78" : "equipe@bailly.fr"}
                    />
                  </div>
                )}
              </div>
              {regleInitiale && modeleId && (
                <div>
                  <label htmlFor="regle-modele">Modèle envoyé</label>
                  <select id="regle-modele" value={modeleId} onChange={(e) => choisirModele(e.target.value)}>
                    {memeCanal.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <p className={s.aide}>Choisir un autre modèle l&apos;ouvre ici : c&apos;est lui que la règle enverra, et lui que vous modifiez.</p>
                </div>
              )}
              {regleInitiale && modeleId && autreRegle && (
                <button
                  type="button"
                  className={s.lienDiscret}
                  onClick={() => {
                    const g = modeles.find((x) => x.id === modeleId);
                    if (g) autreRegle(g);
                  }}
                >
                  + Une autre règle pour ce modèle
                </button>
              )}
              {!regleInitiale && !regleNeuve && (
                <button type="button" className={s.lienDiscret} onClick={() => setR(null)}>
                  Ne pas ajouter de règle
                </button>
              )}
            </>
          )}

          <div className={s.actions}>
            <button type="button" className="btn primary" disabled={enCours} onClick={enregistrer}>
              {enCours ? "Enregistrement…" : regleNeuve ? "Créer la règle" : carte ? "Enregistrer" : "Créer le modèle"}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => tester({ titre: m.name, modeleId: null, canal: m.channel, sujet: m.sujet, corps: m.contenu })}
            >
              Tester l&apos;envoi
            </button>
            <button type="button" className="btn ghost" onClick={fermer}>
              Fermer
            </button>
            {carte && !regleNeuve && (carte.regle || modeleId) && (
              <button type="button" className={s.supprimer} disabled={enCours} onClick={supprimer}>
                {carte.regle ? "Supprimer la règle" : "Supprimer le modèle"}
              </button>
            )}
          </div>
          {retour && (
            <p className={s.retour} data-ok={retour.ok} role="status">
              {retour.ok ? retour.message : retour.erreur}
            </p>
          )}
        </div>
        <PanneauApercu apercu={apercu} />
      </div>
    </Fenetre>
  );
}
