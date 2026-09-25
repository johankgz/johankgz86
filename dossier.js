/* =====================================================================
   dossier.js — un dossier de chantier, le même partout
   ---------------------------------------------------------------------
   La carte d'un dossier et tout ce qu'on y fait : documents (Ouvrir,
   supprimer, « Lu par », « Nouveau », OK saisie), sous-dossier
   « Suivi de chantier », itinéraire, accès, discussion, « En attente de
   réponse », archivage. « Tous mes chantiers » et la page du chantier
   s'en servent toutes les deux : une seule vue, un seul code.

   Chaque page le configure :
     Dossier.configurer({session, charger, toast, apresArchive})
     Dossier.moi({nom, role})           qui regarde
     Dossier.carte(chantier, rang, {ouvertParDefaut, integree})
   ===================================================================== */
(function(){
"use strict";
var CFG={}, S=null, MOI=null;
var API="/api/rapports";
var $=function(i){ return document.getElementById(i); };
function charger(){ if(CFG.charger) CFG.charger(); }
function toast(t){ if(CFG.toast) CFG.toast(t); }
function appInstallee(){
  try{
    return !!window.navigator.standalone
      || window.matchMedia("(display-mode: standalone)").matches;
  }catch(e){ return false; }
}
function octets(n){ return n>1048576 ? (n/1048576).toFixed(1).replace(".",",")+" Mo" : Math.round(n/1024)+" Ko"; }
function frDate(d){ if(!d) return ""; var a=String(d).slice(0,10).split("-"); return a[2]+"/"+a[1]+"/"+a[0]; }


/* ---------- export des photos en ZIP (sans bibliothèque) ---------- */
var CRC_TABLE = (function(){
  var t=new Uint32Array(256);
  for(var n=0;n<256;n++){
    var c=n;
    for(var k=0;k<8;k++) c = (c&1) ? (0xEDB88320 ^ (c>>>1)) : (c>>>1);
    t[n]=c>>>0;
  }
  return t;
})();
function crc32(buf){
  var c=0xFFFFFFFF;
  for(var i=0;i<buf.length;i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c>>>8);
  return (c ^ 0xFFFFFFFF)>>>0;
}
function b64ToBytes(b64){
  var bin=atob(b64), out=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
  return out;
}
function nomFichier(t){
  return String(t||"photo").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^A-Za-z0-9 _-]+/g,"").trim().replace(/\s+/g,"-").slice(0,48) || "photo";
}
function creerZip(fichiers){          /* [{nom, octets}] -> Blob */
  var enc=new TextEncoder(), morceaux=[], central=[], offset=0;
  function u32(n){ return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]); }
  function u16(n){ return new Uint8Array([n&255,(n>>>8)&255]); }
  fichiers.forEach(function(f){
    var nom=enc.encode(f.nom), data=f.octets, crc=crc32(data);
    var entete=[
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nom.length), u16(0), nom
    ];
    entete.forEach(function(p){ morceaux.push(p); });
    morceaux.push(data);
    central.push({nom:nom, crc:crc, taille:data.length, offset:offset});
    offset += 30 + nom.length + data.length;
  });
  var debutCentral=offset, tailleCentral=0;
  central.forEach(function(c){
    var e=[
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(c.crc), u32(c.taille), u32(c.taille), u16(c.nom.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset), c.nom
    ];
    e.forEach(function(p){ morceaux.push(p); });
    tailleCentral += 46 + c.nom.length;
  });
  [u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
   u32(tailleCentral), u32(debutCentral), u16(0)].forEach(function(p){ morceaux.push(p); });
  return new Blob(morceaux, {type:"application/zip"});
}

function nomLisible(f){
  var base=(f.titre||"document").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^A-Za-z0-9 ]+/g,"").trim().replace(/\s+/g,"-").toLowerCase();
  var ext = f.cle.slice(f.cle.lastIndexOf("."));
  return (f.date||"").slice(0,10) + "-" + base + ext;
}
function archiver(c, bouton){
  if(!window.confirm("Exporter tous les documents de " + (c.client||c.ref) + " ("
    + c.fichiers.length + " document" + (c.fichiers.length>1?"s":"")
    + "), puis le supprimer du site ?\n\nLe fichier ZIP sera téléchargé sur cet appareil. "
    + "La suppression est définitive.")) return;
  bouton.textContent="Export en cours…"; bouton.disabled=true;
  var fichiers=[], manifeste=["Travaux : "+(c.client||"")+" ("+c.ref+")",
    c.adresse||"", "Archivé le "+new Date().toLocaleString("fr-FR"), "", "Documents :"];
  var suite=Promise.resolve();
  c.fichiers.forEach(function(f){
    suite=suite.then(function(){
      return fetch(API+"?action=fichier&cle="+encodeURIComponent(f.cle)+"&auth="+encodeURIComponent(S.jeton))
        .then(function(r){ if(!r.ok) throw new Error("fichier"); return r.arrayBuffer(); })
        .then(function(buf){
          fichiers.push({nom:c.ref+"/"+nomLisible(f), octets:new Uint8Array(buf)});
          manifeste.push("  " + nomLisible(f) + "   " + (f.auteur||"") + "   " + octets(f.taille));
        });
    });
    if(f.donnees){
      suite=suite.then(function(){
        return fetch(API+"?action=fiche&cle="+encodeURIComponent(f.cle)+"&auth="+encodeURIComponent(S.jeton))
          .then(function(r){ return r.ok ? r.text() : null; })
          .then(function(txt){
            if(!txt) return;
            fichiers.push({nom:c.ref+"/fiches/"+nomLisible(f).replace(/\.pdf$/,".json"),
                           octets:new TextEncoder().encode(txt)});
          }).catch(function(){});
      });
    }
  });
  suite.then(function(){
    fichiers.push({nom:c.ref+"/00-contenu.txt", octets:new TextEncoder().encode(manifeste.join("\n"))});
    return fetch(API+"?action=messages&ref="+encodeURIComponent(c.ref), {headers:{"x-auth":S.jeton}})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){
        if(d && d.messages && d.messages.length){
          var lignes=["Discussion du chantier "+(c.client||c.ref)+" ("+c.ref+")",
            d.messages.length+" message"+(d.messages.length>1?"s":""), ""];
          d.messages.forEach(function(m){
            lignes.push(m.auteur+"  "+String(m.quand).slice(0,10).split("-").reverse().join("/")
              +" "+String(m.quand).slice(11,16));
            if(m.texte) lignes.push("  "+m.texte.replace(/\n/g, "\n  "));
            if(m.photo) lignes.push("  [photo jointe]");
            lignes.push("");
          });
          fichiers.push({nom:c.ref+"/discussion.txt",
            octets:new TextEncoder().encode(lignes.join("\n"))});
        }
        return null;
      })
      .catch(function(){ return null; });
  }).then(function(){
    var blob=creerZip(fichiers);
    var nom="Travaux-"+c.ref+".zip";
    var a=document.createElement("a");
    a.href=URL.createObjectURL(blob); a.download=nom; a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 3000);
    bouton.textContent="Suppression…";
    return new Promise(function(res){ setTimeout(res, 1200); });
  }).then(function(){
    if(!window.confirm("Le ZIP a été téléchargé. Vérifiez-le si vous le souhaitez.\n\n"
      + "Supprimer maintenant ce dossier du site ?")){
      bouton.textContent="Archiver"; bouton.disabled=false;
      return null;
    }
    return fetch(API+"?action=supprimer-chantier&ref="+encodeURIComponent(c.ref),
      {headers:{"x-auth":S.jeton}})
      .then(function(r){ return r.json().then(function(d){ return {ok:r.ok,d:d}; }); })
      .then(function(res){
        if(!res.ok){ window.alert(res.d.erreur||"Suppression refusée."); bouton.textContent="Archiver"; bouton.disabled=false; return; }
        if(CFG.apresArchive) CFG.apresArchive(c); else charger();
      });
  }).catch(function(){
    window.alert("Export interrompu. Rien n'a été supprimé.");
    bouton.textContent="Archiver"; bouton.disabled=false;
  });
}

