/* =====================================================================
   doc-cote.js — un document à côté de la fiche
   ---------------------------------------------------------------------
   Pendant un relevé (ou un suivi), revoir un rapport, un plan, une
   notice, une photo — du même chantier ou d'un autre — sans quitter la
   fiche :
   - l'onglet « Document », sur le bord droit de l'écran, ouvre le choix :
     les chantiers (celui en cours en tête, puis les autres, une
     recherche) et leurs documents (PDF et photos) — ou le Cloud, ses
     dossiers et ses fichiers ;
   - le document s'ouvre dans un panneau qui glisse de la droite. Un
     glissé du doigt vers la droite (ou « ‹ Relevé ») le range : il reste
     chargé, son onglet sur le bord ; un glissé depuis le bord (ou un
     toucher sur l'onglet) le ramène. On passe ainsi de l'un à l'autre ;
   - sur une tablette en paysage ou un ordinateur, les deux côte à côte ;
   - − et + pour zoomer ; « Changer » pour un autre document.
   Le dernier document ouvert est retenu le temps de la visite.

   DocCote.installer({libelle:"Relevé", ref:function(){ return "2026-041"; }})
   DocCote.choisir({ok:function(f){ … f.blob, f.nom, f.mime … }})
     le même panneau, pour prendre des fichiers (tous formats) du Cloud ou
     d'un dossier : chaque toucher en ajoute un, « Terminé » referme.
   ===================================================================== */
