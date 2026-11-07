"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { TEL_AGENCE, TEL_AGENCE_LIEN } from "@/lib/messaging";

const delai = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/**
 * Le client a cliqué sur « Je souhaite être rappelé » dans son message ou
 * dans son estimation en PDF : c'est ce clic qui confirme son intérêt.
 *
 * La demande part à l'ouverture de la page, depuis le navigateur — pas au
 * chargement côté serveur : les messageries ouvrent d'elles-mêmes les liens
 * qu'elles reçoivent pour les vérifier, et chacune de ces visites aurait
 * inscrit un rappel que personne n'a demandé.
 */
export default function DemandeRappel({ requestId }: { requestId: string }) {
  const [etat, setEtat] = useState<"envoi" | "fait" | "echec">("envoi");
  const lance = useRef(false);

  const demander = useCallback(async () => {
    try {
      const res = await fetch("/api/rappels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId }),
      });
      setEtat(res.ok ? "fait" : "echec");
    } catch {
      setEtat("echec");
    }
  }, [requestId]);

  useEffect(() => {
    // Une seule fois : en développement, React monte la page deux fois.
    if (lance.current) return;
    lance.current = true;
    void demander();
  }, [demander]);

  const titre =
    etat === "fait" ? (
      <>
        C&apos;est bien <span className="gradient-text">noté</span>
      </>
    ) : etat === "echec" ? (
      <>
        Votre demande n&apos;est pas <span className="gradient-text">partie</span>
      </>
    ) : (
      <>
        Un <span className="gradient-text">instant</span>…
      </>
    );

  const texte =
    etat === "fait"
      ? "Un conseiller vous rappelle au plus vite pour finaliser votre estimation avec vous."
      : etat === "echec"
        ? "Nous n'avons pas pu enregistrer votre demande de rappel. Réessayez, ou appelez-nous directement."
        : "Nous enregistrons votre demande de rappel.";

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-paper px-6 py-16 text-ink">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="halo absolute left-1/2 top-1/2 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2"
          style={{ "--halo": "color-mix(in srgb, var(--color-brand) 30%, transparent)" } as CSSProperties}
        />
      </div>

      <div className="relative z-10 w-full max-w-lg text-center">
        <Image
          src="/marque/bailly-logo.svg"
          alt="Bailly Déménagement"
          width={200}
          height={64}
          priority
          className="mx-auto h-auto w-[160px]"
        />
        <p className="eyebrow reveal mt-10 text-brand-ink">Être rappelé</p>
        <h1 role="status" className="font-serif reveal mt-4 text-balance text-[36px] sm:text-[46px]" style={delai(80)}>
          {titre}
        </h1>
        <p className="reveal mx-auto mt-4 max-w-[46ch] text-[15.5px] leading-relaxed text-ink-soft" style={delai(160)}>
          {texte}
        </p>
        <div className="reveal mt-9 flex flex-wrap justify-center gap-3" style={delai(240)}>
          {etat === "echec" && (
            <button
              type="button"
              onClick={() => {
                setEtat("envoi");
                void demander();
              }}
              className="inline-flex h-12 items-center rounded-full bg-ink px-6 text-[14.5px] font-semibold text-shell transition active:scale-[0.98]"
            >
              Réessayer
            </button>
          )}
          <a
            href={TEL_AGENCE_LIEN}
            className="inline-flex h-12 items-center rounded-full border border-line-strong bg-card px-6 text-[14.5px] font-semibold transition hover:border-ink"
          >
            {TEL_AGENCE}
          </a>
        </div>
      </div>
    </div>
  );
}