function ouvrirAcces(c){
  var ov=document.createElement("div");
  ov.style.cssText="position:fixed;inset:0;z-index:70;background:rgba(26,24,21,.55);"
    +"-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:flex-end";
  var feuille=document.createElement("div");
  feuille.style.cssText="background:var(--bg);width:100%;max-height:84vh;overflow:auto;"
    +"padding:18px 16px calc(20px + env(safe-area-inset-bottom,0px));border-top:2px solid var(--ink)";
  var h=document.createElement("h2");
  h.style.cssText="font-size:18px;font-weight:700;letter-spacing:-.02em;margin:0 0 4px";
  h.textContent="Qui voit ce dossier";
  var sub=document.createElement("p"); sub.className="hint"; sub.style.margin="0 0 14px";
  sub.textContent=(c.client||c.ref)+" — ces personnes voient tous les documents du dossier, passés et à venir.";
  feuille.appendChild(h); feuille.appendChild(sub);
  var hote=document.createElement("div");
  feuille.appendChild(hote);
  var fermer=document.createElement("button");
  fermer.type="button"; fermer.className="act"; fermer.textContent="Fermer";
  fermer.style.cssText="width:100%;margin-top:14px";
  fermer.addEventListener("click", function(){ document.body.removeChild(ov); charger(); });
  feuille.appendChild(fermer);
  ov.appendChild(feuille);
  ov.addEventListener("click", function(e){ if(e.target===ov){ document.body.removeChild(ov); charger(); } });
  document.body.appendChild(ov);

  hote.textContent="Chargement…";
  fetch(API+"?action=equipe-dossier&ref="+encodeURIComponent(c.ref), {headers:{"x-auth":S.jeton}})
    .then(function(r){ return r.json().then(function(d){ return {ok:r.ok,d:d}; }); })
    .then(function(res){
      if(!res.ok){ hote.textContent=res.d.erreur||"Accès refusé."; return; }
      var equipe=res.d.equipe.slice(), auteur=res.d.auteur;
      function peindre(){
        hote.textContent="";
        var dedans=document.createElement("div");
        dedans.style.cssText="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px";
        equipe.forEach(function(nom){
          var p=document.createElement("span");
          p.style.cssText="display:inline-flex;align-items:center;gap:7px;background:var(--accent-soft);"
            +"color:var(--accent);padding:7px 11px;font-size:14px;font-weight:600";
          p.appendChild(document.createTextNode(nom));
          if(res.d.peutModifier && nom!==auteur){
            var x=document.createElement("button"); x.type="button"; x.textContent="×";
            x.setAttribute("aria-label","Retirer "+nom);
            x.style.cssText="width:22px;height:22px;min-height:22px;border:0;border-radius:50%;"
              +"background:rgba(180,98,26,.16);color:var(--accent);font-size:15px;line-height:1;"
              +"cursor:pointer;font-family:inherit";
            x.addEventListener("click", function(){
              equipe=equipe.filter(function(n){ return n!==nom; });
              enregistrer();
            });
            p.appendChild(x);
          } else if(nom===auteur){
            var t=document.createElement("span");
            t.style.cssText="font-size:11.5px;opacity:.6;font-weight:500";
            t.textContent="auteur";
            p.appendChild(t);
          }
          dedans.appendChild(p);
        });
        hote.appendChild(dedans);
        if(!res.d.peutModifier){
          var note=document.createElement("p"); note.className="hint"; note.style.margin="0";
          note.textContent="Seul le bureau peut modifier les accès.";
          hote.appendChild(note);
          return;
        }
        var reste=res.d.personnes.filter(function(u){ return equipe.indexOf(u.nom)<0; });
        if(!reste.length) return;
        var l=document.createElement("p"); l.className="legend"; l.textContent="Ajouter";
        hote.appendChild(l);
        var libre=document.createElement("div");
        libre.style.cssText="display:flex;flex-wrap:wrap;gap:7px";
        reste.forEach(function(u){
          var b=document.createElement("button"); b.type="button";
          b.style.cssText="border:1px solid var(--rule);background:var(--card);padding:8px 12px;"
            +"font-size:14px;font-family:inherit;color:var(--ink);cursor:pointer";
          b.textContent="+ "+u.nom+(u.role==="technicien" ? "" : "  ·  bureau");
          b.addEventListener("click", function(){ equipe.push(u.nom); enregistrer(); });
          libre.appendChild(b);
        });
        hote.appendChild(libre);
      }
      function enregistrer(){
        peindre();
        fetch(API+"?action=equipe-dossier-enregistrer", {method:"POST",
          headers:{"Content-Type":"application/json","x-auth":S.jeton},
          body:JSON.stringify({ref:c.ref, equipe:equipe})})
          .then(function(r){ return r.json().then(function(d){ return {ok:r.ok,d:d}; }); })
          .then(function(res2){
            if(!res2.ok){ alert(res2.d.erreur||"Modification refusée."); return; }
            equipe=res2.d.equipe; peindre();
          })
          .catch(function(){ alert("Pas de réseau."); });
      }
      peindre();
    })
    .catch(function(){ hote.textContent="Pas de réseau."; });
}

