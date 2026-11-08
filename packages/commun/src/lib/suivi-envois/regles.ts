/*
 * Les règles du suivi des e-mails, sans effet de bord : comment un e-mail
 * est équipé (ses liens réécrits, le pixel d'ouverture ajouté), comment on
 * reconnaît un relevé fait par une machine plutôt que par le client, et ce
 * que veut dire chaque page du portail. Ce fichier n'importe rien : il sert
 * au serveur des deux apps et aux écrans du CRM.
 *
 * Ce qu'une ouverture veut dire, honnêtement :
 *   - le pixel ne se charge que si la messagerie affiche les images : une
 *     ouverture non relevée n'est pas une preuve que l'e-mail n'a pas été lu ;
 *   - Apple Mail (protection de la vie privée, « MPP ») charge les images
 *     tout seul, par ses serveurs, souvent dès la réception : on ne sait pas
 *     si le client a lu. Son agent est réduit à « Mozilla/5.0 » ;
 *   - Gmail et Yahoo passent par leur proxy d'images : c'est en général une
 *     vraie ouverture, sauf quand elle suit l'envoi de quelques secondes ;
 *   - un antivirus ou un filtre d'entreprise suit parfois les liens dès la
 *     réception : un clic dans les secondes qui suivent l'envoi est tenu pour
 *     automatique.
 * Un relevé automatique se montre « ouverture probable (relevé
 * automatique) », jamais comme une ouverture certaine.
 */

/** Une ouverture moins de N secondes après l'envoi, par un proxy d'images : probablement automatique. À valider. */
export const DELAI_PROXY_AUTOMATIQUE_S = 60;
/** Une ouverture ou un clic moins de N secondes après l'envoi, par quiconque : une machine (antivirus, aperçu). À valider. */
export const DELAI_MACHINE_S = 8;
/** Une même page du portail revue dans ce délai ne compte qu'une fois. */
export const DOUBLON_PORTAIL_MIN = 30;
/** Après un clic vers l'espace client, les pages vues dans ce délai sont rattachées à l'e-mail. */
export const ATTRIBUTION_MIN = 30;
/** Au plus N liens suivis par e-mail ; les suivants restent tels quels. */
export const LIENS_MAX = 40;

export type Agent = "apple_proxy" | "google_proxy" | "yahoo_proxy" | "outlook" | "messagerie" | "robot" | "navigateur" | "inconnu";

export const LIBELLE_AGENT: Record<Agent, string> = {
  apple_proxy: "Apple Mail (protection de la vie privée)",
  google_proxy: "Gmail (proxy d’images)",
  yahoo_proxy: "Yahoo (proxy d’images)",
  outlook: "Outlook",
  messagerie: "Messagerie",
  robot: "Robot ou antivirus",
  navigateur: "Navigateur",
  inconnu: "Inconnu",
};

/** La famille de l'agent : c'est tout ce qu'on garde (jamais l'agent complet). */
export function familleAgent(ua: string | null | undefined): Agent {
  const a = String(ua ?? "").trim();
  if (!a) return "inconnu";
  // La protection de la vie privée d'Apple Mail : l'agent réduit à sa plus simple expression.
  if (/^Mozilla\/5\.0$/.test(a)) return "apple_proxy";
  if (/GoogleImageProxy|ggpht\.com/i.test(a)) return "google_proxy";
  if (/YahooMailProxy/i.test(a)) return "yahoo_proxy";
  if (
    /(bot|crawler|spider|scanner|preview|python|curl|wget|java\/|go-http|httpclient|okhttp|headless|barracuda|proofpoint|mimecast|symantec|safelinks|ironport|trendmicro|libwww|node-fetch|axios|undici|facebookexternalhit|linkexpanding|bingpreview)/i.test(
      a,
    )
  )
    return "robot";
  if (/(Microsoft Outlook|ms-office|Outlook-iOS|Outlook-Android|OneOutlook|Microsoft Office)/i.test(a)) return "outlook";
  if (/(Thunderbird|AppleMail|Mail\/\d|Airmail|Spark)/i.test(a)) return "messagerie";
  if (/(Mozilla|AppleWebKit|Chrome|Safari|Firefox|Edg\/)/i.test(a)) return "navigateur";
  return "inconnu";
}

/** Une ouverture relevée par une machine, plutôt que par le client ? */
export function ouvertureAutomatique(agent: Agent, secondesDepuisEnvoi: number | null): boolean {
  if (agent === "apple_proxy" || agent === "robot") return true;
  if (secondesDepuisEnvoi != null && secondesDepuisEnvoi < DELAI_MACHINE_S) return true;
  if ((agent === "google_proxy" || agent === "yahoo_proxy") && secondesDepuisEnvoi != null && secondesDepuisEnvoi < DELAI_PROXY_AUTOMATIQUE_S) return true;
  return false;
}

/** Un clic suivi par une machine (antivirus, aperçu de lien), plutôt que par le client ? */
export function clicAutomatique(agent: Agent, secondesDepuisEnvoi: number | null): boolean {
  if (agent === "robot" || agent === "apple_proxy" || agent === "google_proxy" || agent === "yahoo_proxy") return true;
  return secondesDepuisEnvoi != null && secondesDepuisEnvoi < DELAI_MACHINE_S;
}

/* ─────────────── Le portail ─────────────── */

