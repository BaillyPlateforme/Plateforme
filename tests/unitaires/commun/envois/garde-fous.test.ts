import { describe, expect, it } from "vitest";
import {
  dansLaListe,
  decider,
  emailValide,
  estAdresseFictive,
  lireListe,
  lireReglage,
  MOTIFS,
  normaliserTelephone,
  telephoneValide,
  type ReglageEnvois,
} from "@/lib/envois/garde-fous";

const reglage = (env: Record<string, string | undefined>): ReglageEnvois => lireReglage(env);

describe("envois/garde-fous — normaliserTelephone", () => {
  it("ramène les écritures françaises au format attendu par Brevo (33…)", () => {
    expect(normaliserTelephone("06 12 34 56 78")).toBe("33612345678");
    expect(normaliserTelephone("06.12.34.56.78")).toBe("33612345678");
    expect(normaliserTelephone("06-12-34-56-78")).toBe("33612345678");
    expect(normaliserTelephone("+33 6 12 34 56 78")).toBe("33612345678");
    expect(normaliserTelephone("0033 6 12 34 56 78")).toBe("33612345678");
    expect(normaliserTelephone("33612345678")).toBe("33612345678");
  });

  it("laisse un numéro étranger tel quel, sans indicatif ajouté", () => {
    expect(normaliserTelephone("+1 514 555 0199")).toBe("15145550199");
    expect(normaliserTelephone("0041 22 555 01 99")).toBe("41225550199");
  });

  it("ne transforme pas un numéro à 10 chiffres qui ne commence pas par 0", () => {
    expect(normaliserTelephone("1234567890")).toBe("1234567890");
  });

  it("supporte une valeur vide ou absente sans lever", () => {
    expect(normaliserTelephone("")).toBe("");
    expect(normaliserTelephone(undefined as unknown as string)).toBe("");
    expect(normaliserTelephone(null as unknown as string)).toBe("");
  });

  it("supprime un « + » au milieu du numéro (deux numéros collés ne se fondent pas en un numéro valide)", () => {
    expect(telephoneValide("+33612345678+33700000000")).toBe(false);
  });
});

describe("envois/garde-fous — telephoneValide et emailValide", () => {
  it("accepte un numéro de 8 à 15 chiffres une fois normalisé", () => {
    expect(telephoneValide("06 12 34 56 78")).toBe(true);
    expect(telephoneValide("12345678")).toBe(true); // 8 chiffres : la borne basse
    expect(telephoneValide("123456789012345")).toBe(true); // 15 chiffres : la borne haute
  });

  it("refuse les numéros trop courts, trop longs ou vides", () => {
    expect(telephoneValide("1234567")).toBe(false); // 7 chiffres
    expect(telephoneValide("1234567890123456")).toBe(false); // 16 chiffres
    expect(telephoneValide("")).toBe(false);
    expect(telephoneValide("pas un numéro")).toBe(false);
  });

  it("refuse deux numéros dans le même champ", () => {
    expect(telephoneValide("06 12 34 56 78, 07 11 22 33 44")).toBe(false);
    expect(telephoneValide("0612345678;0711223344")).toBe(false);
  });

  it("accepte une adresse e-mail ordinaire, espaces autour compris", () => {
    expect(emailValide("claire@bailly.fr")).toBe(true);
    expect(emailValide("  claire.dumont+devis@bailly.fr  ")).toBe(true);
  });

  it("refuse une adresse vide, sans @, sans domaine ou sans extension", () => {
    expect(emailValide("")).toBe(false);
    expect(emailValide("claire")).toBe(false);
    expect(emailValide("claire@")).toBe(false);
    expect(emailValide("claire@bailly")).toBe(false);
    expect(emailValide("@bailly.fr")).toBe(false);
    expect(emailValide(undefined as unknown as string)).toBe(false);
  });

  it("refuse plusieurs destinataires dans le même champ", () => {
    expect(emailValide("a@bailly.fr, b@bailly.fr")).toBe(false);
    expect(emailValide("a@bailly.fr,b@bailly.fr")).toBe(false);
    expect(emailValide("a@bailly.fr;b@bailly.fr")).toBe(false);
    expect(emailValide("a@bailly.fr@pirate.com")).toBe(false);
  });

  it("refuse une adresse portant un retour à la ligne (injection d'en-tête)", () => {
    expect(emailValide("victime@bailly.fr\r\nBcc: pirate@exemple.com")).toBe(false);
    expect(emailValide("victime@bailly.fr\nBcc:pirate@pirate.com")).toBe(false);
    expect(emailValide("victime@bailly.fr\tx")).toBe(false);
  });
});