var DISCU_RETOUR=null;
function ouvrirDiscussion(c){
  var vue=document.createElement("div");
  vue.style.cssText="position:fixed;inset:0;z-index:75;background:#F7F3EA;display:flex;flex-direction:column;"
    +"padding-top:env(safe-area-inset-top,0px)";
  var barre=document.createElement("div");
  barre.style.cssText="display:flex;align-items:center;gap:8px;padding:11px 13px;background:#22201C;flex:0 0 auto";
  var t=document.createElement("span");
  t.style.cssText="flex:1;color:#E8D9C4;font-size:13.5px;font-weight:600;overflow:hidden;"
    +"white-space:nowrap;text-overflow:ellipsis";
  t.textContent=(c.client||c.ref)+" · "+c.ref;
  var bf=document.createElement("button"); bf.type="button"; bf.textContent="Fermer";
  bf.style.cssText="padding:7px 12px;border:0;background:#B4621A;color:#fff;font-size:12.5px;"
    +"font-weight:600;font-family:inherit;cursor:pointer";
  bf.addEventListener("click", function(){
    if(DISCU_RETOUR){ location.href=DISCU_RETOUR; return; }
    document.body.removeChild(vue); charger();
  });
  barre.appendChild(t); barre.appendChild(bf);

  var fil=document.createElement("div");
  fil.style.cssText="flex:1;overflow:auto;padding:13px;display:flex;flex-direction:column;gap:11px";
  var attente=document.createElement("p");
  attente.className="hint"; attente.style.textAlign="center";
  attente.textContent="Chargement de la discussion…";
  fil.appendChild(attente);

  var pied=document.createElement("div");
  pied.style.cssText="flex:0 0 auto;display:flex;gap:8px;align-items:center;padding:11px 13px;"
    +"border-top:1px solid var(--rule);background:var(--card);"
    +"padding-bottom:calc(11px + env(safe-area-inset-bottom,0px))";
  var photoBtn=document.createElement("button"); photoBtn.type="button";
  photoBtn.setAttribute("aria-label","Joindre une photo");
  photoBtn.style.cssText="width:40px;height:40px;min-height:40px;border:1px solid var(--rule);"
    +"background:var(--card);color:var(--ink-2);cursor:pointer;display:flex;align-items:center;justify-content:center";
  photoBtn.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" '
    +'style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;'
    +'stroke-linejoin:round"><path d="M3.5 8.5h3l1.6-2.4h7.8l1.6 2.4h3v10h-17z"/><circle cx="12" cy="13" r="3.4"/></svg>';
  var champPhoto=document.createElement("input");
  champPhoto.type="file"; champPhoto.accept="image/*"; champPhoto.hidden=true;
  var champ=document.createElement("textarea");
  champ.rows=1; champ.placeholder="Écrire un message…";
  champ.style.cssText="flex:1;min-height:40px;max-height:110px;padding:10px 12px;border:0;border-radius:var(--r-field);"
    +"background:var(--field);font-size:16px;font-family:inherit;resize:none";
  var envoi=document.createElement("button"); envoi.type="button"; envoi.textContent="Envoyer";
  envoi.style.cssText="padding:11px 14px;border:0;background:var(--accent);color:#fff;font-size:13.5px;"
    +"font-weight:600;font-family:inherit;cursor:pointer";
  pied.appendChild(photoBtn); pied.appendChild(champPhoto); pied.appendChild(champ); pied.appendChild(envoi);

  vue.appendChild(barre); vue.appendChild(fil); vue.appendChild(pied);
  document.body.appendChild(vue);

  var enAttente=null;
  photoBtn.addEventListener("click", function(){ champPhoto.click(); });
  champPhoto.addEventListener("change", function(){
    var f=this.files[0]; this.value="";
    if(!f) return;
    compresserPhoto(f, function(data){
      if(!data){ alert("Photo illisible."); return; }
      enAttente=data;
      photoBtn.style.borderColor="var(--accent)";
      champ.placeholder="Photo jointe — ajoutez un mot si besoin";
    });
  });

  function peindre(messages, equipe, lectures){
    fil.textContent="";
    if(!messages.length){
      var v=document.createElement("p"); v.className="hint"; v.style.textAlign="center";
      v.textContent="Aucun message. Posez votre question, l'équipe du dossier la verra.";
      fil.appendChild(v);
      return;
    }
    var dernier=messages[messages.length-1];
    messages.forEach(function(m){
      var mien = m.auteur===S.nom;
      var bloc=document.createElement("div");
      bloc.style.cssText="max-width:82%;align-self:"+(mien?"flex-end":"flex-start");
      var qui=document.createElement("p");
      qui.style.cssText="margin:0 0 3px;font-size:11.5px;color:var(--ink-3);"+(mien?"text-align:right":"");
      qui.textContent=(mien ? "Vous" : m.auteur)+" · "+quandLisible(m.quand);
      var bulle=document.createElement("div");
      bulle.style.cssText="border:1px solid "+(mien?"#F0DCC6":"var(--rule)")+";background:"
        +(mien?"var(--accent-soft)":"var(--card)")+";padding:10px 12px;font-size:14.5px;"
        +"color:var(--ink);line-height:1.5;white-space:pre-wrap;word-break:break-word";
      if(m.texte) bulle.appendChild(document.createTextNode(m.texte));
      if(m.photo){
        var im=document.createElement("img");
        im.src=m.photo; im.alt="Photo jointe"; im.loading="lazy";
        im.style.cssText="display:block;width:100%;margin-top:"+(m.texte?"8px":"0")+";cursor:zoom-in";
        im.addEventListener("click", function(){ agrandir(m.photo); });
        bulle.appendChild(im);
      }
      bloc.appendChild(qui); bloc.appendChild(bulle);
      fil.appendChild(bloc);
    });
    var vus=Object.keys(lectures||{}).filter(function(n){
      return n!==S.nom && lectures[n]===dernier.id;
    });
    if(vus.length){
      var l=document.createElement("p");
      l.style.cssText="align-self:center;margin:2px 0 0;font-size:11px;color:var(--ink-3)";
      l.textContent="Vu par "+vus.join(", ");
      fil.appendChild(l);
    }
    fil.scrollTop=fil.scrollHeight;
  }
  function agrandir(src){
    var g=document.createElement("div");
    g.style.cssText="position:fixed;inset:0;z-index:95;background:#0F0E0C;display:flex;"
      +"align-items:center;justify-content:center;padding:12px";
    var im=document.createElement("img");
    im.src=src; im.style.cssText="max-width:100%;max-height:88vh;object-fit:contain";
    g.appendChild(im);
    g.addEventListener("click", function(){ document.body.removeChild(g); });
    document.body.appendChild(g);
  }
  function charge(){
    fetch(API+"?action=messages&ref="+encodeURIComponent(c.ref), {headers:{"x-auth":S.jeton}})
      .then(function(r){ return r.json().then(function(d){ return {ok:r.ok,d:d}; }); })
      .then(function(res){
        if(!res.ok){ fil.textContent=""; var e=document.createElement("p");
          e.className="hint"; e.textContent=res.d.erreur||"Discussion indisponible."; fil.appendChild(e); return; }
        peindre(res.d.messages, res.d.equipe, res.d.lectures);
      })
      .catch(function(){ fil.textContent="Pas de réseau."; });
  }
  function envoyer(){
    var texte=champ.value.trim();
    if(!texte && !enAttente) return;
    envoi.disabled=true; envoi.textContent="…";
    fetch(API+"?action=message-envoyer", {method:"POST",
      headers:{"Content-Type":"application/json","x-auth":S.jeton},
      body:JSON.stringify({ref:c.ref, texte:texte, photo:enAttente||""})})
      .then(function(r){ return r.json().then(function(d){ return {ok:r.ok,d:d}; }); })
      .then(function(res){
        envoi.disabled=false; envoi.textContent="Envoyer";
        if(!res.ok){ alert(res.d.erreur||"Envoi refusé."); return; }
        champ.value=""; enAttente=null;
        photoBtn.style.borderColor="var(--rule)";
        champ.placeholder="Écrire un message…";
        charge();
      })
      .catch(function(){
        envoi.disabled=false; envoi.textContent="Envoyer";
        alert("Pas de réseau. Le message n'est pas parti.");
      });
  }
  envoi.addEventListener("click", envoyer);
  champ.addEventListener("input", function(){
    champ.style.height="auto";
    champ.style.height=Math.min(110, champ.scrollHeight)+"px";
  });
  charge();
}
function quandLisible(iso){
  var d=new Date(iso), maintenant=new Date();
  var jour=d.toISOString().slice(0,10), auj=maintenant.toISOString().slice(0,10);
  var heure=String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
  if(jour===auj) return heure;
  var hier=new Date(maintenant.getTime()-86400000).toISOString().slice(0,10);
  if(jour===hier) return "hier "+heure;
  return frDate(jour)+" "+heure;
}
function compresserPhoto(file, cb){
  var fr=new FileReader();
  fr.onload=function(){
    var img=new Image();
    img.onload=function(){
      var max=1100, w=img.width, h=img.height;
      if(w>max||h>max){ var r=Math.min(max/w,max/h); w=Math.round(w*r); h=Math.round(h*r); }
      var cv=document.createElement("canvas"); cv.width=w; cv.height=h;
      cv.getContext("2d").drawImage(img,0,0,w,h);
      cb(cv.toDataURL("image/jpeg",0.7));
    };
    img.onerror=function(){ cb(null); };
    img.src=fr.result;
  };
  fr.onerror=function(){ cb(null); };
  fr.readAsDataURL(file);
}

