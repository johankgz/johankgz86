/* =====================================================================
   pied.js — le pied de page commun : mentions légales, confidentialité,
   conditions. Le même sur toutes les pages, ajouté en fin de page.
   Pas de « Gérer mes cookies » : le site n'en dépose aucun.
   Les pages envoyées aux clients (lien, QR code, rendez-vous) ne
   montrent que ce qui les concerne ; les éditeurs plein écran, dont la
   page ne défile pas, gardent le lien dans « Aide » et « Mon compte ».
   ===================================================================== */
(function(){
  "use strict";
  if(document.getElementById("piedSite")) return;
  var b = document.body;
  if(!b) return;
  var st = getComputedStyle(b), sh = getComputedStyle(document.documentElement);
  if(st.overflow === "hidden" || st.overflowY === "hidden" || sh.overflowY === "hidden") return;

  var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  var publique = page === "client.html" || page === "rdv.html";
  var LIENS = [
    ["./mentions-legales.html", "Mentions légales"],
    ["./confidentialite.html", "Confidentialité"]
  ];
  if(!publique) LIENS.push(
    ["./cgu.html", "Conditions d'utilisation"],
    ["./conditions-abonnement.html", "Conditions d'abonnement"],
    ["./sous-traitance.html", "Sous-traitance des données"]
  );

  var css = document.createElement("style");
  css.textContent =
    "#piedSite{position:relative;z-index:1;clear:both;text-align:center;font-family:inherit;font-size:12.5px;line-height:1.6;" +
    "padding:18px 16px calc(18px + env(safe-area-inset-bottom));margin:0}" +
    "#piedSite nav{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 14px}" +
    "#piedSite a{color:inherit;text-decoration:underline;text-underline-offset:2px}" +
    "#piedSite a[aria-current]{text-decoration:none;font-weight:650}" +
    "#piedSite a:focus-visible{outline:3px solid currentColor;outline-offset:2px;border-radius:3px}" +
    "@media print{#piedSite{display:none}}";
  document.head.appendChild(css);

  var f = document.createElement("footer");
  f.id = "piedSite"; f.className = "pied-site";
  var n = document.createElement("nav");
  n.setAttribute("aria-label", "Informations légales");
  LIENS.forEach(function(l){
    var a = document.createElement("a");
    a.href = l[0]; a.textContent = l[1];
    if(l[0].slice(2) === page) a.setAttribute("aria-current", "page");
    n.appendChild(a);
  });
  f.appendChild(n);
  b.appendChild(f);

  /* une barre fixée en bas de l'écran (enregistrer, publier…) ne doit pas le cacher */
  function degager(){
    var h = 0, H = window.innerHeight;
    Array.prototype.forEach.call(b.children, function(e){
      if(e === f) return;
      var s = getComputedStyle(e);
      if(s.position !== "fixed" || s.display === "none" || s.visibility === "hidden") return;
      var r = e.getBoundingClientRect();
      if(r.height > 0 && r.height < H * 0.4 && r.bottom >= H - 2 && r.width > window.innerWidth * 0.5) h = Math.max(h, r.height);
    });
    f.style.paddingBottom = "calc(" + (18 + h) + "px + env(safe-area-inset-bottom))";
  }
  degager();
  window.addEventListener("resize", degager);
  setTimeout(degager, 1200);
})();
