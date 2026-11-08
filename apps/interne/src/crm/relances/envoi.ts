import "server-only";
import type { Destinataire } from "@/crm/envois";
import { entree, lignesCatalogue } from "@/crm/messages/catalogue";
import { jourParis } from "@/crm/envois";
import { relanceEspace } from "./espace";
import { relancesEtRegles } from "./moteur";
import { TEXTES_PROPOSES } from "./courrier";
import { canalEnClair, defCourrier, type Canal, type RelanceCourrier } from "./regles";

/*
 * Ce que l'écran d'envoi (PanneauEnvoi) et l'envoi à la main partagent :
 * retrouver une relance par sa clé — une relance du moteur, y compris celles
 * proposées à la main hors calendrier, ou la relance « Ce qui manque » —, et
 * dire, canal par canal, s'il peut partir et avec quel texte.
 */

/** Un canal de la relance, tel que l'écran d'envoi le montre : son texte, et s'il partira. */
export interface CanalEnvoi {
  canal: Canal;
  /**
   * pret : la carte a son texte et elle est active ;
   * vide : la carte n'a pas de texte — le texte proposé part, une fois relu ;
   * desactivee : la carte a un texte mais Bailly l'a désactivée (rien ne part) ;
   * sans_contact : pas d'adresse e-mail, ou pas de numéro, sur la fiche client.
   */
  etat: "pret" | "vide" | "desactivee" | "sans_contact";
  raison: string | null;
  /** Le texte de départ, avec ses variables : celui de la carte, ou celui proposé quand elle est vide. */
  objet: string | null;
  corps: string;
  propose: boolean;
  /** Un canal en plus, que l'équipe coche (le SMS de « Ce qui manque »). */
  optionnel: boolean;
  carte: { cle: string; titre: string; variables: string[]; active: boolean };
}

/** La relance d'une clé, avec les canaux qu'elle prendrait. Null si elle n'existe plus (réglée, partie entre-temps…). */
export async function relanceParCle(cle: string): Promise<{ r: RelanceCourrier; canaux: { canal: Canal; optionnel: boolean }[] } | null> {
  if (cle.startsWith("espace:")) {
    const r = await relanceEspace(cle.split(":")[1] ?? "");
    // Le rang a changé : une autre relance « Ce qui manque » vient de partir.
    if (!r || r.cle !== cle) return null;
    return { r, canaux: [{ canal: "email", optionnel: false }, { canal: "sms", optionnel: true }] };
  }
  const { relances, regles } = await relancesEtRegles(jourParis(), { manuelles: true });
  const r = relances.find((x) => x.cle === cle);
  if (!r) return null;
  return { r, canaux: (r.colonne === "envoyee" ? r.canaux : regles.get(r.type)!.canaux).map((canal) => ({ canal, optionnel: false })) };
}

/** Chaque canal : son état, son texte de départ, sa carte. */
export async function etatsCanaux(r: RelanceCourrier, canaux: { canal: Canal; optionnel: boolean }[], c: Pick<Destinataire, "email" | "telephone">): Promise<CanalEnvoi[]> {
  const def = defCourrier(r.type)!;
  const cartes = await lignesCatalogue();
  return canaux.map(({ canal, optionnel }) => {
    const cle = def.cartes[canal];
    const m = cartes.get(cle) ?? null;
    const e = entree(cle);
    const carte = { cle, titre: m?.nom ?? e?.titre ?? cle, variables: e?.variables ?? [], active: !!m?.actif };
    const vide = !m?.corps.trim();
    const propose = vide ? (TEXTES_PROPOSES[cle] ?? null) : null;
    const texte = { objet: propose ? propose.objet : (m?.objet ?? null), corps: propose ? propose.corps : (m?.corps ?? "") };
    const contact = canal === "email" ? c.email : c.telephone;
    if (!contact) return { canal, etat: "sans_contact", raison: canal === "email" ? "Pas d'adresse e-mail sur la fiche client." : "Pas de numéro de téléphone sur la fiche client.", ...texte, propose: !!propose, optionnel, carte };
    if (!m) return { canal, etat: "desactivee", raison: "Carte introuvable dans « Courriers et SMS ».", ...texte, propose: false, optionnel, carte };
    if (vide) {
      return propose
        ? { canal, etat: "vide", raison: null, ...texte, propose: true, optionnel, carte }
        : { canal, etat: "desactivee", raison: "Texte de la carte à rédiger dans « Courriers et SMS ».", ...texte, propose: false, optionnel, carte };
    }
    if (!m.actif) return { canal, etat: "desactivee", raison: `Carte « ${carte.titre} » (${canalEnClair(canal)}) désactivée dans « Courriers et SMS » : rien ne part par ce canal.`, ...texte, propose: false, optionnel, carte };
    return { canal, etat: "pret", raison: null, ...texte, propose: false, optionnel, carte };
  });
}