/* ---------- ouvrir ou partager un document ---------- */
function telecharger(f){
  return fetch(API+"?action=fichier&cle="+encodeURIComponent(f.cle), {headers:{"x-auth":S.jeton}})
    .then(function(r){ if(!r.ok) throw new Error("refus"); return r.blob(); });
}
function nomFichier(f){ return String(f.cle).split("/").pop(); }
function partagerDocument(f, bouton){
  var avant = bouton ? bouton.textContent : "";
  if(bouton){ bouton.disabled=true; bouton.textContent="…"; }
  telecharger(f)
    .then(function(blob){
      if(bouton){ bouton.disabled=false; bouton.textContent=avant; }
      marquerLu(f);
      var fichier;
      try{ fichier=new File([blob], nomFichier(f), {type:blob.type||"application/pdf"}); }catch(e){ fichier=null; }
      if(fichier && navigator.canShare && navigator.canShare({files:[fichier]})){
        navigator.share({files:[fichier], title:f.titre||nomFichier(f)})
          .catch(function(err){ if(!err || err.name!=="AbortError") enregistrer(blob, nomFichier(f)); });
        return;
      }
      enregistrer(blob, nomFichier(f));
    })
    .catch(function(){
      if(bouton){ bouton.disabled=false; bouton.textContent=avant; }
      alert("Document indisponible. Vérifiez la connexion.");
    });
}
function enregistrer(blob, nom){
  var url=URL.createObjectURL(blob);
  var a=document.createElement("a"); a.href=url; a.download=nom; a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
}
/* Le lien de la ligne ouvre le document dans la page — mais sur un
   site installé en icône, sans onglet à ouvrir à côté, ça affiche le
   PDF brut, sans les boutons de l'appareil (partager, imprimer…).
   En passant par le même téléchargement que « Partager », le
   téléphone montre sa propre visionneuse, avec tous ses boutons —
   dont celui pour partager, si besoin. */
function ouvrirDocument(f, bouton){
  var avant = bouton ? bouton.textContent : "";
  if(bouton){ bouton.disabled=true; bouton.textContent="…"; }
  telecharger(f)
    .then(function(blob){
      if(bouton){ bouton.disabled=false; bouton.textContent=avant; }
      marquerLu(f);
      enregistrer(blob, nomFichier(f));
    })
    .catch(function(){
      if(bouton){ bouton.disabled=false; bouton.textContent=avant; }
      alert("Document indisponible. Vérifiez la connexion.");
    });
}
/* ---------- galerie des photos ---------- */
function lireZip(octets){
  /* nos archives sont écrites sans compression : on peut lire les fichiers tels quels */
  var v=new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  var dec=new TextDecoder("utf-8");
  var out=[], i=0;
  while(i+30 <= octets.length){
    if(v.getUint32(i, true) !== 0x04034b50) break;
    var methode=v.getUint16(i+8, true);
    var taille=v.getUint32(i+18, true);
    var lgNom=v.getUint16(i+26, true);
    var lgExtra=v.getUint16(i+28, true);
    var nom=dec.decode(octets.subarray(i+30, i+30+lgNom));
    var debut=i+30+lgNom+lgExtra;
    if(methode===0 && taille>0 && /\.(jpe?g|png)$/i.test(nom)){
      out.push({nom:nom, octets:octets.subarray(debut, debut+taille)});
    }
    i = debut + taille;
  }
  return out;
}
function ouvrirGalerie(f){
  var ov=document.createElement("div");
  ov.style.cssText="position:fixed;inset:0;z-index:80;background:#1A1815;display:flex;flex-direction:column;"
    +"padding-top:env(safe-area-inset-top,0px)";
  var barre=document.createElement("div");
  barre.style.cssText="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#262320;flex:0 0 auto";
  var titre=document.createElement("span");
  titre.style.cssText="flex:1;color:#BDB5A6;font-size:13.5px;font-weight:600";
  titre.textContent=f.titre || "Photos";
  var telecharger=document.createElement("button");
  telecharger.type="button"; telecharger.textContent="Partager";
  telecharger.style.cssText="padding:9px 13px;border:0;background:rgba(244,241,234,.12);"
    +"color:#F4F1EA;font-size:13.5px;font-weight:600;font-family:inherit;cursor:pointer";
  telecharger.addEventListener("click", function(){ partagerDocument(f, telecharger); });
  var fermer=document.createElement("button"); fermer.type="button"; fermer.textContent="Fermer";
  fermer.style.cssText="padding:9px 13px;border:0;border-radius:var(--r-field);background:#B4621A;color:#fff;"
    +"font-size:13.5px;font-weight:600;font-family:inherit;cursor:pointer";
  barre.appendChild(titre); barre.appendChild(telecharger); barre.appendChild(fermer);
  var corps=document.createElement("div");
  corps.style.cssText="flex:1;overflow:auto;padding:12px;display:grid;"
    +"grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;align-content:start";
  var etat=document.createElement("p");
  etat.style.cssText="grid-column:1/-1;color:#BDB5A6;font-size:14px;margin:6px 2px";
  etat.textContent="Ouverture des photos…";
  corps.appendChild(etat);
  ov.appendChild(barre); ov.appendChild(corps);
  document.body.appendChild(ov);

  var urls=[];
  function refermer(){
    urls.forEach(function(u){ URL.revokeObjectURL(u); });
    if(ov.parentNode) document.body.removeChild(ov);
  }
  fermer.addEventListener("click", refermer);

  fetch(API+"?action=fichier&cle="+encodeURIComponent(f.cle), {headers:{"x-auth":S.jeton}})
    .then(function(r){ if(!r.ok) throw new Error("refus"); return r.arrayBuffer(); })
    .then(function(buf){
      var photos=lireZip(new Uint8Array(buf));
      corps.textContent="";
      if(!photos.length){
        var v=document.createElement("p");
        v.style.cssText="grid-column:1/-1;color:#BDB5A6;font-size:14px";
        v.textContent="Archive illisible dans le navigateur. Utilisez Télécharger.";
        corps.appendChild(v); return;
      }
      marquerLu(f);
      photos.forEach(function(p, i){
        var blob=new Blob([p.octets], {type: /\.png$/i.test(p.nom) ? "image/png" : "image/jpeg"});
        var url=URL.createObjectURL(blob); urls.push(url);
        var fig=document.createElement("figure");
        fig.style.cssText="margin:0;background:#262320;border:1px solid rgba(244,241,234,.10)";
        var im=document.createElement("img");
        im.src=url; im.alt=p.nom; im.loading="lazy";
        im.style.cssText="display:block;width:100%;height:150px;object-fit:cover;cursor:zoom-in";
        im.addEventListener("click", function(){ plein(i); });
        var cap=document.createElement("figcaption");
        cap.style.cssText="padding:7px 9px;color:#BDB5A6;font-size:11.5px;overflow:hidden;"
          +"text-overflow:ellipsis;white-space:nowrap";
        cap.textContent=p.nom.split("/").pop().replace(/\.(jpe?g|png)$/i,"").replace(/^\d+-?/,"").replace(/-/g," ");
        fig.appendChild(im); fig.appendChild(cap);
        corps.appendChild(fig);
      });
      function plein(depart){
        var k=depart;
        var vue=document.createElement("div");
        vue.style.cssText="position:fixed;inset:0;z-index:90;background:#0F0E0C;display:flex;"
          +"flex-direction:column;align-items:center;justify-content:center;padding:12px";
        var grande=document.createElement("img");
        grande.style.cssText="max-width:100%;max-height:78vh;object-fit:contain";
        var nom=document.createElement("p");
        nom.style.cssText="color:#BDB5A6;font-size:12.5px;margin:10px 0 0;text-align:center";
        var nav=document.createElement("div");
        nav.style.cssText="display:flex;gap:10px;margin-top:14px";
        function bouton(texte, fn){
          var b=document.createElement("button"); b.type="button"; b.textContent=texte;
          b.style.cssText="min-height:44px;padding:0 18px;border:0;border-radius:var(--r-field);"
            +"background:rgba(244,241,234,.12);color:#F4F1EA;font-size:14.5px;font-weight:600;"
            +"font-family:inherit;cursor:pointer";
          b.addEventListener("click", fn); return b;
        }
        function afficher(){
          grande.src=urls[k];
          nom.textContent=(k+1)+" sur "+urls.length+"  ·  "+photos[k].nom.split("/").pop();
        }
        nav.appendChild(bouton("Précédente", function(){ k=(k-1+urls.length)%urls.length; afficher(); }));
        nav.appendChild(bouton("Suivante", function(){ k=(k+1)%urls.length; afficher(); }));
        nav.appendChild(bouton("Fermer", function(){ document.body.removeChild(vue); }));
        vue.appendChild(grande); vue.appendChild(nom); vue.appendChild(nav);
        document.body.appendChild(vue);
        afficher();
      }
    })
    .catch(function(){
      corps.textContent="";
      var v=document.createElement("p");
      v.style.cssText="grid-column:1/-1;color:#BDB5A6;font-size:14px";
      v.textContent="Photos indisponibles. Réessayez ou utilisez Télécharger.";
      corps.appendChild(v);
    });
}
function marquerLu(f){
  fetch(API+"?action=lu&cle="+encodeURIComponent(f.cle), {headers:{"x-auth":S.jeton}})
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d){ if(d && d.lectures){ f.lectures=d.lectures; setTimeout(charger, 900); } })
    .catch(function(){});
}

