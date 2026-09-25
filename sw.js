/* =====================================================================
   sw.js — le facteur des notifications
   ---------------------------------------------------------------------
   Il ne fait qu'une chose : recevoir une notification envoyée par le
   serveur et l'afficher, même site fermé ; un appui ouvre la bonne
   page. Aucun cache, aucune interception des pages : le site se charge
   exactement comme avant.
   ===================================================================== */
self.addEventListener("install", function(){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function(e){
  var d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (err) { d = { texte: e.data ? e.data.text() : "" }; }
  var options = {
    body: d.texte || "",
    icon: "/icone-192.png",
    badge: "/icone-192.png",
    data: { url: d.url || "./index.html" },
    timestamp: Date.now()
  };
  /* même sujet (même discussion, même rappel) : la nouvelle remplace
     l'ancienne au lieu de s'empiler, et sonne quand même */
  if (d.tag) { options.tag = d.tag; options.renotify = true; }
  e.waitUntil(self.registration.showNotification(d.titre || "Suivi travaux 360", options));
});

self.addEventListener("notificationclick", function(e){
  e.notification.close();
  var cible = (e.notification.data && e.notification.data.url) || "./index.html";
  var url = new URL(cible, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(fenetres){
    for (var i = 0; i < fenetres.length; i++) {
      var w = fenetres[i];
      if (w.navigate && w.focus) {
        return w.navigate(url).then(function(x){ return (x || w).focus(); })
          .catch(function(){ return self.clients.openWindow(url); });
      }
    }
    return self.clients.openWindow(url);
  }));
});
