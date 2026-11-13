/*
 * Bailly Déménagement — le devis en ligne dans une page du site officiel.
 *
 * Le site (WordPress) ne fait pas tourner le formulaire : il l'affiche dans
 * un cadre, servi par la plateforme. Ce script pose le cadre, le tient à la
 * hauteur de son contenu et ramène la page en haut du formulaire à chaque
 * étape. Il suffit, dans un bloc HTML de la page :
 *
 *   <div data-bailly-devis></div>
 *   <script src="https://<la plateforme>/integration.js" async></script>
 *
 * Réglages facultatifs, sur le <div> :
 *   data-parcours="particulier" | "entreprise" | "mutation"   ouvre une seule porte
 *   data-mode="express" | "complet"                           (particulier) la branche
 *   data-transfert="simple" | "projet"                        (entreprise) la branche
 *   data-decalage="90"   hauteur en pixels d'un en-tête fixe du site, pour le retour en haut
 *
 * Les mêmes réglages peuvent venir de l'adresse de la page :
 * /devis/?parcours=entreprise ouvre directement la porte « Entreprise ».
 *
 * Le formulaire parle au site par messages : { source: "bailly-devis",
 * hauteur: 1840 } quand sa hauteur change, { source: "bailly-devis",
 * haut: true } quand il change d'étape (voir src/app/demande/integration.tsx).
 */
(function () {
  "use strict";

  var script =
    document.currentScript ||
    (function () {
      var s = document.querySelectorAll('script[src*="/integration.js"]');
      return s[s.length - 1];
    })();
  if (!script || !script.src) return;
  var ORIGINE = new URL(script.src, location.href).origin;
  var REGLAGES = ["parcours", "mode", "transfert"];

  function adresse(bloc) {
    var page = new URLSearchParams(location.search);
    var p = new URLSearchParams({ integre: "1" });
    REGLAGES.forEach(function (k) {
      var v = bloc.getAttribute("data-" + k) || page.get(k);
      if (v) p.set(k, v);
    });
    return ORIGINE + "/?" + p.toString();
  }

  function poser(bloc) {
    if (bloc.getAttribute("data-bailly-pose")) return;
    bloc.setAttribute("data-bailly-pose", "1");
    var cadre = document.createElement("iframe");
    cadre.src = adresse(bloc);
    cadre.title = "Demande de devis — Bailly Déménagement";
    cadre.setAttribute("loading", "eager");
    cadre.style.cssText = "display:block;width:100%;height:900px;border:0;margin:0;padding:0;background:transparent;";
    // Le lien de secours éventuellement laissé dans le bloc cède la place au cadre.
    bloc.innerHTML = "";
    bloc.appendChild(cadre);
  }

  function blocDe(source) {
    var cadres = document.querySelectorAll("[data-bailly-devis] iframe");
    for (var i = 0; i < cadres.length; i++) {
      if (cadres[i].contentWindow === source) return { cadre: cadres[i], bloc: cadres[i].parentNode };
    }
    return null;
  }

  window.addEventListener("message", function (e) {
    if (e.origin !== ORIGINE || !e.data || e.data.source !== "bailly-devis") return;
    var t = blocDe(e.source);
    if (!t) return;
    if (typeof e.data.hauteur === "number" && e.data.hauteur > 0) {
      t.cadre.style.height = Math.ceil(e.data.hauteur) + "px";
    }
    if (e.data.haut) {
      // Seulement si le haut du formulaire est sorti de l'écran : on n'agite pas une page déjà en place.
      var decalage = parseInt(t.bloc.getAttribute("data-decalage") || "0", 10) || 0;
      var haut = t.cadre.getBoundingClientRect().top;
      if (haut < decalage || haut > window.innerHeight * 0.4) {
        window.scrollTo({ top: Math.max(0, haut + window.pageYOffset - decalage - 12), behavior: "smooth" });
      }
    }
  });

  function toutPoser() {
    var blocs = document.querySelectorAll("[data-bailly-devis]");
    for (var i = 0; i < blocs.length; i++) poser(blocs[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", toutPoser);
  else toutPoser();
})();
