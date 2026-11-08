import "server-only";
import type { FactureComplete, Mentions } from "./donnees";
import { totaux } from "./calcul";

/*
 * La facture électronique au format Factur-X (profil EN 16931) : un PDF/A-3
 * lisible, qui embarque la facture structurée (XML CII). La bibliothèque
 * @e-invoice-eu/core (maintenue, licence WTFPL) produit le XML et le PDF/A-3
 * à partir de la facture dans son format interne, calqué sur UBL ; le PDF
 * lisible est celui de FacturePdf.tsx.
 *
 * Avant de produire quoi que ce soit, prealablesFacturX() dit ce qui manque :
 * la norme exige des données que Bailly n'a pas encore données (SIREN, TVA
 * intracommunautaire, adresse en champs séparés…). Rien n'est inventé ni
 * complété d'office ; le pays est reconnu quand il est écrit (« France » ou
 * « FR »), jamais supposé.
 *
 * Ce module produit le fichier. L'obligation française qui arrive (réforme de
 * la facturation électronique) demande en plus de le transmettre par une
 * plateforme agréée : voir le rapport de la facturation.
 */

const PAYS: Record<string, string> = { france: "FR", fr: "FR", belgique: "BE", be: "BE", suisse: "CH", ch: "CH", luxembourg: "LU", lu: "LU", allemagne: "DE", de: "DE", espagne: "ES", es: "ES", italie: "IT", it: "IT", "royaume-uni": "GB", gb: "GB", canada: "CA", ca: "CA" };
export const codePays = (p: string | null | undefined) => {
  if (!p) return null;
  const k = p.trim().toLowerCase();
  return PAYS[k] ?? (/^[a-z]{2}$/.test(k) ? k.toUpperCase() : null);
};
const sirenDe = (m: Mentions) => (m.siren ?? m.siret ?? "").replace(/\s/g, "").slice(0, 9) || null;
const montant = (n: number) => n.toFixed(2);

/** Ce qui manque pour une facture électronique conforme ; vide : on peut la produire. */
export function prealablesFacturX(f: FactureComplete, m: Mentions, emailEmetteur: string | null): string[] {
  const p = f.payeur ?? f.origine;
  return [
    !sirenDe(m) && "SIREN (ou SIRET) de Bailly, dans Paramètres",
    !m.tvaIntracom && "numéro de TVA intracommunautaire de Bailly (Paramètres › Facturation)",
    (!m.adresse || !m.codePostal || !m.ville) && "adresse de Bailly en champs séparés : rue, code postal, ville (Paramètres › Facturation)",
    !codePays(m.pays) && "pays de Bailly (Paramètres › Facturation)",
    !emailEmetteur && "adresse e-mail de l'entreprise, adresse électronique de l'émetteur (Paramètres, carte Entreprise)",
    !p?.email && "adresse e-mail du client facturé, son adresse électronique",
    !codePays(p?.pays) && "pays de l'adresse de facturation du client (fenêtre « Client facturé »)",
    f.genre !== "avoir" && f.reste > 0 && !f.echeanceLe && !(f.conditions || m.conditions) && "date d'échéance ou conditions de règlement",
    f.lignes.length === 0 && "lignes détaillées : facture émise avant le détail des lignes",
    f.lignes.some((l) => l.genre !== "texte" && l.tauxTva === 0) && "motif d'exonération d'une ligne à 0 % de TVA (non géré : la facture électronique ne connaît ici que le taux normal)",
  ].filter(Boolean) as string[];
}

const adresseUbl = (rue: string | null, cp: string | null, ville: string | null, pays: string) => ({
  ...(rue ? { "cbc:StreetName": rue } : {}),
  ...(ville ? { "cbc:CityName": ville } : {}),
  ...(cp ? { "cbc:PostalZone": cp } : {}),
  "cac:Country": { "cbc:IdentificationCode": pays },
});
const categorie = (taux: number) => ({ "cbc:ID": "S", "cbc:Percent": String(taux), "cac:TaxScheme": { "cbc:ID": "VAT" } });

