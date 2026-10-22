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
var CLIENTS={};   /* code travaux (ref) -> nom du chantier (client), pour nommer les téléchargements */
var API="/api/rapports";
var $=function(i){ return document.getElementById(i); };
function charger(){ if(CFG.charger) CFG.charger(); }
function toast(t){ if(CFG.toast) CFG.toast(t); }
function octets(n){ return n>1048576 ? (n/1048576).toFixed(1).replace(".",",")+" Mo" : Math.round(n/1024)+" Ko"; }
function frDate(d){ if(!d) return ""; var a=dateLocale(d).split("-"); return a[2]+"/"+a[1]+"/"+a[0]; }


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
(function(){
  var st=document.createElement("style");
  st.textContent=".head .etiq-ts{flex:0 0 auto;background:#FDF4EA;color:#92400E;font-size:10.5px;font-weight:700;letter-spacing:.02em;padding:2px 9px;border-radius:999px;white-space:nowrap}"
    +".travaux .sous .etiq-ts{padding:1px 7px;font-size:11.5px;margin-left:8px}"
    +".travaux .sous > span.etiq-ts::before,.travaux .sous > span.etiq-accepte::before{content:none!important}"
    +".head .etiq-accepte{flex:0 0 auto;background:rgba(21,128,61,.12);color:#15803D;font-size:10.5px;font-weight:700;letter-spacing:.02em;padding:2px 9px;border-radius:999px;white-space:nowrap}"
    +".travaux .sous .etiq-accepte{padding:0;background:none;font-size:12px;color:#15803D;margin-left:8px}"
    +".actions button.accepte{background:rgba(21,128,61,.12);color:#15803D;border:1px solid rgba(21,128,61,.28);font-weight:700}";
  (document.head||document.documentElement).appendChild(st);
})();
/* Archiver : télécharger le ZIP du dossier puis le retirer du site, ou le
   retirer sans rien télécharger quand on n'en a pas besoin (dossier en
   double, essai, déjà sauvegardé). */
function archiver(c, bouton){
  choisirSuppression(c).then(function(mode){
    if(!mode) return;
    var avecZip = mode==="zip";
    bouton.disabled=true;
    bouton.textContent = avecZip ? "Export en cours…" : "Suppression…";
    (avecZip ? exporterArchive(c, bouton) : Promise.resolve()).then(function(){
      return supprimerApresArchive(c, bouton, avecZip);
    }).catch(function(){
      window.alert(avecZip ? "Export interrompu. Rien n'a été supprimé." : "Pas de réseau. Rien n'a été supprimé.");
      bouton.textContent="Archiver"; bouton.disabled=false;
    });
  });
}
function choisirSuppression(c){
  return new Promise(function(fini){
    var ov=document.createElement("div");
    ov.style.cssText="position:fixed;inset:0;z-index:70;background:rgba(26,24,21,.55);"
      +"-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:flex-end";
    var f=document.createElement("div");
    f.style.cssText="background:var(--bg);width:100%;max-height:84vh;overflow:auto;"
      +"padding:18px 16px calc(20px + env(safe-area-inset-bottom,0px));border-top:2px solid var(--ink)";
    var n=c.fichiers.length;
    var h=document.createElement("h2"); h.style.cssText="font-size:18px;font-weight:700;letter-spacing:-.02em;margin:0 0 6px";
    h.textContent="Archiver "+(c.client||c.ref)+" ?";
    var p=document.createElement("p"); p.className="hint"; p.style.margin="0 0 14px";
    p.textContent=n+" document"+(n>1?"s":"")+". Le dossier est retiré du site : c'est définitif.";
    f.appendChild(h); f.appendChild(p);
    function choix(txt, sous, cls, val){
      var b=document.createElement("button"); b.type="button"; b.className="act "+cls;
      b.style.cssText="display:block;width:100%;text-align:left;margin-bottom:10px;padding:12px 14px;min-height:56px";
      var t=document.createElement("b"); t.style.display="block"; t.textContent=txt;
      var s2=document.createElement("span"); s2.style.cssText="display:block;font-size:12.5px;font-weight:400;opacity:.85;margin-top:2px"; s2.textContent=sous;
      b.appendChild(t); b.appendChild(s2);
      b.addEventListener("click", function(){ document.body.removeChild(ov); fini(val); });
      f.appendChild(b);
    }
    choix("Télécharger le ZIP, puis supprimer", "Tous les documents, les fiches et la discussion, dans un ZIP sur cet appareil.", "blue", "zip");
    choix("Supprimer sans télécharger", "Rien n'est gardé sur l'appareil.", "ghost", "sans");
    choix("Annuler", "Rien n'est supprimé.", "ghost", null);
    ov.appendChild(f);
    ov.addEventListener("click", function(e){ if(e.target===ov){ document.body.removeChild(ov); fini(null); } });
    document.body.appendChild(ov);
  });
}
function exporterArchive(c, bouton){
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
  return suite.then(function(){
    fichiers.push({nom:c.ref+"/00-contenu.txt", octets:new TextEncoder().encode(manifeste.join("\n"))});
    return fetch(API+"?action=messages&ref="+encodeURIComponent(c.ref), {headers:{"x-auth":S.jeton}})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){
        if(d && d.messages && d.messages.length){
          var lignes=["Discussion du chantier "+(c.client||c.ref)+" ("+c.ref+")",
            d.messages.length+" message"+(d.messages.length>1?"s":""), ""];
          d.messages.forEach(function(m){
            lignes.push(m.auteur+"  "+dateLocale(m.quand).split("-").reverse().join("/")
              +" "+heureLocale(m.quand));
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
    var nom="Travaux-"+(nomPropre(c.ref+" "+(c.client||"")).replace(/\s+/g,"-")||c.ref)+".zip";
    var a=document.createElement("a");
    a.href=URL.createObjectURL(blob); a.download=nom; a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 3000);
    bouton.textContent="Suppression…";
    return new Promise(function(res){ setTimeout(res, 1200); });
  });
}
function supprimerApresArchive(c, bouton, avecZip){
  /* le client a un lien ou un QR de tableau : on lui garde son espace, ou on supprime tout */
  return fetch(API+"?action=liens&ref="+encodeURIComponent(c.ref), {headers:{"x-auth":S.jeton}})
    .then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; })
    .then(function(d){
      var liens=(d && d.liens) || [];
      if(!liens.length){
        if(!avecZip) return "tout";             /* déjà confirmé : « Supprimer sans télécharger » */
        return window.confirm("Le ZIP a été téléchargé. Vérifiez-le si vous le souhaitez.\n\nSupprimer maintenant ce dossier du site ?") ? "tout" : null;
      }
      return choixArchivage(c, liens, avecZip);
    }).then(function(choix){
      if(!choix){
        bouton.textContent="Archiver"; bouton.disabled=false;
        return null;
      }
      return fetch(API+"?action=supprimer-chantier&ref="+encodeURIComponent(c.ref)+(choix==="garder" ? "&garder=1" : ""),
        {headers:{"x-auth":S.jeton}})
        .then(function(r){ return r.json().then(function(d){ return {ok:r.ok,d:d}; }); })
        .then(function(res){
          if(!res.ok){ window.alert(res.d.erreur||"Suppression refusée."); bouton.textContent="Archiver"; bouton.disabled=false; return; }
          if(CFG.apresArchive) CFG.apresArchive(c); else charger();
        });
    });
}

