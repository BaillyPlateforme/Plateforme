import { beforeEach, describe, expect, it, vi } from "vitest";
import { fausseBase } from "./_outils";

/*
 * Les modules de la messagerie des questionnaires : messaging.ts (variables,
 * pièce jointe), email-defauts.ts (les modèles livrés), emails.ts et
 * templates.ts (lectures simples).
 */

const m = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => m.client }));

import { contexteDemande, eventLabel, MESSAGE_EVENTS, pieceJointeDuModele, renderTemplate, TEL_AGENCE, TEL_AGENCE_LIEN, TEMPLATE_VARIABLES } from "@/lib/messaging";
import { modeleEffectif } from "@/lib/email-defauts";
import { EMAIL_TEMPLATES, listEmails } from "@/lib/emails";
import { listTemplates } from "@/lib/templates";

const ANCIEN_ACCUSE = `Bonjour {{client_nom}},

Nous vous confirmons la bonne réception de votre demande de déménagement de {{ville_depart}} vers {{ville_arrivee}}.

Notre équipe étudie votre projet et revient vers vous dans les plus brefs délais avec une estimation personnalisée.

À très bientôt,
L'équipe {{entreprise_nom}}`;

const ANCIEN_DEVIS = `Bonjour {{client_nom}},

Nous avons le plaisir de vous adresser votre devis pour le déménagement de {{ville_depart}} vers {{ville_arrivee}}.

Référence : {{reference}}
Montant : {{montant_ttc}} € TTC ({{montant_ht}} € HT)
Volume estimé : ~{{volume}} m³
Date souhaitée : {{date}}

Ce devis reste à votre disposition. N'hésitez pas à nous contacter pour toute question ou ajustement.

Bien cordialement,
L'équipe {{entreprise_nom}}`;

const tpl = (contenu: string, champs: Record<string, unknown> = {}) => ({ channel: "email", sujet: "Ancien objet", contenu, options: null as unknown, ...champs }) as { channel: string; sujet: string | null; contenu: string; options?: { piece_jointe?: "estimation" | null } | null };

describe("messaging — renderTemplate", () => {
  it("remplace {{variable}}, espaces intérieurs compris ; une absente devient vide", () => {
    expect(renderTemplate("Bonjour {{client_nom}}, {{ ville_depart }} → {{absente}}.", { client_nom: "Claire", ville_depart: "Paris" })).toBe("Bonjour Claire, Paris → .");
  });

  it("rend les nombres, les booléens et zéro", () => {
    expect(renderTemplate("{{a}}/{{b}}/{{c}}/{{d}}", { a: 0, b: false, c: 12.5, d: null })).toBe("0/false/12.5/");
  });

  it("ne réinterprète pas une valeur qui contient des accolades (pas d'injection de variable)", () => {
    expect(renderTemplate("{{client_nom}}", { client_nom: "{{lien_completion}}", lien_completion: "https://pirate" })).toBe("{{lien_completion}}");
  });

  it("n'échappe rien : c'est au rendu HTML de le faire", () => {
    expect(renderTemplate("{{client_nom}}", { client_nom: "<b>x</b>" })).toBe("<b>x</b>");
  });

  it("laisse intactes les accolades simples et les jetons mal formés", () => {
    expect(renderTemplate("{client_nom} {{client-nom}} {{}}", { client_nom: "x" })).toBe("{client_nom} {{client-nom}} {{}}");
  });
});

describe("messaging — pieceJointeDuModele", () => {
  it("un choix explicite de l'équipe gagne toujours, même « aucune »", () => {
    expect(pieceJointeDuModele({ contenu: "{{bloc_estimation}}", options: { piece_jointe: null } })).toBeNull();
    expect(pieceJointeDuModele({ contenu: "rien", options: { piece_jointe: "estimation" } })).toBe("estimation");
  });

  it("sans choix, un message qui montre l'estimation la joint", () => {
    expect(pieceJointeDuModele({ contenu: "a\n{{ bloc_estimation }}\nb" })).toBe("estimation");
    expect(pieceJointeDuModele({ contenu: "{{bouton_estimation}}", options: null })).toBeNull();
    expect(pieceJointeDuModele({ contenu: "x", options: {} })).toBeNull();
  });
});

