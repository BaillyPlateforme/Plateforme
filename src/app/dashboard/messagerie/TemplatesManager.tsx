"use client";

import { useState, useTransition } from "react";
import type { MessageTemplate, Channel } from "@/lib/messaging";
import {
  MESSAGE_EVENTS,
  PIECES_JOINTES,
  TEMPLATE_BLOCS,
  TEMPLATE_VARIABLES,
  eventLabel,
  pieceJointeDuModele,
} from "@/lib/messaging";
import { saveTemplate, deleteTemplate } from "@/lib/actions/templates";
import { rendreEmail } from "@/lib/email-render";

const empty = {
  name: "Nouveau modèle",
  channel: "email" as Channel,
  event: "manual",
  sujet: "",
  contenu: "",
  piece_jointe: "" as "" | "estimation",
  active: true,
};

export default function TemplatesManager({
  templates,
  base,
  entreprise,
}: {
  templates: MessageTemplate[];
  base?: string;
  entreprise?: { nom?: string | null; email?: string | null; tel?: string | null };
}) {
  const [selected, setSelected] = useState<string | "new" | null>(templates[0]?.id ?? "new");
  const current = selected === "new" ? null : templates.find((t) => t.id === selected) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="space-y-2">
        {templates.map((t) => (
          <button key={t.id} onClick={() => setSelected(t.id)}
            className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${selected === t.id ? "border-accent bg-accent-soft/40" : "border-line bg-card hover:border-line-strong"}`}>
            <div className="min-w-0">
              <div className="truncate font-medium">{t.name}</div>
              <div className="text-xs text-ink-soft">{eventLabel(t.event)}</div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${t.channel === "sms" ? "bg-accent-soft text-accent" : "bg-accent-soft text-accent-dark"}`}>
              {t.channel.toUpperCase()}
            </span>
          </button>
        ))}
        <button onClick={() => setSelected("new")}
          className={`w-full rounded-xl border border-dashed px-4 py-3 text-sm transition ${selected === "new" ? "border-accent text-accent" : "border-line-strong text-ink-soft hover:border-accent hover:text-accent"}`}>
          + Nouveau modèle
        </button>
      </div>

      <TemplateEditor key={selected ?? "none"} template={current} isNew={selected === "new"} onDone={setSelected} base={base} entreprise={entreprise} />
    </div>
  );
}

