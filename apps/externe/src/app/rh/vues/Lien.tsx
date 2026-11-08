"use client";

import { useMemo, useState } from "react";
import { cheminQr } from "@/lib/rh-qr";
import { Carte, Vide } from "../_ui/briques";
import { Picto, type NomPicto } from "../_ui/Icones";
import { nomDeFichier, telecharger } from "../calculs";

/*
 * Le lien des salariés : à copier, à ouvrir, en code QR (généré ici, sans
 * dépendance — lib/rh-qr.ts), et un e-mail prêt à envoyer.
 *
 * TEXTES À VALIDER — l'e-mail aux salariés et les trois étapes sont des
 * propositions. La phrase « un conseiller dédié reprend votre demande »
 * reprend le texte d'accueil des espaces pro (messageDe, lib/espaces.ts).
 */

const ETAPES: { picto: NomPicto; titre: string; texte: string }[] = [
  { picto: "lien", titre: "Transmettez le lien", texte: "Dans votre intranet, votre courrier de mobilité, ou sur une affiche avec le code QR." },
  { picto: "camion", titre: "Le collaborateur décrit son déménagement", texte: "En quelques minutes, depuis son téléphone ou son ordinateur. Un conseiller dédié reprend sa demande." },
  { picto: "personnes", titre: "Vous suivez chaque étape ici", texte: "De la demande au jour du déménagement, avec le budget quand votre espace le présente." },
];

export function emailSalaries(entreprise: string, lien: string) {
  return {
    objet: `Votre déménagement avec Bailly Déménagement`,
    corps: [
      "Bonjour,",
      "",
      `Dans le cadre de votre mobilité, ${entreprise} vous propose de préparer votre déménagement avec Bailly Déménagement.`,
      "",
      "Pour décrire votre déménagement, rendez-vous sur l'espace qui vous est réservé :",
      lien,
      "",
      "Quelques minutes suffisent : vos adresses, votre logement, la date souhaitée. Un conseiller dédié reprend ensuite votre demande et vous accompagne jusqu'au jour J.",
      "",
      "Bien cordialement,",
    ].join("\n"),
  };
}

export default function VueLien({ lien, entreprise }: { lien: string | null; entreprise: string }) {
  const [copie, setCopie] = useState<"lien" | "email" | null>(null);
  const qr = useMemo(() => (lien ? cheminQr(lien) : null), [lien]);
  const email = useMemo(() => (lien ? emailSalaries(entreprise, lien) : null), [lien, entreprise]);

  if (!lien || !qr || !email)
    return <Vide picto="lien" titre="Votre espace est en pause" texte="Son lien n'est pas disponible pour l'instant. Votre interlocuteur Bailly Déménagement peut le rouvrir." />;

  const copier = async (quoi: "lien" | "email", texte: string) => {
    try {
      await navigator.clipboard.writeText(texte);
    } catch {
      // Sans presse-papiers (page non sécurisée), le texte reste sélectionnable à l'écran.
    }
    setCopie(quoi);
    setTimeout(() => setCopie(null), 1800);
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.cote} ${qr.cote}" width="${qr.cote * 12}" height="${qr.cote * 12}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#ffffff"/><path d="${qr.d}" fill="#1b1a18"/></svg>`;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Carte titre="Le lien de vos salariés" sous={`Réservé aux collaborateurs de ${entreprise} : leurs demandes arrivent dans cet espace.`}>
          <div className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-paper p-2 sm:flex-row sm:items-center sm:pl-4">
            <span className="min-w-0 flex-1 break-all px-2 py-1.5 font-mono text-[13px] sm:truncate sm:break-normal sm:px-0">{lien.replace(/^https?:\/\//, "")}</span>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => copier("lien", lien)}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-brand px-4 text-[13px] font-semibold text-sur-brand transition active:scale-[0.97] sm:flex-none"
              >
                <Picto nom={copie === "lien" ? "check" : "copier"} taille={15} />
                {copie === "lien" ? "Copié" : "Copier"}
              </button>
              <a
                href={lien}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-line-strong bg-card px-4 text-[13px] font-semibold transition hover:border-ink sm:flex-none"
              >
                Ouvrir
              </a>
            </div>
          </div>

          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {ETAPES.map((e, i) => (
              <li key={e.titre} className="relative rounded-[18px] bg-subtle p-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1b1a18] text-[13px] font-bold text-brand-clair">{i + 1}</span>
                  <Picto nom={e.picto} taille={18} className="text-ink-soft" />
                </div>
                <p className="mt-3 text-[14px] font-semibold leading-snug">{e.titre}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{e.texte}</p>
              </li>
            ))}
          </ol>
        </Carte>

        <Carte titre="Code QR" sous="Pour une affiche, une note interne ou un écran d'accueil">
          <div className="flex flex-col items-center gap-4 sm:flex-row xl:flex-col">
            <div data-qr className="rounded-[20px] border border-line bg-white p-3 shadow-[0_18px_40px_-28px_rgba(27,26,24,0.5)]">
              <svg viewBox={`0 0 ${qr.cote} ${qr.cote}`} className="h-[188px] w-[188px]" shapeRendering="crispEdges" role="img" aria-label={`Code QR du lien : ${lien}`}>
                <rect width="100%" height="100%" fill="#ffffff" />
                <path d={qr.d} fill="#1b1a18" />
              </svg>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto xl:w-full">
              <button
                type="button"
                onClick={() => telecharger(svg, "image/svg+xml", `qr-espace-${nomDeFichier(entreprise)}.svg`)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#1b1a18] px-4 text-[13px] font-semibold text-white transition hover:bg-black"
              >
                <Picto nom="telecharger" taille={15} /> Télécharger (SVG)
              </button>
              <p className="text-center text-[12px] leading-snug text-ink-soft sm:text-left xl:text-center">Format vectoriel : net à toutes les tailles, de la vignette à l&apos;affiche.</p>
            </div>
          </div>
        </Carte>
      </div>

      <Carte
        titre="E-mail prêt à envoyer"
        sous="À adapter si besoin, puis à transmettre aux collaborateurs concernés"
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copier("email", `Objet : ${email.objet}\n\n${email.corps}`)}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-[13px] font-semibold text-sur-brand transition active:scale-[0.97]"
            >
              <Picto nom={copie === "email" ? "check" : "copier"} taille={15} />
              {copie === "email" ? "Copié" : "Copier le texte"}
            </button>
            <a
              href={`mailto:?subject=${encodeURIComponent(email.objet)}&body=${encodeURIComponent(email.corps)}`}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-card px-4 text-[13px] font-semibold transition hover:border-ink"
            >
              <Picto nom="mail" taille={15} /> Ouvrir dans ma messagerie
            </a>
          </div>
        }
      >
        <div className="overflow-hidden rounded-[18px] border border-line">
          <div className="flex gap-3 border-b border-line bg-subtle px-4 py-3 text-[13px]">
            <span className="text-ink-soft">Objet</span>
            <span className="font-semibold">{email.objet}</span>
          </div>
          <pre className="whitespace-pre-wrap break-words bg-card px-4 py-4 font-sans text-[13.5px] leading-relaxed text-ink">{email.corps}</pre>
        </div>
      </Carte>
    </div>
  );
}