describe("envois/garde-fous — estAdresseFictive", () => {
  it("reconnaît les domaines réservés aux exemples (RFC 2606 et 6761)", () => {
    for (const a of ["x@example.com", "x@example.org", "x@example.net", "x@site.example", "x@a.b.test", "x@machine.localhost"]) {
      expect(estAdresseFictive(a), a).toBe(true);
    }
  });

  it("reconnaît les domaines du jeu de démonstration (.exemple, exemple.fr)", () => {
    expect(estAdresseFictive("claire@exemple.fr")).toBe(true);
    expect(estAdresseFictive("claire@bailly.exemple")).toBe(true);
  });

  it("ignore la casse et les espaces autour", () => {
    expect(estAdresseFictive("  Claire.Dumont@EXAMPLE.COM ")).toBe(true);
  });

  it("ne tient pas pour fictive une vraie adresse, même si le mot « example » y figure", () => {
    expect(estAdresseFictive("example@gmail.com")).toBe(false);
    expect(estAdresseFictive("x@example.com.pirate.fr")).toBe(false);
    expect(estAdresseFictive("x@monexample.com")).toBe(false);
    expect(estAdresseFictive("x@bailly.fr")).toBe(false);
    expect(estAdresseFictive("")).toBe(false);
  });
});

describe("envois/garde-fous — lireListe", () => {
  it("sépare par virgules, points-virgules et retours à la ligne", () => {
    const l = lireListe("david@bailly.fr, @mindeon.ai;06 12 34 56 78\n+33 7 11 22 33 44");
    expect(l.emails).toEqual(["david@bailly.fr"]);
    expect(l.domaines).toEqual(["mindeon.ai"]);
    expect(l.telephones).toEqual(["33612345678", "33711223344"]);
  });

  it("met en minuscules et ignore les morceaux vides", () => {
    expect(lireListe(" ,, David@Bailly.FR ;; ").emails).toEqual(["david@bailly.fr"]);
  });

  it("n'autorise rien avec ce qui n'est ni adresse, ni domaine, ni numéro valide", () => {
    const l = lireListe("@, @x, n'importe quoi, 123");
    expect(l.domaines).toEqual([]);
    expect(l.telephones).toEqual([]);
    for (const d of ["x@x.fr", "n'importe@quoi.fr", "a@x"]) expect(dansLaListe(l, "email", d), d).toBe(false);
    expect(dansLaListe(l, "sms", "123")).toBe(false);
  });

  it("rend une liste vide sans variable", () => {
    expect(lireListe(undefined)).toEqual({ emails: [], domaines: [], telephones: [] });
  });
});

