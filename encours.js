/* =====================================================================
   encours.js — la fiche en cours reste sur l'appareil où on l'a commencée
   ---------------------------------------------------------------------
   Un relevé, un suivi, un point… commencé sur l'iPhone reste sur l'iPhone ;
   sur l'iPad, sur l'iPad ; sur l'ordinateur, sur l'ordinateur. Rien ne
   passe d'un appareil à l'autre : un appareil ne remplace jamais sa fiche
   par celle d'un autre (demandé par le propriétaire, après un relevé
   commencé sur l'iPad hors réseau, écrasé au retour par celui de l'iPhone).
   Ce qui est publié (dossier du chantier) se retrouve partout, comme avant.

   Ce script fournit window.storage à toutes les applis (chargé avant
   elles, il remplace leur copie) : IndexedDB, localStorage en secours.
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

  window.storage = local;
})();
