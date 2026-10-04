"use client";

import type {
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/* ─────────────────────────── Icônes ─────────────────────────── */

const TRACES = {
  user: (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
  tel: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  maison: (
    <>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  immeuble: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
    </>
  ),
  camion: (
    <>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </>
  ),
  bouclier: (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  poids: (
    <>
      <circle cx="12" cy="5" r="3" />
      <path d="M6.5 8a2 2 0 0 0-1.905 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.48 8Z" />
    </>
  ),
  calendrier: (
    <>
      <path d="M8 2v4M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  carton: (
    <>
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </>
  ),
  verre: (
    <>
      <path d="M8 22h8" />
      <path d="M7 10h10" />
      <path d="M12 15v7" />
      <path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z" />
    </>
  ),
  couronne: (
    <>
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
      <path d="M5 21h14" />
    </>
  ),
  liste: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  photo: (
    <>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  check: <path d="m5 13 4 4L19 7" />,
  croix: <path d="M18 6 6 18M6 6l12 12" />,
  droite: <path d="M5 12h14M12 5l7 7-7 7" />,
  gauche: <path d="M19 12H5M12 19l-7-7 7-7" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  plus: <path d="M5 12h14M12 5v14" />,
  crayon: (
    <>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </>
  ),
  fauteuil: (
    <>
      <path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3" />
      <path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z" />
      <path d="M5 18v2M19 18v2" />
    </>
  ),
  cle: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  sablier: (
    <>
      <path d="M5 22h14M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </>
  ),
  regle: (
    <>
      <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
      <path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2" />
    </>
  ),
  horloge: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  message: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />,
  eclair: (
    <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
  ),
  route: (
    <>
      <circle cx="6" cy="19" r="3" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
      <circle cx="18" cy="5" r="3" />
    </>
  ),
  piano: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  reglages: <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />,
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
  telecharger: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ),
  euro: (
    <>
      <path d="M4 10h12M4 14h9" />
      <path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2" />
    </>
  ),
} as const;

export type NomIcone = keyof typeof TRACES;

export function Icone({
  nom,
  taille = 18,
  trait = 1.8,
  className,
}: {
  nom: NomIcone;
  taille?: number;
  trait?: number;
  className?: string;
}) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={trait}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {TRACES[nom]}
    </svg>
  );
}

/* ─────────────────────────── Champs ─────────────────────────── */

/**
 * Un champ et son libellé.
 *
 * Une précision courte (« facultatif », « en mètres ») se range à droite du
 * libellé ; une longue passe dessous — à droite, elle se repliait sur trois
 * lignes et repoussait le libellé.
 *
 * `groupe` : pour un champ fait de plusieurs boutons. Un <label> autour d'eux
 * activerait le premier dès qu'on clique sur le libellé.
 */
export function Field({
  label,
  hint,
  children,
  className = "",
  groupe = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  groupe?: boolean;
}) {
  const requis = /\*\s*$/.test(label);
  const texte = label.replace(/\s*\*\s*$/, "");
  const longue = !!hint && hint.length > 30;

  const entete = (
    <span className="mb-2 block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[13.5px] font-semibold text-ink">
          {texte}
          {requis && (
            <span className="ml-0.5 text-brand-ink" aria-hidden>
              *
            </span>
          )}
        </span>
        {hint && !longue && <span className="shrink-0 text-[12px] text-ink-soft">{hint}</span>}
      </span>
      {longue && <span className="mt-1 block text-[12.5px] leading-snug text-ink-soft">{hint}</span>}
    </span>
  );

  if (groupe)
    return (
      <div className={className} role="group" aria-label={texte}>
        {entete}
        {children}
      </div>
    );
  return (
    <label className={`block ${className}`}>
      {entete}
      {children}
    </label>
  );
}

export function TextInput({
  icone,
  unite,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { icone?: NomIcone; unite?: string }) {
  if (!icone && !unite) return <input {...props} className={`champ ${className}`} />;
  return (
    <span className="relative block">
      {icone && (
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft">
          <Icone nom={icone} taille={17} />
        </span>
      )}
      <input
        {...props}
        className={`champ ${icone ? "pl-11" : ""} ${unite ? "pr-14" : ""} ${className}`}
      />
      {unite && (
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-medium text-ink-soft">
          {unite}
        </span>
      )}
    </span>
  );
}

export function Zone(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`champ ${props.className ?? ""}`} />;
}

export function Selecteur({
  children,
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select {...props} className={`champ appearance-none pr-11 ${className}`}>
        {children}
      </select>
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-soft">
        <Icone nom="chevron" taille={16} trait={2.2} />
      </span>
    </span>
  );
}

/* ─────────────────────────── Choix ─────────────────────────── */

/** Sélecteur à segments : une piste, un curseur noir sur l'option retenue. */
export function Choice({
  options,
  value,
  onChange,
  plein = false,
}: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
  /** Occupe toute la largeur — pour trois options ou plus. */
  plein?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      className={`${plein ? "grid w-full" : "inline-grid max-w-full"} auto-cols-fr grid-flow-col gap-1 rounded-full bg-subtle p-1 ring-1 ring-inset ring-line`}
    >
      {options.map(([val, texte]) => {
        const on = value === val;
        return (
          <button
            key={val}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(val)}
            className={`min-h-10 rounded-full px-3 text-[13px] font-medium leading-tight transition-[background-color,color,box-shadow,transform] duration-200 active:scale-[0.97] sm:px-4 sm:text-[13.5px] ${
              on
                ? "bg-ink text-shell shadow-[0_8px_18px_-10px_rgba(27,26,24,0.75)]"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {texte}
          </button>
        );
      })}
    </div>
  );
}

export function YesNo({
  value,
  onChange,
}: {
  value: "oui" | "non" | "";
  onChange: (v: "oui" | "non") => void;
}) {
  return (
    <div role="radiogroup" className="inline-flex shrink-0 gap-2">
      {(["oui", "non"] as const).map((v) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            className={`inline-flex h-10 min-w-[72px] items-center justify-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-medium transition-[background-color,border-color,color,transform] duration-200 active:scale-95 ${
              on
                ? "border-ink bg-ink text-shell"
                : "border-line-strong bg-card text-ink-mid hover:border-ink hover:text-ink"
            }`}
          >
            <span className={on ? (v === "oui" ? "coche-or" : "opacity-70") : "text-ink-soft/55"}>
              <Icone nom={v === "oui" ? "check" : "croix"} taille={13} trait={3} />
            </span>
            {v === "oui" ? "Oui" : "Non"}
          </button>
        );
      })}
    </div>
  );
}

export function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center rounded-full border px-4 text-[13.5px] font-medium transition-[background-color,border-color,color,transform] duration-200 active:scale-95 ${
        active
          ? "border-ink bg-ink text-shell"
          : "border-line-strong bg-card text-ink-mid hover:border-ink hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** La pastille d'un choix : vide, puis cochée dans un petit rebond. */
export function Radio({ on }: { on: boolean }) {
  return (
    <span
      className={`relative flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 ${
        on
          ? "border-[#1b1a18] bg-[#1b1a18] text-brand"
          : "border-line-strong text-transparent group-hover:border-ink-soft"
      }`}
    >
      {on && <span className="onde absolute inset-0 rounded-full" />}
      <Icone nom="check" taille={12} trait={3.4} className={on ? "coche-pop" : ""} />
    </span>
  );
}

/** Une grande carte à choisir : icône, titre, explication, et la pastille. */
export function CarteChoix({
  active,
  onClick,
  icone,
  titre,
  texte,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icone: NomIcone;
  titre: string;
  texte: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`group relative flex w-full flex-col overflow-hidden rounded-[22px] border p-4 text-left transition-[border-color,background-color,box-shadow,transform] duration-300 active:scale-[0.985] sm:p-5 ${
        active
          ? "border-ink bg-brand-soft shadow-[inset_0_0_0_1px_var(--color-ink),0_22px_40px_-28px_rgba(27,26,24,0.55)]"
          : "border-line-strong bg-card hover:-translate-y-0.5 hover:border-ink-soft hover:shadow-[0_18px_34px_-26px_rgba(27,26,24,0.5)]"
      }`}
    >
      {active && <span aria-hidden className="eclat" />}
      <span className="flex items-start justify-between gap-3">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-[14px] transition-colors duration-300 ${
            active ? "bg-[#1b1a18] text-brand" : "bg-subtle text-ink-mid"
          }`}
        >
          <Icone nom={icone} taille={20} />
        </span>
        <Radio on={active} />
      </span>
      <span className="mt-4 block text-[15.5px] font-semibold leading-tight">{titre}</span>
      <span className="mt-1.5 block text-[13px] leading-snug text-ink-soft">{texte}</span>
      {badge && (
        <span
          className={`mt-4 inline-flex self-start rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors duration-300 ${
            active ? "bg-[#1b1a18] text-brand" : "bg-subtle text-ink-mid"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/** Une option en ligne : la pastille, un titre, une précision. */
export function Option({
  active,
  onClick,
  titre,
  texte,
}: {
  active: boolean;
  onClick: () => void;
  titre: string;
  texte?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-[18px] border px-4 py-3.5 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 active:scale-[0.985] ${
        active
          ? "border-ink bg-brand-soft shadow-[inset_0_0_0_1px_var(--color-ink)]"
          : "border-line-strong bg-card hover:border-ink-soft"
      }`}
    >
      <Radio on={active} />
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold leading-tight">{titre}</span>
        {texte && <span className="mt-1 block text-[12.5px] leading-snug text-ink-soft">{texte}</span>}
      </span>
    </button>
  );
}

/* ─────────────────────────── Mise en page ─────────────────────────── */

/** Une section du formulaire : une carte, son icône et son titre. */
export function Bloc({
  icone,
  titre,
  sous,
  children,
  delai = 0,
  etiquette,
}: {
  icone: NomIcone;
  titre: string;
  sous?: string;
  children: ReactNode;
  /** Décalage de l'entrée, en millisecondes : les blocs arrivent en cascade. */
  delai?: number;
  /** Une mention à droite du titre : « À compléter », « Renseigné ». */
  etiquette?: { texte: string; fait?: boolean };
}) {
  const mention = `shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10.5px] font-bold uppercase leading-none tracking-[0.08em] transition-colors duration-300 ${
    etiquette?.fait ? "bg-brand text-[#1b1a18]" : "bg-[#1b1a18] text-brand"
  }`;
  const pastille = etiquette && (
    <>
      {etiquette.fait && <Icone nom="check" taille={10} trait={3.6} />}
      {etiquette.texte}
    </>
  );

  return (
    <section
      className="bloc reveal rounded-[26px] border border-line bg-card p-5 sm:p-7"
      style={{ "--d": `${delai}ms` } as CSSProperties}
    >
      {/* L'icône s'aligne sur le haut du texte : centrée, elle flottait au milieu
          d'un titre replié sur trois lignes au téléphone. */}
      <header className="mb-6 flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-brand-soft text-brand-ink">
          <Icone nom={icone} taille={20} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          {/* Au téléphone, la mention passe au-dessus du titre plutôt qu'à côté. */}
          {etiquette && <span className={`mb-2 inline-flex sm:hidden ${mention}`}>{pastille}</span>}
          <h2 className="text-[17px] font-semibold leading-tight tracking-[-0.01em]">{titre}</h2>
          {sous && <p className="mt-1 text-[13px] leading-snug text-ink-soft">{sous}</p>}
        </div>
        {etiquette && <span className={`hidden sm:inline-flex ${mention}`}>{pastille}</span>}
      </header>
      {children}
    </section>
  );
}

/**
 * Une question et sa réponse, sur une même ligne.
 *
 * Une grille à deux colonnes, jamais un flex qui se replie : la réponse reste
 * à droite quelle que soit la longueur de la question, et toutes les lignes
 * s'alignent.
 */
export function Ligne({
  label,
  aide,
  nue = false,
  children,
}: {
  label: string;
  aide?: string;
  /** Sans filet au-dessus : pour une ligne posée dans un encadré. */
  nue?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-3.5 ${
        nue ? "" : "border-t border-line first:border-t-0"
      }`}
    >
      <div className="text-[14px] font-medium leading-snug text-ink">{label}</div>
      {children}
      {/* Sous la question, sur toute la largeur : coincée à côté de la
          réponse, l'aide s'étirait sur huit lignes au téléphone. */}
      {aide && (
        <div className="col-span-2 mt-1.5 max-w-[68ch] text-[12.5px] leading-snug text-ink-soft">{aide}</div>
      )}
    </div>
  );
}
