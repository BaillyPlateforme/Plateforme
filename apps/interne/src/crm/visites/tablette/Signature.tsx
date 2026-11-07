"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { empreinteLisible, PLAFONDS } from "@/lib/visite/regles";
import { Picto } from "@/terrain/composants/Picto";
import { signerCompteRendu } from "../actions";
import s from "./tablette.module.css";

/*
 * La signature du compte-rendu, au doigt, sur la tablette du commercial.
 *
 * Signature électronique simple (cahier des charges, §7 : pas de niveau
 * eIDAS avancé) : le nom du signataire, le tracé, et côté serveur l'heure qui
 * fait foi et l'empreinte SHA-256 du contenu. L'empreinte affichée ici est
 * celle du récapitulatif au-dessus ; le serveur la recalcule et refuse de
 * signer si la saisie a changé entre-temps.
 *
 * Le tracé est gardé point par point : le canevas se redessine quand la
 * tablette pivote, sans rien perdre.
 */

type Point = { x: number; y: number };

export default function Signature({ visiteId, empreinte, nomPropose }: { visiteId: number; empreinte: string; nomPropose: string }) {
  const router = useRouter();
  const canevas = useRef<HTMLCanvasElement | null>(null);
  const traits = useRef<Point[][]>([]);
  const enCours = useRef<Point[] | null>(null);
  const [vide, setVide] = useState(true);
  const [signataire, setSignataire] = useState(nomPropose);
  const [relu, setRelu] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const dessiner = useCallback(() => {
    const c = canevas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#17152b";
    ctx.lineWidth = 2.8;
    // Les points sont gardés en fraction du cadre : le tracé suit le cadre quand il change de taille.
    for (const t of [...traits.current, ...(enCours.current ? [enCours.current] : [])]) {
      const p = t.map((q) => ({ x: q.x * r.width, y: q.y * r.height }));
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      if (p.length === 1) ctx.lineTo(p[0].x + 0.1, p[0].y + 0.1);
      for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2);
      if (p.length > 1) ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    dessiner();
    const o = new ResizeObserver(() => dessiner());
    if (canevas.current) o.observe(canevas.current);
    return () => o.disconnect();
  }, [dessiner]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  function effacer() {
    traits.current = [];
    enCours.current = null;
    setVide(true);
    dessiner();
  }

  async function signer() {
    setErreur(null);
    const c = canevas.current;
    if (!c || vide) return setErreur("Le client signe dans le cadre, au doigt.");
    if (signataire.trim().length < 2) return setErreur("Indiquez le nom de la personne qui signe.");
    setEnvoi(true);
    try {
      const r = await signerCompteRendu(visiteId, { signataire: signataire.trim(), signature: c.toDataURL("image/png"), empreinte });
      if (r.ok) {
        // La confirmation s'affiche en haut de la page : on y remonte.
        window.scrollTo({ top: 0, behavior: "smooth" });
        router.refresh();
        return;
      }
      setErreur(r.erreur);
      if (r.relire) router.refresh();
    } catch {
      setErreur("La signature n'a pas pu être envoyée : vérifiez la connexion, puis réessayez.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className={s.signer} aria-label="Signature du client">
      <h2>Signature du client</h2>
      <p>Le client relit le compte-rendu ci-dessus, indique son nom et signe dans le cadre.</p>
      <div className={s.signerGrille}>
        <div>
          <label className={s.champ}>
            <span>Nom du signataire</span>
            <input value={signataire} maxLength={PLAFONDS.signataire} onChange={(e) => setSignataire(e.target.value)} autoComplete="off" placeholder="Prénom Nom" />
          </label>
          <div className={s.empreinte}>
            Empreinte du contenu signé (SHA-256)
            <code title={empreinte}>{empreinteLisible(empreinte, 8)}</code>
          </div>
        </div>
        <div className={s.cadreSignature}>
          <canvas
            ref={canevas}
            aria-label="Zone de signature"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              enCours.current = [point(e)];
              dessiner();
            }}
            onPointerMove={(e) => {
              if (!enCours.current) return;
              // Les points intermédiaires que le navigateur a regroupés : le trait reste lisse au doigt.
              const evts = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
              if (evts.length) {
                const r = e.currentTarget.getBoundingClientRect();
                for (const x of evts) enCours.current.push({ x: (x.clientX - r.left) / r.width, y: (x.clientY - r.top) / r.height });
              } else enCours.current.push(point(e));
              dessiner();
            }}
            onPointerUp={() => {
              if (enCours.current) traits.current.push(enCours.current);
              enCours.current = null;
              setVide(traits.current.length === 0);
              dessiner();
            }}
            onPointerCancel={() => {
              enCours.current = null;
              dessiner();
            }}
          />
          <span />
          <em>Signez ici</em>
          {!vide && (
            <button type="button" className={s.boutonDoux} onClick={effacer}>
              <Picto nom="recharger" taille={18} /> Effacer
            </button>
          )}
        </div>
      </div>
      <div className={s.signerBas}>
        <label>
          <input type="checkbox" checked={relu} onChange={(e) => setRelu(e.target.checked)} />
          J&apos;ai relu ce compte-rendu de visite.
        </label>
        <button type="button" className={s.boutonSigner} disabled={!relu || vide || envoi || signataire.trim().length < 2} onClick={signer}>
          <Picto nom="plume" taille={20} />
          {envoi ? "Signature…" : "Signer le compte-rendu"}
        </button>
      </div>
      {erreur && (
        <p className={s.erreur} role="alert">
          {erreur}
        </p>
      )}
    </section>
  );
}