var NON_LUS={};
/* Les messages non lus arrivent à part : la liste attend leur compte
   avant de se peindre, sinon la pastille de la discussion manquait
   quand la liste répondait la première. */
function chargerNonLus(){
  return fetch(API+"?action=messages-non-lus", {headers:{"x-auth":S.jeton}})
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d){
      if(!d) return;
      NON_LUS={};
      (d.dossiers||[]).forEach(function(x){ NON_LUS[x.ref]=x.nb; });
    })
    .catch(function(){});
}
/* sans tout repeindre : seulement les pastilles des boutons Discussion */
function majPastillesDiscussion(){
  document.querySelectorAll("button.discu[data-ref]").forEach(function(b){
    var n=NON_LUS[b.getAttribute("data-ref")]||0;
    var p=b.querySelector(".pastille-discu");
    if(!n){ if(p) p.remove(); b.classList.remove("a-lire"); return; }
    if(!p){ p=document.createElement("span"); p.className="pastille-discu"; b.appendChild(p); }
    p.textContent=String(n);
    b.classList.add("a-lire");
    b.title=n+" message"+(n>1?"s":"")+" non lu"+(n>1?"s":"")+" dans la discussion";
  });
}
setInterval(function(){ if(!document.hidden && S && S.jeton) chargerNonLus().then(majPastillesDiscussion); }, 45000);
document.addEventListener("visibilitychange", function(){
  if(!document.hidden && S && S.jeton) chargerNonLus().then(majPastillesDiscussion);
});
var MOI=null;
function pasEncoreLu(f){
  var m = MOI && MOI.nom;
  return !!m && f.auteur !== m && !((f.lectures||{})[m]);
}
function docsNonLus(c){
  return (c.fichiers||[]).filter(pasEncoreLu).length;
}
/* Le bureau dit au technicien que la commande est passée chez le
   fournisseur : qui, quand, et un mot s'il y en a un. */
function ligneSaisie(f){
  if(!f.saisie) return null;
  var p=document.createElement("span"); p.className="saisie";
  p.textContent="Commande saisie par "+f.saisie.par+" le "+frDate(f.saisie.le)
    + (f.saisie.note ? " — "+f.saisie.note : "");
  return p;
}
function boutonSaisie(f, repeindre){
  if(!MOI || (MOI.role!=="bureau" && MOI.role!=="admin")) return null;
  if(f.type !== "commande") return null;
  var b=document.createElement("button");
  b.type="button"; b.className="ok-saisie"+(f.saisie ? " on" : "");
  b.textContent = f.saisie ? "Saisie \u2713" : "OK saisie";
  b.title = f.saisie ? "Revenir en arrière : la commande n'est plus marquée saisie."
                     : "Prévenir le technicien que la commande est passée.";
  b.addEventListener("click", function(e){
    e.preventDefault(); e.stopPropagation();
    var corps={cle:f.cle};
    if(f.saisie){
      if(!window.confirm("Retirer la marque « saisie » de cette commande ?")) return;
      corps.saisie=false;
    } else {
      var note=window.prompt("Commande saisie. Un mot pour le technicien ? (facultatif)", "");
      if(note === null) return;
      corps.note=note;
    }
    b.disabled=true;
    fetch(API+"?action=commande-saisie", {method:"POST",
      headers:{"content-type":"application/json","x-auth":S.jeton},
      body:JSON.stringify(corps)})
      .then(function(r){ return r.json().then(function(d){ return {ok:r.ok, d:d}; }); })
      .then(function(res){
        b.disabled=false;
        if(!res.ok){ alert(res.d.erreur || "Impossible d'enregistrer."); return; }
        f.saisie = res.d.saisie || null;
        repeindre();
      })
      .catch(function(){ b.disabled=false; alert("Pas de réseau."); });
  });
  return b;
}

var ORDRE={releve:1, technique:2, carnet:3, memoire:4, suivi:5, commande:6, point:7, photos:8, reportage:9, etiquettes:10, autocontrole:11, reception:12, doe:13, sav:14};
function rangDoc(f){
  var base=(ORDRE[f.type]||9)*1000;
  if(f.type==="suivi"){
    var n=parseInt(f.visite,10);
    return base + (isNaN(n) ? 500 : n);
  }
  return base + (String(f.date||"").replace(/-/g,"").slice(-4)|0)/10000;
}
function trierDocs(c){
  (c.fichiers||[]).sort(function(a,b){
    var d=rangDoc(a)-rangDoc(b);
    if(d) return d;
    return String(a.publie||"").localeCompare(String(b.publie||""));
  });
  return c;
}
function depuisCombien(jours){
  var j=Math.max(0, jours|0);
  if(j < 1)  return "aujourd'hui";
  if(j < 31) return j+" jour"+(j>1?"s":"");
  var m=Math.round(j/30.4);
  if(m < 12) return m+" mois";
  var an=Math.floor(m/12);
  return an+" an"+(an>1?"s":"")+(m%12 ? " et "+(m%12)+" mois" : "");
}
/* la commune, pour situer le dossier d'un coup d'œil : ce qui suit le
   code postal, sinon le dernier morceau de l'adresse */
function villeDe(adresse){
  var a=String(adresse||"").replace(/\n/g, ", ").trim();
  if(!a) return "";
  var m=a.match(/\b\d{5}\s+([^,]+)/);
  if(m) return m[1].trim();
  var p=a.split(",");
  return p.length > 1 ? p[p.length-1].trim() : "";
}
var ICO={
  iti:'<path d="M21 3 3 10.5l7.6 2.9L13.5 21z"/><path d="M21 3 10.6 13.4"/>',
  acces:'<circle cx="9" cy="8.4" r="3.3"/><path d="M3.4 19.2c.4-3 2.8-4.8 5.6-4.8s5.2 1.8 5.6 4.8"/>'
    +'<path d="M16.2 6.2a3 3 0 0 1 0 5.9M17.4 14.6c2.1.4 3.4 2 3.6 4.6"/>',
  discu:'<path d="M20.5 12c0 4-3.8 7.2-8.5 7.2a9.9 9.9 0 0 1-2.8-.4L4.5 20.5l1.2-3.4'
    +'A6.8 6.8 0 0 1 3.5 12c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2z"/>',
  pli:'<path d="m6 9 6 6 6-6"/>'
};
function icone(nom){
  return '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">'+ICO[nom]+'</svg>';
}
/* Un petit bouton rond, l'icône seule : le libellé n'apparaît qu'en
   grand écran, il reste lu par le lecteur d'écran et en infobulle. */