function TemplateEditor({
  template,
  isNew,
  onDone,
  base,
  entreprise,
}: {
  template: MessageTemplate | null;
  isNew: boolean;
  onDone: (s: string | "new" | null) => void;
  base?: string;
  entreprise?: { nom?: string | null; email?: string | null; tel?: string | null };
}) {
  const [f, setF] = useState(template ? {
    name: template.name,
    channel: template.channel,
    event: template.event,
    sujet: template.sujet ?? "",
    contenu: template.contenu,
    // Celle qui s'applique vraiment : sans réglage, un message qui montre
    // l'estimation la joint.
    piece_jointe: (pieceJointeDuModele(template) ?? "") as "" | "estimation",
    active: template.active,
  } : empty);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  if (!template && !isNew) return <div className="rounded-xl border border-dashed border-line p-12 text-center text-ink-soft">Sélectionnez ou créez un modèle.</div>;

  return (
    <div className="rounded-[18px] bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input value={f.name} onChange={(e) => set("name", e.target.value)} className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2 font-serif text-lg outline-none focus:border-accent" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} className="accent-[var(--color-accent)]" />Actif</label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-ink-soft">Canal</label>
          <select value={f.channel} onChange={(e) => set("channel", e.target.value)} className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent">
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-ink-soft">Déclencheur associé</label>
          <select value={f.event} onChange={(e) => set("event", e.target.value)} className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent">
            {MESSAGE_EVENTS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
        </div>
      </div>

      {f.channel === "email" && (
        <div className="mt-4">
          <label className="mb-1 block text-sm text-ink-soft">Sujet</label>
          <input value={f.sujet} onChange={(e) => set("sujet", e.target.value)} className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" placeholder="Votre devis {{reference}}" />
        </div>
      )}

      <div className="mt-4">
        <label className="mb-1 block text-sm text-ink-soft">{f.channel === "sms" ? "Message (SMS)" : "Corps du message"}</label>
        <textarea value={f.contenu} onChange={(e) => set("contenu", e.target.value)} rows={f.channel === "sms" ? 4 : 8}
          className="w-full resize-y rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" placeholder="Bonjour {{client_nom}}, …" />
      </div>

      {f.channel === "email" && (
        <>
          {/* Les blocs : ce que le message contient, sans écrire de HTML. */}
          <div className="mt-4 rounded-xl border border-line bg-paper p-4">
            <div className="text-sm font-medium">Ce que le message contient</div>
            <p className="mt-0.5 text-[12.5px] text-ink-soft">
              Posez un bloc seul sur sa ligne : il devient un tableau, un bouton ou un encadré,
              mis en page aux couleurs de Bailly.
            </p>
            <div className="mt-3 space-y-1.5">
              {TEMPLATE_BLOCS.map((b) => {
                const dedans = f.contenu.includes(b.token);
                return (
                  <button
                    key={b.token}
                    type="button"
                    onClick={() =>
                      set(
                        "contenu",
                        dedans
                          ? f.contenu.replace(new RegExp(`\\n?\\s*${b.token.replace(/[{}]/g, "\\$&")}\\s*`, "g"), "\n")
                          : `${f.contenu.replace(/\s*$/, "")}\n\n${b.token}\n`,
                      )
                    }
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                      dedans ? "border-brand bg-brand-soft/60" : "border-line bg-card hover:border-line-strong"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                        dedans ? "border-brand bg-brand text-[#1b1a18]" : "border-line-strong text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{b.label}</span>
                      <span className="block text-[11.5px] text-ink-soft">{b.aide}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm text-ink-soft">Pièce jointe</label>
            <select
              value={f.piece_jointe}
              onChange={(e) => set("piece_jointe", e.target.value)}
              className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {PIECES_JOINTES.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[12px] text-ink-soft">
              {PIECES_JOINTES.find((p) => p.key === f.piece_jointe)?.aide}
            </p>
          </div>
        </>
      )}

      <div className="mt-4">
        <div className="mb-1.5 text-xs text-ink-soft">Insérer une variable :</div>
        <div className="space-y-2">
          {[...new Set(TEMPLATE_VARIABLES.map((v) => v.groupe))].map((groupe) => (
            <div key={groupe} className="flex flex-wrap items-center gap-1.5">
              <span className="w-24 shrink-0 text-[11px] text-ink-soft">{groupe}</span>
              {TEMPLATE_VARIABLES.filter((v) => v.groupe === groupe).map((v) => (
                <button key={v.token} type="button" onClick={() => set("contenu", f.contenu + " " + v.token)}
                  title={v.label} className="rounded-full border border-line bg-paper px-2.5 py-1 font-mono text-[11px] transition hover:border-accent hover:text-accent">
                  {v.token}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {f.channel === "email" && <Apercu modele={f} base={base} entreprise={entreprise} />}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={() => start(async () => {
          await saveTemplate(template?.id ?? null, {
            name: f.name,
            channel: f.channel,
            event: f.event,
            sujet: f.channel === "email" ? f.sujet || null : null,
            contenu: f.contenu,
            options: { piece_jointe: f.channel === "email" && f.piece_jointe ? f.piece_jointe : null },
            active: f.active,
          });
          if (isNew) onDone(null);
          setSaved(true); setTimeout(() => setSaved(false), 1500);
        })} disabled={pending} className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50">
          {pending ? "…" : saved ? "Enregistré ✓" : isNew ? "Créer le modèle" : "Enregistrer"}
        </button>
        {template && (
          <button onClick={() => start(() => deleteTemplate(template.id).then(() => onDone(null)))} disabled={pending}
            className="ml-auto rounded-xl px-4 py-2 text-sm text-accent transition hover:bg-accent-soft/40">Supprimer</button>
        )}
      </div>
    </div>
  );
}

/** Un jeu de données représentatif, pour voir à quoi le message ressemblera. */
const EXEMPLE = {
  client_nom: "Camille Durand",
  client_email: "camille.durand@email.fr",
  client_tel: "06 12 34 56 78",
  ville_depart: "Lyon",
  ville_arrivee: "Toulouse",
  volume: 30,
  distance: 540,
  date: "2026-11-15",
  formule: "standard",
  reference: "DEV-2026-0042",
  montant_ht: 1800,
  montant_ttc: 2160,
  validite: "15/12/2026",
  entreprise_nom: "Bailly Déménagement",
  entreprise_tel: "01 69 10 35 20",
  entreprise_email: "contact@demenagements-bailly.com",
  lien_estimation: "#",
  lien_completion: "#",
};

const LIGNES_EXEMPLE = [
  { label: "Transport et manutention", amount: 1500 },
  { label: "Portage charges lourdes", amount: 240 },
  { label: "Garantie dommages standard", amount: 60 },
];

/**
 * L'aperçu du message, rendu exactement comme il partira.
 *
 * Dans une iframe isolée : le HTML d'un e-mail porte ses propres styles, et on
 * ne veut ni qu'il déborde sur l'application, ni l'inverse.
 */
function Apercu({
  modele,
  base,
  entreprise,
}: {
  modele: { name: string; sujet: string; contenu: string; piece_jointe?: "" | "estimation" };
  base?: string;
  entreprise?: { nom?: string | null; email?: string | null; tel?: string | null };
}) {
  const [ouvert, setOuvert] = useState(true);
  const coord = {
    nom: entreprise?.nom || EXEMPLE.entreprise_nom,
    email: entreprise?.email || EXEMPLE.entreprise_email,
    tel: entreprise?.tel || EXEMPLE.entreprise_tel,
  };
  const { sujet, html } = rendreEmail(
    { name: modele.name, sujet: modele.sujet, contenu: modele.contenu },
    {
      vars: { ...EXEMPLE, ...coord, entreprise_nom: coord.nom, entreprise_tel: coord.tel, entreprise_email: coord.email },
      lignes: LIGNES_EXEMPLE,
      base,
      entreprise: coord,
      pieceJointe: modele.piece_jointe === "estimation",
    },
  );

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-line">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="flex w-full items-center justify-between gap-3 bg-paper px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-medium">Aperçu du message</span>
          <span className="block truncate text-[12.5px] text-ink-soft">{sujet}</span>
        </span>
        <span className="shrink-0 text-sm text-brand-ink">{ouvert ? "Masquer" : "Voir"}</span>
      </button>
      {ouvert && (
        <iframe
          title="Aperçu du message"
          srcDoc={html}
          sandbox=""
          className="h-[520px] w-full border-t border-line bg-[#f6f5f2]"
        />
      )}
    </div>
  );
}
