"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Ic } from "@/crm/lib/icons";
import s from "./planning.module.css";

/*
 * Le petit calendrier du planning : un mois, semaine par semaine (du lundi
 * au dimanche). Un clic sur un jour ouvre sa semaine ; la semaine affichée
 * et aujourd'hui sont marqués. Le mois se change aux flèches.
 */

const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const iso = (d: Date) => d.toISOString().slice(0, 10);

function lundiDe(jour: string) {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(d);
}

export default function MiniCalendrier({ semaine, aujourdhui, prefixe }: { semaine: string; aujourdhui: string; /** L'adresse de la page, à laquelle on ajoute le lundi choisi. */ prefixe: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [mois, setMois] = useState(() => `${semaine.slice(0, 7)}-01`);
  const boite = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent) => !boite.current?.contains(e.target as Node) && setOuvert(false);
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    document.addEventListener("mousedown", fermer);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", fermer);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  const premier = new Date(`${mois}T12:00:00Z`);
  const debut = new Date(`${lundiDe(mois)}T12:00:00Z`);
  const semaines = Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, j) => {
      const d = new Date(debut);
      d.setUTCDate(d.getUTCDate() + w * 7 + j);
      return d;
    }),
  ).filter((sem, i) => i < 4 || sem[0].getUTCMonth() === premier.getUTCMonth());
  const decaler = (n: number) => {
    const d = new Date(premier);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMois(iso(d));
  };

  return (
    <div className={s.miniCal} ref={boite}>
      <button type="button" className="btn ghost" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert}>
        <Ic n="cal" />
        Choisir une semaine
      </button>
      {ouvert && (
        <div className={s.miniCalBoite} role="dialog" aria-label="Choisir une semaine">
          <div className={s.miniCalTete}>
            <button type="button" onClick={() => decaler(-1)} aria-label="Mois précédent">
              <Ic n="left" />
            </button>
            <b>{MOIS.format(premier)}</b>
            <button type="button" onClick={() => decaler(1)} aria-label="Mois suivant">
              <Ic n="right" />
            </button>
          </div>
          <div className={s.miniCalJours}>
            {["L", "M", "M", "J", "V", "S", "D"].map((j, i) => (
              <span key={i}>{j}</span>
            ))}
          </div>
          {semaines.map((sem) => {
            const lundi = iso(sem[0]);
            return (
              <div key={lundi} className={`${s.miniCalSemaine} ${lundi === semaine ? s.miniCalActive : ""}`}>
                {sem.map((d) => (
                  <button
                    key={iso(d)}
                    type="button"
                    className={`${d.getUTCMonth() !== premier.getUTCMonth() ? s.miniCalHors : ""} ${iso(d) === aujourdhui ? s.miniCalAuj : ""}`}
                    onClick={() => {
                      setOuvert(false);
                      router.push(`${prefixe}${lundi}`);
                    }}
                  >
                    {d.getUTCDate()}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
