"use client";

import { useMemo, useState, useTransition } from "react";
import { sendTest } from "@/lib/actions/alerts";
import { renderTemplate, type Channel } from "@/lib/messaging";
import type { GabaritVue } from "./donnees";
import { Fenetre, Telephone } from "./elements";
import s from "./messages.module.css";

/*
 * Tester l'envoi d'un message : l'ancien onglet « Simulation » de la
 * messagerie, venu dans Courriers et SMS (08/11/2026). On part d'une carte
 * (son texte), d'un modèle des questionnaires ou d'un message libre ; les
 * variables {{…}} prennent des valeurs d'exemple modifiables ; le test part
 * par sendTest, avec les mêmes garde-fous que tout envoi (journalisé, rien ne
 * part tant que l'envoi est désactivé).
 */

const SAMPLE_FIELDS: { key: string; label: string; def: string }[] = [
  { key: "client_nom", label: "Nom du client", def: "Camille Durand" },
  { key: "reference", label: "Référence", def: "DEV-2026-0001" },
  { key: "montant_ttc", label: "Montant TTC", def: "1440" },
  { key: "montant_ht", label: "Montant HT", def: "1200" },
  { key: "ville_depart", label: "Ville départ", def: "Lyon" },
  { key: "ville_arrivee", label: "Ville arrivée", def: "Toulouse" },
  { key: "volume", label: "Volume", def: "30" },
  { key: "entreprise_nom", label: "Entreprise", def: "Bailly Déménagement" },
];

/** D'où part le test : une carte (son texte, déjà rempli pour les cartes du CRM), un modèle, ou rien (message libre). */
export type DepartTest = { titre?: string; modeleId?: string | null; canal: Channel; sujet: string; corps: string };

const CARTE = "__carte";

export default function TestEnvoi({ modeles, depart, fermer }: { modeles: GabaritVue[]; depart: DepartTest; fermer: () => void }) {
  const [templateId, setTemplateId] = useState<string>(depart.modeleId ?? (depart.titre ? CARTE : ""));
  const [channel, setChannel] = useState<Channel>(depart.canal);
  const [subject, setSubject] = useState(depart.sujet);
  const [body, setBody] = useState(depart.corps);
  const [to, setTo] = useState("");
  const [sample, setSample] = useState<Record<string, string>>(Object.fromEntries(SAMPLE_FIELDS.map((f) => [f.key, f.def])));
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<{ ok: boolean; texte: string } | null>(null);

  function loadTemplate(id: string) {
    setTemplateId(id);
    if (id === CARTE) {
      setChannel(depart.canal);
      setSubject(depart.sujet);
      setBody(depart.corps);
      return;
    }
    const t = modeles.find((x) => x.id === id);
    if (t) {
      setChannel(t.channel);
      setSubject(t.sujet ?? "");
      setBody(t.contenu);
    }
  }

  const previewSubject = useMemo(() => renderTemplate(subject, sample), [subject, sample]);
  const previewBody = useMemo(() => renderTemplate(body, sample), [body, sample]);

  return (
    <Fenetre canal={channel} titre="Tester l'envoi" phrase={depart.titre ? `« ${depart.titre} »` : "Un modèle des questionnaires, ou un message libre"} fermer={fermer}>
      <div className={s.corps}>
        <div className={s.edition}>
          <div className={s.deux}>
            <div>
              <label htmlFor="test-modele">Depuis un modèle</label>
              <select id="test-modele" value={templateId} onChange={(e) => loadTemplate(e.target.value)}>
                <option value="">— message libre —</option>
                {depart.titre && !depart.modeleId && <option value={CARTE}>« {depart.titre} »</option>}
                {modeles.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.channel === "sms" ? "SMS" : "e-mail"})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="test-canal">Canal</label>
              <select id="test-canal" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                <option value="email">E-mail</option>
                <option value="sms">SMS</option>
              </select>
            </div>
          </div>

          {channel === "email" && (
            <div>
              <label htmlFor="test-sujet">Objet</label>
              <input id="test-sujet" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          )}
          <div>
            <label htmlFor="test-texte">Texte</label>
            <textarea id="test-texte" className={s.court} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Bonjour {{client_nom}}, …" />
          </div>

          <div>
            <label>Valeurs d&apos;exemple des variables {"{{…}}"}</label>
            <div className={s.exemples}>
              {SAMPLE_FIELDS.map((sf) => (
                <input
                  key={sf.key}
                  value={sample[sf.key]}
                  onChange={(e) => setSample((x) => ({ ...x, [sf.key]: e.target.value }))}
                  placeholder={sf.label}
                  title={`${sf.label} : {{${sf.key}}}`}
                  aria-label={sf.label}
                />
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="test-a">Envoyer le test à</label>
            <div className={s.ligneEnvoi}>
              <input id="test-a" value={to} onChange={(e) => setTo(e.target.value)} placeholder={channel === "sms" ? "06 12 34 56 78" : "vous@email.fr"} />
              <button
                type="button"
                className="btn primary"
                disabled={pending || !to.trim()}
                onClick={() =>
                  start(async () => {
                    const r = await sendTest(channel, to, previewBody, previewSubject);
                    setFlash({ ok: r.ok, texte: r.message });
                  })
                }
              >
                {pending ? "Envoi…" : "Envoyer le test"}
              </button>
            </div>
            {flash && (
              <p className={s.retour} data-ok={flash.ok} role="status">
                {flash.texte}
              </p>
            )}
          </div>
        </div>

        <div className={s.apercu}>
          <small>Aperçu</small>
          {channel === "email" ? (
            <div className={s.texteBrut}>
              <p className={s.sujet}>{previewSubject || "—"}</p>
              <div>{previewBody || "—"}</div>
            </div>
          ) : (
            <Telephone texte={previewBody} />
          )}
        </div>
      </div>
    </Fenetre>
  );
}
