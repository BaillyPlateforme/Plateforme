import { describe, expect, it } from "vitest";
import { choisirFournisseurs, fournisseurDe, fournisseurPresent, fournisseursEnClair, nomDuFournisseur, sansSecret } from "@/lib/envois/fournisseurs";

/*
 * Le choix du fournisseur des envois (envois/fournisseurs.ts), sans effet de
 * bord : d'après l'environnement, qui transporte un e-mail, qui un SMS.
 * Les valeurs des accès sont factices : seule leur présence compte.
 */

const SENDGRID = { SENDGRID_API_KEY: "cle-factice" };
const TWILIO = { TWILIO_ACCOUNT_SID: "ACfactice", TWILIO_AUTH_TOKEN: "jeton-factice" };

describe("envois/fournisseurs — choisirFournisseurs", () => {
  it("sans aucun accès Twilio : tout reste chez Brevo (avant la bascule)", () => {
    expect(choisirFournisseurs({})).toEqual({ email: "brevo", sms: "brevo", impose: null, avertissements: [] });
    expect(choisirFournisseurs({ BREVO_API_KEY: "k" })).toMatchObject({ email: "brevo", sms: "brevo" });
  });

  it("chaque canal bascule dès que ses accès sont posés, indépendamment de l'autre", () => {
    expect(choisirFournisseurs({ ...SENDGRID })).toMatchObject({ email: "sendgrid", sms: "brevo" });
    expect(choisirFournisseurs({ ...TWILIO })).toMatchObject({ email: "brevo", sms: "twilio" });
    expect(choisirFournisseurs({ ...SENDGRID, ...TWILIO, BREVO_API_KEY: "k" })).toEqual({ email: "sendgrid", sms: "twilio", impose: null, avertissements: [] });
  });

  it("des accès vides ou faits d'espaces ne comptent pas", () => {
    expect(choisirFournisseurs({ SENDGRID_API_KEY: "  ", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: " " })).toMatchObject({ email: "brevo", sms: "brevo" });
  });

  it("un accès Twilio à moitié posé ne bascule rien, et le dit", () => {
    for (const env of [{ TWILIO_ACCOUNT_SID: "ACfactice" }, { TWILIO_AUTH_TOKEN: "jeton" }]) {
      const c = choisirFournisseurs(env);
      expect(c.sms).toBe("brevo");
      expect(c.avertissements).toEqual(["Accès Twilio incomplets (il faut TWILIO_ACCOUNT_SID ET TWILIO_AUTH_TOKEN) : les SMS restent chez Brevo."]);
    }
  });

  it("ENVOI_FOURNISSEUR=twilio impose SendGrid et Twilio, même sans leurs accès ; =brevo impose Brevo (retour arrière)", () => {
    expect(choisirFournisseurs({ ENVOI_FOURNISSEUR: "twilio" })).toEqual({ email: "sendgrid", sms: "twilio", impose: "twilio", avertissements: [] });
    expect(choisirFournisseurs({ ENVOI_FOURNISSEUR: " TWILIO " })).toMatchObject({ impose: "twilio" });
    expect(choisirFournisseurs({ ENVOI_FOURNISSEUR: "brevo", ...SENDGRID, ...TWILIO })).toEqual({ email: "brevo", sms: "brevo", impose: "brevo", avertissements: [] });
  });

  it("une valeur inconnue de ENVOI_FOURNISSEUR : le choix automatique, et un avertissement", () => {
    const c = choisirFournisseurs({ ENVOI_FOURNISSEUR: "sendgrid", ...SENDGRID });
    expect(c).toMatchObject({ email: "sendgrid", sms: "brevo", impose: null });
    expect(c.avertissements[0]).toBe('ENVOI_FOURNISSEUR="sendgrid" n\'est pas reconnu (twilio ou brevo) : chaque canal passe chez Twilio dès que ses accès sont posés.');
  });
});

describe("envois/fournisseurs — présence, noms, identifiants", () => {
  it("fournisseurPresent lit les variables de chacun", () => {
    expect(fournisseurPresent("sendgrid", SENDGRID)).toBe(true);
    expect(fournisseurPresent("twilio", { TWILIO_ACCOUNT_SID: "AC" })).toBe(false);
    expect(fournisseurPresent("twilio", TWILIO)).toBe(true);
    expect(fournisseurPresent("brevo", {})).toBe(false);
  });

  it("fournisseursEnClair : un seul nom quand il porte les deux canaux", () => {
    expect(fournisseursEnClair({ email: "brevo", sms: "brevo" })).toBe("Brevo");
    expect(fournisseursEnClair({ email: "sendgrid", sms: "twilio" })).toBe("SendGrid (e-mails) et Twilio (SMS)");
    expect(fournisseursEnClair({ email: "sendgrid", sms: "brevo" })).toBe("SendGrid (e-mails) et Brevo (SMS)");
    expect(nomDuFournisseur(null)).toBe("le fournisseur");
    expect(nomDuFournisseur("twilio")).toBe("Twilio");
  });

  it("fournisseurDe : la colonne d'abord, sinon la forme de l'identifiant", () => {
    expect(fournisseurDe({ fournisseur: "sendgrid", brevo_id: "<a@b>" })).toBe("sendgrid");
    expect(fournisseurDe({ brevo_id: `SM${"0".repeat(32)}` })).toBe("twilio");
    expect(fournisseurDe({ brevo_id: `MM${"ab".repeat(16)}` })).toBe("twilio");
    expect(fournisseurDe({ brevo_id: "<202611151000.1@smtp-relay.mailin.fr>" })).toBe("brevo");
    expect(fournisseurDe({ brevo_id: "1511882900176220" })).toBe("brevo");
    expect(fournisseurDe({ brevo_id: "W86EgYT6SQKk0lRflfLRsA" })).toBe("sendgrid");
    expect(fournisseurDe({ fournisseur: "inconnu", brevo_id: null })).toBeNull();
    expect(fournisseurDe({ brevo_id: "  " })).toBeNull();
    expect(fournisseurDe({})).toBeNull();
  });

  it("sansSecret masque un secret, jamais un fragment trop court pour en être un", () => {
    expect(sansSecret("la clé abcdefgh est refusée", ["abcdefgh"])).toBe("la clé ••• est refusée");
    expect(sansSecret("abc", ["abc"])).toBe("abc");
    expect(sansSecret("rien", [undefined, ""])).toBe("rien");
  });
});
