"use client";

import { useState, useTransition } from "react";
import type { AiConfig, VolumeRef } from "@/lib/ai-config";
import { saveAiConfig } from "@/lib/actions/ai-config";

const MODELS = [
  "gemini-3.1-pro-preview",
  "gemini-3-pro-preview",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
];

export default function AiConfigEditor({ config }: { config: AiConfig }) {
  const [model, setModel] = useState(config.model);
  const [temperature, setTemperature] = useState(String(config.temperature));
  const [userInstruction, setUserInstruction] = useState(config.user_instruction);
  const [promptAvant, setPromptAvant] = useState(config.prompt_avant);
  const [promptApres, setPromptApres] = useState(config.prompt_apres);
  const [refs, setRefs] = useState<VolumeRef[]>(config.volume_references);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const setRef = (i: number, field: keyof VolumeRef, v: string) =>
    setRefs((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [field]: field === "label" ? v : Number(v) || 0 } : r)),
    );
  const addRef = () => setRefs((prev) => [...prev, { label: "", volume: 0 }]);
  const removeRef = (i: number) => setRefs((prev) => prev.filter((_, idx) => idx !== i));

  const preview = `${promptAvant}\n\nRepères indicatifs de volume déménagement :\n${refs
    .map((r) => `- ${r.label} : ${r.volume} m³`)
    .join("\n")}\n\n${promptApres}`;

  function save() {
    start(async () => {
      await saveAiConfig({
        model,
        temperature: Number(temperature) || 0.2,
        prompt_avant: promptAvant,
        prompt_apres: promptApres,
        user_instruction: userInstruction,
        volume_references: refs.filter((r) => r.label.trim()),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Modèle & réglages */}
      <section className="space-y-4 rounded-2xl border border-line bg-card p-6">
        <h3 className="eyebrow text-ink-soft">Moteur d&apos;analyse</h3>
        <div>
          <label className="mb-1 block text-sm text-ink-soft">Modèle Gemini</label>
          <input
            list="ai-models"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <datalist id="ai-models">
            {MODELS.map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>
        <div>
          <label className="mb-1 flex items-center justify-between text-sm text-ink-soft">
            Température <span className="tabular-nums text-ink">{temperature}</span>
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            className="w-full accent-[var(--color-accent)]"
          />
          <p className="mt-1 text-xs text-ink-soft">Bas = réponses stables, haut = plus créatif.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-ink-soft">Instruction envoyée avec la photo</label>
          <input
            value={userInstruction}
            onChange={(e) => setUserInstruction(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
      </section>

      {/* Volumes de référence */}
      <section className="rounded-2xl border border-line bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="eyebrow text-ink-soft">Volumes de référence (m³)</h3>
          <button onClick={addRef} className="text-xs font-medium text-accent transition hover:text-accent-dark">
            + Ajouter
          </button>
        </div>
        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {refs.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={r.label}
                onChange={(e) => setRef(i, "label", e.target.value)}
                placeholder="Objet"
                className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2 py-1 text-sm outline-none focus:border-accent"
              />
              <div className="flex items-center rounded-md border border-line bg-paper">
                <input
                  type="number"
                  step="0.05"
                  value={r.volume}
                  onChange={(e) => setRef(i, "volume", e.target.value)}
                  className="w-16 bg-transparent px-2 py-1 text-right text-sm outline-none"
                />
                <span className="pr-2 text-xs text-ink-soft">m³</span>
              </div>
              <button onClick={() => removeRef(i)} className="px-1.5 text-sm text-ink-soft hover:text-accent">−</button>
            </div>
          ))}
        </div>
      </section>

      {/* Prompt */}
      <section className="space-y-4 rounded-2xl border border-line bg-card p-6 lg:col-span-2">
        <h3 className="eyebrow text-ink-soft">Consignes (prompt système)</h3>
        <div>
          <label className="mb-1 block text-sm text-ink-soft">Introduction (avant les repères)</label>
          <textarea
            value={promptAvant}
            onChange={(e) => setPromptAvant(e.target.value)}
            rows={4}
            className="w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-ink-soft">Règles (après les repères)</label>
          <textarea
            value={promptApres}
            onChange={(e) => setPromptApres(e.target.value)}
            rows={6}
            className="w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <details className="rounded-lg border border-line bg-paper p-3">
          <summary className="cursor-pointer text-sm text-ink-soft">Aperçu du prompt final envoyé à l&apos;IA</summary>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-ink">{preview}</pre>
        </details>
      </section>

      <div className="lg:col-span-2">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
        >
          {pending ? "…" : saved ? "Enregistré ✓" : "Enregistrer la configuration d'analyse"}
        </button>
      </div>
    </div>
  );
}
