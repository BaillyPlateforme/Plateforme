"use client";

import { useCallback, useRef, useState } from "react";
import { initialesDe, libelleJour, heureDe, cleJour, type MessageVue } from "@/lib/espace-client/discussion-vue";
import type { Conversation } from "./donnees";
import FilClient from "./FilClient";
import s from "./discussion.module.css";

/*
 * Espace client › Messages : toutes les conversations des clients, une liste
 * à gauche, le fil choisi à droite (comme Demandes › Top demandes). En tête,
 * celles qui attendent une réponse (le dernier message est celui du client),
 * avec le nombre de messages non lus ; puis celles où l'équipe a répondu.
 *
 * Un clic choisit une conversation, ↑ et ↓ passent à la voisine ; le choix vit
 * dans l'adresse (?dossier=<id>), qu'ouvre aussi le lien de l'e-mail reçu par
 * le conseiller. Ouvrir un fil le marque lu ; répondre le fait passer dans
 * « Répondu » au prochain chargement — la liste ne bouge pas sous la souris.
 */

const quand = (iso: string | null) => {
  if (!iso) return "";
  return cleJour(iso) === cleJour(new Date().toISOString()) ? heureDe(iso) : libelleJour(iso).replace(/^(\p{L}+) /u, "").replace(/ \d{4}$/, "");
};

export default function BoiteMessages({
  conversations,
  selection,
  supplement = null,
}: {
  conversations: Conversation[];
  selection: string | null;
  /** Le dossier ouvert par l'adresse sans être dans la liste (pas encore de message, ou écarté par un filtre). */
  supplement?: Conversation | null;
}) {
  const [liste, setListe] = useState(() => (supplement ? [supplement, ...conversations] : conversations));
  const [sel, setSel] = useState<string | null>(selection ?? conversations[0]?.dossierId ?? null);
  const refs = useRef(new Map<string, HTMLElement>());
  const courante = liste.find((c) => c.dossierId === sel) ?? null;

  const choisir = useCallback((id: string) => {
    setSel(id);
    const u = new URL(window.location.href);
    u.searchParams.set("dossier", id);
    window.history.replaceState(null, "", `${u.pathname}${u.search}`);
    refs.current.get(id)?.scrollIntoView({ block: "nearest" });
  }, []);

  const lu = useCallback((id: string) => setListe((l) => l.map((c) => (c.dossierId === id ? { ...c, nonLus: 0 } : c))), []);
  const repondu = useCallback(
    (id: string, m: MessageVue) =>
      setListe((l) => l.map((c) => (c.dossierId === id ? { ...c, nonLus: 0, sansReponse: false, dernierAuteur: "equipe", dernierNom: m.nom, dernierLe: m.le, extrait: m.corps.slice(0, 160), total: c.total + 1 } : c))),
    [],
  );

  const clavier = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = liste.findIndex((c) => c.dossierId === sel);
    const j = Math.max(0, Math.min(liste.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
    if (liste[j]) choisir(liste[j].dossierId);
  };

  if (!liste.length) {
    return (
      <p className={s.videBoite}>
        <b>Aucune conversation pour l&apos;instant</b>
        Les messages que les clients écrivent depuis leur espace (bulle « Une question ? », page « Mon conseiller ») arrivent ici.
      </p>
    );
  }

  // Les deux groupes, dans l'ordre de la page : la liste ne se réordonne pas pendant qu'on y travaille.
  const attente = conversations.filter((c) => c.sansReponse).map((c) => c.dossierId);
  const rendre = (id: string) => {
    const c = liste.find((x) => x.dossierId === id);
    if (!c) return null;
    const choisie = c.dossierId === courante?.dossierId;
    return (
      <div
        key={c.dossierId}
        ref={(el) => {
          if (el) refs.current.set(c.dossierId, el);
          else refs.current.delete(c.dossierId);
        }}
        role="option"
        aria-selected={choisie}
        className={s.conv}
        data-attente={c.sansReponse || undefined}
        data-non-lu={c.nonLus > 0 || undefined}
        onClick={() => choisir(c.dossierId)}
      >
        <span className={s.convAvatar}>{initialesDe(c.client)}</span>
        <span className={s.convMilieu}>
          <span className={s.convHaut}>
            <b className={s.convNom}>{c.client}</b>
            <span className={s.convRef}>{c.reference}</span>
          </span>
          <p className={s.convExtrait}>
            {c.dernierAuteur === "equipe" && <i>{c.dernierNom ? `${c.dernierNom.split(" ")[0]} : ` : "Vous : "}</i>}
            {c.extrait || "Nouvelle conversation"}
          </p>
          <p className={s.convSous}>
            {c.conseiller ? `Suivi par ${c.conseiller}` : "Sans conseiller"}
            {c.total ? ` · ${c.total} message${c.total > 1 ? "s" : ""}` : ""}
            {c.demo ? " · client fictif" : ""}
          </p>
        </span>
        <span className={s.convDroite}>
          <span className={s.convQuand}>{quand(c.dernierLe)}</span>
          {c.nonLus > 0 ? (
            <span className={s.compte} title={`${c.nonLus} message${c.nonLus > 1 ? "s" : ""} non lu${c.nonLus > 1 ? "s" : ""}`}>
              {c.nonLus}
            </span>
          ) : c.sansReponse ? (
            <span className={s.marque} data-ton="ambre">
              À répondre
            </span>
          ) : c.total ? (
            <span className={s.marque} data-ton="vert">
              Répondu
            </span>
          ) : (
            <span className={s.marque} data-ton="gris">
              Vide
            </span>
          )}
        </span>
      </div>
    );
  };
  const autres = conversations.filter((c) => !c.sansReponse).map((c) => c.dossierId);
  // Le dossier ouvert par l'adresse hors de la liste : en tête.
  const horsListe = supplement ? [supplement.dossierId] : [];

  return (
    <div className={s.boite}>
      <div className={s.liste} role="listbox" tabIndex={0} aria-label="Conversations des clients" onKeyDown={clavier}>
        {horsListe.map(rendre)}
        {attente.length > 0 && (
          <p className={s.groupeTitre} role="presentation">
            <b>À répondre</b>
            <span>
              {attente.length} conversation{attente.length > 1 ? "s" : ""} dont le dernier message est celui du client
            </span>
          </p>
        )}
        {attente.map(rendre)}
        {autres.length > 0 && (
          <p className={s.groupeTitre} role="presentation">
            <b>Répondu</b>
            <span>la dernière réponse est celle de l&apos;équipe</span>
          </p>
        )}
        {autres.map(rendre)}
      </div>
      {courante && (
        <FilClient
          key={courante.dossierId}
          dossierId={courante.dossierId}
          client={courante.client}
          reference={courante.reference}
          variante="panneau"
          liens={[
            ...(courante.crmDossierId ? [{ href: `/dossiers/${courante.crmDossierId}`, libelle: "Dossier" }] : []),
            { href: `/dashboard/espace-client/dossiers/${courante.dossierId}`, libelle: "Son espace" },
          ]}
          onLu={lu}
          onRepondu={repondu}
        />
      )}
    </div>
  );
}