/* après l'export : garder l'espace du client (ses documents et ses liens), ou tout supprimer */
function choixArchivage(c, liens, avecZip){
  return new Promise(function(fini){
    var ov=document.createElement("div");
    ov.style.cssText="position:fixed;inset:0;z-index:70;background:rgba(26,24,21,.55);"
      +"-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:flex-end";
    var f=document.createElement("div");
    f.style.cssText="background:var(--bg);width:100%;max-height:84vh;overflow:auto;"
      +"padding:18px 16px calc(20px + env(safe-area-inset-bottom,0px));border-top:2px solid var(--ink)";
    var nbQr=liens.filter(function(l){ return l.genre==="tableau"; }).length, client=liens.some(function(l){ return l.genre==="client"; });
    var h=document.createElement("h2"); h.style.cssText="font-size:18px;font-weight:700;letter-spacing:-.02em;margin:0 0 6px";
    h.textContent=(avecZip===false ? "" : "Le ZIP est téléchargé. ")+"Et l'espace du client ?";
    var p=document.createElement("p"); p.className="hint"; p.style.margin="0 0 14px";
    p.textContent=(c.client||c.ref)+" a "+[client ? "un lien client" : "", nbQr ? nbQr+" QR code"+(nbQr>1?"s":"")+" de tableau" : ""].filter(Boolean).join(" et ")
      +". Vous pouvez lui garder ses documents (PV, DOE, schéma, étiquettes, mise en service, interventions SAV) : ses liens restent ouverts. Le reste du dossier (relevé, suivi, commandes, point, photos) "+(avecZip===false ? "est supprimé." : "part avec l'archive.");
    f.appendChild(h); f.appendChild(p);
    function choix(txt, sous, cls, val){
      var b=document.createElement("button"); b.type="button"; b.className="act "+cls;
      b.style.cssText="display:block;width:100%;text-align:left;margin-bottom:10px;padding:12px 14px;min-height:56px";
      var t=document.createElement("b"); t.style.display="block"; t.textContent=txt;
      var s2=document.createElement("span"); s2.style.cssText="display:block;font-size:12.5px;font-weight:400;opacity:.85;margin-top:2px"; s2.textContent=sous;
      b.appendChild(t); b.appendChild(s2);
      b.addEventListener("click", function(){ document.body.removeChild(ov); fini(val); });
      f.appendChild(b);
    }
    choix("Garder l'espace du client", "Ses documents et ses liens restent ; le dossier quitte la liste des chantiers.", "blue", "garder");
    choix("Tout supprimer", (client ? "Le lien du client est coupé. " : "")+(nbQr ? "Le QR du tableau continue de recevoir les demandes." : ""), "ghost", "tout");
    choix("Annuler", "Rien n'est supprimé.", "ghost", null);
    ov.appendChild(f);
    document.body.appendChild(ov);
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
          dedans.appendChild(PastillePersonne(nom,
            res.d.peutModifier && nom!==auteur ? function(){ equipe=equipe.filter(function(n){ return n!==nom; }); enregistrer(); } : null,
            {etiquette: nom===auteur ? "auteur" : ""}));
        });
        hote.appendChild(dedans);
        if(!res.d.peutModifier){
          var note=document.createElement("p"); note.className="hint"; note.style.margin="0";
          note.textContent="Seul le bureau peut modifier les accès.";
          hote.appendChild(note);
          return;
        }
        /* une recherche plutôt que la liste de tous les comptes */
        var l=document.createElement("p"); l.className="legend"; l.textContent="Ajouter quelqu'un";
        hote.appendChild(l);
        hote.appendChild(ChercherPersonne({personnes:res.d.personnes, exclure:equipe,
          ajouter:function(nom){ if(equipe.indexOf(nom)<0){ equipe.push(nom); enregistrer(); } }}));
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
  var jour=jourLocal(d), auj=jourLocal(maintenant);
  var heure=String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
  if(jour===auj) return heure;
  var hier=jourLocal(new Date(maintenant.getTime()-86400000));
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
function nomFichier(f){
  var base=String(f.cle).split("/").pop();
  /* un document importé garde le nom qu'on lui a donné (« Plan RDC.pdf »), pas sa clé */
  if(f.type==="technique" && f.titre){
    var t=String(f.titre).normalize("NFC").replace(/[\/\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 110);
    if(t) return t+base.slice(base.lastIndexOf("."));
  }
  return base;
}
/* glisser un document de la liste vers le bureau ou un dossier de l'ordinateur (Edge, Chrome) */
var TYPES_GLISSER={pdf:"application/pdf", zip:"application/zip", jpg:"image/jpeg", jpeg:"image/jpeg", png:"image/png", webp:"image/webp",
  dwg:"application/acad", dxf:"application/dxf", doc:"application/msword", docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls:"application/vnd.ms-excel", xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt:"application/vnd.ms-powerpoint", pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt:"application/vnd.oasis.opendocument.text", ods:"application/vnd.oasis.opendocument.spreadsheet", txt:"text/plain", csv:"text/csv"};
/* Glisser un document de la liste hors du site (Chrome, Edge) :
   - vers le bureau, un dossier, l'Explorateur, le Finder, Outlook, l'appli
     Mail : le fichier est posé là où on le lâche (DownloadURL), une seule
     fois — rien d'autre n'est glissé avec (ni lien, ni raccourci) ;
   - vers une messagerie ouverte dans le navigateur (iCloud Mail, Gmail,
     Outlook web) : le fichier lui-même, en pièce jointe. Il est préparé dès
     que la souris passe sur la ligne, pour être prêt quand on commence à glisser. */
var FICHIERS_PRETS={};
function preparerGlisser(f){
  if(FICHIERS_PRETS[f.cle] || (f.taille && f.taille > 25*1024*1024)) return;
  FICHIERS_PRETS[f.cle]="…";
  telecharger(f).then(function(blob){
    var ext=String(f.cle).split(".").pop().toLowerCase();
    var nom=nomAvecChantier(refDeCle(f.cle), nomFichier(f)).replace(/:/g, " ");
    try{ FICHIERS_PRETS[f.cle]=new File([blob], nom, {type:TYPES_GLISSER[ext]||blob.type||"application/octet-stream"}); }
    catch(e){ delete FICHIERS_PRETS[f.cle]; }
  }).catch(function(){ delete FICHIERS_PRETS[f.cle]; });
}
function glisserVersOrdinateur(a, f){
  a.draggable=true;
  a.addEventListener("mouseenter", function(){ preparerGlisser(f); });
  a.addEventListener("pointerdown", function(e){ if(e.pointerType==="mouse") preparerGlisser(f); });
  a.addEventListener("dragstart", function(e){
    if(!e.dataTransfer) return;
    var ext=String(f.cle).split(".").pop().toLowerCase();
    var nom=nomAvecChantier(refDeCle(f.cle), nomFichier(f)).replace(/:/g, " ");
    var url=location.origin+API+"?action=fichier&cle="+encodeURIComponent(f.cle)+"&auth="+encodeURIComponent(S.jeton);
    /* rien que le fichier : pas de lien ni de texte, qui faisaient un second élément (raccourci, page) */
    try{ e.dataTransfer.clearData(); }catch(er){}
    try{ e.dataTransfer.setData("DownloadURL", (TYPES_GLISSER[ext]||"application/octet-stream")+":"+nom+":"+url); }catch(er){}
    var pret=FICHIERS_PRETS[f.cle];
    if(pret && typeof pret==="object"){ try{ e.dataTransfer.items.add(pret); }catch(er){} }
    try{ e.dataTransfer.effectAllowed="copy"; }catch(er){}
  });
}
/* le partage de fichiers du système (Chrome et Edge sous Windows, Chrome et Safari sur Mac) */
var PEUT_ENVOYER=null;
function peutEnvoyerFichiers(){
  if(PEUT_ENVOYER!==null) return PEUT_ENVOYER;
  PEUT_ENVOYER=false;
  try{ PEUT_ENVOYER = surOrdinateur() && !!navigator.canShare && navigator.canShare({files:[new File(["x"], "essai.pdf", {type:"application/pdf"})]}); }catch(e){ PEUT_ENVOYER=false; }
  return PEUT_ENVOYER;
}
function envoyerDocument(f, bouton){
  var nom=nomAvecChantier(refDeCle(f.cle), nomFichier(f)).replace(/:/g, " ");
  function partager(fichier){
    navigator.share({files:[fichier], title:f.titre||nom}).then(function(){ marquerLu(f); }).catch(function(err){
      if(err && err.name==="AbortError") return;
      /* le navigateur veut un clic tout frais : le fichier est prêt, un second clic l'envoie aussitôt */
      if(err && err.name==="NotAllowedError") toast("Fichier prêt : touchez de nouveau « Envoyer ».");
      else toast("Le partage n'a pas abouti. Ouvrez le document et enregistrez-le, puis joignez-le.");
    });
  }
  var pret=FICHIERS_PRETS[f.cle];
  if(pret && typeof pret==="object"){ partager(pret); return; }
  var avant=bouton.textContent; bouton.disabled=true; bouton.textContent="…";
  telecharger(f).then(function(blob){
    bouton.disabled=false; bouton.textContent=avant;
    var ext=String(f.cle).split(".").pop().toLowerCase(), fichier;
    try{ fichier=new File([blob], nom, {type:TYPES_GLISSER[ext]||blob.type||"application/octet-stream"}); }catch(e){ fichier=null; }
    if(!fichier){ toast("Fichier illisible."); return; }
    FICHIERS_PRETS[f.cle]=fichier;
    partager(fichier);
  }).catch(function(){ bouton.disabled=false; bouton.textContent=avant; toast("Document indisponible. Vérifiez la connexion."); });
}
function partagerDocument(f, bouton){
  var avant = bouton ? bouton.textContent : "";
  if(bouton){ bouton.disabled=true; bouton.textContent="…"; }
  telecharger(f)
    .then(function(blob){
      if(bouton){ bouton.disabled=false; bouton.textContent=avant; }
      marquerLu(f);
      var nom=nomAvecChantier(refDeCle(f.cle), nomFichier(f));
      var fichier;
      try{ fichier=new File([blob], nom, {type:blob.type||"application/pdf"}); }catch(e){ fichier=null; }
      if(fichier && navigator.canShare && navigator.canShare({files:[fichier]})){
        navigator.share({files:[fichier], title:f.titre||nom})
          .catch(function(err){ if(!err || err.name!=="AbortError") enregistrer(blob, nom); });
        return;
      }
      enregistrer(blob, nom);
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
/* Sur ordinateur (Chrome, Edge, Firefox, Safari du Mac), un PDF s'affiche dans un nouvel onglet,
   avec la visionneuse du navigateur (imprimer, enregistrer sous son nom) : rien n'est téléchargé.
   L'onglet s'ouvre tout de suite, au clic, pour que le navigateur ne le bloque pas. */
function surOrdinateur(){
  var ua=navigator.userAgent||"";
  if(/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return false;
  if(navigator.platform==="MacIntel" && (navigator.maxTouchPoints||0)>1) return false;   /* un iPad qui se dit Mac */
  return true;
}
function ouvrirDocument(f, bouton){
  if(surOrdinateur() && /\.pdf$/i.test(f.cle||"")){
    var lien=API+"?action=fichier&cle="+encodeURIComponent(f.cle)+"&auth="+encodeURIComponent(S.jeton);
    var w=window.open(lien, "_blank");
    if(w){ try{ w.opener=null; }catch(e){} marquerLu(f); return; }
    /* fenêtre bloquée : on retombe sur le téléchargement */
  }
  var avant = bouton ? bouton.textContent : "";
  if(bouton){ bouton.disabled=true; bouton.textContent="…"; }
  telecharger(f)
    .then(function(blob){
      if(bouton){ bouton.disabled=false; bouton.textContent=avant; }
      marquerLu(f);
      enregistrer(blob, nomAvecChantier(refDeCle(f.cle), nomFichier(f)));
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
/* la photo en grand : toujours sur fond noir, en mode clair comme en sombre
   (data-theme-propre : le thème n'y touche pas) */
var STYLE_GALERIE=false;
function styleGalerie(){
  if(STYLE_GALERIE) return;
  STYLE_GALERIE=true;
  var st=document.createElement("style");
  st.setAttribute("data-theme-propre","");
  st.textContent=
    ".dg-plein{position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;background:#0F0E0C;color:#F4F1EA;outline:none;"
    +"padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)}"
    +".dg-haut{flex:0 0 auto;display:flex;justify-content:flex-end;padding:8px 12px 4px}"
    +".dg-x{width:44px;height:44px;min-height:0;padding:0;border:0;border-radius:50%;background:rgba(244,241,234,.14);color:#F4F1EA;"
    +"display:flex;align-items:center;justify-content:center;cursor:pointer}"
    +".dg-x svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round}"
    +".dg-scene{flex:1 1 auto;min-height:0;position:relative;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none}"
    +".dg-piste{position:absolute;inset:0;will-change:transform}"
    +".dg-case{position:absolute;top:0;bottom:0;width:100%;box-sizing:border-box;padding:0 12px;display:flex;align-items:center;justify-content:center}"
    +".dg-case img{display:block;max-width:100%;max-height:100%;object-fit:contain;-webkit-user-drag:none;transform-origin:50% 50%}"
    +".dg-case img[hidden]{display:none}"
    +".dg-fl{display:none;position:absolute;top:50%;z-index:1;width:48px;height:48px;min-height:0;margin-top:-24px;padding:0;border:0;border-radius:50%;"
    +"background:rgba(15,14,12,.55);color:#F4F1EA;align-items:center;justify-content:center;cursor:pointer}"
    +".dg-fl svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}"
    +".dg-fl.g{left:16px}.dg-fl.d{right:16px}"
    +".dg-nom{flex:0 0 auto;margin:10px 16px 0;color:#BDB5A6;font-size:12.5px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
    +".dg-bas{flex:0 0 auto;display:flex;justify-content:center;padding:14px 16px 18px}"
    +".dg-enr{min-height:48px;min-width:170px;padding:0 28px;border:0;border-radius:var(--r-field,10px);background:rgba(244,241,234,.14);"
    +"color:#F4F1EA;font-size:15px;font-weight:600;font-family:inherit;cursor:pointer}"
    +".dg-x:focus-visible,.dg-fl:focus-visible,.dg-enr:focus-visible{outline:3px solid #FB923C;outline-offset:2px}"
    /* à la souris : la main qui saisit, les deux flèches sur les côtés, le survol */
    +"@media (hover:hover) and (pointer:fine){.dg-scene{cursor:grab}.dg-scene.dg-tient{cursor:grabbing}"
    +".dg-fl{display:flex}.dg-fl[hidden]{display:none}"
    +".dg-x:hover,.dg-enr:hover{background:rgba(244,241,234,.24)}.dg-fl:hover{background:rgba(15,14,12,.8)}}";
  (document.head||document.documentElement).appendChild(st);
}
/* Une photo en grand. On passe de l'une à l'autre en la faisant glisser
   du doigt : vers la gauche la suivante, vers la droite la précédente.
   La photo suit le doigt ; aux deux bouts, elle résiste et revient.
   Le zoom : deux doigts qui s'écartent agrandissent la photo vers
   l'endroit pincé (jusqu'à 5 fois) ; un double toucher l'agrandit là où
   l'on touche, un autre la remet entière. Agrandie, un doigt la promène
   (sans qu'elle sorte du cadre) et le glissé ne change plus de photo.
   La croix en haut à droite referme ; « Enregistrer », seul au centre,
   garde la photo affichée. À l'ordinateur : la souris fait glisser de
   même ; la molette (ou le pincement du pavé tactile) et le double clic
   zooment, + et − aussi, 0 remet la photo entière ; les flèches du
   clavier et les deux flèches sur les côtés changent de photo, Échap
   referme. */
function pleinEcran(f, photos, urls, depart, quandFerme){
  styleGalerie();
  var k=depart, n=urls.length, W=1, dx=0, x0=0, y0=0, traces=[], enCours=false;
  /* les doigts posés, et le geste en cours : null (pas encore décidé), « glisse »
     (changer de photo), « promene » (déplacer la photo agrandie), « pince »
     (zoomer à deux doigts), « rien » (un glissé vertical) */
  var DOIGTS={}, geste=null, bouge=false, origine={x:0, y:0}, pince=null, toucherAvant=null;
  var Z={s:1, x:0, y:0}, ZMAX=5, ZDOUBLE=2.5;
  var reduit=!!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var vue=document.createElement("div"); vue.className="dg-plein"; vue.tabIndex=-1;
  vue.setAttribute("role","dialog"); vue.setAttribute("aria-modal","true");
  var haut=document.createElement("div"); haut.className="dg-haut";
  var croix=document.createElement("button"); croix.type="button"; croix.className="dg-x";
  croix.setAttribute("aria-label","Fermer"); croix.title="Fermer";
  croix.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  haut.appendChild(croix);
  var scene=document.createElement("div"); scene.className="dg-scene";
  var piste=document.createElement("div"); piste.className="dg-piste";
  /* trois cases côte à côte : la précédente, celle qu'on voit, la suivante */
  var cases=[0,1,2].map(function(){
    var c=document.createElement("div"); c.className="dg-case";
    var im=document.createElement("img"); im.draggable=false; im.alt="";
    c.appendChild(im); piste.appendChild(c); return c;
  });
  scene.appendChild(piste);
  function fleche(cote, etiquette, trace){
    var b=document.createElement("button"); b.type="button"; b.className="dg-fl "+cote;
    b.setAttribute("aria-label", etiquette); b.title=etiquette;
    b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+trace+'"/></svg>';
    scene.appendChild(b); return b;
  }
  var flG=fleche("g", "Photo précédente", "M15 5l-7 7 7 7");
  var flD=fleche("d", "Photo suivante", "M9 5l7 7-7 7");
  var nom=document.createElement("p"); nom.className="dg-nom"; nom.setAttribute("aria-live","polite");
  var bas=document.createElement("div"); bas.className="dg-bas";
  var enr=document.createElement("button"); enr.type="button"; enr.className="dg-enr"; enr.textContent="Enregistrer";
  bas.appendChild(enr);
  vue.appendChild(haut); vue.appendChild(scene); vue.appendChild(nom); vue.appendChild(bas);

  function remplir(c, i){
    var im=c.firstChild;
    im.style.transition="none"; im.style.transform="";
    if(i<0 || i>=n){ im.hidden=true; im.removeAttribute("src"); im.alt=""; return; }
    im.hidden=false;
    if(im.getAttribute("src")!==urls[i]) im.src=urls[i];
    im.alt=photos[i].nom.split("/").pop();
  }
  function placer(){
    Z={s:1, x:0, y:0}; scene.classList.remove("dg-zoom");
    cases[0].style.left="-100%"; cases[1].style.left="0"; cases[2].style.left="100%";
    remplir(cases[0], k-1); remplir(cases[1], k); remplir(cases[2], k+1);
    cases[0].setAttribute("aria-hidden","true"); cases[1].removeAttribute("aria-hidden"); cases[2].setAttribute("aria-hidden","true");
    nom.textContent=(n>1 ? (k+1)+" sur "+n+"  ·  " : "")+photos[k].nom.split("/").pop();
    vue.setAttribute("aria-label", "Photo "+(k+1)+" sur "+n);
    flG.hidden = k<=0; flD.hidden = k>=n-1;
  }
  function poser(x, anime){
    piste.style.transition = anime && !reduit ? "transform .28s cubic-bezier(.2,.8,.2,1)" : "none";
    piste.style.transform = "translate3d("+x+"px,0,0)";
  }

  /* ---------- le zoom de la photo affichée ---------- */
  function image(){ return cases[1].firstChild; }
  function centre(){ var r=scene.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; }
  /* jusqu'où la photo agrandie peut aller : ses bords ne quittent pas ceux de l'écran */
  function bornes(s){
    var im=image();
    return {x:Math.max(0, (im.offsetWidth*s-scene.clientWidth)/2), y:Math.max(0, (im.offsetHeight*s-scene.clientHeight)/2)};
  }
  function borner(){ var b=bornes(Z.s); Z.x=Math.max(-b.x, Math.min(b.x, Z.x)); Z.y=Math.max(-b.y, Math.min(b.y, Z.y)); }
  function resiste(v, m){ return v>m ? m+(v-m)*.35 : v<-m ? -m+(v+m)*.35 : v; }
  function zoomer(anime){
    var im=image();
    im.style.transition = anime && !reduit ? "transform .25s cubic-bezier(.2,.8,.2,1)" : "none";
    im.style.transform = Z.s===1 && !Z.x && !Z.y ? "" : "translate("+Z.x+"px,"+Z.y+"px) scale("+Z.s+")";
    scene.classList.toggle("dg-zoom", Z.s>1.01);
  }
  function remettre(anime){ Z={s:1, x:0, y:0}; zoomer(anime); }
  /* agrandir à s fois en gardant sous (mx, my) le point de la photo qui s'y trouve */
  function zoomerVers(s, mx, my, anime){
    s=Math.min(ZMAX, Math.max(1, s));
    if(s<1.01){ remettre(anime); return; }
    var c=centre(), px=(mx-c.x-Z.x)/Z.s, py=(my-c.y-Z.y)/Z.s;
    Z.s=s; Z.x=mx-c.x-s*px; Z.y=my-c.y-s*py;
    borner(); zoomer(anime);
  }
  /* la fin d'un pincement : entre 1 et 5 fois, et dans le cadre */
  function finZoom(mx, my){
    if(Z.s<1.01){ remettre(true); return; }
    if(Z.s>ZMAX){ var c=centre(), px=(mx-c.x-Z.x)/Z.s, py=(my-c.y-Z.y)/Z.s; Z.s=ZMAX; Z.x=mx-c.x-ZMAX*px; Z.y=my-c.y-ZMAX*py; }
    borner(); zoomer(true);
  }

  /* une photo plus loin (sens 1) ou plus tôt (sens -1) ; au bout, la photo revient en place */
  function aller(sens){
    if(enCours) return;
    if(k+sens<0 || k+sens>=n){ poser(0, true); return; }
    if(Z.s!==1 || Z.x || Z.y) remettre(false);
    enCours=true; W=scene.clientWidth||1;
    var fini=false;
    function fin(){
      if(fini) return; fini=true;
      k+=sens;
      /* la case arrivée au milieu y reste : son image ne se recharge pas */
      if(sens>0) cases.push(cases.shift()); else cases.unshift(cases.pop());
      placer(); poser(0, false); enCours=false;
    }
    if(reduit){ fin(); return; }
    poser(-sens*W, true);
    piste.addEventListener("transitionend", fin, {once:true});
    setTimeout(fin, 360);
  }

  /* ---------- les doigts (ou la souris) ---------- */
  function doigts(){ return Object.keys(DOIGTS).map(function(i){ return DOIGTS[i]; }); }
  scene.addEventListener("pointerdown", function(e){
    if(e.pointerType==="mouse" && e.button!==0) return;
    if(e.target.closest && e.target.closest(".dg-fl")) return;
    if(enCours) return;
    /* le premier doigt posé : aucun autre ne compte encore (un lâcher perdu ne bloque rien) */
    if(e.isPrimary) DOIGTS={};
    DOIGTS[e.pointerId]={x:e.clientX, y:e.clientY};
    try{ scene.setPointerCapture(e.pointerId); }catch(er){}
    var l=doigts();
    if(l.length===1){
      geste = Z.s>1.01 ? "promene" : null; bouge=false;
      x0=e.clientX; y0=e.clientY; dx=0; W=scene.clientWidth||1;
      traces=[{x:e.clientX, t:e.timeStamp}];
      origine={x:Z.x, y:Z.y};
      if(geste==="promene"){ image().style.transition="none"; scene.classList.add("dg-tient"); }
    } else if(l.length===2){
      /* deux doigts : on zoome ; un glissé commencé reprend sa place */
      if(geste==="glisse") poser(0, true);
      geste="pince"; bouge=true; scene.classList.remove("dg-tient");
      var a=l[0], b=l[1];
      pince={d:Math.max(1, Math.hypot(b.x-a.x, b.y-a.y)), mx:(a.x+b.x)/2, my:(a.y+b.y)/2, s:Z.s, x:Z.x, y:Z.y};
      image().style.transition="none";
    }
  });
  scene.addEventListener("pointermove", function(e){
    if(!DOIGTS[e.pointerId]) return;
    DOIGTS[e.pointerId]={x:e.clientX, y:e.clientY};
    var l=doigts();
    if(geste==="pince"){
      if(l.length<2) return;
      var a=l[0], b=l[1], d=Math.hypot(b.x-a.x, b.y-a.y), cx=(a.x+b.x)/2, cy=(a.y+b.y)/2;
      var s=pince.s*d/pince.d;
      if(s>ZMAX) s=ZMAX+(s-ZMAX)*.3;   /* au-delà de 5 fois, ça résiste */
      if(s<.6) s=.6;
      var c=centre(), px=(pince.mx-c.x-pince.x)/pince.s, py=(pince.my-c.y-pince.y)/pince.s;
      Z.s=s; Z.x=cx-c.x-s*px; Z.y=cy-c.y-s*py;
      zoomer(false);
      return;
    }
    if(l.length!==1) return;
    var mx=e.clientX-x0, my=e.clientY-y0;
    if(!bouge && (Math.abs(mx)>8 || Math.abs(my)>8)) bouge=true;
    if(geste==="promene"){
      var bo=bornes(Z.s);
      Z.x=resiste(origine.x+mx, bo.x); Z.y=resiste(origine.y+my, bo.y);
      zoomer(false);
      return;
    }
    if(geste===null){
      if(!bouge) return;
      geste = Math.abs(mx)>Math.abs(my) ? "glisse" : "rien";
      if(geste==="glisse") scene.classList.add("dg-tient");
    }
    if(geste!=="glisse") return;
    /* au premier et au dernier bout, la photo résiste */
    dx = (k<=0 && mx>0) || (k>=n-1 && mx<0) ? mx*.3 : mx;
    traces.push({x:e.clientX, t:e.timeStamp}); if(traces.length>6) traces.shift();
    poser(dx, false);
  });
  function lacher(e){
    if(!DOIGTS[e.pointerId]) return;
    delete DOIGTS[e.pointerId];
    var l=doigts();
    if(geste==="pince"){
      if(l.length===1){
        /* un doigt reste posé : il promène la photo agrandie */
        x0=l[0].x; y0=l[0].y; origine={x:Z.x, y:Z.y};
        if(Z.s>1.01){ geste="promene"; scene.classList.add("dg-tient"); }
        else { geste="rien"; finZoom(pince.mx, pince.my); }
      } else if(!l.length){ geste=null; finZoom(pince.mx, pince.my); }
      return;
    }
    if(l.length) return;
    scene.classList.remove("dg-tient");
    var g=geste; geste=null;
    if(g==="promene"){
      finZoom(e.clientX, e.clientY);
      if(!bouge && e.type!=="pointercancel") toucher(e);
      return;
    }
    if(g==="glisse"){
      if(e.type==="pointercancel"){ poser(0, true); return; }
      /* un petit coup sec suffit : la vitesse des derniers instants compte */
      var a=traces[0], v=a ? (e.clientX-a.x)/Math.max(16, e.timeStamp-a.t) : 0;
      if(k<n-1 && (dx<-W*.2 || (v<-.35 && dx<-24))) aller(1);
      else if(k>0 && (dx>W*.2 || (v>.35 && dx>24))) aller(-1);
      else poser(0, true);
      return;
    }
    if(g===null && !bouge && e.type!=="pointercancel") toucher(e);
  }
  /* deux touchers rapprochés : la photo s'agrandit là, ou redevient entière */
  function toucher(e){
    var t=e.timeStamp, x=e.clientX, y=e.clientY, avant=toucherAvant;
    toucherAvant={t:t, x:x, y:y};
    if(!avant || t-avant.t>320 || Math.hypot(x-avant.x, y-avant.y)>30) return;
    toucherAvant=null;
    if(Z.s>1.01) remettre(true); else zoomerVers(ZDOUBLE, x, y, true);
  }
  scene.addEventListener("pointerup", lacher);
  scene.addEventListener("pointercancel", lacher);
  scene.addEventListener("dragstart", function(e){ e.preventDefault(); });
  /* la molette, ou le pincement du pavé tactile (une molette avec Ctrl, plus fine) */
  scene.addEventListener("wheel", function(e){
    e.preventDefault();
    if(enCours) return;
    var d=e.deltaY*(e.deltaMode===1 ? 33 : e.deltaMode===2 ? 400 : 1);
    zoomerVers(Z.s*Math.exp(-d*(e.ctrlKey ? .01 : .0018)), e.clientX, e.clientY, false);
  }, {passive:false});
  flG.addEventListener("click", function(){ aller(-1); });
  flD.addEventListener("click", function(){ aller(1); });

  /* enregistrer juste cette photo, à l'unité (pour n'avoir que la photo) */
  enr.addEventListener("click", function(){
    var ph=photos[k];
    var blob=new Blob([ph.octets], {type: ph.type || (/\.png$/i.test(ph.nom) ? "image/png" : "image/jpeg")});
    enregistrer(blob, nomAvecChantier(refDeCle(f.cle), ph.nom.split("/").pop()));
  });
  function touche(e){
    var c;
    if(e.key==="Escape") fermer();
    else if(e.key==="ArrowRight") aller(1);
    else if(e.key==="ArrowLeft") aller(-1);
    else if(e.key==="+" || e.key==="=" || e.key==="-" || e.key==="_"){
      c=centre(); zoomerVers(Z.s*(e.key==="+" || e.key==="=" ? 1.5 : 1/1.5), c.x, c.y, true);
    }
    else if(e.key==="0") remettre(true);
    else return;
    e.preventDefault(); e.stopPropagation();
  }
  /* l'écran tourne : la photo agrandie reste dans le cadre */
  function recaler(){ if(Z.s>1.01){ borner(); zoomer(false); } }
  function fermer(){
    document.removeEventListener("keydown", touche, true);
    window.removeEventListener("resize", recaler);
    if(vue.parentNode) vue.parentNode.removeChild(vue);
    if(quandFerme) quandFerme();
  }
  croix.addEventListener("click", fermer);
  document.addEventListener("keydown", touche, true);
  window.addEventListener("resize", recaler);
  document.body.appendChild(vue);
  placer(); poser(0, false);
  try{ vue.focus({preventScroll:true}); }catch(e){}
}
/* une photo seule (rangée dans les documents du chantier) : « Ouvrir » l'affiche
   en grand, comme dans la galerie, au lieu de la page de téléchargement de l'iPhone */
var PHOTO_AFFICHABLE=/\.(jpe?g|png|webp|gif)$/i;
function ouvrirPhoto(f, bouton){
  var avant = bouton ? bouton.textContent : "";
  if(bouton){ bouton.disabled=true; bouton.textContent="…"; }
  telecharger(f)
    .then(function(blob){
      if(bouton){ bouton.disabled=false; bouton.textContent=avant; }
      marquerLu(f);
      return blob.arrayBuffer().then(function(buf){
        var ext=String(f.cle).split(".").pop().toLowerCase();
        var type=TYPES_GLISSER[ext] || blob.type || "image/jpeg";
        var url=URL.createObjectURL(new Blob([buf], {type:type}));
        pleinEcran(f, [{nom:nomFichier(f), octets:new Uint8Array(buf), type:type}], [url], 0,
          function(){ URL.revokeObjectURL(url); });
      });
    })
    .catch(function(){
      if(bouton){ bouton.disabled=false; bouton.textContent=avant; }
      alert("Photo indisponible. Vérifiez la connexion.");
    });
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
        im.addEventListener("click", function(){ pleinEcran(f, photos, urls, i); });
        var cap=document.createElement("figcaption");
        cap.style.cssText="padding:7px 9px;color:#BDB5A6;font-size:11.5px;overflow:hidden;"
          +"text-overflow:ellipsis;white-space:nowrap";
        cap.textContent=p.nom.split("/").pop().replace(/\.(jpe?g|png)$/i,"").replace(/^\d+-?/,"").replace(/-/g," ");
        fig.appendChild(im); fig.appendChild(cap);
        corps.appendChild(fig);
      });
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
  /* « tout marquer comme vu » sur l'accueil : plus nouveau, sans valoir lecture */
  return !!m && f.auteur !== m && !((f.lectures||{})[m]) && !((f.acquis||{})[m]);
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

var ORDRE={releve:1, technique:2, schema:2.5, carnet:3, memoire:4, suivi:5, commande:6, point:7, note:7.5, photos:8, reportage:9, etiquettes:10, autocontrole:11, reception:12, doe:13, sav:14};
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
/* Les sous-dossiers d'un dossier : « Suivi de chantier », « Plans »
   (documents techniques de nature Plan, et eux seuls), « Documents
   techniques » (fiches techniques, schémas, notices, autres ; ceux de
   nature Photo vont aux photos),
   « Commandes » et « Photos du chantier ». Repliés, avec leur nombre de documents ; les plus récents
   en premier une fois ouverts. Ouvert ou fermé tient jusqu'à la fin de
   la visite, dossier par dossier. */
var SOUS_DOSSIERS={
  suivi:{nom:"Suivi de chantier", classe:"sous-dossier dossier-suivi", memo:"rapports:suivis", mot:"suivi",
    ico:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'},
  plans:{nom:"Plans", classe:"sous-dossier dossier-plans", memo:"rapports:plans", mot:"plan",
    ico:'<path d="M3.5 6.5 9 4.5l6 2 5.5-2v13L15 19.5l-6-2-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>'},
  techniques:{nom:"Documents techniques", classe:"sous-dossier dossier-techniques", memo:"rapports:techniques", mot:"document",
    ico:'<path d="M3.5 7.2 12 3.5l8.5 3.7v9.6L12 20.5 3.5 16.8z"/><path d="M3.5 7.2 12 11l8.5-3.8M12 11v9.5"/>'},
  commandes:{nom:"Commandes", classe:"sous-dossier dossier-commandes", memo:"rapports:commandes", mot:"commande",
    aFaire:function(f){ return !f.saisie; }, motAFaire:"à saisir",
    ico:'<path d="M3.5 5h2.2l2.1 9.4a1.6 1.6 0 0 0 1.6 1.3h7.6a1.6 1.6 0 0 0 1.6-1.2L20.5 8H7"/><circle cx="10" cy="19.4" r="1.3"/><circle cx="17.4" cy="19.4" r="1.3"/>'},
  points:{nom:"Le point de chantier", classe:"sous-dossier dossier-points", memo:"rapports:points", mot:"point",
    ico:'<path d="M4 6.3l1.4 1.4 2.9-3.2M4 12.4l1.4 1.4 2.9-3.2M4 18.5l1.4 1.4 2.9-3.2"/><path d="M11.5 6h8.5M11.5 12h8.5M11.5 18h6"/>'},
  notes:{nom:"Notes", classe:"sous-dossier dossier-notes", memo:"rapports:notes", mot:"note",
    ico:'<path d="M5.5 3.5h9l4 4v13h-13z"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4"/>'},
  photos:{nom:"Photos du chantier", classe:"sous-dossier dossier-photos", memo:"rapports:photos", mot:"document", exporter:true,
    ico:'<path d="M3.5 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1.3-2h6.4l1.3 2h2a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/><circle cx="12" cy="12.5" r="3.4"/>'}
};
/* ---------- la catégorie d'un document technique ----------
   Montrée à côté de l'étiquette ; le bureau, ou celui qui l'a déposé, la
   change d'un choix : le document passe dans le bon sous-dossier. */
var CATEGORIES_TECHNIQUE=["Plan","Fiche technique","Schéma","Notice","Photo","Autre"];
/* un petit menu, à la taille d'une étiquette : il ne déborde plus sur « Ouvrir » */
var STYLE_CATEGORIE=false;
function styleCategorie(){
  if(STYLE_CATEGORIE) return; STYLE_CATEGORIE=true;
  var st=document.createElement("style");
  st.textContent=
    /* une pastille à la taille de son texte : le menu natif, invisible, est posé dessus
       (Safari sur iPhone donnait au menu la largeur de sa plus longue catégorie, coupée à droite) */
    ".f .meta{min-width:0;overflow:hidden;flex-wrap:wrap;row-gap:4px}"
    +".cat-doc{position:relative;display:inline-flex;align-items:center;flex:0 1 auto;min-width:0;max-width:140px;height:22px;"
    +"padding:0 20px 0 9px;box-sizing:border-box;border:1px solid var(--rule,#d9d4ca);border-radius:999px;"
    +"font-size:11.5px;font-weight:600;line-height:20px;color:inherit;cursor:pointer}"
    +".cat-doc>span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0;font:inherit;color:inherit}"
    +".cat-doc::after{content:\"\";position:absolute;right:8px;top:50%;width:5px;height:5px;margin-top:-4px;"
    +"border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);opacity:.75}"
    +".cat-doc>select{position:absolute;inset:0;width:100%!important;height:100%!important;min-height:0!important;margin:0!important;padding:0!important;"
    +"opacity:0;border:0!important;font-size:16px!important;cursor:pointer;-webkit-appearance:none;appearance:none}"
    +".cat-doc.off{opacity:.55}";
  document.head.appendChild(st);
}
function categorieDocument(f, bureau, apres){
  var actuelle=String(f.visite||"").trim();
  var peut = bureau || (MOI && f.auteur===MOI.nom);
  if(!peut){
    if(!actuelle) return null;
    var s=document.createElement("span"); s.className="infos"; s.textContent=actuelle; return s;
  }
  styleCategorie();
  var pastille=document.createElement("span"); pastille.className="cat-doc";
  var lib=document.createElement("span");
  var sel=document.createElement("select");
  pastille.appendChild(lib); pastille.appendChild(sel);
  sel.title="Changer la catégorie de ce document";
  sel.setAttribute("aria-label","Catégorie de "+(f.titre||"ce document"));
  var liste=CATEGORIES_TECHNIQUE.slice();
  if(actuelle && liste.indexOf(actuelle)<0) liste.unshift(actuelle);
  if(!actuelle){ var o0=document.createElement("option"); o0.value=""; o0.textContent="Catégorie…"; sel.appendChild(o0); }
  liste.forEach(function(c){ var o=document.createElement("option"); o.value=c; o.textContent=c; sel.appendChild(o); });
  sel.value=actuelle;
  function montrer(){ lib.textContent = sel.value || "Catégorie…"; pastille.classList.toggle("off", sel.disabled); }
  montrer();
  ["click","pointerdown","touchstart"].forEach(function(ev){ pastille.addEventListener(ev, function(e){ e.stopPropagation(); }); });
  sel.addEventListener("change", function(e){
    e.stopPropagation();
    var c=sel.value; if(!c || c===actuelle) return;
    sel.disabled=true; montrer();
    fetch(API+"?action=categorie-document", {method:"POST", headers:{"content-type":"application/json","x-auth":S.jeton},
      body:JSON.stringify({cle:f.cle, categorie:c})})
      .then(function(r){ return r.json().then(function(d){ return {ok:r.ok, d:d}; }); })
      .then(function(res){
        if(!res.ok){ alert(res.d.erreur || "Catégorie non changée."); sel.disabled=false; sel.value=actuelle; montrer(); return; }
        f.visite=c;
        if(apres) apres();
      })
      .catch(function(){ alert("Pas de réseau."); sel.disabled=false; sel.value=actuelle; montrer(); });
  });
  return pastille;
}

/* renommer un document : seul son nom change, dans la liste (et au téléchargement d'un document importé) ;
   le bureau seulement, et le nom tient même si le document est republié */
var STYLE_RENOMMER=false;
function boutonRenommer(f, bureau, apres){
  if(!bureau) return null;
  if(!STYLE_RENOMMER){
    STYLE_RENOMMER=true;
    var st=document.createElement("style");
    st.textContent=".ren-doc{flex:0 0 auto;width:30px;height:30px;min-width:0!important;min-height:0!important;margin:-6px 0!important;padding:0!important;"
      +"border:0!important;border-radius:8px;background:transparent!important;color:inherit;opacity:.55;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:none!important}"
      +".ren-doc:hover,.ren-doc:focus-visible{opacity:1}"
      +".ren-doc svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}";
    document.head.appendChild(st);
  }
  var b=document.createElement("button"); b.type="button"; b.className="ren-doc";
  b.title="Renommer"; b.setAttribute("aria-label","Renommer "+(f.titre||"ce document"));
  b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/></svg>';
  ["pointerdown","touchstart"].forEach(function(ev){ b.addEventListener(ev, function(e){ e.stopPropagation(); }); });
  b.addEventListener("click", function(e){
    e.preventDefault(); e.stopPropagation();
    var nv=window.prompt("Nouveau nom", f.titre||"");
    if(nv==null) return;
    nv=String(nv).replace(/\s+/g, " ").trim();
    if(!nv || nv===f.titre) return;
    b.disabled=true;
    fetch(API+"?action=renommer-document", {method:"POST", headers:{"content-type":"application/json","x-auth":S.jeton},
      body:JSON.stringify({cle:f.cle, titre:nv})})
      .then(function(r){ return r.json().then(function(d){ return {ok:r.ok, d:d}; }); })
      .then(function(res){
        b.disabled=false;
        if(!res.ok){ alert(res.d.erreur || "Nom non changé."); return; }
        f.titre=res.d.titre; delete FICHIERS_PRETS[f.cle];
        if(apres) apres();
      })
      .catch(function(){ b.disabled=false; alert("Pas de réseau."); });
  });
  return b;
}

/* le sous-dossier où range un document, s'il y en a un */
function sousDossierDe(f){
  if(f.type==="suivi") return "suivi";
  if(f.type==="commande") return "commandes";
  if(f.type==="point") return "points";
  /* les plans : les documents techniques rangés dans la nature « Plan » */
  /* une photo déposée comme document technique rejoint les photos du chantier */
  if(f.type==="technique") return /^plans?(\s|$)/i.test(String(f.visite||"").trim()) ? "plans"
    : /^photos?(\s|$)/i.test(String(f.visite||"").trim()) ? "photos" : "techniques";
  if(f.type==="photos" || f.type==="reportage") return "photos";
  if(f.type==="note") return "notes";
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
/* le code travaux + le nom du chantier, nettoy\u00e9s, pour nommer un fichier */
function refDeCle(cle){ return String(cle||"").split("/")[0]; }
function etiquetteChantier(ref){
  var e=[ref, CLIENTS[ref]||""].filter(Boolean).join(" ");
  return String(e).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[\/\\:*?"<>|]+/g," ").replace(/\s+/g," ").trim().slice(0,80);
}
/* \u00ab 2024-105 Dupont Martin - releve.pdf \u00bb : l'\u00e9tiquette du chantier devant le nom d'origine */
function nomAvecChantier(ref, base){
  var pre=etiquetteChantier(ref); base=String(base||"");
  if(!pre) return base;
  if(ref && base.toLowerCase().indexOf(String(ref).toLowerCase())===0) return base;
  return pre+" - "+base;
}
function exporterPhotos(ref, lignes, bouton){
  var docs=lignes.map(function(l){ return l.f; }).slice().sort(function(a,b){
    return String(a.date||"").localeCompare(String(b.date||"")) || String(a.publie||"").localeCompare(String(b.publie||""));
  });
  var racine=nomPropre("Photos "+etiquetteChantier(ref));
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
    var aFaire=g.aFaire ? lignes.filter(function(l){ return g.aFaire(l.f); }).length : 0;
    tete.innerHTML='<svg class="ds-ico" viewBox="0 0 24 24" aria-hidden="true">'+g.ico+'</svg>'
      +'<span class="ds-nom">'+g.nom+'</span>'
      +(neufs ? '<span class="neuf">'+neufs+' nouveau'+(neufs>1?'x':'')+'</span>' : '')
      +(aFaire ? '<span class="ds-afaire">'+aFaire+' '+g.motAFaire+'</span>' : '')
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
  if(c && c.ref) CLIENTS[c.ref]=c.client||"";
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
  /* les travaux supplémentaires encore à chiffrer, d'un coup d'œil dans la liste */
  if(c.ts>0){
    var tsb=document.createElement("span"); tsb.className="etiq-ts";
    tsb.textContent=c.ts+" TS";
    tsb.title=c.ts+(c.ts>1 ? " travaux supplémentaires à chiffrer" : " travaux supplémentaire à chiffrer");
    sous.appendChild(tsb);
  }
  if(c.accepte){
    var acc=document.createElement("span");
    acc.className="etiq-accepte";
    acc.textContent="Devis accepté";
    acc.title="Devis accepté"+(c.accepteLe ? " le "+new Date(c.accepteLe).toLocaleDateString("fr-FR") : "")+(c.acceptePar ? " par "+c.acceptePar : "");
    sous.appendChild(acc);
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
    var dwg = /\.(dwg|dxf)$/i.test(f.cle||"");
    /* la ligne n'ouvre rien : seul le bouton « Ouvrir » ouvre le document
       (un toucher au hasard en faisant défiler n'ouvre plus un PDF) ;
       à l'ordinateur, on la glisse toujours vers un dossier */
    a.style.cursor="default";
    a.style.webkitUserSelect="none"; a.style.userSelect="none"; a.style.webkitTouchCallout="none";
    glisserVersOrdinateur(a, f);
    var t=document.createElement("div"); t.className="t";
    var tl=document.createElement("div"); tl.className="tl";
    var tb=document.createElement("b"); tb.textContent=f.titre;
    tl.appendChild(tb);
    /* tout document du dossier (plan, photos, suivi, commande…) : le bureau seul le renomme */
    if(!f.brouillon){
      var bRen=boutonRenommer(f, bureau, charger);
      if(bRen) tl.appendChild(bRen);
    }
    if(pasEncoreLu(f)){
      var neuf=document.createElement("span"); neuf.className="neuf";
      neuf.textContent="Nouveau";
      tl.appendChild(neuf);
    }
    t.appendChild(tl);

    var tag=document.createElement("span");
    tag.className="tag"+(f.type==="suivi"?" suivi":(f.type==="commande"?" commande":(f.type==="photos"?" photos":(f.type==="reportage"?" reportage":(f.type==="carnet"?" carnet":(f.type==="memoire"?" memoire":(f.type==="doe"?" doe":(f.type==="autocontrole"?" autoc":(f.type==="reception"?" reception":(f.type==="etiquettes"?" etiq":(f.type==="sav"?" sav":(f.type==="technique"?" technique":(f.type==="point"?" point":(f.type==="schema"?" schema":(f.type==="note"?" note":"")))))))))))))));
    tag.textContent = f.type==="note" ? "Note"
                    : f.type==="schema" ? "Schéma"
                    : f.type==="point" ? "Le point"
                    : f.type==="technique" ? "Technique"
                    : f.type==="suivi" ? (f.visite ? "Visite "+f.visite : "Suivi")
                    : f.type==="commande" ? "Commande"
                    : f.type==="photos" ? "Photos"
                    : f.type==="reportage" ? "Photo et croquis"
                    : f.type==="autocontrole" ? "Autocontrôle"
                    : f.type==="carnet" ? "Carnet"
                    : f.type==="memoire" ? "Mémoire"
                    : f.type==="doe" ? "DOE"
                    : f.type==="reception" ? "Réception"
                    : f.type==="etiquettes" ? "Étiquettes"
                    : f.type==="sav" ? "SAV" : "Relevé";
    var meta=document.createElement("div"); meta.className="meta";
    meta.appendChild(tag);
    /* un document technique : sa catégorie (Plan, Notice…), à changer s'il a été mal rangé */
    if(f.type==="technique"){
      var cat=categorieDocument(f, bureau, charger);
      if(cat) meta.appendChild(cat);
    }
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
        return n+" le "+frDate(quand)+" à "+heureLocale(quand)
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
      /* un lot de photos s'ouvre en galerie, un plan DWG ou DXF dans l'outil Plan */
      if(zip){ marquerLu(f); ouvrirGalerie(f); return; }
      if(dwg){ marquerLu(f); location.href="./dwg.html?cle="+encodeURIComponent(f.cle); return; }
      if(PHOTO_AFFICHABLE.test(f.cle||"")){ ouvrirPhoto(f, bPartage); return; }
      ouvrirDocument(f, bPartage);
    });
    droite.appendChild(bPartage);
    /* Envoyer (ordinateur) : le partage de Windows ou du Mac, avec le fichier en pièce jointe
       (Outlook, Courrier, Teams…) — un glisser vers l'Outlook installé n'emporte pas le fichier */
    if(peutEnvoyerFichiers() && !zip){
      var bEnv=document.createElement("button"); bEnv.type="button"; bEnv.className="part env";
      bEnv.textContent="Envoyer"; bEnv.title="Envoyer en pièce jointe (Outlook, Courrier, Teams…)";
      bEnv.setAttribute("aria-label","Envoyer "+(f.titre||"ce document")+" en pièce jointe");
      bEnv.addEventListener("mouseenter", function(){ preparerGlisser(f); });
      bEnv.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); envoyerDocument(f, bEnv); });
      droite.appendChild(bEnv);
    }
    /* un plan en PDF des documents techniques : l'ouvrir dans « Plan » pour prendre des cotes */
    if(f.type==="technique" && /\.(pdf|jpe?g|png|webp)$/i.test(f.cle||"")){
      var bCote=document.createElement("a");
      bCote.className="part"; bCote.textContent="Coter";
      bCote.href="./dwg.html?cle="+encodeURIComponent(f.cle);
      bCote.title="Ouvrir ce plan dans l'outil Plan pour prendre des cotes";
      bCote.setAttribute("aria-label","Prendre des cotes sur "+(f.titre||"ce plan"));
      bCote.addEventListener("click", function(e){ e.stopPropagation(); });
      droite.appendChild(bCote);
    }
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
    /* le devis accepté, posé d'ici, sans rouvrir le relevé ; c'est définitif */
    var acc2=null;
    if(!c.accepte){
      acc2=document.createElement("button"); acc2.type="button"; acc2.className="accepte";
      acc2.textContent="Devis accepté";
      acc2.addEventListener("click", function(){
        if(!window.confirm("Passer « "+(c.client||c.ref)+" » en devis accepté ?\n\n"
          +"Le dossier devient un chantier actif. Il ne pourra plus repasser en attente de réponse.")) return;
        acc2.disabled=true; acc2.textContent="…";
        fetch(API+"?action=chantier-etat", {method:"POST",
          headers:{"content-type":"application/json", "x-auth":S.jeton},
          body:JSON.stringify({ref:c.ref, etat:"accepte"})})
          .then(function(r){ return r.json().then(function(d){ return {ok:r.ok, d:d}; }); })
          .then(function(res){
            if(!res.ok){ window.alert(res.d.erreur||"Changement refusé."); acc2.disabled=false; acc2.textContent="Devis accepté"; return; }
            charger();
          })
          .catch(function(){ window.alert("Pas de réseau."); acc2.disabled=false; acc2.textContent="Devis accepté"; });
      });
    }
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
    /* accepté : plus de retour en attente de réponse */
    if(c.accepte){
      note.textContent = "Devis accepté"+(c.accepteLe ? " le "+new Date(c.accepteLe).toLocaleDateString("fr-FR") : "")
        +(c.acceptePar ? " par "+c.acceptePar : "")+" · « Archiver » exporte en ZIP puis retire du site";
    }
    if(acc2) act.appendChild(acc2);
    if(!c.accepte) act.appendChild(att2);
    act.appendChild(arc); act.appendChild(note);
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
  quandLisible:quandLisible, frDate:frDate,
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
