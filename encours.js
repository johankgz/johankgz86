/* =====================================================================
   encours.js — la fiche en cours suit la personne d'un appareil à l'autre
   ---------------------------------------------------------------------
   Un relevé, un suivi, un point… commencé sur l'iPhone se poursuit sur
   l'iPad ou l'ordinateur, tel qu'on l'a laissé.

   Chaque appli garde sa fiche en cours sur l'appareil (IndexedDB, sous
   window.storage). Ce script fournit ce window.storage à toutes les
   applis (chargé avant elles, il remplace leur copie locale) et, pour
   les fiches en cours seulement, en garde une copie sur le site
   (serveur/encours.mjs), au nom de la personne connectée :
     - à chaque écriture, la copie part quelques secondes après, les
       photos à part, une seule fois chacune (sous leur empreinte) ;
     - à l'ouverture d'une appli, si le site a une version plus récente
       (écrite depuis un autre appareil), c'est elle qui s'ouvre ;
     - en revenant sur une appli restée ouverte, la page se recharge si
       la fiche a été poursuivie ailleurs entre-temps.
   Sans réseau, rien ne change : l'appareil garde sa fiche, et l'envoie
   au retour du réseau. La dernière version écrite l'emporte, mais l'autre
   n'est jamais perdue : quand deux appareils ont écrit chacun de leur côté
   (un iPad resté hors réseau, puis l'iPhone), la version qui cède est
   gardée sur l'appareil, et un bandeau propose de la rouvrir.
   ===================================================================== */
