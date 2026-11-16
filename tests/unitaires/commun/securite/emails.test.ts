import { describe, expect, it } from "vitest";
import {
  avecTeinte,
  bouton,
  carteContact,
  cartePrix,
  carteTrajet,
  echapper,
  etapes,
  listeDemandes,
  mettreEnPage,
  sousTitre,
  tableau,
} from "@/lib/email-layout";
import { habillerTexte, rendreEmail, variablesCalculees } from "@/lib/email-render";

/*
 * Le rendu des e-mails (email-render.ts, email-layout.ts) : tout ce qui vient
 * des données — le nom du client, ses villes, la référence, les textes d'un
 * espace pro — est échappé ; aucune variable ne doit pouvoir ouvrir une balise
 * ni un attribut.
 */

const P = `"><img src=x onerror=alert(1)><script>alert(2)</script><a href="javascript:alert(3)">x</a>'`;
const ECHAPPE = "&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&lt;script&gt;alert(2)&lt;/script&gt;";

/**
 * Aucune balise ni aucun attribut ne vient de la charge. Les valeurs entre guillemets sont d'abord
 * vidées : une charge échappée dans un alt="…" n'est que du texte ; une charge qui en sortirait
 * laisserait un attribut nu (onerror=, onmouseover=…) hors des guillemets.
 */
