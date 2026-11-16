export const dynamic = "force-static";

/*
 * GET /tablette/sw.js — le service worker de la tablette de visite (retours
 * de Céline, 16/11/2026 : travailler hors connexion chez le client).
 *
 * Sa portée est « /tablette » : il ne commande QUE les pages de la tablette ;
 * le CRM, les espaces et les routes de l'API ne passent jamais par lui. Ce qu'il
 * garde est sans donnée : la page de secours /tablette/hors-ligne (une coque
 * vide, la même pour tous) et les fichiers publics de l'app (_next/static :
 * code, styles, polices, nommés d'après leur contenu, donc jamais périmés).
 * Aucune réponse d'API, aucune page du serveur n'est gardée.
 *
 * - Une page de la tablette se demande d'abord au réseau ; c'est seulement
 *   quand le réseau manque qu'il sert la page de secours, qui rouvre la
 *   visite depuis ce que la tablette a gardé (crm/visites/tablette/hors-ligne.ts).
 * - La coque se recharge à chaque visite ouverte avec du réseau (message
 *   « rafraichir ») : une nouvelle version de l'app la remplace, et les
 *   fichiers de l'ancienne s'en vont.
 * - Sans session, le proxy renvoie la coque vers la connexion : rien n'est
 *   gardé.
 *
 * Pour le retirer de toutes les tablettes : remplacer ce script par un
 * `self.registration.unregister()` ; la tablette retrouve alors son
 * fonctionnement en ligne, sa file d'attente (localStorage) intacte.
 */
const SCRIPT = `/* Bailly — service worker de la tablette de visite (voir src/app/(tablette)/tablette/sw.js/route.ts). */
const CACHE = "bailly-tablette-v1";
const COQUILLE = "/tablette/hors-ligne";

async function precharger() {
  let r;
  try {
    r = await fetch(COQUILLE, { credentials: "same-origin", cache: "no-store" });
  } catch (e) {
    return;
  }
  // Sans session, la coque est renvoyée vers la connexion : rien n'est gardé.
  if (!r.ok || r.redirected || !(r.headers.get("content-type") || "").includes("text/html")) return;
  const html = await r.clone().text();
  const fichiers = [...new Set(html.match(/\\/_next\\/static\\/[^"'\\s)\\\\<>]+/g) || [])];
  const cache = await caches.open(CACHE);
  const gardes = new Set([COQUILLE]);
  for (const f of fichiers) {
    try {
      if (!(await cache.match(f))) {
        const x = await fetch(f, { credentials: "same-origin" });
        if (!x.ok) continue;
        await cache.put(f, x);
      }
      gardes.add(f);
    } catch (e) {
      // Un fichier manquant : la page de secours le redemandera au réseau.
    }
  }
  await cache.put(COQUILLE, r);
  for (const req of await cache.keys()) {
    const u = new URL(req.url);
    if (!gardes.has(u.pathname + u.search) && !gardes.has(u.pathname)) await cache.delete(req);
  }
}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(precharger());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith("bailly-tablette-") && k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "rafraichir") e.waitUntil(precharger());
});

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return;
  if (r.mode === "navigate") {
    if (u.pathname !== "/tablette" && !u.pathname.startsWith("/tablette/")) return;
    // Le réseau d'abord ; la page de secours seulement quand il manque.
    e.respondWith(fetch(r).catch(async () => (await caches.match(COQUILLE)) || Response.error()));
    return;
  }
  if (u.pathname.startsWith("/_next/static/")) e.respondWith(caches.match(r).then((m) => m || fetch(r)));
});
`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // La portée « /tablette » (sans barre finale) couvre aussi l'accueil /tablette ; rien d'autre ne commence ainsi.
      "Service-Worker-Allowed": "/tablette",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'",
    },
  });
}
