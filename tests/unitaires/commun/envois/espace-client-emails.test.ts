import { describe, expect, it } from "vitest";
import { rendreEmail, texteSms } from "@/lib/espace-client/emails";
import { paragraphesHtml, remplirTexte, TEXTES_ESPACE, texteEspace } from "@/lib/espace-client/textes-messages";
import { CGV, PARCOURS_SAV, RGPD, VERSIONS } from "@/lib/espace-client/textes";
import { cleCatalogue } from "@/lib/espace-client/catalogue-textes";
import { RETENTION_JOURS } from "@/lib/suivi-envois/schema";
import { URL_INTERNE } from "@/lib/adresses";
import { TEL_AGENCE } from "@/lib/messaging";

const BASE = "https://espace.bailly.fr";
const p = (h: string) => `<p>${h}</p>`;

describe("espace-client/textes-messages — remplirTexte", () => {
  it("remplace les variables, une absente reste vide", () => {
    expect(remplirTexte("Bonjour {salutation}, {absente}!", { salutation: "Madame Dumont" })).toBe("Bonjour Madame Dumont, !");
    expect(remplirTexte("{n} cartons", { n: 0 })).toBe("0 cartons");
  });

  it("ne réinterprète pas une valeur qui contient elle-même des accolades", () => {
    expect(remplirTexte("{a}", { a: "{b}", b: "x" })).toBe("{b}");
  });

  it("garde le texte brut (objet, SMS) : rien n'est échappé ici", () => {
    expect(remplirTexte("{nom}", { nom: "<b>Claire</b> & Co" })).toBe("<b>Claire</b> & Co");
  });
});

describe("espace-client/textes-messages — paragraphesHtml", () => {
  it("une ligne vide sépare deux paragraphes, un retour à la ligne devient <br>", () => {
    expect(paragraphesHtml("Un\ndeux\n\nTrois", {}, p)).toBe("<p>Un<br>deux</p><p>Trois</p>");
  });

  it("les valeurs sont en gras, sauf la salutation", () => {
    expect(paragraphesHtml("Bonjour {salutation}, {montant}", { salutation: "Madame Dumont", montant: "12 €" }, p)).toBe("<p>Bonjour Madame Dumont, <b>12 €</b></p>");
  });

  it("tout est échappé : le texte de l'équipe comme les valeurs (HTML dans un nom)", () => {
    const h = paragraphesHtml("<i>{salutation}</i> {document}", { salutation: '<img src=x onerror="alert(1)">', document: "a&b <script>" }, p);
    expect(h).toBe("<p>&lt;i&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;/i&gt; <b>a&amp;b &lt;script&gt;</b></p>");
    expect(h).not.toMatch(/<(img|script|i)\b/);
  });

  it("une variable absente disparaît", () => {
    expect(paragraphesHtml("A {x} B", {}, p)).toBe("<p>A  B</p>");
  });
});

describe("espace-client/textes-messages — le catalogue", () => {
  it("chaque texte n'emploie que les variables qu'il déclare", () => {
    for (const t of TEXTES_ESPACE) {
      const employees = [...`${t.objet ?? ""} ${t.corps}`.matchAll(/\{([a-z_]+)\}/gi)].map((x) => x[1]);
      for (const v of employees) expect(t.variables, `${t.cle} : {${v}}`).toContain(v);
    }
  });

  it("chaque clé est celle du catalogue de « Courriers et SMS » (ec_<modèle>, _sms pour un SMS)", () => {
    for (const t of TEXTES_ESPACE) expect(t.cle).toBe(cleCatalogue(t.modele, t.canal));
    expect(new Set(TEXTES_ESPACE.map((t) => t.cle)).size).toBe(TEXTES_ESPACE.length);
  });

  it("un e-mail a un objet, un SMS n'en a pas", () => {
    for (const t of TEXTES_ESPACE) expect(t.objet === null, t.cle).toBe(t.canal === "sms");
  });

  it("texteEspace retrouve un texte par modèle et canal", () => {
    expect(texteEspace("creneau_cartons", "sms")?.cle).toBe("ec_creneau_cartons_sms");
    expect(texteEspace("creneau_cartons", "email")?.cle).toBe("ec_creneau_cartons");
    expect(texteEspace("acces", "email")).toBeNull();
  });
});