function sain(html: string) {
  const balises = html.replace(/"[^"]*"/g, '""').match(/<[a-z][^>]*>/gi) ?? [];
  expect(html).not.toMatch(/<img src=x/i);
  expect(html).not.toMatch(/<script/i);
  expect(balises.filter((b) => /\son[a-z]+\s*=/i.test(b))).toEqual([]);
  expect(html).not.toMatch(/href="javascript:/i);
}

const MODELE = {
  name: "Estimation",
  sujet: "{{titre_demande}} — {{entreprise_nom}}",
  contenu: [
    "Bonjour {{client_nom}},",
    "",
    "Votre déménagement de {{ville_depart}} vers {{ville_arrivee}}, référence {{reference}}.",
    "Le {{client_nom}} :",
    "{{bloc_recapitulatif}}",
    "{{bloc_estimation}}",
    "{{bouton_estimation}}",
    "{{bloc_suite}}",
    "{{bloc_contact}}",
  ].join("\n"),
};

describe("echapper", () => {
  it("échappe & < > et le guillemet double", () => {
    expect(echapper(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });

  it("échappe une seule fois, et convertit ce qui n'est pas une chaîne", () => {
    expect(echapper("&amp;")).toBe("&amp;amp;");
    expect(echapper(42 as unknown as string)).toBe("42");
  });

  it("laisse passer les caractères qui ne sont pas du HTML (l'apostrophe : tous les attributs sont entre guillemets doubles)", () => {
    expect(echapper("O'Neil ‮ 😀 \u0000")).toBe("O'Neil ‮ 😀 \u0000");
  });
});

describe("rendreEmail — des variables hostiles partout", () => {
  const vars = {
    client_nom: P, ville_depart: P, ville_arrivee: P, reference: P, date: P, volume: P, distance: P, formule: P,
    montant_ttc: P, montant_ht: P, validite: P, entreprise_nom: P,
    lien_estimation: "https://plateforme.test/estimation/1", lien_rappel: "https://plateforme.test/rappel/1",
    entreprise_tel: "01 69 10 35 35", entreprise_email: "contact@bailly.test",
  };

  it("ni balise ni attribut dans le HTML, la charge reste lisible en texte", () => {
    const { html } = rendreEmail(MODELE, {
      vars, lignes: [{ label: P, amount: 1_200 }], base: "https://plateforme.test", entreprise: { nom: P, email: "contact@bailly.test", tel: "01 69 10 35 35" },
      espace: { nom: P, couleur: "#0058ab", logo: null, message: `${P}\n\n${P}` },
    });
    sain(html);
    expect(html).toContain(ECHAPPE);
  });

  it("un intertitre construit sur une variable (« {{client_nom}} : ») est échappé lui aussi", () => {
    const { html } = rendreEmail({ name: "x", sujet: "x", contenu: "{{client_nom}} :" }, { vars: { client_nom: P } });
    sain(html);
  });

  it("le mot d'accueil d'un espace pro et son objet sont échappés", () => {
    const { html, sujet } = rendreEmail({ name: "x", sujet: "x", contenu: "Bonjour {{client_nom}}," }, {
      vars: { client_nom: "Jean" }, espace: { nom: "Carrefour", couleur: "#0058ab", message: P, objet: `Objet ${P}` },
    });
    sain(html);
    expect(sujet).toBe(`Objet ${P}`);
  });

  it("une variable qui contient un jeton de bloc ou de variable n'est pas réinterprétée", () => {
    const { html } = rendreEmail({ name: "x", sujet: "Bonjour {{client_nom}}", contenu: "Bonjour {{client_nom}},\n\nDe {{ville_depart}}." }, {
      vars: { client_nom: "{{lien_estimation}}", ville_depart: "{{bloc_contact}}", lien_estimation: "https://evil.test", entreprise_tel: "06 00 00 00 00" },
    });
    expect(html).toContain("{{lien_estimation}}");
    expect(html).toContain("{{bloc_contact}}");
    expect(html).not.toContain("https://evil.test");
    expect(html).not.toContain("Un conseiller vous répond");
  });

  it("l'objet est du texte : il n'est pas passé en HTML, et l'en-tête le reprend échappé", () => {
    const { sujet, html } = rendreEmail({ name: "x", sujet: "Votre devis {{reference}}", contenu: "Bonjour," }, { vars: { reference: "<b>BD-1</b>" } });
    expect(sujet).toBe("Votre devis <b>BD-1</b>");
    expect(html).toContain("<title>Votre devis &lt;b&gt;BD-1&lt;/b&gt;</title>");
    expect(html).not.toContain("<b>BD-1</b>");
  });

  it("la ligne d'aperçu est échappée et bornée à 140 caractères", () => {
    const { html } = rendreEmail({ name: "x", sujet: "x", contenu: `Bonjour,\n\n${"<i>".repeat(100)}` }, { vars: {} });
    const apercu = /<div style="display:none;[^"]*">([^<]*)<\/div>/.exec(html)?.[1] ?? "";
    expect(apercu).toBe("&lt;i&gt;".repeat(46) + "&lt;i");
  });

  it("une variable de 100 000 caractères se rend sans erreur, échappée", () => {
    const { html } = rendreEmail({ name: "x", sujet: "x", contenu: "Bonjour {{client_nom}}," }, { vars: { client_nom: "<".repeat(100_000) } });
    expect(html).not.toMatch(/<{2}/);
  });

  it("titre_demande suit l'existence d'une estimation, sans écraser une valeur fournie", () => {
    expect(variablesCalculees({}).titre_demande).toBe("Nous avons bien reçu votre demande");
    expect(variablesCalculees({ montant_ttc: 3_468 }).titre_demande).toBe("Votre estimation de déménagement");
    expect(variablesCalculees({ titre_demande: "Autre" }).titre_demande).toBe("Autre");
  });

  it("habillerTexte : le texte libre de l'équipe est échappé, sans variable interprétée", () => {
    const html = habillerTexte("Objet", `Bonjour,\n\n${P}\n{{bloc_contact}}`, { entreprise: { nom: "Bailly" } });
    sain(html);
  });

  // Le téléphone et l'e-mail des réglages de l'équipe, posés dans href="tel:…" et href="mailto:…",
  // n'ouvrent jamais d'attribut : le numéro ne garde que ses chiffres, l'adresse est encodée.
  it("le téléphone et l'e-mail de l'entreprise ne peuvent pas ouvrir un attribut", () => {
    const { html } = rendreEmail({ name: "x", sujet: "x", contenu: "{{bloc_contact}}" }, {
      vars: { entreprise_tel: `01 69" onmouseover="alert(1)`, entreprise_email: `c@b.fr" onmouseover="alert(2)` },
      entreprise: { tel: `01 69" onmouseover="alert(1)`, email: `c@b.fr" onmouseover="alert(2)` },
    });
    expect(html).not.toMatch(/<a [^>]*onmouseover=/);
  });
});

describe("les briques de la mise en page", () => {
  it("échappent tout le texte qu'elles reçoivent", () => {
    sain(sousTitre(P));
    sain(bouton(P, "https://plateforme.test/x"));
    sain(tableau([[P, P]], { total: [P, P] }));
    sain(carteTrajet({ depart: P, arrivee: P, reperes: [[P, P], [P, P], [P, P]] }));
    sain(carteTrajet({ arrivee: P, reperes: [] }));
    sain(cartePrix({ lignes: [[P, P]], ht: P, ttc: P, validite: P }));
    sain(etapes([[P, P]]));
    sain(carteContact({ tel: "01 69 10 35 35", mail: "contact@bailly.test" }));
    sain(
      listeDemandes({
        surtitre: P, titre: P, compte: { n: 2, mot: P }, echeance: P, progression: { n: 1, sur: 3, texte: P }, intro: P,
        elements: [{ titre: P, detail: P, valeur: P, lien: { url: "https://plateforme.test/d", libelle: P } }], total: [P, P], action: { libelle: P, url: "https://plateforme.test/a" }, note: P,
      }),
    );
  });

  it("mettreEnPage échappe le titre, l'aperçu, le surtitre, les repères, l'enseigne et le nom de l'entreprise", () => {
    const html = mettreEnPage({
      titre: P, corps: "<p>corps</p>", apercu: P, base: "https://plateforme.test", entreprise: { nom: P, tel: "01 69 10 35 35", email: "contact@bailly.test" },
      surtitre: P, puces: [P, P], marque: { nom: P, logo: null },
    });
    sain(html);
    expect(html).toContain(`alt="${echapper(P)}"`);
  });

  it("le corps, déjà en HTML, passe tel quel (c'est à l'appelant de l'avoir échappé)", () => {
    expect(mettreEnPage({ titre: "t", corps: "<p>ok</p>" })).toContain("<p>ok</p>");
  });
});

describe("avecTeinte — la couleur d'un espace pro", () => {
  const COULEURS_HEX = /(?:bgcolor="|background:|color:)(#[0-9a-f]{6})/g;

  it.each([
    "red;background:url(javascript:alert(1))",
    '#0058ab" onload="alert(1)',
    "expression(alert(1))",
    "#zzzzzz",
    "",
  ])("une couleur hostile ou invalide retombe sur le jaune Bailly : %j", (couleur) => {
    const html = avecTeinte(couleur, () => bouton("Voir", "https://plateforme.test"));
    expect(html).toContain("#f5d033");
    expect(html).not.toMatch(/javascript|onload|expression/);
  });

  it("une couleur valide ne pose que des codes hexadécimaux", () => {
    const html = avecTeinte(" #0058AB ", () => bouton("Voir", "https://plateforme.test") + sousTitre("x"));
    expect([...html.matchAll(COULEURS_HEX)].length).toBeGreaterThan(0);
    expect(html).toContain("#0058ab");
    expect(html).not.toContain("#f5d033");
  });

  it("la teinte est remise en place à la sortie, même après une erreur", () => {
    expect(() => avecTeinte("#0058ab", () => {
      throw new Error("x");
    })).toThrow("x");
    expect(bouton("Voir", "https://plateforme.test")).toContain("#f5d033");
  });
});
