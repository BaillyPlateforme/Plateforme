"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icone } from "./Icone";

/** Les messages qu'une action renvoie par l'adresse (`?ok=…`), après une redirection. */
const MESSAGES: Record<string, string> = {
  conditions: "Conditions de livraison validées : l'étape est cochée dans votre frise.",
  valeurs: "Déclaration de valeurs envoyée : l'étape est cochée dans votre frise.",
  cgv: "Acceptations enregistrées et horodatées.",
  piece: "Document bien reçu, merci.",
  cartons: "Livraison de cartons confirmée : l'équipe Bailly est prévenue.",
  "sans-cartons": "C'est noté : l'étape « Cartons » est cochée dans votre frise.",
  avarie: "Déclaration d'avarie enregistrée : votre conseiller est prévenu.",
  paiement: "Paiement reçu, merci ! Votre frise est à jour.",
  "paiement-annule": "Paiement annulé : aucun montant n'a été débité.",
  "devis-signe": "Devis signé : votre acceptation est horodatée.",
  message: "Message envoyé à votre conseiller.",
  service: "Demande transmise à votre conseiller.",
  bienvenue: "Bienvenue dans votre espace client.",
  // La visite technique.
  "visite-reservee": "Visite réservée : votre conseiller l'a dans son planning.",
  "visite-demande": "Demande transmise à votre conseiller : il vous propose d'autres créneaux.",
};

/**
 * Le toast de la micro démo. Il lit le message dans l'adresse, puis la
 * nettoie : un rechargement de la page ne le refait pas apparaître.
 */
export function Toast() {
  const params = useSearchParams();
  const chemin = usePathname();
  const router = useRouter();
  const cle = params.get("ok");
  const [affiche, setAffiche] = useState<{ cle: string; chemin: string } | null>(null);
  const [precedente, setPrecedente] = useState<string | null>(null);

  // Une nouvelle clé dans l'adresse : on la retient le temps de l'afficher,
  // même après l'avoir retirée de l'adresse — sur cette page seulement.
  if (cle !== precedente) {
    setPrecedente(cle);
    if (cle && MESSAGES[cle]) setAffiche({ cle, chemin });
  }

  useEffect(() => {
    if (!cle) return;
    const reste = new URLSearchParams(params.toString());
    reste.delete("ok");
    const q = reste.toString();
    router.replace(`${chemin}${q ? `?${q}` : ""}${window.location.hash}`, { scroll: false });
  }, [cle, chemin, params, router]);

  useEffect(() => {
    if (!affiche) return;
    const t = setTimeout(() => setAffiche(null), 4500);
    return () => clearTimeout(t);
  }, [affiche]);

  if (!affiche || affiche.chemin !== chemin) return null;
  return (
    <div className="toast" role="status">
      <Icone nom="check" />
      <span>{MESSAGES[affiche.cle]}</span>
    </div>
  );
}