function boutonOutil(classe, nom, libelle, titre){
  var b=document.createElement("button");
  b.type="button"; b.className="outil "+classe;
  b.title=titre||libelle;
  b.setAttribute("aria-label", titre||libelle);
  b.innerHTML=icone(nom)+'<span class="lib">'+libelle+'</span>';
  return b;
}
/* Replié ou déplié : ce que la personne a choisi, dossier par dossier,
   tient jusqu'à la fin de la visite, même quand la liste se repeint
   (après l'ouverture d'un document, par exemple). Sans choix, les
   dossiers se déplient quand il y en a peu à l'écran. */
var PLI={};
try{ PLI=JSON.parse(sessionStorage.getItem("rapports:pli")||"{}")||{}; }catch(e){ PLI={}; }
function retenirPli(ref, ouvert){
  PLI[ref]=ouvert;
  try{ sessionStorage.setItem("rapports:pli", JSON.stringify(PLI)); }catch(e){}
}
/* Les sous-dossiers d'un dossier : « Suivi de chantier » et « Photos du
   chantier ». Repliés, avec leur nombre de documents ; les plus récents
   en premier une fois ouverts. Ouvert ou fermé tient jusqu'à la fin de
   la visite, dossier par dossier. */
var SOUS_DOSSIERS={
  suivi:{nom:"Suivi de chantier", classe:"sous-dossier dossier-suivi", memo:"rapports:suivis", mot:"suivi",
    ico:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'},
  photos:{nom:"Photos du chantier", classe:"sous-dossier dossier-photos", memo:"rapports:photos", mot:"document", exporter:true,
    ico:'<path d="M3.5 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1.3-2h6.4l1.3 2h2a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/><circle cx="12" cy="12.5" r="3.4"/>'}
};
/* le sous-dossier où range un document, s'il y en a un */
function sousDossierDe(f){
  if(f.type==="suivi") return "suivi";
  if(f.type==="photos" || f.type==="reportage") return "photos";
  return null;
}
var OUVERTS={};
function ouverts(genre){
  if(!OUVERTS[genre]){
    try{ OUVERTS[genre]=JSON.parse(sessionStorage.getItem(SOUS_DOSSIERS[genre].memo)||"{}")||{}; }catch(e){ OUVERTS[genre]={}; }
  }
  return OUVERTS[genre];
}
/* ---------- « Tout télécharger » : toutes les photos du chantier en un ZIP ----------
   Chaque lot de photos (reportage, suivi, relevé) devient un dossier daté
   dans l'archive, ses photos dedans ; les PDF de reportage sont posés à
   côté. Un lot qu'on ne sait pas ouvrir est gardé tel quel, en ZIP. */
function nomPropre(t){
  return String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[\/\\:*?"<>|]+/g," ").replace(/\s+/g," ").trim().slice(0,70) || "photos";
}
function exporterPhotos(ref, lignes, bouton){
  var docs=lignes.map(function(l){ return l.f; }).slice().sort(function(a,b){
    return String(a.date||"").localeCompare(String(b.date||"")) || String(a.publie||"").localeCompare(String(b.publie||""));
  });
  var racine=nomPropre("Photos "+ref);
  var fichiers=[], pris={}, nbPhotos=0, fait=0;
  /* seul le libellé change pendant la préparation : l'icône reste */
  var lib=bouton.querySelector("span")||bouton, avant=lib.textContent;
  bouton.disabled=true;
  function unique(nom){
    var n=nom, k=2;
    while(pris[n]){ n=nom.replace(/(\.[^.\/]+)?$/, " ("+(k++)+")$1"); }
    pris[n]=true; return n;
  }
  function avancer(){ lib.textContent="Préparation "+(++fait)+"/"+docs.length+"…"; }
  var suite=Promise.resolve();
  docs.forEach(function(f){
    suite=suite.then(function(){
      return fetch(API+"?action=fichier&cle="+encodeURIComponent(f.cle), {headers:{"x-auth":S.jeton}})
        .then(function(r){ if(!r.ok) throw new Error("fichier"); return r.arrayBuffer(); })
        .then(function(buf){
          var octs=new Uint8Array(buf), date=String(f.date||"").slice(0,10);
          var ext=String(f.cle).slice(String(f.cle).lastIndexOf(".")).toLowerCase();
          var titre=nomPropre((date ? date+" " : "")+(f.titre||"Photos"));
          var photos = ext===".zip" ? lireZip(octs) : [];
          if(photos.length){
            var dossier=unique(racine+"/"+titre);
            photos.forEach(function(ph){
              fichiers.push({nom:unique(dossier+"/"+String(ph.nom).split("/").pop()), octets:ph.octets});
            });
            nbPhotos+=photos.length;
          } else {
            fichiers.push({nom:unique(racine+"/"+titre+ext), octets:octs});
          }
          avancer();
        });
    });
  });
  suite.then(function(){
    enregistrer(creerZip(fichiers), racine.replace(/\s+/g,"-")+".zip");
    bouton.disabled=false; lib.textContent=avant;
    toast(nbPhotos+" photo"+(nbPhotos>1?"s":"")+" exportée"+(nbPhotos>1?"s":"")
      +(fichiers.length>nbPhotos ? ", avec "+(fichiers.length-nbPhotos)+" document"+((fichiers.length-nbPhotos)>1?"s":"") : "")+".");
  }).catch(function(){
    bouton.disabled=false; lib.textContent=avant;
    alert("Export interrompu : un document n'a pas pu être téléchargé. Vérifiez la connexion.");
  });
}
function sousDossier(ref, genre){
  var g=SOUS_DOSSIERS[genre];
  var boite=document.createElement("div"); boite.className=g.classe;
  var tete=document.createElement("button"); tete.type="button"; tete.className="ds-tete";
  var dedans=document.createElement("div"); dedans.className="ds-liste";
  var ouvert=!!ouverts(genre)[ref];
  dedans.hidden=!ouvert; tete.setAttribute("aria-expanded", ouvert ? "true" : "false");
  tete.addEventListener("click", function(e){
    e.preventDefault(); e.stopPropagation();
    var o=dedans.hidden; dedans.hidden=!o;
    tete.setAttribute("aria-expanded", o ? "true" : "false");
    ouverts(genre)[ref]=o;
    try{ sessionStorage.setItem(g.memo, JSON.stringify(ouverts(genre))); }catch(err){}
  });
  boite.appendChild(tete); boite.appendChild(dedans);
  return {boite:boite, remplir:function(lignes){
    lignes.sort(function(x,y){
      return String(y.f.date||"").localeCompare(String(x.f.date||"")) || String(y.f.publie||"").localeCompare(String(x.f.publie||""));
    });
    var neufs=lignes.filter(function(l){ return pasEncoreLu(l.f); }).length;
    tete.innerHTML='<svg class="ds-ico" viewBox="0 0 24 24" aria-hidden="true">'+g.ico+'</svg>'
      +'<span class="ds-nom">'+g.nom+'</span>'
      +(neufs ? '<span class="neuf">'+neufs+' nouveau'+(neufs>1?'x':'')+'</span>' : '')
      +'<span class="ds-nb">'+lignes.length+'</span>'
      +'<svg class="ds-pli" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    tete.setAttribute("aria-label", g.nom+", "+lignes.length+" "+g.mot+(lignes.length>1?"s":""));
    if(g.exporter){
      var barre=document.createElement("div"); barre.className="ds-export";
      var bx=document.createElement("button"); bx.type="button"; bx.className="ds-tout";
      bx.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 19.5h14"/></svg>'
        +'<span>Tout télécharger</span>';
      bx.title="Toutes les photos du chantier dans un seul fichier ZIP";
      bx.addEventListener("click", function(e){
        e.preventDefault(); e.stopPropagation();
        exporterPhotos(ref, lignes, bx);
      });
      var mot=document.createElement("span"); mot.className="hint";
      mot.textContent="Un seul ZIP, un dossier par reportage";
      barre.appendChild(bx); barre.appendChild(mot);
      dedans.appendChild(barre);
    }
    lignes.forEach(function(l){ dedans.appendChild(l.a); });
  }};
}
function carteDossier(c, i, opts){
  opts=opts||{};
  trierDocs(c);
  var ouvertParDefaut = opts.ouvertParDefaut !== undefined ? !!opts.ouvertParDefaut : true;
  var bureau = !!(MOI && (MOI.role==="bureau"||MOI.role==="admin"));
  var box=document.createElement("div"); box.className="travaux"+(opts.integree ? " integree" : "");
  box.setAttribute("data-ref", c.ref);
  if(c.etat === "attente") box.classList.add("attente");
  var head=document.createElement("div"); head.className="head";
  head.setAttribute("role", "button"); head.tabIndex=0;

  /* ----- 1re ligne : le client, ce qui est neuf, les outils ----- */
  var titre=document.createElement("div"); titre.className="titre";
  var b=document.createElement("b"); b.textContent=c.client||c.ref;
  titre.appendChild(b);
  var nonLus=docsNonLus(c);
  if(nonLus){
    var pd=document.createElement("span"); pd.className="pastille-docs";
    pd.textContent=String(nonLus);
    pd.title=nonLus+" document"+(nonLus>1?"s":"")+" que vous n'avez pas encore ouvert"+(nonLus>1?"s":"");
    pd.setAttribute("aria-label", pd.title);
    titre.appendChild(pd);
  }
  var outils=document.createElement("div"); outils.className="outils";
  if((c.adresse||"").trim()){
    var iti=boutonOutil("iti", "iti", "Itinéraire", "Itinéraire vers les travaux");
    iti.addEventListener("click", function(e){
      e.preventDefault(); e.stopPropagation();
      var q=String(c.adresse).replace(/\n/g, ", ");
      window.open("https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(q), "_blank");
    });
    outils.appendChild(iti);
  }
  var nEq=(c.equipe||[]).length;
  var acces=boutonOutil("acces", "acces", "Accès"+(nEq ? " · "+nEq : ""),
    "Qui voit ce dossier"+(nEq ? " ("+nEq+" personne"+(nEq>1?"s":"")+")" : ""));
  acces.addEventListener("click", function(e){
    e.preventDefault(); e.stopPropagation(); ouvrirAcces(c);
  });
  outils.appendChild(acces);

  var discu=boutonOutil("discu", "discu", "Discussion", "Discussion du dossier");
  discu.setAttribute("data-ref", c.ref);
  var nMsg=(NON_LUS[c.ref]||0);
  if(nMsg){
    var pastille=document.createElement("span"); pastille.className="pastille-discu";
    pastille.textContent=String(nMsg);
    discu.appendChild(pastille);
    discu.classList.add("a-lire");
    discu.title=nMsg+" message"+(nMsg>1?"s":"")+" non lu"+(nMsg>1?"s":"")+" dans la discussion";
  }
  discu.addEventListener("click", function(e){
    e.preventDefault(); e.stopPropagation(); ouvrirDiscussion(c);
  });
  outils.appendChild(discu);
  var pli=document.createElement("span"); pli.className="pli"; pli.innerHTML=icone("pli");
  titre.appendChild(outils); titre.appendChild(pli);
  head.appendChild(titre);

  /* ----- 2e ligne : référence, commune, nombre de documents ----- */
  var sous=document.createElement("div"); sous.className="sous";
  var ref=document.createElement("span"); ref.className="ref"; ref.textContent=c.ref;
  sous.appendChild(ref);
  var ville=villeDe(c.adresse);
  if(ville){
    var sv=document.createElement("span"); sv.className="ville"; sv.textContent=ville;
    sv.title=String(c.adresse).replace(/\n/g, ", ");
    sous.appendChild(sv);
  }
  var n=document.createElement("span"); n.className="n";
  n.textContent=c.fichiers.length+" document"+(c.fichiers.length>1?"s":"");
  sous.appendChild(n);
  if(c.etat === "attente"){
    var att=document.createElement("span");
    att.className="etiq-attente"+(c.relanceDue?" du":"");
    att.textContent = c.relanceDue ? "À relancer" : "En attente";
    att.title = "En attente de réponse depuis "+depuisCombien(c.joursAttente)
      + (c.attenteNote ? "  ·  "+c.attenteNote : "");
    sous.appendChild(att);
  }
  head.appendChild(sous);

  var fs=document.createElement("div"); fs.className="fichiers";
  /* les suivis, et toutes les photos du chantier (reportages, lots de
     photos du suivi ou du relevé), vont chacun dans un sous-dossier
     repliable, posé à la place de leur premier document */
  var sous={}, lignesDe={};
  function ranger(f, a){
    var genre=sousDossierDe(f);
    if(!genre){ fs.appendChild(a); return; }
    if(!sous[genre]){ sous[genre]=sousDossier(c.ref, genre); lignesDe[genre]=[]; fs.appendChild(sous[genre].boite); }
    lignesDe[genre].push({f:f, a:a});
  }
  c.fichiers.forEach(function(f){
    var a=document.createElement("a"); a.className="f";
    var zip = f.type==="photos" || String(f.cle).slice(-4)===".zip";
    /* Un document s'ouvre dans son propre onglet : c'est un vrai lien,
       pas un lecteur qui recouvre la page. Le site reste ouvert à
       côté, « précédent » du navigateur marche comme partout ailleurs,
       et on peut ouvrir plusieurs documents en même temps, chacun dans
       le sien. Un ensemble de photos reste une galerie sur place : un
       ZIP ne s'affiche pas tout seul dans un onglet. */
    if(zip){
      a.style.cursor="pointer";
      a.addEventListener("click", function(e){ e.preventDefault(); ouvrirGalerie(f); });
    } else {
      a.href=API+"?action=fichier&cle="+encodeURIComponent(f.cle)+"&auth="+encodeURIComponent(S.jeton);
      if(!appInstallee()){ a.target="_blank"; a.rel="noopener"; }
    }
    a.addEventListener("click", function(){
      /* accusé de lecture immédiat, sans dépendre du chargement du PDF */
      fetch(API+"?action=lu&cle="+encodeURIComponent(f.cle), {headers:{"x-auth":S.jeton}})
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(d){ if(d && d.lectures){ f.lectures=d.lectures; setTimeout(charger, 1200); } })
        .catch(function(){});
    });
    var t=document.createElement("div"); t.className="t";
    var tl=document.createElement("div"); tl.className="tl";
    var tb=document.createElement("b"); tb.textContent=f.titre;
    tl.appendChild(tb);
    if(pasEncoreLu(f)){
      var neuf=document.createElement("span"); neuf.className="neuf";
      neuf.textContent="Nouveau";
      tl.appendChild(neuf);
    }
    t.appendChild(tl);

    var tag=document.createElement("span");
    tag.className="tag"+(f.type==="suivi"?" suivi":(f.type==="commande"?" commande":(f.type==="photos"?" photos":(f.type==="reportage"?" reportage":(f.type==="carnet"?" carnet":(f.type==="memoire"?" memoire":(f.type==="doe"?" doe":(f.type==="autocontrole"?" autoc":(f.type==="reception"?" reception":(f.type==="etiquettes"?" etiq":(f.type==="sav"?" sav":(f.type==="technique"?" technique":(f.type==="point"?" point":"")))))))))))));
    tag.textContent = f.type==="point" ? "Le point"
                    : f.type==="technique" ? "Technique"
                    : f.type==="suivi" ? (f.visite ? "Visite "+f.visite : "Suivi")
                    : f.type==="commande" ? "Commande"
                    : f.type==="photos" ? "Photos"
                    : f.type==="reportage" ? "Reportage"
                    : f.type==="autocontrole" ? "Autocontrôle"
                    : f.type==="carnet" ? "Carnet"
                    : f.type==="memoire" ? "Mémoire"
                    : f.type==="doe" ? "DOE"
                    : f.type==="reception" ? "Réception"
                    : f.type==="etiquettes" ? "Étiquettes"
                    : f.type==="sav" ? "SAV" : "Relevé";
    var meta=document.createElement("div"); meta.className="meta";
    meta.appendChild(tag);
    var ts=document.createElement("span"); ts.className="infos";
    ts.textContent=[frDate(f.date), f.etape, f.auteur,
      (f.versions>1 ? "mis à jour "+f.versions+" fois" : ""), octets(f.taille)].filter(Boolean).join(" · ");
    meta.appendChild(ts);
    t.appendChild(meta);

    var lus=Object.keys(f.lectures||{}).filter(function(n){ return n!==f.auteur; });
    if(lus.length){
      var lu=document.createElement("span");
      lu.className="lu";
      lu.textContent="Lu par "+lus.map(function(n){
        var quand=f.lectures[n];
        var avant = f.publie && String(quand) < String(f.publie);
        return n+" le "+frDate(quand)+" à "+String(quand).slice(11,16)
          + (avant ? " (avant la mise à jour)" : "");
      }).join(", ");
      t.appendChild(lu);
    } else if(bureau && (f.destinataires||[]).length){
      var na=document.createElement("span");
      na.className="lu na";
      na.textContent="Pas encore ouvert";
      t.appendChild(na);
    }
    var mS=ligneSaisie(f);
    if(mS) t.appendChild(mS);
    a.appendChild(t);

    var droite=document.createElement("div"); droite.className="droite";
    var bS=boutonSaisie(f, charger);
    if(bS) droite.appendChild(bS);
    var bPartage=document.createElement("button");
    bPartage.type="button"; bPartage.className="part";
    bPartage.textContent="Ouvrir";
    bPartage.setAttribute("aria-label","Ouvrir "+(f.titre||"ce document"));
    bPartage.addEventListener("click", function(e){
      e.preventDefault(); e.stopPropagation();
      ouvrirDocument(f, bPartage);
    });
    droite.appendChild(bPartage);
    if(bureau){
      var sup=document.createElement("button");
      sup.type="button"; sup.className="sup";
      sup.textContent="×";
      sup.title="Supprimer ce document";
      sup.setAttribute("aria-label","Supprimer "+(f.titre||"ce document"));
      sup.addEventListener("click", function(e){
        e.preventDefault(); e.stopPropagation();
        if(!window.confirm("Supprimer définitivement « "+(f.titre||"ce document")+" » du dossier "
          +(c.client||c.ref)+" ?\n\nLe document et sa fiche sont retirés du site. Les autres documents du dossier restent.")) return;
        sup.disabled=true; sup.textContent="…";
        fetch(API+"?action=supprimer&cle="+encodeURIComponent(f.cle), {headers:{"x-auth":S.jeton}})
          .then(function(r){ return r.json().then(function(d){ return {ok:r.ok,d:d}; }); })
          .then(function(res){
            if(!res.ok){ alert(res.d.erreur||"Suppression refusée."); sup.disabled=false; sup.textContent="×"; return; }
            charger();
          })
          .catch(function(){ alert("Pas de réseau."); sup.disabled=false; sup.textContent="×"; });
      });
      droite.appendChild(sup);
    }
    a.appendChild(droite);
    ranger(f, a);
  });
  Object.keys(sous).forEach(function(genre){ sous[genre].remplir(lignesDe[genre]); });
  if(!c.fichiers.length && opts.integree){
    var vide=document.createElement("p"); vide.className="vide";
    vide.textContent="Aucun document publié sur ce chantier pour le moment.";
    fs.appendChild(vide);
  }
  box.appendChild(head); box.appendChild(fs);

  var act=null;
  if(bureau){
    act=document.createElement("div"); act.className="actions";
    /* mettre de côté un dossier qui n'est qu'au chiffrage : il quitte
       « Mes chantiers » et le site reposera la question dans un mois. */
    var att2=document.createElement("button"); att2.type="button";
    att2.textContent = c.etat === "attente" ? "Reprendre le dossier" : "En attente de réponse";
    att2.addEventListener("click", function(){
      var vers = c.etat === "attente" ? "actif" : "attente";
      var mot = "";
      if(vers === "attente"){
        mot = window.prompt("En attente de réponse — une note ?\n\n"
          +"Le dossier quitte « Mes chantiers » et revient dans un mois "
          +"avec la question de ce qu'il devient.\n\n"
          +"Un dossier dont le relevé porte déjà « En attente » y va tout seul : "
          +"ce bouton sert à mettre de côté un dossier que le relevé ne signale pas.",
          c.attenteNote || "");
        if(mot === null) return;
      }
      att2.disabled=true; att2.textContent="…";
      fetch(API+"?action=chantier-etat", {method:"POST",
        headers:{"content-type":"application/json", "x-auth":S.jeton},
        body:JSON.stringify({ref:c.ref, etat:vers, note:mot})})
        .then(function(r){ return r.json().then(function(d){ return {ok:r.ok, d:d}; }); })
        .then(function(res){
          if(!res.ok){ window.alert(res.d.erreur||"Changement refusé."); att2.disabled=false; return; }
          charger();
        })
        .catch(function(){ window.alert("Pas de réseau."); att2.disabled=false; });
    });
    var arc=document.createElement("button"); arc.type="button"; arc.className="danger";
    arc.textContent="Archiver";
    arc.addEventListener("click", function(){ archiver(c, arc); });
    var note=document.createElement("span"); note.className="hint";
    note.textContent = c.etat === "attente"
      ? ((c.attenteAuto ? "En attente d'après le statut du relevé, depuis "
                        : "En attente depuis ")
         + depuisCombien(c.joursAttente)
         + " · « Archiver » exporte en ZIP puis retire du site")
      : "« Archiver » exporte en ZIP puis retire du site";
    act.appendChild(att2); act.appendChild(arc); act.appendChild(note);
    box.appendChild(act);
  }

  function deplier(ouvert){
    fs.hidden = !ouvert;
    if(act) act.hidden = !ouvert;
    box.classList.toggle("ouvert", ouvert);
    head.setAttribute("aria-expanded", ouvert ? "true" : "false");
  }
  box.__deplier = deplier;
  if(opts.integree){
    /* sur la page du chantier : le dossier est ouvert, il ne se replie pas */
    deplier(true);
    head.removeAttribute("role"); head.removeAttribute("tabindex");
  } else {
    deplier(PLI.hasOwnProperty(c.ref) ? !!PLI[c.ref] : ouvertParDefaut);
    head.addEventListener("click", basculer);
    head.addEventListener("keydown", function(e){
      if(e.target !== head) return;
      if(e.key === "Enter" || e.key === " "){ e.preventDefault(); basculer(); }
    });
  }
  function basculer(){
    var ouvert = fs.hidden;
    deplier(ouvert); retenirPli(c.ref, ouvert);
  }
  box.style.setProperty("--i", String(Math.min(i||0, 12)));
  return box;
}

window.Dossier={
  configurer:function(o){ CFG=o||{}; S=CFG.session||S; },
  moi:function(m){ MOI=m; },
  carte:carteDossier,
  chargerNonLus:chargerNonLus,
  majPastillesDiscussion:majPastillesDiscussion,
  nonLus:function(ref){ return NON_LUS[ref]||0; },
  ouvrirDiscussion:ouvrirDiscussion,
  retourDiscussion:function(u){ DISCU_RETOUR=u; },
  pasEncoreLu:pasEncoreLu
};
})();
