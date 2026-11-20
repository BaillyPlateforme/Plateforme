"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { choisirParLien, envoyerLienMotDePasse } from "@/lib/equipe/lien-mot-de-passe";
import { emailValide } from "@/lib/envois/garde-fous";
import { adresseIp, fenetres, reserver, type Refus } from "@/lib/limites";
import { createAuthClient } from "@/lib/supabase/auth";

/*
 * Les deux actions des pages « Mot de passe oublié » : ouvertes sans session
 * (le proxy laisse passer /login/…), donc plafonnées par adresse IP — et la
 * demande, aussi par adresse e-mail, pour qu'on ne puisse pas noyer une
 * boîte de liens.
 */

export type EtatDemande = { ok: true } | { ok?: false; erreur: string } | null;
export type EtatChoix = { ok?: false; erreur: string; lienPerdu?: boolean } | null;

const attente = (r: Refus) => {
  const minutes = Math.ceil(r.dans / 60);
  return minutes <= 1 ? "dans une minute" : minutes < 60 ? `dans ${minutes} minutes` : `dans ${Math.ceil(minutes / 60)} heure${minutes > 60 ? "s" : ""}`;
};

export async function demanderLien(_avant: EtatDemande, form: FormData): Promise<EtatDemande> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  if (!emailValide(email)) return { erreur: "Saisissez une adresse e-mail valide." };
  const ip = adresseIp(await headers());
  const refus = reserver([
    { cle: `mot-de-passe:ip:${ip}`, fenetres: fenetres("MOT_DE_PASSE_LIEN", { minute: 3, heure: 10, jour: 20 }) },
    { cle: `mot-de-passe:adresse:${email}`, fenetres: fenetres("MOT_DE_PASSE_LIEN_ADRESSE", { minute: 1, heure: 3, jour: 6 }) },
  ]);
  if (refus) return { erreur: `Trop de demandes pour le moment : réessayez ${attente(refus)}.` };
  // Après la réponse : qu'une adresse soit celle d'un compte ou non, la page répond la même chose, dans le même temps.
  after(() =>
    envoyerLienMotDePasse(email).catch((e) => console.error("Mot de passe : lien non envoyé", e instanceof Error ? e.message : e)),
  );
  return { ok: true };
}

export async function choisirMotDePasse(_avant: EtatChoix, form: FormData): Promise<EtatChoix> {
  const ip = adresseIp(await headers());
  const refus = reserver([{ cle: `mot-de-passe:choix:${ip}`, fenetres: fenetres("MOT_DE_PASSE_CHOIX", { minute: 5, heure: 20, jour: 50 }) }]);
  if (refus) return { erreur: `Trop d'essais pour le moment : réessayez ${attente(refus)}.` };

  const nouveau = String(form.get("nouveau") ?? "");
  const r = await choisirParLien(String(form.get("jeton") ?? ""), nouveau, String(form.get("confirmation") ?? ""));
  if (!r.ok) return { erreur: r.erreur, lienPerdu: r.lienPerdu };

  // Le mot de passe est enregistré : on ouvre la session tout de suite, sans repasser par la connexion.
  const { error } = await (await createAuthClient()).auth.signInWithPassword({ email: r.email, password: nouveau });
  redirect(error ? "/login?mot-de-passe=1" : "/");
}
