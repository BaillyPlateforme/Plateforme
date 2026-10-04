import {
  bouton,
  echapper,
  encadre,
  mettreEnPage,
  paragraphe,
  sousTitre,
  tableau,
} from "@/lib/email-layout";
import { renderTemplate, type MessageContext } from "@/lib/messaging";

/** Une ligne du chiffrage, telle que le moteur la produit. */
export type LigneEstimation = { label: string; amount: number };

export interface ContexteRendu {
  /** Le contexte des variables : {{client_nom}}, {{montant_ttc}}… */
  vars: MessageContext;
  /** Le détail du chiffrage, pour le bloc d'estimation. */
  lignes?: LigneEstimation[];
  /** L'adresse du site, pour les liens et le logo. */
  base?: string;
  entreprise?: { nom?: string; email?: string; tel?: string };
}

const eur = (n: number) =>
  `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/**
 * Transforme le texte d'un modèle en e-mail HTML complet.
 *
 * Le corps s'écrit en texte, avec des variables et des blocs. Une ligne qui ne
 * contient qu'un bloc devient ce bloc ; tout le reste devient des paragraphes.
 * L'équipe compose donc son message sans écrire une balise.
 */
export function rendreEmail(
  modele: { sujet?: string | null; contenu: string; name: string },
  ctx: ContexteRendu,
): { sujet: string; html: string } {
  const sujet = renderTemplate(modele.sujet || modele.name, ctx.vars);
  // Le découpage se fait sur le texte BRUT : les jetons de bloc doivent être
  // reconnus avant que la substitution des variables ne les efface.
  const corps = assembler(modele.contenu, ctx);

  return {
    sujet,
    html: mettreEnPage({
      titre: sujet,
      corps,
      apercu: premiereLigne(modele.contenu, ctx),
      base: ctx.base,
      entreprise: ctx.entreprise,
    }),
  };
}

/** Le texte rendu, coupé en paragraphes et en blocs. */
function assembler(texte: string, ctx: ContexteRendu): string {
  const morceaux: string[] = [];
  let paragrapheEnCours: string[] = [];

  const viderParagraphe = () => {
    if (paragrapheEnCours.length) {
      // Les variables sont remplacées ici, puis échappées : un nom de client
      // n'est pas du HTML, et ne doit pas pouvoir en devenir.
      const lignes = paragrapheEnCours.map((l) => echapper(renderTemplate(l, ctx.vars)));
      morceaux.push(paragraphe(lignes.join("<br>")));
      paragrapheEnCours = [];
    }
  };

  for (const ligne of texte.split("\n")) {
    const net = ligne.trim();
    if (!net) {
      viderParagraphe();
      continue;
    }
    const bloc = rendreBloc(net, ctx);
    if (bloc !== null) {
      viderParagraphe();
      if (bloc) morceaux.push(bloc);
      continue;
    }
    // Une ligne seule qui finit par « : » fait un bon intertitre.
    if (net.endsWith(":") && net.length < 60 && paragrapheEnCours.length === 0) {
      morceaux.push(sousTitre(renderTemplate(net.slice(0, -1), ctx.vars)));
      continue;
    }
    paragrapheEnCours.push(net);
  }
  viderParagraphe();

  return morceaux.join("\n");
}

/** Rend un bloc, ou null si la ligne n'en est pas un. */
function rendreBloc(ligne: string, ctx: ContexteRendu): string | null {
  const v = ctx.vars;
  const lien = (cle: string) => String(v[cle] ?? "");

  switch (ligne) {
    case "{{bloc_recapitulatif}}": {
      const lignes: [string, string][] = [];
      const trajet = [v.ville_depart, v.ville_arrivee].filter(Boolean).join(" → ");
      if (trajet) lignes.push(["Trajet", trajet]);
      if (v.distance) lignes.push(["Distance", `${v.distance} km`]);
      if (v.volume) lignes.push(["Volume à déménager", `${v.volume} m³`]);
      if (v.date) lignes.push(["Date souhaitée", String(v.date)]);
      if (v.formule) lignes.push(["Formule", String(v.formule)]);
      return lignes.length ? sousTitre("Votre déménagement") + tableau(lignes) : "";
    }

    case "{{bloc_estimation}}": {
      const lignes = (ctx.lignes ?? []).map(
        (l) => [l.label, eur(l.amount)] as [string, string],
      );
      if (v.montant_ht) lignes.push(["Total HT", String(v.montant_ht)]);
      if (!lignes.length && !v.montant_ttc) return "";
      return (
        sousTitre("Votre estimation") +
        tableau(lignes, v.montant_ttc ? { total: ["Total TTC", String(v.montant_ttc)] } : undefined) +
        (v.validite
          ? paragraphe(
              `<span style="color:#615f68;font-size:13px;">Estimation valable jusqu'au ${echapper(String(v.validite))}. Elle ne constitue pas un devis contractuel.</span>`,
            )
          : "")
      );
    }

    case "{{bouton_estimation}}":
      return lien("lien_estimation") ? bouton("Voir mon estimation", lien("lien_estimation")) : "";

    case "{{bouton_completer}}":
      return lien("lien_completion") ? bouton("Compléter ma demande", lien("lien_completion")) : "";

    case "{{bloc_contact}}": {
      const tel = String(v.entreprise_tel ?? "");
      const mail = String(v.entreprise_email ?? "");
      if (!tel && !mail) return "";
      return encadre(
        `<strong>Une question ?</strong><br>` +
          [
            tel ? `Appelez-nous au <a href="tel:${tel.replace(/\s/g, "")}" style="color:#1b1a18;">${echapper(tel)}</a>` : "",
            mail ? `ou écrivez à <a href="mailto:${mail}" style="color:#1b1a18;">${echapper(mail)}</a>` : "",
          ]
            .filter(Boolean)
            .join(" "),
      );
    }

    default:
      return null;
  }
}

/** La ligne d'aperçu que les boîtes affichent à côté de l'objet. */
function premiereLigne(texte: string, ctx: ContexteRendu): string {
  const ligne = texte
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("{{"));
  return ligne ? renderTemplate(ligne, ctx.vars).slice(0, 140) : "";
}