(function(){
  "use strict";
  if(window.DocCote) return;

  var OPT={libelle:"Fiche", ref:function(){ return ""; }};
  var EL={}, ETAT={ouvert:false, doc:null, zoom:1, chargeId:0}, LISTE=null, CLE_DERNIER="doccote:dernier";
  /* en mode « choisir » (une pièce jointe) : {ok, tous} ; sinon null */
  var PICK=null;

  function session(){ try{ var s=JSON.parse(localStorage.getItem("outils:session")||"null"); return s && s.jeton ? s : null; }catch(e){ return null; } }
  function api(action){ return "/api/rapports?action="+action; }
  function el(tag, cls, txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
  function frDate(d){ var a=String(d||"").slice(0,10).split("-"); return a.length===3 ? a[2]+"/"+a[1]+"/"+a[0] : ""; }
  function sans(t){ return String(t||"").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  var LISIBLE=/\.(pdf|jpe?g|png|webp)$/i;

  /* ---------- le style ---------- */
  function style(){
    var st=document.createElement("style"); st.setAttribute("data-theme-propre","");
    st.textContent=
      ".dc-onglet{position:fixed;right:0;top:46%;z-index:8990;display:flex;flex-direction:column;align-items:center;gap:6px;width:34px;padding:12px 0;"
      +"border:0;border-radius:14px 0 0 14px;background:linear-gradient(160deg,#2563EB,#06B6D4);color:#fff;box-shadow:-4px 6px 18px -6px rgba(11,18,32,.55);"
      +"cursor:pointer;font:700 11px/1 inherit;font-family:inherit;touch-action:none;-webkit-tap-highlight-color:transparent}"
      +".dc-onglet svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}"
      +".dc-onglet span{writing-mode:vertical-rl;transform:rotate(180deg);letter-spacing:.04em;max-height:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
      +".dc-onglet.charge{background:linear-gradient(160deg,#0B1220,#1E3A8A)}"
      +".dc-onglet.charge::before{content:'';position:absolute;left:6px;top:6px;width:7px;height:7px;border-radius:50%;background:#22D3EE}"
      +"html.dc-ouvert .dc-onglet{opacity:0;pointer-events:none}"
      +".dc-pan{position:fixed;top:0;bottom:0;right:0;width:100vw;z-index:9000;display:flex;flex-direction:column;background:#0F1626;color:#E2E8F0;"
      +"transform:translateX(102%);transition:transform .32s cubic-bezier(.2,.85,.3,1);box-shadow:-18px 0 40px -20px rgba(0,0,0,.7);"
      +"font-family:inherit;padding-top:env(safe-area-inset-top,0px)}"
      +"html.dc-ouvert .dc-pan{transform:none}"
      +".dc-pan.tire{transition:none}"
      +".dc-tete{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:8px 8px 8px 10px;background:linear-gradient(160deg,#0B1220,#172554 62%,#1E3A8A);"
      +"border-bottom:1px solid rgba(255,255,255,.08);touch-action:pan-y}"
      +".dc-b{flex:0 0 auto;min-height:36px;min-width:36px;padding:0 11px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgba(255,255,255,.08);"
      +"color:#fff;font:600 13px/1 inherit;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px}"
      +".dc-b.rond{padding:0;width:36px}"
      +".dc-t{flex:1;min-width:0}"
      +".dc-t b{display:block;font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff}"
      +".dc-t span{display:block;font-size:11.5px;color:#9FB0CC;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
      +".dc-corps{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;padding:10px 8px calc(env(safe-area-inset-bottom,0px) + 18px)}"
      +".dc-pages{display:flex;flex-direction:column;align-items:center;gap:10px;margin:0 auto}"
      +".dc-pages canvas,.dc-pages img{display:block;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.45);border-radius:2px}"
      +".dc-etat{color:#9FB0CC;font-size:14px;text-align:center;margin:30px 12px}"
      /* le choix : chantiers puis documents */
      +".dc-choix{display:flex;flex-direction:column;gap:8px;max-width:640px;margin:0 auto}"
      +".dc-choix .dc-choix{width:100%}"
      +".dc-cherche{width:100%;box-sizing:border-box;height:42px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;"
      +"padding:0 14px;font:inherit;font-size:15px;outline:none}"
      +".dc-cherche::placeholder{color:#8C9BB6}"
      +".dc-src{display:flex;gap:4px;padding:4px;border-radius:12px;background:rgba(255,255,255,.06)}"
      +".dc-src button{flex:1;min-height:38px;border:0;border-radius:9px;background:transparent;color:#9FB0CC;font:700 14px/1 inherit;font-family:inherit;cursor:pointer}"
      +".dc-src button.on{background:linear-gradient(160deg,#2563EB,#06B6D4);color:#fff}"
      +".dc-l .ic.dos{background:rgba(125,211,252,.16);color:#7DD3FC;align-items:center;padding-bottom:0}"
      +".dc-l .ic.dos svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round}"
      +".dc-sect{font-size:11px;font-weight:700;letter-spacing:.12em;color:#7DD3FC;margin:10px 4px 2px;text-transform:uppercase}"
      +".dc-l{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:11px 12px;border:1px solid rgba(148,180,255,.10);border-radius:12px;"
      +"background:rgba(255,255,255,.045);color:#E2E8F0;font:inherit;cursor:pointer}"
      +".dc-l:active{background:rgba(255,255,255,.10)}"
      +".dc-l .ic{flex:0 0 auto;width:32px;height:38px;border-radius:6px;background:linear-gradient(160deg,#2563EB,#06B6D4);color:#fff;font-size:9px;font-weight:800;"
      +"display:flex;align-items:flex-end;justify-content:center;padding-bottom:5px;box-sizing:border-box}"
      +".dc-l .tx{flex:1;min-width:0}"
      +".dc-l .tx b{display:block;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
      +".dc-l .tx small{display:block;font-size:12px;color:#9FB0CC;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
      +".dc-l .ici{flex:0 0 auto;font-size:10.5px;font-weight:800;color:#0B1220;background:#22D3EE;border-radius:999px;padding:3px 8px}"
      /* tablette en paysage, ordinateur : côte à côte */
      +"@media (min-width:1000px){.dc-pan{width:min(48vw,760px)}html.dc-ouvert body{margin-right:min(48vw,760px);transition:margin-right .32s}"
      /* la barre d'onglets du bas reste dans la moitié de la fiche */
      +"html.dc-ouvert nav#nav{right:min(48vw,760px)}}";
    (document.head||document.documentElement).appendChild(st);
  }

  /* ---------- le panneau ---------- */
  function construire(){
    style();
    var o=el("button","dc-onglet"); o.type="button";
    o.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg><span>Document</span>';
    o.setAttribute("aria-label","Ouvrir un document à côté de la fiche");
    var p=el("div","dc-pan"); p.setAttribute("role","dialog"); p.setAttribute("aria-label","Document à côté");
    var t=el("div","dc-tete");
    var bR=el("button","dc-b","‹ "+OPT.libelle); bR.type="button"; bR.title="Revenir à la fiche (le document reste ouvert)";
    var ti=el("div","dc-t"); var tb=el("b","","Document"); var ts=el("span","","Choisissez un document"); ti.appendChild(tb); ti.appendChild(ts);
    var bM=el("button","dc-b rond","−"); bM.type="button"; bM.setAttribute("aria-label","Dézoomer");
    var bP=el("button","dc-b rond","+"); bP.type="button"; bP.setAttribute("aria-label","Zoomer");
    var bC=el("button","dc-b","Changer"); bC.type="button";
    var bX=el("button","dc-b rond","×"); bX.type="button"; bX.setAttribute("aria-label","Fermer le document"); bX.style.fontSize="20px";
    [bR, ti, bM, bP, bC, bX].forEach(function(x){ t.appendChild(x); });
    var c=el("div","dc-corps");
    p.appendChild(t); p.appendChild(c);
    document.body.appendChild(o); document.body.appendChild(p);
    EL={onglet:o, pan:p, tete:t, corps:c, titre:tb, sous:ts, zm:bM, zp:bP, retour:bR, chg:bC};

    o.addEventListener("click", function(){ if(o.__glisse) return; montrer(); });
    bR.addEventListener("click", cacher);
    bC.addEventListener("click", choisir);
    bX.addEventListener("click", function(){ if(PICK) cacher(); else fermer(); });
    bM.addEventListener("click", function(){ zoomer(ETAT.zoom/1.25); });
    bP.addEventListener("click", function(){ zoomer(ETAT.zoom*1.25); });
    gestes();
  }

  function montrer(){
    document.documentElement.classList.add("dc-ouvert");
    ETAT.ouvert=true;
    if(!ETAT.doc && !EL.corps.firstChild) choisir();
  }
  function cacher(){
    document.documentElement.classList.remove("dc-ouvert"); ETAT.ouvert=false;
    if(!PICK) return;
    /* fin du choix : le panneau redevient celui du document (rouvert, rangé) */
    var fin=PICK.fin; PICK=null;
    EL.retour.textContent="‹ "+OPT.libelle; EL.zm.style.display=EL.zp.style.display="";
    if(ETAT.doc){ ouvrirDoc(ETAT.doc); document.documentElement.classList.remove("dc-ouvert"); ETAT.ouvert=false; }
    else { EL.corps.textContent=""; EL.titre.textContent="Document"; EL.sous.textContent="Choisissez un document"; }
    if(fin) try{ fin(); }catch(e){}
  }
  /* un document du dossier ou du Cloud, touché : affiché, ou (mode choisir) récupéré et donné */
  function prendre(d, bouton){
    if(!PICK){ ouvrirDoc(d); return; }
    var s=session(); if(!s) return;
    var p=PICK, adr = d.cloud ? api("cloud-fichier")+"&id="+encodeURIComponent(d.cloud) : api("fichier")+"&cle="+encodeURIComponent(d.cle);
    if(bouton){ bouton.disabled=true; bouton.style.opacity=".6"; }
    EL.sous.textContent="Récupération de « "+d.titre+" »…";
    fetch(adr, {headers:{"x-auth":s.jeton}})
      .then(function(r){ if(!r.ok) throw new Error("fichier"); return r.blob(); })
      .then(function(blob){ return Promise.resolve(p.ok({blob:blob, nom:d.fichier||d.titre, mime:blob.type||""})); })
      .then(function(){
        EL.sous.textContent="Ajouté : « "+d.titre+" ». Touchez-en d'autres, ou Terminé.";
        if(bouton){ bouton.style.opacity="1"; var x=bouton.querySelector(".ici"); if(!x){ x=el("span","ici","AJOUTÉ"); bouton.appendChild(x); } }
      })
      .catch(function(){ EL.sous.textContent="Fichier indisponible : vérifiez la connexion."; if(bouton){ bouton.disabled=false; bouton.style.opacity="1"; } });
  }
  function fermer(){
    cacher(); ETAT.doc=null; ETAT.chargeId++;
    EL.corps.textContent=""; EL.titre.textContent="Document"; EL.sous.textContent="Choisissez un document";
    EL.onglet.classList.remove("charge"); EL.onglet.querySelector("span").textContent="Document";
    try{ sessionStorage.removeItem(CLE_DERNIER); }catch(e){}
  }

  /* ---------- les gestes : glisser vers la droite range, depuis le bord ramène ---------- */
  function gestes(){
    var g=null;
    function debut(x, y, depuisOnglet){ g={x:x, y:y, dx:0, decide:false, horiz:false, onglet:depuisOnglet}; }
    function bouge(x, y, e){
      if(!g) return;
      var dx=x-g.x, dy=y-g.y;
      if(!g.decide){ if(Math.abs(dx)<10 && Math.abs(dy)<10) return; g.decide=true; g.horiz=Math.abs(dx)>Math.abs(dy)*1.3; if(g.horiz) EL.pan.classList.add("tire"); }
      if(!g.horiz) return;
      if(e && e.cancelable) e.preventDefault();
      var w=EL.pan.offsetWidth;
      if(g.onglet){ g.dx=Math.min(0, dx); EL.pan.style.transform="translateX("+Math.max(0, w+g.dx)+"px)"; EL.onglet.__glisse=true; }
      else { g.dx=Math.max(0, dx); EL.pan.style.transform="translateX("+g.dx+"px)"; }
    }
    function fin(){
      if(!g) return;
      var gg=g; g=null;
      EL.pan.classList.remove("tire"); EL.pan.style.transform="";
      if(!gg.horiz) return;
      var w=EL.pan.offsetWidth;
      if(gg.onglet){ if(-gg.dx>Math.min(90, w*.25)) montrer(); setTimeout(function(){ EL.onglet.__glisse=false; }, 50); }
      else if(gg.dx>Math.min(90, w*.25)) cacher();
    }
    /* le panneau : on le tire vers la droite par sa barre, ou par le document quand il n'est pas zoomé */
    function surPanneau(e){ var t=e.touches ? e.touches[0] : e; return t; }
    EL.tete.addEventListener("touchstart", function(e){ var t=surPanneau(e); debut(t.clientX, t.clientY, false); }, {passive:true});
    EL.corps.addEventListener("touchstart", function(e){ if(ETAT.zoom>1.05 || (e.touches && e.touches.length>1)) return; var t=surPanneau(e); debut(t.clientX, t.clientY, false); }, {passive:true});
    EL.onglet.addEventListener("touchstart", function(e){ var t=surPanneau(e); debut(t.clientX, t.clientY, true); }, {passive:true});
    document.addEventListener("touchmove", function(e){ if(!g) return; if(e.touches.length>1){ g=null; EL.pan.classList.remove("tire"); EL.pan.style.transform=""; return; } var t=e.touches[0]; bouge(t.clientX, t.clientY, e); }, {passive:false});
    document.addEventListener("touchend", fin, {passive:true});
    document.addEventListener("touchcancel", fin, {passive:true});
    /* depuis le bord droit de l'écran, quand un document est chargé et rangé */
    document.addEventListener("touchstart", function(e){
      if(ETAT.ouvert || !ETAT.doc || g) return;
      var t=e.touches[0]; if(t.clientX > window.innerWidth-18) debut(t.clientX, t.clientY, true);
    }, {passive:true});
    /* à la souris : la barre se tire aussi */
    EL.tete.addEventListener("mousedown", function(e){ if(e.target.closest("button")) return; debut(e.clientX, e.clientY, false);
      function mm(ev){ bouge(ev.clientX, ev.clientY, ev); } function mu(){ document.removeEventListener("mousemove", mm); document.removeEventListener("mouseup", mu); fin(); }
      document.addEventListener("mousemove", mm); document.addEventListener("mouseup", mu); });
    document.addEventListener("keydown", function(e){ if(e.key==="Escape" && ETAT.ouvert) cacher(); });
  }

  /* ---------- le choix : un chantier, puis un de ses documents ---------- */
  function chargerListe(){
    if(LISTE) return Promise.resolve(LISTE);
    var s=session(); if(!s) return Promise.reject(new Error("session"));
    return fetch(api("liste"), {headers:{"x-auth":s.jeton}})
      .then(function(r){ if(!r.ok) throw new Error("liste"); return r.json(); })
      .then(function(d){ LISTE=(d.chantiers||[]).filter(function(c){ return (c.fichiers||[]).length; }); return LISTE; });
  }
  function documentsDe(c){
    return (c.fichiers||[]).filter(function(f){ return !f.brouillon && (PICK && PICK.tous || LISIBLE.test(f.cle||"")); })
      .sort(function(a, b){ return String(b.publie||b.date||"").localeCompare(String(a.publie||a.date||"")); });
  }
  var SOURCE="chantiers";
  /* en tête du choix : Chantiers ou Cloud */
  function sources(box, active){
    var b=el("div","dc-src");
    [["chantiers","Chantiers"],["cloud","Cloud"]].forEach(function(x){
      var t=el("button", x[0]===active ? "on" : "", x[1]); t.type="button";
      t.addEventListener("click", function(){ if(x[0]===active) return; SOURCE=x[0]; if(x[0]==="cloud") choisirCloud(""); else choisirChantier(); });
      b.appendChild(t);
    });
    box.appendChild(b);
  }
  function choisir(){ if(SOURCE==="cloud") choisirCloud(""); else choisirChantier(); }
  function choisirChantier(){
    SOURCE="chantiers";
    var c=EL.corps; c.textContent="";
    EL.titre.textContent=PICK ? PICK.titre : "Ouvrir un document"; EL.sous.textContent="Le chantier, puis le document";
    var box=el("div","dc-choix"); c.appendChild(box);
    sources(box, "chantiers");
    var q=el("input","dc-cherche"); q.type="search"; q.placeholder="Chercher un chantier (client, référence, ville)"; q.setAttribute("aria-label","Chercher un chantier");
    box.appendChild(q);
    var liste=el("div","dc-choix"); box.appendChild(liste);
    liste.appendChild(el("p","dc-etat","Chargement des chantiers…"));
    chargerListe().then(function(l){
      var ici=String(OPT.ref()||"").toUpperCase();
      function peindre(){
        liste.textContent="";
        var f=sans(q.value), vus=l.filter(function(ch){ return !f || sans([ch.client, ch.ref, ch.adresse].join(" ")).indexOf(f)>=0; });
        var a=vus.filter(function(ch){ return ici && String(ch.ref).toUpperCase()===ici; }), b=vus.filter(function(ch){ return a.indexOf(ch)<0; });
        if(a.length){ liste.appendChild(el("p","dc-sect","Ce chantier")); a.forEach(function(ch){ liste.appendChild(ligneChantier(ch, true)); }); }
        if(b.length){ liste.appendChild(el("p","dc-sect", a.length ? "Les autres chantiers" : "Les chantiers")); b.forEach(function(ch){ liste.appendChild(ligneChantier(ch, false)); }); }
        if(!vus.length) liste.appendChild(el("p","dc-etat","Aucun chantier avec des documents à afficher."));
      }
      q.addEventListener("input", peindre); peindre();
    }).catch(function(){ liste.textContent=""; liste.appendChild(el("p","dc-etat","Liste indisponible : vérifiez la connexion.")); });
  }
  function ligneChantier(ch, ici){
    var b=el("button","dc-l"); b.type="button";
    var ic=el("span","ic"); ic.textContent=String(documentsDe(ch).length); ic.style.alignItems="center"; ic.style.paddingBottom="0"; ic.style.fontSize="12px";
    var tx=el("span","tx"); tx.appendChild(el("b","",ch.client || ch.ref)); tx.appendChild(el("small","",[ch.ref, String(ch.adresse||"").replace(/\n/g, ", ")].filter(Boolean).join(" · ")));
    b.appendChild(ic); b.appendChild(tx);
    if(ici) b.appendChild(el("span","ici","ICI"));
    b.addEventListener("click", function(){ choisirDocument(ch); });
    return b;
  }
  function choisirDocument(ch){
    var c=EL.corps; c.textContent="";
    EL.titre.textContent=ch.client || ch.ref; EL.sous.textContent="Choisissez un document";
    var box=el("div","dc-choix"); c.appendChild(box);
    var ret=el("button","dc-l","‹  Les chantiers"); ret.type="button"; ret.style.justifyContent="flex-start"; ret.style.fontWeight="700";
    ret.addEventListener("click", choisirChantier); box.appendChild(ret);
    documentsDe(ch).forEach(function(f){
      var b=el("button","dc-l"); b.type="button";
      var ext=String(f.cle).split(".").pop().toUpperCase().replace("JPEG","JPG");
      b.appendChild(el("span","ic",ext));
      var tx=el("span","tx"); tx.appendChild(el("b","",f.titre || String(f.cle).split("/").pop()));
      tx.appendChild(el("small","",[frDate(f.date), f.auteur, f.etape].filter(Boolean).join(" · ")));
      b.appendChild(tx);
      b.addEventListener("click", function(){ var ext=String(f.cle).split(".").pop(); prendre({cle:f.cle, titre:f.titre || String(f.cle).split("/").pop(), fichier:(f.titre || "document").replace(/[\\/:*?"<>|]+/g, " ").trim()+"."+ext, chantier:ch.client || ch.ref}, b); });
      box.appendChild(b);
    });
  }

  /* ---------- le Cloud : ses dossiers, puis un fichier ---------- */
  var LISIBLE_MIME=/^(application\/pdf|image\/(jpeg|png|webp|gif))/;
  function icoDossier(){ var i=el("span","ic dos"); i.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h6l2 2.2h9v10.3H3.5z"/></svg>'; return i; }
  function choisirCloud(dossier){
    SOURCE="cloud";
    var c=EL.corps; c.textContent="";
    EL.titre.textContent=PICK ? PICK.titre : "Ouvrir un document"; EL.sous.textContent="Le Cloud : un dossier, puis le fichier";
    var box=el("div","dc-choix"); c.appendChild(box);
    sources(box, "cloud");
    var liste=el("div","dc-choix"); box.appendChild(liste);
    liste.appendChild(el("p","dc-etat","Chargement du Cloud…"));
    var s=session(); if(!s) return;
    fetch(api("cloud-liste")+(dossier ? "&dossier="+encodeURIComponent(dossier) : ""), {headers:{"x-auth":s.jeton}})
      .then(function(r){ if(!r.ok) throw new Error("cloud"); return r.json(); })
      .then(function(d){
        liste.textContent="";
        var chemin=d.chemin||[];
        if(dossier){
          var parent=chemin.length>1 ? chemin[chemin.length-2].id : "";
          var ret=el("button","dc-l","‹  "+(chemin.length>1 ? chemin[chemin.length-2].nom : "Le Cloud")); ret.type="button"; ret.style.fontWeight="700";
          ret.addEventListener("click", function(){ choisirCloud(parent); }); liste.appendChild(ret);
          EL.sous.textContent=chemin.map(function(x){ return x.nom; }).join(" › ");
        }
        var els=(d.elements||[]).slice().sort(function(a, b){
          if((a.type==="dossier")!==(b.type==="dossier")) return a.type==="dossier" ? -1 : 1;
          return a.type==="dossier" ? String(a.nom).localeCompare(String(b.nom)) : String(b.maj||"").localeCompare(String(a.maj||""));
        });
        var dos=els.filter(function(e){ return e.type==="dossier"; }), fic=els.filter(function(e){ return e.type==="fichier" && (PICK && PICK.tous || LISIBLE_MIME.test(e.mime||"")); });
        dos.forEach(function(e){
          var b=el("button","dc-l"); b.type="button"; b.appendChild(icoDossier());
          var tx=el("span","tx"); tx.appendChild(el("b","",e.nom)); tx.appendChild(el("small","", (e.nb||0)+" élément"+((e.nb||0)>1?"s":"")+(e.acces==="partage" ? " · partagé par "+e.proprio : ""))); b.appendChild(tx);
          b.addEventListener("click", function(){ choisirCloud(e.id); }); liste.appendChild(b);
        });
        fic.forEach(function(e){
          var b=el("button","dc-l"); b.type="button";
          b.appendChild(el("span","ic", /pdf/.test(e.mime) ? "PDF" : String(e.nom).split(".").pop().toUpperCase().replace("JPEG","JPG").slice(0,4)));
          var tx=el("span","tx"); tx.appendChild(el("b","",e.nom)); tx.appendChild(el("small","", [frDate(e.maj||e.cree), e.par].filter(Boolean).join(" · "))); b.appendChild(tx);
          b.addEventListener("click", function(){ prendre({cloud:e.id, pdf:/pdf/.test(e.mime), titre:e.nom, fichier:e.nom, chantier:"Cloud"+(chemin.length ? " › "+chemin[chemin.length-1].nom : "")}, b); });
          liste.appendChild(b);
        });
        if(!dos.length && !fic.length) liste.appendChild(el("p","dc-etat", dossier ? "Rien à afficher dans ce dossier (PDF et photos seulement)." : "Votre Cloud est vide."));
      })
      .catch(function(){ liste.textContent=""; liste.appendChild(el("p","dc-etat","Cloud indisponible : vérifiez la connexion.")); });
  }

  /* ---------- le document : les pages du PDF, ou la photo ---------- */
  function ouvrirDoc(d){
    var s=session(); if(!s) return;
    ETAT.doc=d; ETAT.zoom=1; var id=++ETAT.chargeId;
    try{ sessionStorage.setItem(CLE_DERNIER, JSON.stringify(d)); }catch(e){}
    EL.titre.textContent=d.titre; EL.sous.textContent=d.chantier;
    EL.onglet.classList.add("charge"); EL.onglet.querySelector("span").textContent=String(d.titre).slice(0, 28);
    var c=EL.corps; c.textContent="";
    var pages=el("div","dc-pages"); c.appendChild(pages);
    var etat=el("p","dc-etat","Ouverture du document…"); pages.appendChild(etat);
    montrer();
    var adr = d.cloud ? api("cloud-fichier")+"&id="+encodeURIComponent(d.cloud) : api("fichier")+"&cle="+encodeURIComponent(d.cle);
    fetch(adr, {headers:{"x-auth":s.jeton}})
      .then(function(r){ if(!r.ok) throw new Error("fichier"); return r.blob(); })
      .then(function(blob){
        if(id!==ETAT.chargeId) return;
        if(d.cloud ? (d.pdf || /pdf/.test(blob.type)) : /\.pdf$/i.test(d.cle)) return pdf(blob, pages, etat, id);
        var url=URL.createObjectURL(blob), im=new Image(); im.alt=d.titre; im.src=url;
        pages.removeChild(etat); pages.appendChild(im); appliquerZoom();
      })
      .catch(function(){ if(id===ETAT.chargeId) etat.textContent="Document indisponible : vérifiez la connexion."; });
  }
  function largeurUtile(){ return Math.max(200, EL.corps.clientWidth-16); }
  function pdf(blob, pages, etat, id){
    var lib = window.Visionneuse && Visionneuse.pdfjs ? Visionneuse.pdfjs() : Promise.reject(new Error("pdfjs"));
    return lib.then(function(pdfjs){
      return blob.arrayBuffer().then(function(buf){ return pdfjs.getDocument({data:new Uint8Array(buf)}).promise; });
    }).then(function(doc){
      if(id!==ETAT.chargeId){ doc.destroy(); return; }
      pages.removeChild(etat);
      var larg=largeurUtile(), dpr=Math.min(2.5, window.devicePixelRatio||1);
      /* les pages se dessinent à mesure qu'on les approche (un long rapport reste léger) */
      var vues=[], obs=("IntersectionObserver" in window) ? new IntersectionObserver(function(es){
        es.forEach(function(e){ if(e.isIntersecting){ dessiner(e.target); obs.unobserve(e.target); } });
      }, {root:EL.corps, rootMargin:"600px 0px"}) : null;
      function dessiner(cv){
        if(cv.__fait || id!==ETAT.chargeId) return; cv.__fait=true;
        doc.getPage(cv.__n).then(function(page){
          var v1=page.getViewport({scale:1}), k=larg*1.6*dpr/v1.width, v=page.getViewport({scale:k});
          cv.width=Math.floor(v.width); cv.height=Math.floor(v.height);
          return page.render({canvasContext:cv.getContext("2d"), viewport:v}).promise;
        }).catch(function(){});
      }
      var n=0;
      (function suivante(){
        if(id!==ETAT.chargeId || ++n>doc.numPages) return;
        doc.getPage(n).then(function(page){
          var v1=page.getViewport({scale:1}), cv=document.createElement("canvas");
          cv.__n=n; cv.__ratio=v1.height/v1.width; cv.width=10; cv.height=Math.round(10*cv.__ratio);
          cv.setAttribute("aria-label", "Page "+n);
          pages.appendChild(cv); vues.push(cv); appliquerZoom();
          if(obs) obs.observe(cv); else dessiner(cv);
          suivante();
        });
      })();
    }).catch(function(){
      /* pas de lecteur : le PDF tel quel */
      if(id!==ETAT.chargeId) return;
      pages.textContent="";
      var f=document.createElement("iframe"); f.src=URL.createObjectURL(blob); f.title=ETAT.doc ? ETAT.doc.titre : "Document";
      f.style.cssText="width:100%;height:80vh;border:0;background:#fff";
      pages.appendChild(f);
    });
  }
  function zoomer(z){ ETAT.zoom=Math.max(1, Math.min(4, z)); appliquerZoom(); }
  function appliquerZoom(){
    var w=Math.round(largeurUtile()*ETAT.zoom), pages=EL.corps.querySelector(".dc-pages"); if(!pages) return;
    pages.style.width=w+"px";
    Array.prototype.forEach.call(pages.querySelectorAll("canvas"), function(cv){ cv.style.width=w+"px"; cv.style.height=Math.round(w*(cv.__ratio||1.414))+"px"; });
    Array.prototype.forEach.call(pages.querySelectorAll("img"), function(im){ im.style.width=w+"px"; im.style.height="auto"; });
    EL.zm.disabled = ETAT.zoom<=1; EL.zm.style.opacity = ETAT.zoom<=1 ? .4 : 1;
  }
  window.addEventListener("resize", function(){ if(ETAT.doc) appliquerZoom(); });

  window.DocCote={
    installer:function(o){
      if(EL.pan) return;
      for(var k in o) OPT[k]=o[k];
      if(!session()) return;
      construire();
      /* le document de tout à l'heure, retrouvé (rangé, prêt à revenir) */
      var d=null; try{ d=JSON.parse(sessionStorage.getItem(CLE_DERNIER)||"null"); }catch(e){}
      if(d && (d.cle || d.cloud)){ ouvrirDoc(d); cacher(); }
    },
    montrer:montrer, cacher:cacher, fermer:fermer,
    /* prendre des fichiers du Cloud ou d'un dossier (une pièce jointe) */
    choisir:function(o){
      if(!EL.pan) return false;
      PICK={ok:(o && o.ok) || function(){}, tous:!o || o.tous!==false, fin:o && o.fin, titre:(o && o.titre) || "Ajouter un document"};
      EL.retour.textContent="Terminé"; EL.zm.style.display=EL.zp.style.display="none";
      document.documentElement.classList.add("dc-ouvert"); ETAT.ouvert=true;
      choisir();
      return true;
    }
  };
})();