describe("envois/garde-fous — lireReglage (ENVOI_MODE)", () => {
  it("sans variable : désactivé, sans avertissement", () => {
    const r = reglage({});
    expect(r.mode).toBe("desactive");
    expect(r.avertissements).toEqual([]);
    expect(r.bacASable).toBe(false);
  });

  it("« actif » et « recette » sont reconnus, casse, espaces et accents compris", () => {
    expect(reglage({ ENVOI_MODE: "actif" }).mode).toBe("actif");
    expect(reglage({ ENVOI_MODE: "  ACTIF " }).mode).toBe("actif");
    expect(reglage({ ENVOI_MODE: "recette" }).mode).toBe("recette");
    expect(reglage({ ENVOI_MODE: "Récette" }).mode).toBe("recette");
  });

  it("une valeur inconnue désactive l'envoi, avec un avertissement", () => {
    for (const v of ["active", "on", "true", "1", "oui", "prod", "actif;", "actif recette"]) {
      const r = reglage({ ENVOI_MODE: v });
      expect(r.mode, v).toBe("desactive");
      expect(r.avertissements.some((a) => a.includes("n'est pas reconnu")), v).toBe(true);
    }
  });

  it("« desactive », « désactivé », « off » et « 0 » désactivent sans avertissement", () => {
    for (const v of ["desactive", "désactive", "off", "0", "OFF"]) {
      const r = reglage({ ENVOI_MODE: v });
      expect(r.mode, v).toBe("desactive");
      expect(r.avertissements, v).toEqual([]);
    }
  });

  it("avertit d'une recette sans liste blanche", () => {
    const r = reglage({ ENVOI_MODE: "recette" });
    expect(r.avertissements).toContain("Recette sans liste blanche (ENVOI_DESTINATAIRES_AUTORISES) : aucun destinataire n'est autorisé.");
  });

  it("avertit qu'une liste blanche ne vaut rien en mode actif", () => {
    const r = reglage({ ENVOI_MODE: "actif", ENVOI_DESTINATAIRES_AUTORISES: "david@bailly.fr" });
    expect(r.avertissements.some((a) => a.includes("ne vaut qu'en recette"))).toBe(true);
  });

  it("signale l'ancienne variable ESPACE_CLIENT_ENVOI, qui n'est plus lue", () => {
    const r = reglage({ ESPACE_CLIENT_ENVOI: "actif" });
    expect(r.mode).toBe("desactive");
    expect(r.avertissements.some((a) => a.includes("ESPACE_CLIENT_ENVOI"))).toBe(true);
  });

  it("le bac à sable ne s'ouvre qu'avec ENVOI_BAC_A_SABLE=1 exactement", () => {
    expect(reglage({ ENVOI_BAC_A_SABLE: "1" }).bacASable).toBe(true);
    expect(reglage({ ENVOI_BAC_A_SABLE: "true" }).bacASable).toBe(false);
    expect(reglage({ ENVOI_BAC_A_SABLE: "0" }).bacASable).toBe(false);
  });
});

describe("envois/garde-fous — dansLaListe", () => {
  const liste = lireListe("david@bailly.fr, @mindeon.ai, 06 12 34 56 78");

  it("reconnaît une adresse de la liste, casse et espaces compris", () => {
    expect(dansLaListe(liste, "email", " David@Bailly.fr ")).toBe(true);
  });

  it("reconnaît tout le domaine autorisé, mais pas un sous-domaine ni un domaine voisin", () => {
    expect(dansLaListe(liste, "email", "qui@mindeon.ai")).toBe(true);
    expect(dansLaListe(liste, "email", "qui@app.mindeon.ai")).toBe(false);
    expect(dansLaListe(liste, "email", "qui@mindeon.ai.pirate.com")).toBe(false);
    expect(dansLaListe(liste, "email", "qui@faux-mindeon.ai")).toBe(false);
  });

  it("une adresse autorisée n'autorise pas ses alias +étiquette", () => {
    expect(dansLaListe(liste, "email", "david+test@bailly.fr")).toBe(false);
  });

  it("reconnaît un numéro quelle que soit son écriture", () => {
    expect(dansLaListe(liste, "sms", "+33 6 12 34 56 78")).toBe(true);
    expect(dansLaListe(liste, "sms", "0033612345678")).toBe(true);
    expect(dansLaListe(liste, "sms", "06 12 34 56 79")).toBe(false);
  });

  it("une adresse e-mail ne vaut pas pour le canal SMS, ni l'inverse", () => {
    expect(dansLaListe(liste, "sms", "david@bailly.fr")).toBe(false);
    expect(dansLaListe(liste, "email", "06 12 34 56 78")).toBe(false);
  });
});

