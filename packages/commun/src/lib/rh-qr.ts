/*
 * Un code QR, sans dépendance : le lien de l'espace pro, à imprimer sur une
 * affiche ou à glisser dans un courrier de mobilité.
 *
 * Mode octets (UTF-8), correction d'erreur « M » (15 % du code peut manquer),
 * versions 1 à 10 — jusqu'à 213 octets, bien plus qu'un lien d'espace pro.
 * L'algorithme suit la norme ISO/IEC 18004 dans l'ordre de l'implémentation
 * de référence de Nayuki (licence MIT) : données, correction Reed-Solomon,
 * entrelacement, motifs fixes, placement en zigzag, masque le moins pénalisé.
 *
 * Module pur : le serveur et le navigateur le lisent.
 */

/* Correction « M », versions 1 à 10 (l'indice 0 ne sert pas). */
const ECC_PAR_BLOC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const NB_BLOCS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const VERSION_MAX = 10;
/** Les bits de format du niveau M. */
const FORMAT_M = 0;

/** Le nombre de modules de données d'une version (tout sauf les motifs fixes). */
function modulesDeDonnees(v: number): number {
  let n = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const nbAlign = Math.floor(v / 7) + 2;
    n -= (25 * nbAlign - 10) * nbAlign - 55;
    if (v >= 7) n -= 36;
  }
  return n;
}
const octetsDeDonnees = (v: number) => Math.floor(modulesDeDonnees(v) / 8) - ECC_PAR_BLOC[v] * NB_BLOCS[v];

/* ── Reed-Solomon sur GF(256), polynôme 0x11D ── */