describe("messaging — constantes et contexte", () => {
  it("le standard de l'agence et son lien tel:", () => {
    expect(TEL_AGENCE).toBe("01 69 10 35 35");
    expect(TEL_AGENCE_LIEN).toBe("tel:+33169103535");
  });

  it("contexteDemande : la date du calendrier, sinon la période dite par le client", () => {
    expect(contexteDemande({ depart_ville: "Paris", arrivee_ville: "Lyon", volume_m3: 30, date_souhaitee: null, flexibilite: "fin mars", distance_km: 465, formule: "eco" })).toEqual({
      ville_depart: "Paris", ville_arrivee: "Lyon", volume: 30, date: "fin mars", distance: 465, formule: "eco",
    });
    expect(contexteDemande({ date_souhaitee: "2026-12-05", flexibilite: "fin mars" }).date).toBe("2026-12-05");
    expect(contexteDemande({})).toEqual({ ville_depart: null, ville_arrivee: null, volume: null, date: null, distance: null, formule: null });
  });

  it("eventLabel : le libellé, sinon la clé", () => {
    expect(eventLabel("devis_cree")).toBe("Devis créé");
    expect(eventLabel("inconnu")).toBe("inconnu");
    expect(new Set(MESSAGE_EVENTS.map((e) => e.key)).size).toBe(MESSAGE_EVENTS.length);
  });

  it("les variables proposées à l'équipe sont toutes au format {{nom}}", () => {
    for (const v of TEMPLATE_VARIABLES) expect(v.token).toMatch(/^\{\{[a-z_]+\}\}$/);
  });
});

describe("email-defauts — modeleEffectif", () => {
  it("un message resté MOT POUR MOT à son texte d'origine part dans sa version complète", () => {
    const r = modeleEffectif(tpl(ANCIEN_ACCUSE));
    expect(r.sujet).toBe("{{titre_demande}} — {{entreprise_nom}}");
    expect(r.contenu).toContain("{{bloc_recapitulatif}}");
    expect(r.contenu).toContain("{{bloc_estimation}}");
  });

  it("aux espaces et aux apostrophes près", () => {
    const variante = `  ${ANCIEN_ACCUSE.replace(/'/g, "’").replace(/\n\n/g, "\n   \n")}  `;
    expect(modeleEffectif(tpl(variante)).contenu).toContain("{{bloc_recapitulatif}}");
  });

  it("une virgule changée : c'est le texte de l'équipe qui part, tel quel", () => {
    const modifie = ANCIEN_ACCUSE.replace("À très bientôt,", "À très bientôt !");
    const t = tpl(modifie);
    expect(modeleEffectif(t)).toBe(t);
  });

  it("un SMS n'est jamais remplacé", () => {
    const t = tpl(ANCIEN_ACCUSE, { channel: "sms" });
    expect(modeleEffectif(t)).toBe(t);
  });

  it("le devis joint l'estimation par défaut ; un réglage explicite de l'équipe reste le sien", () => {
    expect(modeleEffectif(tpl(ANCIEN_DEVIS)).options).toEqual({ piece_jointe: "estimation" });
    expect(modeleEffectif(tpl(ANCIEN_DEVIS, { options: { piece_jointe: null } })).options).toEqual({ piece_jointe: null });
    expect(modeleEffectif(tpl(ANCIEN_ACCUSE, { options: { piece_jointe: "estimation" } })).options).toEqual({ piece_jointe: "estimation" });
  });

  it("ne modifie pas le modèle reçu", () => {
    const t = tpl(ANCIEN_ACCUSE);
    const copie = structuredClone(t);
    modeleEffectif(t);
    expect(t).toEqual(copie);
  });

  it("chaque version complète n'emploie que des variables et des blocs connus", () => {
    const connus = new Set([
      ...TEMPLATE_VARIABLES.map((v) => v.token.slice(2, -2)),
      "titre_demande", "bloc_recapitulatif", "bloc_estimation", "bouton_estimation", "bouton_completer", "bloc_suite", "bloc_contact",
    ]);
    for (const ancien of [ANCIEN_ACCUSE, ANCIEN_DEVIS]) {
      const r = modeleEffectif(tpl(ancien));
      for (const [, v] of `${r.sujet} ${r.contenu}`.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) expect(connus, v).toContain(v);
    }
  });
});

describe("emails et templates — lectures", () => {
  let base: ReturnType<typeof fausseBase>;
  beforeEach(() => {
    base = fausseBase((r) => (r.table === "emails" ? { data: [{ id: "e1" }] } : { data: null }));
    m.client = base.client;
  });

  it("listEmails : les plus récents d'abord", async () => {
    expect(await listEmails()).toEqual([{ id: "e1" }]);
    expect(base.requetes[0].filtres).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("listTemplates : dans l'ordre de création ; rien en base → liste vide", async () => {
    expect(await listTemplates()).toEqual([]);
    expect(base.requetes[0]).toMatchObject({ table: "message_templates", action: "select" });
    expect(base.requetes[0].filtres).toContainEqual(["order", "created_at", { ascending: true }]);
  });

  it("les modèles d'e-mails prêts à l'emploi : clés uniques, un « message libre » vide", () => {
    expect(new Set(EMAIL_TEMPLATES.map((t) => t.key)).size).toBe(EMAIL_TEMPLATES.length);
    expect(EMAIL_TEMPLATES.find((t) => t.key === "libre")).toMatchObject({ sujet: "", corps: "" });
  });
});