(function(){
  "use strict";
  if(window.storage) return;

  var local = (function(){
    var BASE="outils-chantier", MAGASIN="cles", base=null;
    function ouvrir(){
      if(base) return Promise.resolve(base);
      return new Promise(function(ok, non){
        if(!window.indexedDB) return non(new Error("IndexedDB indisponible"));
        var r;
        try{ r=indexedDB.open(BASE, 1); }catch(e){ return non(e); }
        r.onupgradeneeded=function(){
          if(!r.result.objectStoreNames.contains(MAGASIN)) r.result.createObjectStore(MAGASIN);
        };
        r.onsuccess=function(){ base=r.result; ok(base); };
        r.onerror=function(){ non(r.error || new Error("IndexedDB refusée")); };
        r.onblocked=function(){ non(new Error("IndexedDB occupée")); };
      });
    }
    function tx(mode, faire){
      return ouvrir().then(function(d){
        return new Promise(function(ok, non){
          var t, m, req;
          try{ t=d.transaction(MAGASIN, mode); m=t.objectStore(MAGASIN); req=faire(m); }
          catch(e){ return non(e); }
          t.oncomplete=function(){ ok(req ? req.result : null); };
          t.onerror=function(){ non(t.error || new Error("écriture refusée")); };
          t.onabort=function(){ non(t.error || new Error("écriture interrompue")); };
        });
      });
    }
    function local(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
    return {
      get:function(k){
        function secours(){ var v=local(k); return v==null ? null : {key:k, value:v}; }
        return tx("readonly", function(m){ return m.get(k); })
          .then(function(v){ return v==null ? secours() : {key:k, value:v}; })
          .catch(secours);
      },
      set:function(k, v){
        return tx("readwrite", function(m){ return m.put(v, k); })
          .then(function(){
            /* la copie d'avant ne sert plus, et elle occupe la place */
            try{ if(localStorage.getItem(k) !== null) localStorage.removeItem(k); }catch(e){}
            return {key:k, value:v};
          })
          .catch(function(){
            localStorage.setItem(k, v);        /* si ça échoue aussi, l'appli le saura */
            return {key:k, value:v};
          });
      },
      delete:function(k){
        try{ localStorage.removeItem(k); }catch(e){}
        return tx("readwrite", function(m){ return m.delete(k); })
          .catch(function(){})
          .then(function(){ return {key:k, deleted:true}; });
      },
      list:function(p){
        function locales(){
          var out=[];
          try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(!p||k.indexOf(p)===0) out.push(k); } }catch(e){}
          return out;
        }
        return tx("readonly", function(m){ return m.getAllKeys(); })
          .then(function(ks){
            var out=locales();
            (ks||[]).forEach(function(k){ k=String(k); if((!p||k.indexOf(p)===0) && out.indexOf(k)<0) out.push(k); });
            return {keys:out};
          })
          .catch(function(){ return {keys:locales()}; });
      }
    };
  })();

  /* ---------- les fiches qui suivent la personne ---------- */
  var APPLIS="releve|suivi|commande|point|autocontrole|reception|sav|etiquettes|photos|carnet|technique|note";
  var SUIVIES=new RegExp("^(?:"+APPLIS+"):courante?(?:[@#].*)?$");
  function suivie(k){ return typeof k==="string" && SUIVIES.test(k) && k.length<=160; }
  var META="encours§";                          /* ce que l'appareil sait de chaque fiche */
  var BLOB="§encours:";                        /* une photo remplacée par son empreinte */
  var SEUIL=2048;                                   /* au-delà, un data:… part à part */

  function session(){
    try{ var s=JSON.parse(localStorage.getItem("outils:session")||"null"); return s && s.jeton ? s : null; }catch(e){ return null; }
  }
  var enLigne = (location.protocol==="http:" || location.protocol==="https:")
    && !!(window.crypto && window.crypto.subtle && window.TextEncoder && window.fetch);
  function actif(){ return enLigne && !!session(); }
  function url(action){ return location.origin+"/api/rapports?action="+action; }
  function entetes(type){ var h={"x-auth":(session()||{}).jeton||""}; if(type) h["content-type"]=type; return h; }
  function appareil(){
    var ua=navigator.userAgent||"";
    if(/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints>1)) return "iPad";
    if(/iPhone/.test(ua)) return "iPhone";
    if(/Android/.test(ua)) return /Mobile/.test(ua) ? "téléphone Android" : "tablette Android";
    return "ordinateur";
  }
  function attendre(p, ms){
    return Promise.race([p, new Promise(function(ok){ setTimeout(function(){ ok(undefined); }, ms); })]);
  }

  /* ---------- ce que l'appareil sait d'une fiche : {sync, sale, quand} ----------
     sync : la version du site sur laquelle repose la copie de l'appareil ;
     sale : l'appareil a écrit depuis, pas encore envoyé ; quand : à quelle heure. */
  function lireMeta(k){
    return local.get(META+k).then(function(r){
      try{ return (r && r.value) ? JSON.parse(r.value) : {}; }catch(e){ return {}; }
    }).catch(function(){ return {}; });
  }
  function ecrireMeta(k, m){ return local.set(META+k, JSON.stringify(m)).catch(function(){}); }

  /* ---------- empreintes ---------- */
  var EMPREINTES=new Map();
  function empreinte(t){
    if(EMPREINTES.has(t)) return Promise.resolve(EMPREINTES.get(t));
    return crypto.subtle.digest("SHA-1", new TextEncoder().encode(t)).then(function(b){
      var h=Array.prototype.map.call(new Uint8Array(b), function(x){ return (x<16?"0":"")+x.toString(16); }).join("");
      EMPREINTES.set(t, h); return h;
    });
  }
  /* ce que l'accueil des autres appareils en dit : « il reste un relevé à enregistrer » */
  function resumeDe(o){
    if(!o || typeof o!=="object") return null;
    function t(v){ return String(v==null ? "" : v).trim(); }
    var cl=o.client||{}, ch=o.chantier||{}, af=o.affaire||{}, ga=o.garde||{};
    var client=t(cl.nom) || t(ch.client) || t(ga.nom);
    var ref=t(af.chantier) || t(ch.ref) || t(cl.ref);
    var photos=Array.isArray(o.photos) && o.photos.length;
    var rempli=!!(client || ref || photos);
    /* les applis notent les cases changées depuis le dernier enregistrement (_modifs) :
       une fiche publiée puis laissée telle quelle n'est plus « à enregistrer » */
    var modifs = (o._modifs && typeof o._modifs==="object") ? Object.keys(o._modifs).length>0 : true;
    return {client:client, ref:ref, aEnregistrer: rempli && modifs};
  }
  /* la fiche, ses photos remplacées par leur empreinte */
  function alleger(texte){
    var obj; try{ obj=JSON.parse(texte); }catch(e){ return Promise.resolve({v:texte, blobs:{}}); }
    var resume=resumeDe(obj);
    var blobs={}, attente=[];
    (function parcourir(o){
      if(!o || typeof o!=="object") return;
      Object.keys(o).forEach(function(c){
        var v=o[c];
        if(typeof v==="string" && v.length>SEUIL && v.slice(0,5)==="data:"){
          attente.push(empreinte(v).then(function(h){ blobs[h]=v; o[c]=BLOB+h; }));
        } else if(v && typeof v==="object") parcourir(v);
      });
    })(obj);
    return Promise.all(attente).then(function(){ return {v:JSON.stringify(obj), blobs:blobs, resume:resume}; });
  }
  /* la fiche du site, ses photos remises */
  function regarnir(texte){
    var obj; try{ obj=JSON.parse(texte); }catch(e){ return Promise.resolve(texte); }
    var places=[];
    (function parcourir(o){
      if(!o || typeof o!=="object") return;
      Object.keys(o).forEach(function(c){
        var v=o[c];
        if(typeof v==="string" && v.indexOf(BLOB)===0) places.push([o, c, v.slice(BLOB.length)]);
        else if(v && typeof v==="object") parcourir(v);
      });
    })(obj);
    var lues={};
    var hs=Array.from(new Set(places.map(function(p){ return p[2]; })));
    return parSerie(hs, 4, function(h){
      return fetch(url("encours-blob-lire")+"&h="+h, {headers:entetes()})
        .then(function(r){ if(!r.ok) throw new Error("photo manquante"); return r.text(); })
        .then(function(t){ lues[h]=t; EMPREINTES.set(t, h); });
    }).then(function(){
      places.forEach(function(p){ p[0][p[1]]=lues[p[2]]; });
      return JSON.stringify(obj);
    });
  }
  function parSerie(liste, n, faire){
    var i=0;
    function suivant(){ if(i>=liste.length) return Promise.resolve(); var x=liste[i++]; return faire(x).then(suivant); }
    var fils=[]; for(var k=0;k<Math.min(n, liste.length);k++) fils.push(suivant());
    return Promise.all(fils);
  }

  /* ---------- ce que le site a en cours (lu une fois, puis gardé un instant) ---------- */
  var LISTE=null, LISTE_T=0;
  function liste(frais){
    if(!actif()) return Promise.resolve(null);
    if(!frais && LISTE && Date.now()-LISTE_T < 8000) return LISTE;
    LISTE_T=Date.now();
    LISTE=attendre(fetch(url("encours-liste"), {headers:entetes()})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){ return d && d.fiches ? d.fiches : null; })
      .catch(function(){ return null; }), 4000)
      .then(function(x){ if(x===undefined){ LISTE=null; return null; } return x; });
    return LISTE;
  }

  /* ---------- envoyer la fiche (quelques secondes après la dernière écriture) ---------- */
  var MINUTEURS={}, EN_VOL={};
  function planifier(k, ms){
    clearTimeout(MINUTEURS[k]);
    MINUTEURS[k]=setTimeout(function(){ envoyer(k); }, ms==null ? 2500 : ms);
  }
  function envoyer(k){
    if(!actif()) return Promise.resolve(false);
    if(EN_VOL[k]){ planifier(k, 1500); return EN_VOL[k]; }
    var tour;
    EN_VOL[k] = lireMeta(k).then(function(m){
      if(!m.sale) return true;
      tour=m.quand;
      /* un autre appareil a écrit depuis la version sur laquelle repose celle-ci :
         sa version est gardée ici avant d'être remplacée sur le site */
      var verif = liste(true).then(function(fiches){
        if(!fiches) throw new Error("site injoignable");
        var e=fiches[k];
        if(!e || !e.maj || e.efface || e.maj===m.sync || m.gardee===e.maj) return;
        return garderSite(k, e).then(function(){ return lireMeta(k); })
          .then(function(m3){ m3.gardee=e.maj; return ecrireMeta(k, m3); });
      });
      return verif.then(function(){ return local.get(k); }).then(function(r){
        var v = r && r.value;
        if(v==null){
          return fetch(url("encours-effacer"), {method:"POST", headers:entetes("application/json"),
            body:JSON.stringify({k:k, appareil:appareil()})}).then(function(rep){ return rep.ok ? rep.json() : null; });
        }
        return alleger(String(v)).then(function(a){
          var hs=Object.keys(a.blobs);
          var avant = hs.length
            ? fetch(url("encours-manque"), {method:"POST", headers:entetes("application/json"), body:JSON.stringify({h:hs})})
                .then(function(rep){ if(!rep.ok) throw new Error("refus"); return rep.json(); })
                .then(function(d){
                  return parSerie(d.manque||[], 3, function(h){
                    return fetch(url("encours-blob")+"&h="+h, {method:"POST", headers:entetes("text/plain;charset=utf-8"), body:a.blobs[h]})
                      .then(function(rep){ if(!rep.ok) throw new Error("photo refusée"); });
                  });
                })
            : Promise.resolve();
          return avant.then(function(){
            return fetch(url("encours-ecrire"), {method:"POST", headers:entetes("application/json"),
              body:JSON.stringify({k:k, v:a.v, blobs:hs, appareil:appareil(), resume:a.resume||null})})
              .then(function(rep){ return rep.ok ? rep.json() : null; });
          });
        });
      }).then(function(d){
        if(!d || !d.ok) return false;
        /* écrite de nouveau pendant l'envoi : elle repartira ; sinon la copie est à jour */
        return lireMeta(k).then(function(m2){
          var propre = m2.quand===tour;
          LISTE=null;
          return ecrireMeta(k, {sync:d.maj, sale:!propre, quand:m2.quand}).then(function(){
            if(!propre) planifier(k);
            return true;
          });
        });
      });
    }).catch(function(){ planifier(k, 30000); return false; })     /* pas de réseau : on réessaie plus tard */
      .then(function(x){ EN_VOL[k]=null; return x; });
    return EN_VOL[k];
  }
  /* au retour du réseau, ou au lancement : ce qui n'est pas encore parti */
  function rattraper(){
    if(!actif()) return;
    local.list(META).then(function(r){
      (r.keys||[]).forEach(function(mk){
        var k=mk.slice(META.length);
        if(!suivie(k)) return;
        lireMeta(k).then(function(m){ if(m.sale) planifier(k, 800); });
      });
    });
  }

  /* ---------- reprendre la version du site ---------- */
  var LUES={};                    /* les fiches lues par cette page : à surveiller */
  function reprendre(k, e){
    if(e.efface){
      return local.delete(k).then(function(){ return ecrireMeta(k, {sync:e.maj, sale:false}); })
        .then(function(){ return {key:k, value:null, efface:true}; });
    }
    return fetch(url("encours-lire")+"&k="+encodeURIComponent(k), {headers:entetes()})
      .then(function(r){ if(!r.ok) throw new Error("illisible"); return r.json(); })
      .then(function(d){ return regarnir(d.v).then(function(v){ return {v:v, d:d}; }); })
      .then(function(x){
        return local.set(k, x.v).then(function(){ return ecrireMeta(k, {sync:x.d.maj, sale:false}); })
          .then(function(){ return {key:k, value:x.v, appareil:x.d.appareil, maj:x.d.maj}; });
      });
  }
  /* le site a-t-il, pour cette fiche, une version que l'appareil n'a pas ? */
  function plusRecente(k, fiches, m){
    var e = fiches && fiches[k];
    if(!e || !e.maj || e.maj===m.sync) return null;
    if(m.sale){
      /* écrite ici aussi depuis : la dernière écrite l'emporte (l'heure de l'appareil faute de mieux) */
      if(m.quand && m.quand > e.maj) return null;
    }
    return e;
  }

  /* ---------- la version qui cède est gardée, jamais perdue ---------- */
  var GARDE="encours-garde§";
  function garder(k, v, info){
    if(v==null) return Promise.resolve();
    var le=new Date().toISOString();
    var cle=GARDE+k+"§"+le+"§"+Math.random().toString(36).slice(2,6);
    var g={k:k, v:String(v), appareil:info.appareil||"", quand:info.quand||le, ici:!!info.ici, avant:!!info.avant, le:le};
    return local.set(cle, JSON.stringify(g))
      .then(function(){ return local.list(GARDE+k+"§"); })
      .then(function(r){ var ks=(r.keys||[]).sort(); return Promise.all(ks.slice(0, Math.max(0, ks.length-5)).map(function(x){ return local.delete(x); })); })
      .then(function(){ setTimeout(proposerGardes, 600); })
      .catch(function(){});
  }
  /* la version du site, avant que cet appareil ne l'écrase sans l'avoir vue */
  function garderSite(k, e){
    return fetch(url("encours-lire")+"&k="+encodeURIComponent(k), {headers:entetes()})
      .then(function(r){
        if(r.status===404) return null;                    /* plus rien sur le site */
        if(!r.ok) throw new Error("site injoignable");
        return r.json();
      })
      .then(function(d){
        if(!d || d.v==null) return;
        return regarnir(d.v).catch(function(){ return d.v; })
          .then(function(v){ return garder(k, v, {appareil:d.appareil||e.appareil||"", quand:d.maj||e.maj}); });
      });
  }
  /* « Ouvrir cette version » : l'échange se fait au rechargement, avant que l'appli ne lise sa fiche */
  function echangeEnAttente(k){
    var x=null; try{ x=JSON.parse(sessionStorage.getItem("encours:echange")||"null"); }catch(e){}
    if(!x || x.k!==k) return Promise.resolve();
    try{ sessionStorage.removeItem("encours:echange"); }catch(e){}
    return local.get(x.g).then(function(r){
      var g=null; try{ g=(r && r.value) ? JSON.parse(r.value) : null; }catch(e){}
      if(!g) return;
      return local.get(k).then(function(c){
        var avant = (c && c.value!=null && c.value!==g.v) ? garder(k, c.value, {avant:true, appareil:appareil()}) : Promise.resolve();
        return avant.then(function(){ return local.set(k, g.v); })
          .then(function(){ return local.delete(x.g); })
          .then(function(){ return lireMeta(k); })
          .then(function(m){ m.sale=true; m.quand=new Date().toISOString(); return ecrireMeta(k, m); })
          .then(function(){ planifier(k); });
      });
    }).catch(function(){});
  }
  function libelleGarde(g){
    var h=heure(g.quand);
    if(g.avant) return "la version ouverte juste avant (sur cet appareil)";
    if(g.ici) return "la version de cet appareil, écrite "+h+", pas encore envoyée";
    return "la version laissée "+depuis({appareil:g.appareil})+" "+h;
  }
  /* le bandeau : les versions gardées de la fiche de cette page */
  function proposerGardes(){
    if(!document.body) return;
    local.list(GARDE).then(function(r){
      var ks=(r.keys||[]).filter(function(c){
        var k=c.slice(GARDE.length).split("§")[0];
        return deCettePage(k) && k.indexOf("@")<0 && k.indexOf("#")<0;
      });
      return Promise.all(ks.map(function(c){
        return local.get(c).then(function(x){ var g=null; try{ g=JSON.parse(x.value); }catch(e){} return g ? {cle:c, g:g} : null; });
      }));
    }).then(function(L){
      L=(L||[]).filter(Boolean);
      /* une version gardée identique à celle ouverte ne sert à rien */
      return Promise.all(L.map(function(x){
        return local.get(x.g.k).then(function(c){
          if(c && c.value===x.g.v){ return local.delete(x.cle).then(function(){ return null; }); }
          return x;
        });
      }));
    }).then(function(L){
      L=(L||[]).filter(Boolean).sort(function(a,b){ return String(b.g.le).localeCompare(String(a.g.le)); });
      var vieux=document.getElementById("encoursGardes"); if(vieux) vieux.remove();
      if(!L.length || proposerGardes.plusTard) return;
      var b=document.createElement("div"); b.id="encoursGardes"; b.setAttribute("role","region"); b.setAttribute("aria-label","Autres versions de la fiche");
      b.style.cssText="position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:3001;"
        +"width:min(94vw,520px);padding:12px 14px;border-radius:14px;background:#1E2329;color:#fff;font:500 14px/1.4 system-ui,sans-serif;"
        +"box-shadow:0 10px 30px rgba(0,0,0,.35);border-left:4px solid #F59E0B";
      var t=document.createElement("div"); t.style.cssText="font-weight:700;margin:0 26px 6px 0";
      t.textContent = L.length>1 ? "D'autres versions de cette fiche sont gardées" : "Une autre version de cette fiche est gardée";
      b.appendChild(t);
      var x=document.createElement("button"); x.type="button"; x.setAttribute("aria-label","Plus tard"); x.textContent="×";
      x.style.cssText="position:absolute;right:8px;top:6px;width:34px;height:34px;border:0;border-radius:50%;background:transparent;color:#fff;font:400 24px/1 system-ui;cursor:pointer";
      x.addEventListener("click", function(){ proposerGardes.plusTard=true; b.remove(); });
      b.appendChild(x);
      L.forEach(function(it){
        var l=document.createElement("div"); l.style.cssText="padding:8px 0;border-top:1px solid rgba(255,255,255,.12)";
        var p=document.createElement("div"); p.style.cssText="margin-bottom:8px;color:rgba(255,255,255,.85)";
        var res=null; try{ res=resumeDe(JSON.parse(it.g.v)); }catch(e){}
        p.textContent=libelleGarde(it.g).replace(/^./, function(c){ return c.toUpperCase(); })+(res && (res.client||res.ref) ? " — "+[res.client, res.ref].filter(Boolean).join(" · ") : "")+".";
        l.appendChild(p);
        var o=document.createElement("button"); o.type="button"; o.textContent="Ouvrir cette version";
        o.style.cssText="min-height:40px;padding:0 14px;margin-right:8px;border:0;border-radius:999px;background:#F59E0B;color:#111;font:700 14px system-ui;cursor:pointer";
        o.addEventListener("click", function(){
          if(!window.confirm("Ouvrir "+libelleGarde(it.g)+" ?\n\nLa fiche ouverte maintenant est gardée à son tour : vous pourrez y revenir.")) return;
          try{ sessionStorage.setItem("encours:echange", JSON.stringify({k:it.g.k, g:it.cle})); }catch(e){ return; }
          location.reload();
        });
        var j=document.createElement("button"); j.type="button"; j.textContent="Jeter";
        j.style.cssText="min-height:40px;padding:0 14px;border:1px solid rgba(255,255,255,.3);border-radius:999px;background:transparent;color:#fff;font:600 14px system-ui;cursor:pointer";
        j.addEventListener("click", function(){
          if(!window.confirm("Jeter "+libelleGarde(it.g)+" ?\n\nElle sera perdue.")) return;
          local.delete(it.cle).then(proposerGardes);
        });
        l.appendChild(o); l.appendChild(j); b.appendChild(l);
      });
      document.body.appendChild(b);
    }).catch(function(){});
  }

  /* la fiche de l'appli ouverte (et pas celles que la page du chantier relit au passage) */
  function deCettePage(k){
    var page=(location.pathname.split("/").pop()||"").replace(/\.html$/,"");
    return k.split(":")[0]===page;
  }
  /* ---------- un petit mot quand la fiche vient d'un autre appareil ---------- */
  function dire(texte){
    function poser(){
      var b=document.getElementById("encoursMot");
      if(!b){
        b=document.createElement("div"); b.id="encoursMot"; b.setAttribute("role","status");
        b.style.cssText="position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:3000;"
          +"max-width:min(92vw,460px);padding:10px 16px;border-radius:12px;background:#1E2329;color:#fff;font:600 13.5px/1.35 system-ui,sans-serif;"
          +"box-shadow:0 8px 24px rgba(0,0,0,.25);text-align:center;pointer-events:none;transition:opacity .3s";
        document.body.appendChild(b);
      }
      b.textContent=texte; b.style.opacity="1";
      clearTimeout(dire.t); dire.t=setTimeout(function(){ b.style.opacity="0"; }, 4500);
    }
    if(document.body) poser(); else document.addEventListener("DOMContentLoaded", poser);
  }
  function heure(iso){
    var d=new Date(iso); if(isNaN(d)) return "";
    var auj=new Date(), memeJour=d.toDateString()===auj.toDateString();
    var h=String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
    return memeJour ? "à "+h : "le "+d.toLocaleDateString("fr-FR",{day:"numeric",month:"long"})+" à "+h;
  }
  function depuis(e){
    var a=e.appareil||"";
    if(!a) return "sur un autre appareil";
    if(/^tablette/.test(a)) return "sur la "+a;
    if(/^téléphone/.test(a)) return "sur le "+a;
    return "sur l'"+a;                                /* l'iPhone, l'iPad, l'ordinateur */
  }

  /* ---------- tant que la fiche de la page n'est pas chargée, on n'y touche pas ----------
     Reprise d'un autre appareil (et ses photos), sur un réseau faible : la fiche peut mettre
     plusieurs secondes à arriver. Le formulaire est déjà là, mais la fiche pas encore : un
     toucher (Rouvrir, une case, un onglet) partait dans le vide (« null is not an object »),
     ou ce qu'on tapait était effacé à l'arrivée de la fiche. Le formulaire attend donc, grisé,
     que les lectures du démarrage soient faites ; au-delà d'une demi-seconde, il le dit. */
  var VOILE={attente:0, courant:false, fini:false, debut:Date.now(), t:0, mot:0};
  function voileStyle(){
    if(document.getElementById("ficheChargeStyle")) return;
    var st=document.createElement("style"); st.id="ficheChargeStyle";
    st.textContent="html.fiche-charge main,html.fiche-charge #nav{pointer-events:none!important}"
      +"html.fiche-charge main{opacity:.55;transition:opacity .2s}"
      +"#ficheCharge{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 96px);transform:translateX(-50%);z-index:3000;"
      +"display:flex;align-items:center;gap:10px;max-width:min(92vw,440px);padding:11px 16px;border-radius:14px;background:#1E2329;color:#fff;"
      +"font:600 13.5px/1.35 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3)}"
      +"#ficheCharge i{flex:0 0 auto;width:16px;height:16px;border-radius:50%;border:2.5px solid rgba(255,255,255,.25);border-top-color:#22D3EE;animation:ficheTourne .8s linear infinite}"
      +"@keyframes ficheTourne{to{transform:rotate(360deg)}}";
    (document.head||document.documentElement).appendChild(st);
  }
  function voileDire(t){
    if(!document.body) return;
    var b=document.getElementById("ficheCharge");
    if(!b){ b=document.createElement("div"); b.id="ficheCharge"; b.setAttribute("role","status"); b.innerHTML="<i></i><span></span>"; document.body.appendChild(b); }
    b.lastChild.textContent=t;
  }
  function voileFin(){
    if(VOILE.fini) return;
    VOILE.fini=true; clearTimeout(VOILE.t); clearTimeout(VOILE.mot); clearTimeout(VOILE.mot2);
    document.documentElement.classList.remove("fiche-charge");
    var b=document.getElementById("ficheCharge"); if(b) b.remove();
  }
  function voile(k, p){
    if(VOILE.fini) return p;
    /* rien à attendre si la page n'ouvre pas sa fiche dès son démarrage */
    if(!VOILE.courant && Date.now()-VOILE.debut > 5000){ VOILE.fini=true; return p; }
    if(!VOILE.courant && deCettePage(k) && /:courante?$/.test(k)){
      VOILE.courant=true;
      voileStyle(); document.documentElement.classList.add("fiche-charge");
      VOILE.mot=setTimeout(function(){ voileDire("Ouverture de la fiche…"); }, 500);
      VOILE.mot2=setTimeout(function(){ voileDire("La fiche arrive du site (réseau faible)… un instant."); }, 6000);
      VOILE.t=setTimeout(voileFin, 45000);           /* quoi qu'il arrive, la page ne reste pas figée */
    }
    VOILE.attente++;
    function fait(){
      VOILE.attente--;
      /* la page reçoit la fiche juste après : on la laisse la poser avant de rendre la main */
      if(VOILE.courant && VOILE.attente<=0) setTimeout(function(){ if(VOILE.attente<=0) voileFin(); }, 80);
    }
    p.then(fait, fait);
    return p;
  }

  /* ---------- window.storage : comme avant, la copie sur le site en plus ---------- */
  window.storage = {
    get:function(k){
      if(!suivie(k)) return local.get(k);
      if(!actif()) return echangeEnAttente(k).then(function(){ return local.get(k); });
      LUES[k]=true;
      return echangeEnAttente(k).then(function(){ return Promise.all([lireMeta(k), liste()]); }).then(function(x){
        var m=x[0], e=plusRecente(k, x[1], m);
        if(!e){
          return local.get(k).then(function(r){
            /* une fiche commencée avant que l'appareil ne suive : elle part, pour être reprise ailleurs */
            if(r && r.value!=null && !m.sync && !m.sale && !(x[1] && x[1][k])){
              ecrireMeta(k, {sale:true, quand:new Date().toISOString()}).then(function(){ planifier(k); });
            }
            return r;
          });
        }
        /* l'appareil a écrit sans pouvoir l'envoyer (hors réseau) : sa version est gardée avant de prendre l'autre */
        var avant = m.sale
          ? local.get(k).then(function(r){ if(r && r.value!=null) return garder(k, r.value, {ici:true, appareil:appareil(), quand:m.quand}); })
          : Promise.resolve();
        return avant.then(function(){ return reprendre(k, e); }).then(function(r){
          if(!r.efface && k.indexOf("@")<0 && k.indexOf("#")<0 && deCettePage(k))
            dire("Fiche reprise telle que laissée "+depuis(e)+" "+heure(e.maj)+"."+(m.sale ? " Celle de cet appareil est gardée." : ""));
          return r.value==null ? null : {key:k, value:r.value};
        }, function(){ return local.get(k); });          /* site injoignable en route : la copie de l'appareil */
      });
    },
    set:function(k, v){
      var p=local.set(k, v);
      if(!suivie(k)) return p;
      return p.then(function(r){
        var quand=new Date().toISOString();
        return lireMeta(k).then(function(m){ m.sale=true; m.quand=quand; return ecrireMeta(k, m); })
          .then(function(){ planifier(k); return r; });
      });
    },
    delete:function(k){
      var p=local.delete(k);
      if(!suivie(k)) return p;
      return p.then(function(r){
        return lireMeta(k).then(function(m){ m.sale=true; m.quand=new Date().toISOString(); return ecrireMeta(k, m); })
          .then(function(){ planifier(k); return r; });
      });
    },
    list:function(p){ return local.list(p); }
  };
  /* la lecture, vue par le voile du démarrage (ci-dessus) */
  var lireFiche=window.storage.get;
  window.storage.get=function(k){ return voile(k, lireFiche(k)); };

  /* ---------- l'appli restée ouverte : la fiche a-t-elle été poursuivie ailleurs ? ---------- */
  function verifier(){
    var cles=Object.keys(LUES);
    if(!cles.length || !actif()) return;
    liste(true).then(function(fiches){
      if(!fiches) return;
      cles.forEach(function(k){
        lireMeta(k).then(function(m){
          if(m.sale){ planifier(k, 300); return; }       /* l'appareil a du neuf : c'est lui qui part */
          var e=plusRecente(k, fiches, m);
          if(!e) return;
          reprendre(k, e).then(function(){
            if(k.indexOf("@")>=0 || k.indexOf("#")>=0 || !deCettePage(k)) return;
            try{ sessionStorage.setItem("encours:mot", "Fiche mise à jour telle que laissée "+depuis(e)+" "+heure(e.maj)+"."); }catch(err){}
            location.reload();
          }, function(){});
        });
      });
    });
  }
  document.addEventListener("visibilitychange", function(){
    if(document.visibilityState==="visible") verifier();
    else Object.keys(MINUTEURS).forEach(function(k){ envoyer(k); });   /* on quitte : ce qui attend part tout de suite */
  });
  window.addEventListener("pageshow", function(ev){ if(ev.persisted) verifier(); });
  window.addEventListener("online", rattraper);
  try{
    var mot=sessionStorage.getItem("encours:mot");
    if(mot){ sessionStorage.removeItem("encours:mot"); dire(mot); }
  }catch(e){}
  setTimeout(rattraper, 4000);
  setTimeout(proposerGardes, 1500);
})();