function multiplier(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function diviseur(degre: number): number[] {
  const r = new Array<number>(degre).fill(0);
  r[degre - 1] = 1;
  let racine = 1;
  for (let i = 0; i < degre; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = multiplier(r[j], racine);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    racine = multiplier(racine, 0x02);
  }
  return r;
}

function reste(donnees: number[], div: number[]): number[] {
  const r = div.map(() => 0);
  for (const octet of donnees) {
    const facteur = octet ^ (r.shift() as number);
    r.push(0);
    div.forEach((c, i) => (r[i] ^= multiplier(c, facteur)));
  }
  return r;
}

/* ── Les octets à placer ── */

function codewords(texte: string): { version: number; octets: number[] } {
  const donnees = [...new TextEncoder().encode(texte)];
  let version = 1;
  // Mode (4 bits) + longueur (8 bits jusqu'à la version 9, 16 ensuite) + données.
  const bitsNecessaires = (v: number) => 4 + (v < 10 ? 8 : 16) + donnees.length * 8;
  while (version <= VERSION_MAX && bitsNecessaires(version) > octetsDeDonnees(version) * 8) version++;
  if (version > VERSION_MAX) throw new Error("Texte trop long pour le code QR.");

  const bits: number[] = [];
  const ajouter = (valeur: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((valeur >>> i) & 1);
  };
  ajouter(0b0100, 4);
  ajouter(donnees.length, version < 10 ? 8 : 16);
  for (const o of donnees) ajouter(o, 8);
  const capacite = octetsDeDonnees(version) * 8;
  ajouter(0, Math.min(4, capacite - bits.length));
  ajouter(0, (8 - (bits.length % 8)) % 8);
  for (let rembourrage = 0xec; bits.length < capacite; rembourrage ^= 0xec ^ 0x11) ajouter(rembourrage, 8);
  const octets: number[] = [];
  for (let i = 0; i < bits.length; i += 8) octets.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // Découpe en blocs, correction de chaque bloc, entrelacement.
  const nbBlocs = NB_BLOCS[version];
  const eccLong = ECC_PAR_BLOC[version];
  const total = Math.floor(modulesDeDonnees(version) / 8);
  const nbCourts = nbBlocs - (total % nbBlocs);
  const longCourt = Math.floor(total / nbBlocs);
  const div = diviseur(eccLong);
  const blocs: number[][] = [];
  for (let i = 0, k = 0; i < nbBlocs; i++) {
    const morceau = octets.slice(k, k + longCourt - eccLong + (i < nbCourts ? 0 : 1));
    k += morceau.length;
    const ecc = reste(morceau, div);
    if (i < nbCourts) morceau.push(0);
    blocs.push(morceau.concat(ecc));
  }
  const resultat: number[] = [];
  for (let i = 0; i < blocs[0].length; i++)
    blocs.forEach((b, j) => {
      if (i !== longCourt - eccLong || j >= nbCourts) resultat.push(b[i]);
    });
  return { version, octets: resultat };
}

/* ── La matrice ── */

function positionsAlignement(v: number, taille: number): number[] {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2;
  const pas = Math.floor((v * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
  const r = [6];
  for (let pos = taille - 7; r.length < n; pos -= pas) r.splice(1, 0, pos);
  return r;
}

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

function masqueInverse(m: number, x: number, y: number): boolean {
  switch (m) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** La pénalité d'une matrice (règles N1 à N4 de la norme) : le masque qui en a le moins se lit le mieux. */
function penalite(m: boolean[][]): number {
  const n = m.length;
  let score = 0;
  const lignes: boolean[][] = [...m, ...m[0].map((_, x) => m.map((l) => l[x]))];
  const motifA = [true, false, true, true, true, false, true, false, false, false, false];
  const motifB = [...motifA].reverse();
  for (const l of lignes) {
    // N1 : cinq modules ou plus de la même couleur à la suite.
    for (let i = 0; i < n; ) {
      let j = i;
      while (j < n && l[j] === l[i]) j++;
      if (j - i >= 5) score += 3 + (j - i - 5);
      i = j;
    }
    // N3 : un motif qui ressemble à un repère d'angle.
    for (let i = 0; i + 11 <= n; i++) {
      if (motifA.every((b, k) => l[i + k] === b) || motifB.every((b, k) => l[i + k] === b)) score += 40;
    }
  }
  // N2 : carrés 2 × 2 d'une seule couleur.
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
  // N4 : l'équilibre entre clair et foncé.
  const fonces = m.reduce((s, l) => s + l.filter(Boolean).length, 0);
  score += Math.floor(Math.abs(fonces * 20 - n * n * 10) / (n * n)) * 10;
  return score;
}

/** La matrice du code QR d'un texte : true = module foncé. Sans la marge blanche autour. */
export function matriceQr(texte: string): boolean[][] {
  const { version, octets } = codewords(texte);
  const taille = version * 4 + 17;
  const fond = () => Array.from({ length: taille }, () => new Array<boolean>(taille).fill(false));
  const modules = fond();
  const fixe = fond();
  const poser = (x: number, y: number, fonce: boolean) => {
    modules[y][x] = fonce;
    fixe[y][x] = true;
  };

  // Lignes de synchronisation.
  for (let i = 0; i < taille; i++) {
    poser(6, i, i % 2 === 0);
    poser(i, 6, i % 2 === 0);
  }
  // Les trois repères d'angle, avec leur liseré blanc.
  for (const [cx, cy] of [[3, 3], [taille - 4, 3], [3, taille - 4]])
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < taille && y >= 0 && y < taille) poser(x, y, d !== 2 && d !== 4);
      }
  // Les repères d'alignement.
  const pos = positionsAlignement(version, taille);
  pos.forEach((ay, i) =>
    pos.forEach((ax, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) poser(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }),
  );
  const format = (masque: number) => {
    const d = (FORMAT_M << 3) | masque;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    for (let i = 0; i <= 5; i++) poser(8, i, bit(b, i));
    poser(8, 7, bit(b, 6));
    poser(8, 8, bit(b, 7));
    poser(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) poser(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) poser(taille - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) poser(8, taille - 15 + i, bit(b, i));
    poser(8, taille - 8, true);
  };
  format(0);
  // L'information de version, à partir de la version 7.
  if (version >= 7) {
    let r = version;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (version << 12) | r;
    for (let i = 0; i < 18; i++) {
      const a = taille - 11 + (i % 3);
      const c = Math.floor(i / 3);
      poser(a, c, bit(b, i));
      poser(c, a, bit(b, i));
    }
  }

  // Les données, en zigzag de colonnes de deux, de bas en haut puis de haut en bas.
  let i = 0;
  for (let droite = taille - 1; droite >= 1; droite -= 2) {
    if (droite === 6) droite = 5;
    for (let v = 0; v < taille; v++)
      for (let j = 0; j < 2; j++) {
        const x = droite - j;
        const monte = ((droite + 1) & 2) === 0;
        const y = monte ? taille - 1 - v : v;
        if (!fixe[y][x] && i < octets.length * 8) {
          modules[y][x] = bit(octets[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
  }

  // Le masque le moins pénalisé.
  let meilleur: boolean[][] = modules;
  let scoreMin = Infinity;
  for (let masque = 0; masque < 8; masque++) {
    const essai = modules.map((l, y) => l.map((f, x) => (!fixe[y][x] && masqueInverse(masque, x, y) ? !f : f)));
    // Les bits de format disent quel masque est appliqué.
    const sauvegarde = modules.map((l) => [...l]);
    format(masque);
    for (let y = 0; y < taille; y++) for (let x = 0; x < taille; x++) if (fixe[y][x]) essai[y][x] = modules[y][x];
    modules.forEach((l, y) => l.splice(0, taille, ...sauvegarde[y]));
    const score = penalite(essai);
    if (score < scoreMin) {
      scoreMin = score;
      meilleur = essai;
    }
  }
  return meilleur;
}

/** Le tracé SVG des modules foncés, marge comprise : un seul chemin, net à toutes les tailles. */
export function cheminQr(texte: string, marge = 4): { cote: number; d: string } {
  const m = matriceQr(texte);
  let d = "";
  m.forEach((l, y) =>
    l.forEach((f, x) => {
      if (f) d += `M${x + marge} ${y + marge}h1v1h-1z`;
    }),
  );
  return { cote: m.length + marge * 2, d };
}
