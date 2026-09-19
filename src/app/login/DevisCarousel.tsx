"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const HOLD = 5500; // durée d'affichage d'une page, en ms

// Espace fine insécable pour les milliers : formatage déterministe, identique
// côté serveur et côté navigateur (pas de dépendance à l'ICU du runtime).
function fr(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

type Slide = {
  eyebrow: string;
  badge: string;
  value: number | null;
  unit: string;
  big?: string; // grand texte quand il n'y a pas de nombre à animer
  caption: string;
  body: ReactNode;
};

const SLIDES: Slide[] = [
  {
    eyebrow: "Demande #2 481",
    badge: "Estimation instantanée",
    value: 2640,
    unit: "€",
    caption: "fourchette 2 400 – 2 900 € · formule standard",
    body: (
      <>
        <Route from="Paris 15e" to="Nantes" />
        <Meta items={["385 km", "32 m³", "3e étage sans ascenseur"]} />
      </>
    ),
  },
  {
    eyebrow: "Demande #2 481",
    badge: "Analyse des photos",
    value: 32,
    unit: "m³",
    caption: "14 photos analysées · marge ± 8 %",
    body: (
      <div className="space-y-2 border-t border-white/15 pt-4">
        <Bar label="Salon" value="11 m³" pct={34} color="#93c5fd" />
        <Bar label="Chambres" value="9 m³" pct={28} color="#c4b5fd" />
        <Bar label="Cuisine" value="6 m³" pct={19} color="#f9a8d4" />
        <Bar label="Divers, cartons" value="6 m³" pct={19} color="#6ee7b7" />
      </div>
    ),
  },
  {
    eyebrow: "Devis DV-1042",
    badge: "Envoyé au client",
    value: 2640,
    unit: "€",
    caption: "envoyé le 14 mai · relance automatique dans 3 jours",
    body: (
      <div className="border-t border-white/15 pt-4">
        <Steps steps={["Reçue", "Chiffrée", "Envoyée", "Signée"]} current={2} />
        <Meta items={["ouvert 2 fois", "PDF signé en ligne"]} />
      </div>
    ),
  },
  {
    eyebrow: "Dossier #2 481",
    badge: "Intervention planifiée",
    value: null,
    unit: "",
    big: "Mar. 12 mai",
    caption: "départ 08 h 30 · arrivée estimée 14 h 15",
    body: (
      <>
        <Route from="Paris 15e" to="Nantes" />
        <Meta items={["équipe de 3", "camion 20 m³", "monte-meubles"]} />
      </>
    ),
  },
];

export default function DevisCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (paused || reduce) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), HOLD);
    return () => clearTimeout(t);
  }, [index, paused, reduce]);

  const slide = SLIDES[index];

  return (
    <div
      className="levitate relative rounded-3xl"
      style={{ "--d": "250ms", "--dur": "8s" } as CSSProperties}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Anneau de lumière qui tourne autour de la carte. */}
      <div className="ring-only pointer-events-none absolute -inset-px overflow-hidden rounded-3xl">
        <div
          className="spin-slow absolute left-1/2 top-1/2 h-[200%] w-[200%] -translate-x-1/2 -translate-y-1/2 opacity-70"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.55) 35deg, transparent 120deg, transparent 240deg, rgba(255,255,255,0.25) 280deg, transparent 330deg)",
          }}
        />
      </div>

      <div
        className="shine relative overflow-hidden rounded-3xl border border-white/25 bg-linear-to-br from-white/22 via-white/10 to-white/5 p-6 shadow-2xl shadow-ink/40 backdrop-blur-xl"
        style={{ "--shine": "9s" } as CSSProperties}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="eyebrow text-[10px] text-white/70">{slide.eyebrow}</p>
          <span
            key={`badge-${index}`}
            className="slide-in inline-flex items-center rounded-md border border-white/20 bg-white/15 px-2 py-1 text-[11px] font-semibold text-white"
          >
            {slide.badge}
          </span>
        </div>

        {/* Hauteur figée : les quatre pages défilent sans faire sauter la carte. */}
        <div key={index} className="slide-in flex h-[196px] flex-col">
          {slide.value !== null ? (
            <CountUp value={slide.value} unit={slide.unit} reduce={reduce} />
          ) : (
            <div className="display-num gradient-flow-light text-[46px] leading-none">
              {slide.big}
            </div>
          )}
          <p className="mb-4 mt-1 text-[12.5px] text-white/75">{slide.caption}</p>
          <div className="mt-auto">{slide.body}</div>
        </div>

        {/* Pagination : la puce active se remplit sur la durée d'affichage. */}
        <div className="mt-5 flex items-center gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={s.badge}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Page ${i + 1} : ${s.badge}`}
              aria-current={i === index}
              className={`h-1.5 overflow-hidden rounded-full transition-all duration-500 ${
                i === index ? "w-10 bg-white/25" : "w-1.5 bg-white/25 hover:bg-white/45"
              }`}
            >
              {i === index && (
                <span
                  key={`fill-${index}-${paused}`}
                  className="dot-fill block h-full w-full rounded-full bg-white"
                  style={
                    {
                      "--hold": `${HOLD}ms`,
                      animationPlayState: paused ? "paused" : "running",
                    } as CSSProperties
                  }
                />
              )}
            </button>
          ))}
          <span className="ml-auto text-[10.5px] tabular-nums text-white/50">
            {index + 1} / {SLIDES.length}
          </span>
        </div>
      </div>
    </div>
  );
}

// Le nombre s'incrémente à chaque changement de page.
function CountUp({ value, unit, reduce }: { value: number; unit: string; reduce: boolean }) {
  const [shown, setShown] = useState(value);
  const raf = useRef(0);

  useEffect(() => {
    if (reduce) return;
    const start = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, reduce]);

  return (
    <div className="display-num gradient-flow-light text-[46px] leading-none">
      {fr(reduce ? value : shown)} {unit}
    </div>
  );
}

function Route({ from, to }: { from: string; to: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-white/15 pt-4 text-[13px] text-white">
      <span className="font-medium">{from}</span>
      <span className="h-px flex-1 bg-white/25" />
      <IconTruck />
      <span className="h-px flex-1 bg-white/25" />
      <span className="font-medium">{to}</span>
    </div>
  );
}

function Meta({ items }: { items: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-white/70">
      {items.map((i) => (
        <span key={i}>{i}</span>
      ))}
    </div>
  );
}

function Bar({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 text-[11.5px]">
      <span className="w-28 shrink-0 text-white/75">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
        <span
          className="block h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </span>
      <span className="w-12 shrink-0 text-right tabular-nums text-white">{value}</span>
    </div>
  );
}

function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s} className="flex flex-1 flex-col gap-1.5">
          <span
            className={`h-1 rounded-full ${
              i < current ? "bg-white/55" : i === current ? "bg-white" : "bg-white/20"
            }`}
          />
          <span className={`text-[10.5px] ${i <= current ? "text-white/85" : "text-white/45"}`}>
            {s}
          </span>
        </div>
      ))}
    </div>
  );
}

function IconTruck() {
  return (
    <svg
      width={17}
      height={17}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="text-white/70"
    >
      <path d="M2 16V6a1 1 0 0 1 1-1h11v11" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 9h4l3 3.5V16h-2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
      <path d="M8.8 16h6.4" strokeLinecap="round" />
    </svg>
  );
}