describe("envois/garde-fous — decider", () => {
  const desactive = reglage({});
  const recette = reglage({ ENVOI_MODE: "recette", ENVOI_DESTINATAIRES_AUTORISES: "david@bailly.fr, 06 12 34 56 78" });
  const actif = reglage({ ENVOI_MODE: "actif" });
  const sable = reglage({ ENVOI_MODE: "actif", ENVOI_BAC_A_SABLE: "1" });

  it("désactivé : rien ne part, quel que soit le destinataire, statut « journalise »", () => {
    expect(decider(desactive, { canal: "email", destinataire: "david@bailly.fr" })).toEqual({ partir: false, statut: "journalise", motif: MOTIFS.journalise });
    expect(decider(desactive, { canal: "sms", destinataire: "06 12 34 56 78" })).toEqual({ partir: false, statut: "journalise", motif: MOTIFS.journalise });
  });

  it("recette : seule la liste blanche part, le reste est « bloque »", () => {
    expect(decider(recette, { canal: "email", destinataire: "david@bailly.fr" })).toEqual({ partir: true, bacASable: false });
    expect(decider(recette, { canal: "sms", destinataire: "+33612345678" })).toEqual({ partir: true, bacASable: false });
    expect(decider(recette, { canal: "email", destinataire: "client@gmail.com" })).toEqual({ partir: false, statut: "bloque", motif: MOTIFS.bloque });
    expect(decider(recette, { canal: "sms", destinataire: "07 00 00 00 00" })).toEqual({ partir: false, statut: "bloque", motif: MOTIFS.bloque });
  });

  it("recette sans liste blanche : tout est bloqué", () => {
    const vide = reglage({ ENVOI_MODE: "recette" });
    expect(decider(vide, { canal: "email", destinataire: "david@bailly.fr" })).toMatchObject({ partir: false, statut: "bloque" });
  });

  it("actif : tout destinataire réel reçoit", () => {
    expect(decider(actif, { canal: "email", destinataire: "client@gmail.com" })).toEqual({ partir: true, bacASable: false });
  });

  it("bac à sable : la décision le transmet", () => {
    expect(decider(sable, { canal: "email", destinataire: "client@gmail.com" })).toEqual({ partir: true, bacASable: true });
  });

  it("un destinataire fictif est écarté avant tout, même en actif et en bac à sable", () => {
    for (const r of [actif, sable, recette, desactive]) {
      expect(decider(r, { canal: "email", destinataire: "claire@example.com" })).toMatchObject({ partir: false, statut: "fictif" });
      expect(decider(r, { canal: "sms", destinataire: "06 12 34 56 78", fictif: true })).toMatchObject({ partir: false, statut: "fictif" });
    }
  });

  it("un compte marqué démo n'est jamais servi, même s'il est sur la liste blanche", () => {
    expect(decider(recette, { canal: "email", destinataire: "david@bailly.fr", fictif: true })).toMatchObject({ partir: false, statut: "fictif" });
  });

  it("une adresse ou un numéro invalide échoue, avant même le mode", () => {
    expect(decider(desactive, { canal: "email", destinataire: "" })).toEqual({ partir: false, statut: "echec", motif: MOTIFS.emailInvalide });
    expect(decider(actif, { canal: "email", destinataire: "a@b.fr, c@d.fr" })).toEqual({ partir: false, statut: "echec", motif: MOTIFS.emailInvalide });
    expect(decider(actif, { canal: "email", destinataire: "a@b.fr\r\nBcc: c@d.fr" })).toEqual({ partir: false, statut: "echec", motif: MOTIFS.emailInvalide });
    expect(decider(actif, { canal: "sms", destinataire: "123" })).toEqual({ partir: false, statut: "echec", motif: MOTIFS.telephoneInvalide });
  });

  it("aucune combinaison hors « actif » ou « recette + liste blanche » ne laisse partir un message", () => {
    const modes = ["", "desactive", "off", "inconnu", "ACTIVE", "recette", "actif"];
    const destinataires: [canal: "email" | "sms", d: string][] = [
      ["email", "client@gmail.com"],
      ["email", "david@bailly.fr"],
      ["email", "x@example.com"],
      ["sms", "06 99 99 99 99"],
      ["sms", "06 12 34 56 78"],
    ];
    for (const mode of modes) {
      for (const sableActif of ["", "1"]) {
        const r = reglage({ ENVOI_MODE: mode, ENVOI_BAC_A_SABLE: sableActif, ENVOI_DESTINATAIRES_AUTORISES: "david@bailly.fr, 06 12 34 56 78" });
        for (const [canal, d] of destinataires) {
          const dec = decider(r, { canal, destinataire: d });
          const autorise = r.mode === "actif" ? !estAdresseFictive(d) : r.mode === "recette" ? dansLaListe(r.liste, canal, d) : false;
          expect(dec.partir, `${mode}/${sableActif}/${d}`).toBe(autorise);
          if (r.mode === "desactive") expect(dec.partir).toBe(false);
        }
      }
    }
  });
});
