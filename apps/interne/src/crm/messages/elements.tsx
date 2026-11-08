"use client";

import { useEffect } from "react";
import type { Apercu } from "./actions";
import s from "./messages.module.css";

/*
 * Les pièces communes de « Courriers et SMS » : les pictogrammes des canaux,
 * le compte des SMS, la colonne d'aperçu et la fenêtre où s'ouvrent l'éditeur
 * d'une carte, celui d'un modèle et le test d'envoi.
 */

export const Enveloppe = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);
export const Bulle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
  </svg>
);

/** La pastille du canal d'un message. */
export function Canal({ canal }: { canal: "email" | "sms" }) {
  return (
    <span className={s.canal} data-canal={canal}>
      {canal === "sms" ? <Bulle /> : <Enveloppe />}
      {canal === "sms" ? "SMS" : "E-mail"}
    </span>
  );
}

/**
 * Le nombre de SMS facturés : 160 caractères (153 par morceau au-delà) dans
 * l'alphabet SMS (GSM 03.38), 70 (67) dès qu'un caractère en sort.
 */
const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_ETENDU = "^{}\\[~]|€";
export function compterSms(texte: string) {
  const chars = [...texte];
  const unicode = chars.some((c) => !GSM.includes(c) && !GSM_ETENDU.includes(c));
  const longueur = unicode ? chars.length : chars.reduce((n, c) => n + (GSM_ETENDU.includes(c) ? 2 : 1), 0);
  const segments = unicode ? (longueur <= 70 ? 1 : Math.ceil(longueur / 67)) : longueur <= 160 ? 1 : Math.ceil(longueur / 153);
  return { segments: Math.max(1, segments), unicode };
}

/** Le SMS dans un téléphone, avec son nombre de caractères et de SMS facturés. */
export function Telephone({ texte }: { texte: string }) {
  const { segments, unicode } = compterSms(texte);
  return (
    <div className={s.telephone}>
      <div className={s.bulle}>{texte || "…"}</div>
      <p className={s.compte}>
        {texte.length} caractères · {segments} SMS{unicode ? " (caractères accentués hors alphabet SMS : 70 par SMS)" : ""}
      </p>
    </div>
  );
}

/** La colonne d'aperçu : le message rendu comme à l'envoi, avec des valeurs d'exemple. */
export function PanneauApercu({ apercu }: { apercu: Apercu | null }) {
  return (
    <div className={s.apercu}>
      <small>Aperçu, avec des valeurs d&apos;exemple</small>
      {!apercu ? (
        <p className={s.aide}>Préparation de l&apos;aperçu…</p>
      ) : apercu.canal === "sms" ? (
        <Telephone texte={apercu.texte} />
      ) : (
        <>
          <p className={s.sujet}>{apercu.sujet}</p>
          <iframe className={s.cadre} title="Aperçu de l'e-mail" sandbox="" srcDoc={apercu.html ?? ""} />
        </>
      )}
    </div>
  );
}

/**
 * Une fenêtre au-dessus de la page : en-tête (canal, titre, phrase), puis son
 * contenu. Échap ou un clic sur le voile la ferme — sauf si une autre fenêtre
 * est ouverte par-dessus (`bloquee`), qui se ferme la première.
 */
export function Fenetre({
  canal,
  titre,
  phrase,
  fermer,
  bloquee = false,
  children,
}: {
  canal?: "email" | "sms";
  titre: string;
  phrase?: React.ReactNode;
  fermer: () => void;
  bloquee?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (bloquee) return;
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [fermer, bloquee]);
  return (
    <div className={s.voile} onClick={bloquee ? undefined : fermer} role="presentation">
      <div className={s.fenetre} role="dialog" aria-modal="true" aria-label={titre} onClick={(e) => e.stopPropagation()}>
        <div className={s.enTete}>
          <div>
            {canal && <Canal canal={canal} />}
            <h2>{titre}</h2>
            {phrase && <p>{phrase}</p>}
          </div>
          <button type="button" className={s.fermer} onClick={fermer} aria-label="Fermer">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