/** Les pages de l'espace client, par leur premier segment après la référence ; « accueil » : la page du dossier. */
export const PAGES: Record<string, string> = {
  accueil: "Accueil de l’espace",
  devis: "Devis",
  documents: "Documents",
  paiement: "Paiement",
  conseiller: "Conseiller",
  sav: "SAV",
  conteneur: "Conteneur",
  cartons: "Cartons",
  tutos: "Tutos",
  visite: "Visite",
  services: "Services",
  // La page où le client signe son devis, sur l'app de l'équipe (/signature/<jeton>).
  signature: "Page de signature du devis",
};

/** Les gestes clés, dits comme le Feed et la chronologie les disent. */
export const GESTES: Record<string, string> = {
  devis: "A consulté son devis",
  signature: "A consulté son devis (page de signature)",
  paiement: "A ouvert la page de paiement",
  pdf_devis: "A téléchargé le PDF du devis",
  pdf_facture: "A téléchargé une facture",
};

/** « /espace-client/BD-2026-0012/devis » → « devis » ; une adresse hors de l'espace d'un dossier, rien. */
export function pageDuChemin(chemin: string, reference: string): string | null {
  const morceaux = String(chemin ?? "").split("?")[0].split("/").filter(Boolean).map((m) => {
    try {
      return decodeURIComponent(m);
    } catch {
      return m;
    }
  });
  if (morceaux[0] !== "espace-client" || morceaux[1] !== reference) return null;
  const page = morceaux[2] ?? "accueil";
  return page in PAGES && page !== "signature" ? page : null;
}

/* ─────────────── L'équipement d'un e-mail ─────────────── */

export interface LienSuivi {
  indice: number;
  libelle: string | null;
  /** L'adresse complète, telle qu'écrite dans l'e-mail : elle ne se garde que chiffrée. */
  url: string;
  /** Hôte et chemin, sans la requête ni l'ancre : ce qu'on peut afficher. */
  destination: string;
}

const ENTITES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " ", rarr: "", rsaquo: "", raquo: "", laquo: "" };
const decoder = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k in ENTITES) return ENTITES[k];
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith("#")) return String.fromCodePoint(Number(k.slice(1)));
    return m;
  });

/** Le texte d'un lien : son contenu sans balises, ou le texte de remplacement de son image. */
function libelleDe(contenu: string): string | null {
  const texte = decoder(contenu.replace(/<[^>]+>/g, " "))
    .replace(/[→›»→]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (texte) return texte.slice(0, 80);
  const alt = /alt\s*=\s*(["'])(.*?)\1/i.exec(contenu)?.[2];
  return alt ? decoder(alt).trim().slice(0, 80) || null : null;
}

/**
 * Ce qu'on peut afficher d'une adresse : l'hôte et le chemin, sans la
 * requête ni l'ancre, et sans les segments qui ressemblent à un jeton (le
 * lien de signature d'un devis, /signature/<jeton>) : « …/signature/… ».
 * L'adresse complète, elle, ne se garde que chiffrée.
 */
export function destinationDe(url: string): string {
  const masquer = (chemin: string) =>
    chemin
      .split("/")
      .map((m) => (/^[A-Za-z0-9_.~-]{16,}$/.test(m) && /\d/.test(m) ? "…" : m))
      .join("/");
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === "/" ? "" : masquer(u.pathname)}`.slice(0, 200);
  } catch {
    return masquer(url.split(/[?#]/)[0]).slice(0, 200);
  }
}

/**
 * Équipe un e-mail : chaque lien http(s) devient `<base>/t/c/<jeton>?l=<n>`,
 * et le pixel `<base>/t/o/<jeton>.gif` est posé avant la fin du corps. Les
 * liens mailto:, tel:, les ancres et les liens déjà suivis restent tels
 * quels. Rend l'e-mail équipé et la liste des liens à garder.
 */
export function equiperHtml(html: string, o: { base: string; jeton: string }): { html: string; liens: LienSuivi[] } {
  const base = o.base.replace(/\/$/, "");
  const liens: LienSuivi[] = [];
  const parUrl = new Map<string, number>();
  const sortie = html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (tout, attributs: string, contenu: string) => {
    const m = /(\shref\s*=\s*)(["'])(.*?)\2/i.exec(attributs);
    if (!m) return tout;
    const url = decoder(m[3].trim());
    if (!/^https?:\/\//i.test(url) || url.startsWith(`${base}/t/`)) return tout;
    const libelle = libelleDe(contenu);
    // Un même lien écrit deux fois (le bouton, puis l'adresse en clair) : un seul indice si le libellé est le même.
    const cle = `${url}\n${libelle ?? ""}`;
    let indice = parUrl.get(cle);
    if (indice == null) {
      if (liens.length >= LIENS_MAX) return tout;
      indice = liens.length;
      parUrl.set(cle, indice);
      liens.push({ indice, libelle, url, destination: destinationDe(url) });
    }
    const suivi = `${base}/t/c/${o.jeton}?l=${indice}`;
    const nouveaux = attributs.replace(m[0], `${m[1]}${m[2]}${suivi}${m[2]}`);
    return `<a${nouveaux}>${contenu}</a>`;
  });
  const pixel = `<img src="${base}/t/o/${o.jeton}.gif" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;margin:0;padding:0;opacity:0;" />`;
  const fin = sortie.search(/<\/body>(?![\s\S]*<\/body>)/i);
  return { html: fin >= 0 ? `${sortie.slice(0, fin)}${pixel}${sortie.slice(fin)}` : `${sortie}${pixel}`, liens };
}

/** Le GIF transparent d'un pixel (43 octets). */
export const GIF_TRANSPARENT = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