describe("espace-client/emails — rendreEmail, messages au texte modifiable", () => {
  it("le texte de départ, ses variables, son bouton vers l'espace", () => {
    const r = rendreEmail("document_depose", { salutation: "Madame Dumont", document: "Attestation d'assurance", chemin: "/espace-client/BD-2026-0147/documents" }, BASE);
    expect(r.sujet).toBe("Un nouveau document a été déposé dans votre espace client");
    expect(r.html).toContain("Bonjour Madame Dumont,");
    expect(r.html).toContain("<b>Attestation d&#39;assurance</b>");
    expect(r.html).toContain(`href="${BASE}/espace-client/BD-2026-0147/documents"`);
    expect(r.html).toContain("Consulter mes documents");
    expect(r.texte).toContain(`${BASE}/espace-client/BD-2026-0147/documents`);
    expect(r.texte.endsWith("L'équipe Bailly")).toBe(true);
  });

  it("le texte réglé dans « Courriers et SMS » remplace celui de départ, la mise en page reste", () => {
    const r = rendreEmail("paiement_confirme", { salutation: "M. Roussel", montant: "900,00 €", libelle: "Arrhes", reference: "pi_1", chemin: "/x" }, BASE, { objet: "Merci pour {montant}", corps: "Reçu : {montant}." });
    expect(r.sujet).toBe("Merci pour 900,00 €");
    expect(r.html).toContain("Reçu : <b>900,00 €</b>.");
    expect(r.html).toContain("Voir mes factures");
  });

  it("un texte réglé vide garde le texte de départ ; un objet vide garde l'objet de départ", () => {
    const depart = rendreEmail("avarie_recue", { salutation: "S", numero: "SAV-1", objets: "Armoire" }, BASE);
    expect(rendreEmail("avarie_recue", { salutation: "S", numero: "SAV-1", objets: "Armoire" }, BASE, { objet: "Autre", corps: "   " }).sujet).toBe(depart.sujet);
    expect(rendreEmail("avarie_recue", { salutation: "S", numero: "SAV-1", objets: "Armoire" }, BASE, { objet: " ", corps: "Texte" }).sujet).toBe("Votre déclaration d'avarie a bien été reçue");
  });

  it("demande d'avis sans lien de dépôt : pas de bouton, une mention", () => {
    const r = rendreEmail("demande_avis", { salutation: "S", trajet: "Paris → Lyon" }, BASE);
    expect(r.sujet).toBe("Votre déménagement Paris → Lyon : votre avis compte");
    expect(r.html).toContain("Le lien de dépôt d'avis sera fourni par l'outil métier de Bailly.");
    expect(r.html).not.toContain("Donner mon avis");
    const avecLien = rendreEmail("demande_avis", { salutation: "S", trajet: "x", lien_avis: "https://g.page/r/bailly/review" }, BASE);
    expect(avecLien.html).toContain('href="https://g.page/r/bailly/review"');
  });

  it("du HTML dans le nom du client est échappé partout dans le corps ; l'objet, texte brut, le garde", () => {
    const nom = '<script>alert("x")</script>';
    const r = rendreEmail("reponse_conseiller", { salutation: nom, conseiller: nom, dossier: "BD-1", chemin: "/x" }, BASE);
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
    // Le préheader (ligne grise de la boîte) est lui aussi échappé.
    expect(r.html).toContain(`&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; vous a répondu`);
  });

  it("un lien d'avis hostile ne sort pas de son attribut", () => {
    const r = rendreEmail("demande_avis", { salutation: "S", trajet: "x", lien_avis: 'https://a.fr/"><script>x</script>' }, BASE);
    expect(r.html).not.toContain('"><script>');
    expect(r.html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("la signature du conseiller, à défaut celle de l'équipe et le standard", () => {
    expect(rendreEmail("document_depose", { salutation: "S", document: "d" }, BASE).html).toContain(TEL_AGENCE);
    const r = rendreEmail("document_depose", { salutation: "S", document: "d", signature: { nom: "Nadia <Berthier>", role: "Votre contact", telephone: "01 84 60 12 30" } }, BASE);
    expect(r.html).toContain("Nadia &lt;Berthier&gt;");
    expect(r.texte.endsWith("Nadia <Berthier>")).toBe(true);
  });
});

describe("espace-client/emails — rendreEmail, messages écrits dans le code", () => {
  it("accès : le lien personnel, l'identifiant, la durée", () => {
    const r = rendreEmail("acces", { salutation: "Madame Dumont", reference: "BD-2026-0147", lien: "https://espace.bailly.fr/connexion?jeton=SECRET", duree: 15, email: "claire@gmail.com", depart: "Paris", arrivee: "Lyon", periode: "en décembre", trajet: "Paris → Lyon" }, BASE);
    expect(r.sujet).toBe("Votre espace client Bailly est prêt · Dossier BD-2026-0147");
    expect(r.html).toContain('href="https://espace.bailly.fr/connexion?jeton=SECRET"');
    expect(r.texte).toContain("valable 15 minutes et utilisable une seule fois");
    expect(r.html).toContain("claire@gmail.com");
  });

  it("accès sans lien : la page de connexion ; sans référence, l'objet ne finit pas par un espace", () => {
    const r = rendreEmail("acces", { salutation: "S", duree: 15 }, BASE);
    expect(r.html).toContain(`href="${BASE}/espace-client/connexion"`);
    expect(r.sujet).toBe("Votre espace client Bailly est prêt · Dossier");
  });

  it("les avis à l'équipe pointent vers le back-office (app interne)", () => {
    const r = rendreEmail("cartons_demandes_equipe", { client: "Claire", reference: "BD-1", jour: "samedi 21", adresse: "12 rue", chemin: "/dashboard/espace/cartons" }, BASE);
    expect(r.html).toContain(`href="${URL_INTERNE}/dashboard/espace/cartons"`);
    expect(r.sujet).toBe("Cartons demandés — BD-1 — samedi 21");
  });

  it("le lien de désabonnement d'une alerte est échappé", () => {
    const r = rendreEmail("service_demande", { client: "C", service: "Garde-meuble", reference: "BD-1", desabonnement: 'https://crm/desabonnement/x"onmouseover="y' }, BASE);
    expect(r.html).toContain("Ne plus recevoir cette alerte");
    expect(r.html).not.toContain('x"onmouseover');
  });

  it("le message du client au conseiller est cité, échappé, et le fil du CRM proposé", () => {
    const r = rendreEmail("message_conseiller", { client: "Claire", email: "claire@gmail.com", reference: "BD-1", message: "Bonjour <b>urgent</b>\nMerci", chemin: "/dashboard/discussions/9" }, BASE);
    expect(r.html).toContain("Bonjour &lt;b&gt;urgent&lt;/b&gt;");
    expect(r.html).toContain("Répondre dans le CRM");
    expect(r.texte).toContain(`Répondre dans le CRM : ${URL_INTERNE}/dashboard/discussions/9`);
    const sansFil = rendreEmail("message_conseiller", { client: "C", email: "e", reference: "R", message: "m" }, BASE);
    expect(sansFil.html).toContain("Répondez-lui directement à son adresse e-mail.");
  });

  it("le bailleur reçoit une mention qui lui est propre, jamais celle du client", () => {
    const r = rendreEmail("avarie_bailleur", { locataire: "Fatou Diallo", reference: "BD-1", numero: "SAV-1", objets: "Table", date_constat: "12/11", adresse: "Vitry" }, BASE);
    expect(r.html).toContain("vous êtes indiqué comme bailleur du logement");
    expect(r.html).not.toContain("un dossier de déménagement est ouvert à votre nom");
  });

  it("les créneaux de visite : un par ligne, échappés", () => {
    const r = rendreEmail("creneaux_visite", { salutation: "S", conseiller: "Nadia", creneaux: ["Lundi 9 h", "<b>Mardi</b>"], chemin: "/espace-client/BD-1/visite" }, BASE);
    expect(r.sujet).toBe("Votre visite technique : 2 créneaux à choisir");
    expect(r.html).toContain("&lt;b&gt;Mardi&lt;/b&gt;");
    expect(r.texte).toContain("- Lundi 9 h\n- <b>Mardi</b>");
  });

  it("un modèle inconnu : l'objet donné, sinon le nom du modèle échappé", () => {
    expect(rendreEmail("<inconnu>", { sujet: "Objet" }, BASE).sujet).toBe("Objet");
    const r = rendreEmail("<inconnu>", {}, BASE);
    expect(r.sujet).toBe("<inconnu>");
    expect(r.html).toContain("&lt;inconnu&gt;");
  });
});

describe("espace-client/emails — texteSms", () => {
  it("le texte de départ, variables remplies, espaces resserrés", () => {
    const t = texteSms("creneau_cartons", { prenom: "Claire", nb: 20, debut: "9 h", fin: "11 h", adresse: "12 rue de la Paix", contact: "Claire", telephone: TEL_AGENCE });
    expect(t).toBe(`Bailly Déménagement : bonjour Claire, vos 20 cartons seront livrés demain entre 9 h et 11 h au 12 rue de la Paix. Présence requise : Claire. Un empêchement ? ${TEL_AGENCE}`);
  });

  it("sans prénom, pas de « undefined »", () => {
    expect(texteSms("creneau_cartons", { nb: 1 })).not.toContain("undefined");
  });

  it("le texte réglé l'emporte ; vide, celui de départ", () => {
    expect(texteSms("creneau_cartons", { nb: 3 }, "Cartons : {nb}\n\n demain")).toBe("Cartons : 3 demain");
    expect(texteSms("creneau_cartons", { nb: 3 }, "   ")).toContain("vos 3 cartons");
  });
});

describe("espace-client/textes — les textes acceptés", () => {
  it("chaque texte a une version datée, toutes distinctes", () => {
    const v = Object.values(VERSIONS);
    for (const x of v) expect(x).toMatch(/^[A-Z-]+-\d{4}\.\d+$/);
    expect(new Set(v).size).toBe(v.length);
  });

  it("la politique de confidentialité dit la mesure d'ouverture des e-mails (version 2026.2)", () => {
    expect(VERSIONS.rgpd).toBe("RGPD-2026.2");
    const mesure = RGPD.find((s) => s.titre === "Mesure d'ouverture des e-mails");
    expect(mesure?.texte).toContain("sans conserver votre adresse IP");
    expect(mesure?.texte).toContain("13 mois");
  });

  it("les « 13 mois » annoncés au client sont ceux de la conservation du suivi (RETENTION_JOURS)", () => {
    expect(Math.round(RETENTION_JOURS / (365.25 / 12))).toBe(13);
  });

  it("les CGV et le parcours du SAV sont complets (titres et textes non vides, trois étapes)", () => {
    for (const a of [...CGV, ...RGPD]) {
      expect(a.titre.trim()).not.toBe("");
      expect(a.texte.trim()).not.toBe("");
    }
    expect(PARCOURS_SAV.avec.etapes).toHaveLength(3);
    expect(PARCOURS_SAV.sans.etapes).toHaveLength(3);
  });
});