/** La facture dans le format interne de @e-invoice-eu/core (UBL en JSON). Suppose les préalables remplis. */
export function factureVersEn16931(f: FactureComplete, m: Mentions, emailEmetteur: string, livraison: string | null = null) {
  const p = (f.payeur ?? f.origine)!;
  const t = totaux(f.lignes.map((l) => ({ genre: l.genre as "prestation", libelle: l.libelle, quantite: l.quantite, prixUnitaireHt: l.prixUnitaireHt, tauxTva: l.tauxTva })));
  const prepaye = f.genre === "avoir" ? 0 : Math.round(f.reglements.reduce((a, r) => a + r.montant, 0) * 100) / 100;
  const avoir = f.genre === "avoir";
  const notes = [m.penalites, f.genre !== "avoir" && (p.type === "compte" || p.type === "partenaire" || p.siren) ? m.indemnite : null, m.escompte, f.motif && avoir ? `Motif : ${f.motif}` : null].filter(Boolean) as string[];
  const lignes = t.lignes
    .map((l, i) => ({ l, src: f.lignes[i] }))
    .filter(({ l }) => l.genre !== "texte")
    .map(({ l, src }, i) => {
      // La norme refuse un prix négatif : une déduction s'écrit en quantité négative, au prix positif.
      const negatif = l.prixUnitaireHt < 0;
      const quantite = negatif ? -l.quantite : l.quantite;
      const prix = Math.abs(l.prixUnitaireHt);
      return {
        "cbc:ID": String(i + 1),
        "cbc:InvoicedQuantity": String(quantite),
        "cbc:InvoicedQuantity@unitCode": "C62",
        "cbc:LineExtensionAmount": montant(l.ht),
        "cbc:LineExtensionAmount@currencyID": "EUR",
        "cac:Item": { ...(src.detail ? { "cbc:Description": src.detail } : {}), "cbc:Name": l.libelle.slice(0, 200) || "Prestation", "cac:ClassifiedTaxCategory": categorie(l.tauxTva) },
        "cac:Price": { "cbc:PriceAmount": prix.toFixed(4).replace(/0{1,2}$/, ""), "cbc:PriceAmount@currencyID": "EUR" },
      };
    });
  return {
    "ubl:Invoice": {
      "cbc:CustomizationID": "urn:cen.eu:en16931:2017",
      "cbc:ID": f.numero,
      "cbc:IssueDate": f.emiseLe!,
      ...(f.echeanceLe && !avoir ? { "cbc:DueDate": f.echeanceLe } : {}),
      "cbc:InvoiceTypeCode": avoir ? "381" : f.genre === "acompte" ? "386" : "380",
      ...(notes.length ? { "cbc:Note": notes } : {}),
      "cbc:DocumentCurrencyCode": "EUR",
      ...(f.bonCommande ? { "cbc:BuyerReference": f.bonCommande, "cac:OrderReference": { "cbc:ID": f.bonCommande } } : {}),
      ...(avoir && f.origineNumero ? { "cac:BillingReference": [{ "cac:InvoiceDocumentReference": { "cbc:ID": f.origineNumero } }] } : {}),
      "cac:AccountingSupplierParty": {
        "cac:Party": {
          "cbc:EndpointID": emailEmetteur,
          "cbc:EndpointID@schemeID": "EM",
          "cac:PostalAddress": adresseUbl(m.adresse, m.codePostal, m.ville, codePays(m.pays)!),
          "cac:PartyTaxScheme": [{ "cbc:CompanyID": m.tvaIntracom!, "cac:TaxScheme": { "cbc:ID": "VAT" } }],
          "cac:PartyLegalEntity": {
            "cbc:RegistrationName": m.nom,
            "cbc:CompanyID": sirenDe(m)!,
            "cbc:CompanyID@schemeID": "0002",
            ...([m.formeJuridique, m.capital && `capital ${m.capital}`, m.rcs && `RCS ${m.rcs}`].filter(Boolean).length
              ? { "cbc:CompanyLegalForm": [m.formeJuridique, m.capital && `capital ${m.capital}`, m.rcs && `RCS ${m.rcs}`].filter(Boolean).join(", ") }
              : {}),
          },
        },
      },
      "cac:AccountingCustomerParty": {
        "cac:Party": {
          "cbc:EndpointID": p.email!,
          "cbc:EndpointID@schemeID": "EM",
          "cac:PostalAddress": adresseUbl(p.adresse, p.codePostal, p.ville, codePays(p.pays)!),
          ...(p.tvaIntracom ? { "cac:PartyTaxScheme": [{ "cbc:CompanyID": p.tvaIntracom, "cac:TaxScheme": { "cbc:ID": "VAT" } }] } : {}),
          "cac:PartyLegalEntity": { "cbc:RegistrationName": p.nom, ...(p.siren ? { "cbc:CompanyID": p.siren.replace(/\s/g, ""), "cbc:CompanyID@schemeID": "0002" } : {}) },
        },
      },
      // La date de la prestation : la livraison du déménagement, quand elle est posée (BT-72).
      ...(livraison ? { "cac:Delivery": { "cbc:ActualDeliveryDate": livraison } } : {}),
      ...(m.iban && !avoir ? { "cac:PaymentMeans": [{ "cbc:PaymentMeansCode": "30", "cac:PayeeFinancialAccount": { "cbc:ID": m.iban.replace(/\s/g, "") } }] } : {}),
      ...((f.conditions || m.conditions) && !avoir ? { "cac:PaymentTerms": { "cbc:Note": (f.conditions || m.conditions)! } } : {}),
      "cac:TaxTotal": [{
        "cbc:TaxAmount": montant(t.tva),
        "cbc:TaxAmount@currencyID": "EUR",
        "cac:TaxSubtotal": t.parTaux.map((g) => ({
          "cbc:TaxableAmount": montant(g.base), "cbc:TaxableAmount@currencyID": "EUR",
          "cbc:TaxAmount": montant(g.tva), "cbc:TaxAmount@currencyID": "EUR",
          "cac:TaxCategory": categorie(g.taux),
        })),
      }],
      "cac:LegalMonetaryTotal": {
        "cbc:LineExtensionAmount": montant(t.ht), "cbc:LineExtensionAmount@currencyID": "EUR",
        "cbc:TaxExclusiveAmount": montant(t.ht), "cbc:TaxExclusiveAmount@currencyID": "EUR",
        "cbc:TaxInclusiveAmount": montant(t.ttc), "cbc:TaxInclusiveAmount@currencyID": "EUR",
        ...(prepaye ? { "cbc:PrepaidAmount": montant(prepaye), "cbc:PrepaidAmount@currencyID": "EUR" } : {}),
        "cbc:PayableAmount": montant(Math.round((t.ttc - prepaye) * 100) / 100), "cbc:PayableAmount@currencyID": "EUR",
      },
      "cac:InvoiceLine": lignes,
    },
  };
}
