/* =====================================================================
   pieces-jointes.js — joindre un e-mail, un PDF, une photo à une fiche
   ---------------------------------------------------------------------
   Un client écrit : on saisit le relevé, et l'e-mail (avec ses pièces
   jointes) part avec lui dans le dossier du chantier, avant même que le
   relevé soit publié.
   - « Joindre un fichier » : PDF, photo, plan, Word, Excel…, ou un e-mail
     enregistré (.eml, ou .msg glissé depuis Outlook) ;
   - « Coller un e-mail » : on colle le texte (et, si on veut, l'expéditeur,
     l'objet) ;
   - sur l'ordinateur, on glisse les fichiers (ou l'e-mail depuis Outlook)
     sur le bloc, ou on les colle (Ctrl+V).
   Un e-mail (.eml, .msg) est ouvert ici : son texte devient une pièce
   « e-mail », ses pièces jointes des pièces à part. À la publication de
   la fiche, chaque pièce est déposée dans le dossier, sous « Documents
   techniques » (nature « Pièce jointe ») ; un e-mail y devient un PDF.

   PiecesJointes.installer({hote, liste:fn, enregistrer:fn, toast:fn})
   PiecesJointes.peindre()
   PiecesJointes.deposer({ref, client, adresse, date, origine, url:fn, entetes:fn, etat:fn}) → Promise({faits, echecs})
   PiecesJointes.emails()  les e-mails joints (pour le PDF de la fiche)
   ===================================================================== */
(function(){
  "use strict";
  if(window.PiecesJointes) return;

  var O={}, MAX_UN=20*1024*1024, MAX_TOUT=60*1024*1024;
  var MIMES={pdf:"application/pdf", jpg:"image/jpeg", jpeg:"image/jpeg", png:"image/png", webp:"image/webp", gif:"image/gif", heic:"image/heic",
    txt:"text/plain", csv:"text/csv", doc:"application/msword", docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls:"application/vnd.ms-excel", xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt:"application/vnd.ms-powerpoint", pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odt:"application/vnd.oasis.opendocument.text", ods:"application/vnd.oasis.opendocument.spreadsheet", dwg:"application/acad", dxf:"application/dxf"};
  /* ce que le dossier accepte (serveur : documents techniques) */
  var DEPOSABLES=/^(pdf|jpe?g|png|webp|dwg|dxf|docx?|xlsx?|pptx?|odt|ods|txt|csv)$/;

  function liste(){ var l=O.liste ? O.liste() : null; return Array.isArray(l) ? l : []; }
  function dire(t){ if(O.toast) O.toast(t); }
  function el(tag, cls, txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
  function nid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2, 7); }
  function extDe(nom){ var m=/\.([a-z0-9]{1,5})$/i.exec(nom||""); return m ? m[1].toLowerCase() : ""; }
  function sansExt(nom){ return String(nom||"").replace(/\.[a-z0-9]{1,5}$/i, ""); }
  function taille(n){ return n>=1048576 ? (n/1048576).toFixed(1).replace(".", ",")+" Mo" : Math.max(1, Math.round(n/1024))+" Ko"; }
  function poidsTotal(){ return liste().reduce(function(s, j){ return s+(j.taille||0); }, 0); }
  function lireDataUrl(blob){ return new Promise(function(ok, ko){ var r=new FileReader(); r.onload=function(){ ok(r.result); }; r.onerror=ko; r.readAsDataURL(blob); }); }
  function lireOctets(blob){ return new Promise(function(ok, ko){ var r=new FileReader(); r.onload=function(){ ok(new Uint8Array(r.result)); }; r.onerror=ko; r.readAsArrayBuffer(blob); }); }
  function octetsVersDataUrl(o, mime){ return lireDataUrl(new Blob([o], {type:mime||"application/octet-stream"})); }
  function dataUrlVersBlob(u){
    var p=String(u).split(","), mime=(/^data:([^;,]+)/.exec(p[0])||[])[1]||"application/octet-stream", b=atob(p[1]||""), o=new Uint8Array(b.length);
    for(var i=0;i<b.length;i++) o[i]=b.charCodeAt(i);
    return new Blob([o], {type:mime});
  }

  /* ---------- ajouter ---------- */
  function ajouterPiece(j){
    if((j.taille||0) > MAX_UN){ dire("« "+j.fichier+" » est trop lourd : 20 Mo au plus par pièce."); return false; }
    if(poidsTotal()+(j.taille||0) > MAX_TOUT){ dire("Trop de pièces jointes sur cette fiche (60 Mo au plus) : publiez-la, puis joignez la suite."); return false; }
    j.id=j.id||nid(); j.le=j.le||new Date().toISOString();
    liste().push(j);
    return true;
  }
  function ajouterFichiers(fichiers){
    var l=Array.prototype.slice.call(fichiers||[]).filter(function(f){ return f && f.size!=null; });
    if(!l.length) return Promise.resolve(0);
    var n=0;
    return l.reduce(function(pr, f){
      return pr.then(function(){
        var ext=extDe(f.name);
        if(ext==="eml") return lireOctets(f).then(function(o){ n+=ajouterEmail(lireEml(o), f.name); });
        if(ext==="msg") return lireOctets(f).then(function(o){ var m=lireMsg(o); if(!m) throw new Error("msg"); n+=ajouterEmail(m, f.name); })
          .catch(function(){ dire("« "+f.name+" » n'a pas pu être ouvert."); });
        return lireDataUrl(f).then(function(u){
          var mime=f.type||MIMES[ext]||"application/octet-stream";
          if(ajouterPiece({genre:"fichier", nom:sansExt(f.name)||"Document", fichier:f.name||"document", ext:ext, mime:mime, taille:f.size, contenu:u})) n++;
        });
      });
    }, Promise.resolve()).then(function(){
      if(n){ O.enregistrer && O.enregistrer(); peindre(); dire(n>1 ? n+" pièces jointes ajoutées." : "Pièce jointe ajoutée."); }
      return n;
    }).catch(function(){ dire("Lecture du fichier impossible."); peindre(); return n; });
  }
  /* un e-mail lu (.eml, .msg) : son texte, puis ses pièces jointes, chacune à part */
  function ajouterEmail(m, nomFichier){
    var n=0, texte=String(m.texte||"").trim();
    if(ajouterPiece({genre:"email", nom:m.objet ? "E-mail — "+m.objet : "E-mail", fichier:nomFichier||"", ext:"pdf",
      taille:texte.length, email:{de:m.de||"", a:m.a||"", date:m.date||"", objet:m.objet||"", texte:texte}})) n++;
    var attente=(m.pieces||[]).map(function(p){
      var ext=extDe(p.nom);
      return octetsVersDataUrl(p.octets, p.mime||MIMES[ext]).then(function(u){
        if(ajouterPiece({genre:"fichier", nom:sansExt(p.nom)||"Pièce jointe", fichier:p.nom||"piece", ext:ext, mime:p.mime||MIMES[ext]||"application/octet-stream",
          taille:p.octets.length, contenu:u, deEmail:m.objet||""})) n++;
      });
    });
    /* les pièces de l'e-mail arrivent un instant après : on repeint à la fin */
    Promise.all(attente).then(function(){ O.enregistrer && O.enregistrer(); peindre(); });
    return n + (m.pieces||[]).length;
  }

  /* ---------- lire un .eml (le format texte des e-mails) ---------- */
  function decoderTexte(o, charset){
    var cs=String(charset||"utf-8").toLowerCase().replace(/^"|"$/g, "");
    try{ return new TextDecoder(cs).decode(o); }catch(e){ try{ return new TextDecoder("windows-1252").decode(o); }catch(er){ return ""; } }
  }
  function octetsDe(txt){ var o=new Uint8Array(txt.length); for(var i=0;i<txt.length;i++) o[i]=txt.charCodeAt(i)&255; return o; }
  function b64Octets(t){ try{ return octetsDe(atob(String(t).replace(/[^A-Za-z0-9+/=]/g, ""))); }catch(e){ return new Uint8Array(0); } }
  function qpOctets(t){
    t=String(t).replace(/=\r?\n/g, "");
    var out=[];
    for(var i=0;i<t.length;i++){
      if(t[i]==="=" && /^[0-9A-F]{2}$/i.test(t.substr(i+1, 2))){ out.push(parseInt(t.substr(i+1, 2), 16)); i+=2; }
      else out.push(t.charCodeAt(i)&255);
    }
    return new Uint8Array(out);
  }
  /* =?utf-8?B?…?= et =?iso-8859-1?Q?…?= dans les en-têtes */
  function motsEncodes(v){
    return String(v||"").replace(/\?=\s+=\?/g, "?==?").replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, function(_, cs, enc, t){
      var o = enc.toUpperCase()==="B" ? b64Octets(t) : qpOctets(t.replace(/_/g, " "));
      return decoderTexte(o, cs);
    });
  }
  function entetes(brut){
    var h={}, lignes=brut.replace(/\r\n/g, "\n").replace(/\n[ \t]+/g, " ").split("\n");
    lignes.forEach(function(l){ var i=l.indexOf(":"); if(i>0){ var k=l.slice(0, i).trim().toLowerCase(); if(!(k in h)) h[k]=l.slice(i+1).trim(); } });
    return h;
  }
  function parametre(v, nom){ var m=new RegExp(nom+'\\*?=\\s*"?([^";]+)"?', "i").exec(v||""); return m ? motsEncodes(decodeURIComponent(m[1].replace(/^[a-z0-9-]+''/i, "").replace(/%(?![0-9a-f]{2})/gi, "%25"))) : ""; }
  function htmlEnTexte(h){
    var d=document.createElement("div");
    d.innerHTML=String(h).replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n");
    return (d.textContent||"").replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function partie(brut, sortie){
    var i=brut.search(/\r?\n\r?\n/), tete=i<0 ? brut : brut.slice(0, i), corps=i<0 ? "" : brut.slice(i).replace(/^\r?\n\r?\n/, "");
    var h=entetes(tete), type=(h["content-type"]||"text/plain").toLowerCase(), enc=(h["content-transfer-encoding"]||"").toLowerCase();
    if(/^multipart\//.test(type)){
      var b=parametre(h["content-type"], "boundary"); if(!b) return h;
      corps.split("--"+b).slice(1).forEach(function(p){ if(/^--/.test(p)) return; partie(p.replace(/^\r?\n/, ""), sortie); });
      return h;
    }
    var o = enc==="base64" ? b64Octets(corps) : enc==="quoted-printable" ? qpOctets(corps) : octetsDe(corps);
    var nom=parametre(h["content-disposition"], "filename") || parametre(h["content-type"], "name");
    if(nom || /attachment/i.test(h["content-disposition"]||"")){
      sortie.pieces.push({nom:nom||"piece-jointe", mime:type.split(";")[0], octets:o});
    } else if(/^text\/plain/.test(type) && !sortie.texte){
      sortie.texte=decoderTexte(o, parametre(h["content-type"], "charset"));
    } else if(/^text\/html/.test(type) && !sortie.html){
      sortie.html=decoderTexte(o, parametre(h["content-type"], "charset"));
    } else if(/^message\/rfc822/.test(type)){
      sortie.pieces.push({nom:"message-joint.eml", mime:"message/rfc822", octets:o});
    }
    return h;
  }
  function lireEml(o){
    var brut=""; for(var i=0;i<o.length;i++) brut+=String.fromCharCode(o[i]);
    var s={texte:"", html:"", pieces:[]};
    var h=partie(brut, s);
    return {de:motsEncodes(h.from), a:motsEncodes(h.to), date:dateLisible(h.date), objet:motsEncodes(h.subject),
      texte:s.texte || (s.html ? htmlEnTexte(s.html) : ""), pieces:s.pieces.filter(function(p){ return p.octets.length; })};
  }
  function dateLisible(v){
    var d=v instanceof Date ? v : new Date(v||"");
    if(isNaN(d)) return String(v||"");
    return d.toLocaleDateString("fr-FR", {weekday:"long", day:"numeric", month:"long", year:"numeric"})+" à "+d.toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});
  }

  /* ---------- lire un .msg (l'e-mail glissé depuis Outlook) ----------
     Un fichier « composé » (CFB) : des secteurs, une table d'allocation,
     un répertoire. On n'y prend que l'objet, l'expéditeur, le
     destinataire, la date, le texte et les pièces jointes. */
  function lireMsg(o){
    var dv=new DataView(o.buffer, o.byteOffset, o.byteLength);
    if(o.length<512 || dv.getUint32(0, true)!==0xE011CFD0 || dv.getUint32(4, true)!==0xE11AB1A1) return null;
    var tS=1<<dv.getUint16(0x1E, true), tM=1<<dv.getUint16(0x20, true), coupure=dv.getUint32(0x38, true);
    function u32(p){ return dv.getUint32(p, true); }
    function off(s){ return (s+1)*tS; }
    var secteursFat=[];
    for(var i=0;i<109;i++){ var s=u32(0x4C+i*4); if(s<0xFFFFFFFA) secteursFat.push(s); }
    var dif=u32(0x44), garde=0;
    while(dif<0xFFFFFFFA && garde++<1000 && off(dif)+tS<=o.length){
      for(var k=0;k<tS/4-1;k++){ var s2=u32(off(dif)+k*4); if(s2<0xFFFFFFFA) secteursFat.push(s2); }
      dif=u32(off(dif)+tS-4);
    }
    var fat=[];
    secteursFat.forEach(function(s){ for(var k=0;k<tS/4;k++) fat.push(u32(off(s)+k*4)); });
    function chaine(depart, table){ var c=[], s=depart, g=0; while(s<0xFFFFFFFA && g++<200000){ c.push(s); s=table[s]; if(s===undefined) break; } return c; }
    function lireChaine(depart){
      var c=chaine(depart, fat), out=new Uint8Array(c.length*tS);
      c.forEach(function(s, k){ var a=off(s); if(a+tS<=o.length) out.set(o.subarray(a, a+tS), k*tS); });
      return out;
    }
    var rep=lireChaine(u32(0x30)), entrees=[];
    for(var p=0;p+128<=rep.length;p+=128){
      var dvr=new DataView(rep.buffer, p, 128), lg=dvr.getUint16(0x40, true), nom="";
      for(var c=0;c<Math.max(0, lg/2-1);c++) nom+=String.fromCharCode(dvr.getUint16(c*2, true));
      entrees.push({nom:nom, type:rep[p+0x42], g:dvr.getUint32(0x44, true), d:dvr.getUint32(0x48, true), enfant:dvr.getUint32(0x4C, true),
        depart:dvr.getUint32(0x74, true), taille:dvr.getUint32(0x78, true)});
    }
    if(!entrees.length) return null;
    var mini=lireChaine(entrees[0].depart), miniFat=[];
    if(u32(0x3C)<0xFFFFFFFA){ var mf=lireChaine(u32(0x3C)), dm=new DataView(mf.buffer, mf.byteOffset, mf.byteLength); for(var q=0;q+4<=mf.length;q+=4) miniFat.push(dm.getUint32(q, true)); }
    function flux(e){
      if(e.taille<coupure){
        var c=chaine(e.depart, miniFat), out=new Uint8Array(c.length*tM);
        c.forEach(function(s, k){ out.set(mini.subarray(s*tM, s*tM+tM), k*tM); });
        return out.subarray(0, e.taille);
      }
      return lireChaine(e.depart).subarray(0, e.taille);
    }
    function enfants(e){
      var out=[], vus={};
      (function marche(i){ if(i>=0xFFFFFFFA || vus[i] || !entrees[i]) return; vus[i]=1; var x=entrees[i]; marche(x.g); out.push(x); marche(x.d); })(e.enfant);
      return out;
    }
    function texteDe(liste, id){
      var u=liste.filter(function(e){ return e.nom==="__substg1.0_"+id+"001F"; })[0];
      if(u) return decoderTexte(flux(u), "utf-16le").replace(/\u0000+$/, "");
      var a=liste.filter(function(e){ return e.nom==="__substg1.0_"+id+"001E"; })[0];
      if(a) return decoderTexte(flux(a), "windows-1252").replace(/\u0000+$/, "");
      return "";
    }
    function binaireDe(liste, id){ var b=liste.filter(function(e){ return e.nom==="__substg1.0_"+id+"0102"; })[0]; return b ? flux(b) : null; }
    var racine=enfants(entrees[0]);
    /* la date : dans les propriétés (heure d'envoi 0x0039, ou de réception 0x0E06) */
    var date="", props=racine.filter(function(e){ return e.nom==="__properties_version1.0"; })[0];
    if(props){
      var pr=flux(props), dp=new DataView(pr.buffer, pr.byteOffset, pr.byteLength);
      for(var z=32; z+16<=pr.length; z+=16){
        var tag=dp.getUint32(z, true);
        if(tag===0x00390040 || tag===0x0E060040){
          var ft=dp.getUint32(z+8, true)+dp.getUint32(z+12, true)*4294967296;
          var d=new Date(ft/10000-11644473600000); if(!isNaN(d)){ date=dateLisible(d); if(tag===0x00390040) break; }
        }
      }
    }
    var corps=texteDe(racine, "1000");
    if(!corps){ var h=binaireDe(racine, "1013"); if(h) corps=htmlEnTexte(decoderTexte(h, "utf-8")); }
    var nomDe=texteDe(racine, "0C1A"), mailDe=texteDe(racine, "5D01") || texteDe(racine, "0C1F");
    var pieces=[];
    racine.filter(function(e){ return /^__attach_version1\.0_#/.test(e.nom); }).forEach(function(a){
      var l=enfants(a), data=binaireDe(l, "3701");
      if(!data || !data.length) return;
      pieces.push({nom:texteDe(l, "3707") || texteDe(l, "3704") || texteDe(l, "3001") || "piece-jointe", mime:texteDe(l, "370E"), octets:data});
    });
    return {objet:texteDe(racine, "0037"), de:[nomDe, mailDe && mailDe.indexOf("@")>0 && mailDe!==nomDe ? "<"+mailDe+">" : ""].filter(Boolean).join(" "),
      a:texteDe(racine, "0E04"), date:date, texte:corps, pieces:pieces};
  }

  /* ---------- un e-mail en PDF, pour le dossier ---------- */
  function propre(t){
    return String(t||"").replace(/\r/g, "").replace(/[\u2028\u2029]/g, "\n").replace(/\t/g, "    ")
      .replace(/[^\x0A\x20-\x7E\xA0-\xFF–—‘’“”•…€Œœ]/g, "");
  }
  function emailEnPdf(j){
    var m=j.email||{}, doc=new window.jspdf.jsPDF({unit:"mm", format:"a4"}), M=16, PW=210, PH=297, L=PW-2*M, y=0;
    function bandeau(){
      doc.setFillColor(11,18,32); doc.rect(0, 0, PW, 24, "F");
      doc.setFillColor(37,99,235); doc.rect(0, 24, PW, 1.2, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(125,211,252);
      doc.text("E-MAIL JOINT AU DOSSIER", M, 10);
      doc.setFontSize(13); doc.setTextColor(255,255,255);
      doc.text(doc.splitTextToSize(propre(m.objet||"(sans objet)"), L)[0], M, 18);
      y=34;
    }
    bandeau();
    [["De", m.de], ["À", m.a], ["Date", m.date], ["Objet", m.objet]].forEach(function(r){
      if(!String(r[1]||"").trim()) return;
      doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(93,98,109); doc.text(r[0], M, y);
      doc.setFont("helvetica","normal"); doc.setTextColor(28,30,34);
      var l=doc.splitTextToSize(propre(r[1]), L-22); doc.text(l, M+22, y); y+=l.length*4.6+1.4;
    });
    doc.setDrawColor(207,213,225); doc.setLineWidth(0.3); doc.line(M, y, PW-M, y); y+=7;
    doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(28,30,34);
    doc.splitTextToSize(propre(m.texte||""), L).forEach(function(l){
      if(y>PH-16){ doc.addPage(); bandeau(); doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(28,30,34); }
      doc.text(l, M, y); y+=4.9;
    });
    var n=doc.getNumberOfPages();
    for(var p=1;p<=n;p++){ doc.setPage(p); doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(140,148,160); doc.text("Page "+p+" / "+n, PW-M, PH-8, {align:"right"}); }
    return doc.output("datauristring");
  }

  /* ---------- à l'écran ---------- */
  function style(){
    if(document.getElementById("pj-style")) return;
    var st=document.createElement("style"); st.id="pj-style";
    st.textContent=
      ".pj-zone{border:2px dashed var(--rule,#CFD5E1);border-radius:14px;padding:12px;transition:border-color .15s,background .15s}"
      +".pj-zone.survol{border-color:var(--accent,#2563EB);background:var(--accent-soft,#EAF1FF)}"
      +".pj-zone .pj-aide{font-size:12.5px;color:var(--ink-3,#767D8B);margin:2px 0 0;text-align:center}"
      +".pj-l{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--rule,#CFD5E1)}"
      +".pj-l:last-child{border-bottom:0}"
      +".pj-ic{flex:0 0 auto;width:34px;height:40px;border-radius:7px;background:linear-gradient(160deg,#2563EB,#06B6D4);color:#fff;font-size:9px;font-weight:800;"
      +"display:flex;align-items:flex-end;justify-content:center;padding-bottom:5px;box-sizing:border-box;letter-spacing:.02em}"
      +".pj-ic.mail{background:linear-gradient(160deg,#0B1220,#1E3A8A);align-items:center;padding:0}"
      +".pj-ic.mail svg{width:20px;height:20px;fill:none;stroke:#7DD3FC;stroke-width:1.8;stroke-linejoin:round}"
      +".pj-tx{flex:1;min-width:0;cursor:pointer}"
      +".pj-tx b{display:block;font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
      +".pj-tx small{display:block;font-size:12px;color:var(--ink-3,#767D8B);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
      +".pj-x{flex:0 0 auto;width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:var(--ink-3,#767D8B);font-size:21px;cursor:pointer}"
      +".pj-depose{font-size:10.5px;font-weight:800;color:#16A34A;margin-left:6px}"
      +".pj-fond{position:fixed;inset:0;z-index:9500;background:rgba(11,18,32,.6);display:flex;align-items:flex-end;justify-content:center}"
      +".pj-feuille{background:var(--card,#fff);color:var(--ink,#1C1E22);width:100%;max-width:640px;max-height:88vh;overflow:auto;border-radius:18px 18px 0 0;"
      +"padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px));box-sizing:border-box}"
      +".pj-feuille h3{margin:0 0 10px;font-size:18px}"
      +".pj-feuille label{display:block;font-size:12.5px;color:var(--ink-3,#767D8B);margin:8px 0 4px}"
      +".pj-feuille input,.pj-feuille textarea{width:100%;box-sizing:border-box}"
      +".pj-feuille textarea{min-height:200px}"
      +".pj-feuille .pj-bas{display:flex;gap:8px;margin-top:14px}.pj-feuille .pj-bas button{flex:1}"
      +".pj-texte{white-space:pre-wrap;font-size:14px;line-height:1.5;margin:10px 0 0}"
      +".pj-entete{font-size:13px;line-height:1.55;color:var(--ink-3,#767D8B)}.pj-entete b{color:var(--ink,#1C1E22)}"
      +".pj-feuille img{display:block;max-width:100%;border-radius:10px;margin-top:8px}";
    document.head.appendChild(st);
  }
  var ICO_MAIL='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/></svg>';
  function peindre(){
    var h=O.hote; if(!h) return;
    var zone=h.querySelector(".pj-liste"); if(!zone) return;
    zone.textContent="";
    var l=liste();
    l.forEach(function(j, i){
      var r=el("div","pj-l");
      var ic=el("span","pj-ic"+(j.genre==="email" ? " mail" : ""));
      if(j.genre==="email") ic.innerHTML=ICO_MAIL; else ic.textContent=(j.ext||"?").toUpperCase().replace("JPEG","JPG").slice(0, 4);
      var tx=el("div","pj-tx"); var b=el("b","",j.nom);
      if(j.depose) b.appendChild(el("span","pj-depose","DÉPOSÉE"));
      tx.appendChild(b);
      tx.appendChild(el("small","", j.genre==="email"
        ? [j.email && j.email.de, j.email && j.email.date].filter(Boolean).join(" · ") || "Texte de l'e-mail"
        : [j.fichier, taille(j.taille||0), j.deEmail ? "de l'e-mail « "+j.deEmail+" »" : ""].filter(Boolean).join(" · ")));
      tx.title="Voir";
      tx.addEventListener("click", function(){ voir(j); });
      var x=el("button","pj-x","×"); x.type="button"; x.setAttribute("aria-label","Retirer "+j.nom);
      x.addEventListener("click", function(){
        if(!window.confirm("Retirer « "+j.nom+" » des pièces jointes ?")) return;
        var L=liste(), k=L.indexOf(j); if(k>=0) L.splice(k, 1);
        O.enregistrer && O.enregistrer(); peindre();
      });
      r.appendChild(ic); r.appendChild(tx); r.appendChild(x); zone.appendChild(r);
    });
    var c=h.querySelector(".pj-compte"); if(c) c.textContent = l.length ? l.length+" pièce"+(l.length>1?"s":"")+" · "+taille(poidsTotal()) : "";
  }
  function feuille(titre){
    var fond=el("div","pj-fond"), f=el("div","pj-feuille");
    f.appendChild(el("h3","",titre)); fond.appendChild(f);
    function fermer(){ if(fond.parentNode) fond.parentNode.removeChild(fond); }
    fond.addEventListener("click", function(e){ if(e.target===fond) fermer(); });
    document.body.appendChild(fond);
    return {f:f, fermer:fermer};
  }
  function voir(j){
    if(j.genre==="email"){
      var m=j.email||{}, s=feuille(m.objet||"E-mail");
      var e=el("div","pj-entete");
      [["De", m.de], ["À", m.a], ["Date", m.date]].forEach(function(r){ if(r[1]){ var p=el("div"); p.appendChild(el("b","",r[0]+" : ")); p.appendChild(document.createTextNode(r[1])); e.appendChild(p); } });
      s.f.appendChild(e); s.f.appendChild(el("div","pj-texte", m.texte||""));
      var bas=el("div","pj-bas"), ok=el("button","act","Fermer"); ok.type="button"; ok.addEventListener("click", s.fermer); bas.appendChild(ok); s.f.appendChild(bas);
      return;
    }
    var blob=dataUrlVersBlob(j.contenu);
    if(j.ext==="pdf" && window.Visionneuse && Visionneuse.pdf){ Visionneuse.pdf(blob, j.fichier||j.nom+".pdf"); return; }
    if(/^image\//.test(j.mime||"")){
      var s2=feuille(j.nom), im=new Image(); im.src=j.contenu; im.alt=j.nom; s2.f.appendChild(im);
      var b2=el("div","pj-bas"), ok2=el("button","act","Fermer"); ok2.type="button"; ok2.addEventListener("click", s2.fermer); b2.appendChild(ok2); s2.f.appendChild(b2);
      return;
    }
    var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=j.fichier||j.nom; a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
  }
  function collerEmail(){
    var s=feuille("Coller un e-mail");
    s.f.appendChild(el("p","pj-aide","Dans l'e-mail : tout sélectionner, copier, puis coller ici. L'expéditeur et l'objet sont facultatifs."));
    function champ(lib, tag){ var l=el("label","",lib), c=document.createElement(tag||"input"); if(!tag) c.type="text"; s.f.appendChild(l); s.f.appendChild(c); return c; }
    var de=champ("Expéditeur"), ob=champ("Objet"), tx=champ("Texte de l'e-mail", "textarea");
    var bas=el("div","pj-bas"), an=el("button","act ghost","Annuler"), ok=el("button","act blue","Joindre");
    an.type=ok.type="button"; an.addEventListener("click", s.fermer);
    ok.addEventListener("click", function(){
      var t=tx.value.trim(); if(!t){ tx.focus(); dire("Collez le texte de l'e-mail."); return; }
      /* collé en entier (De : … Objet : …), on reprend l'en-tête s'il est là */
      var m={de:de.value.trim(), objet:ob.value.trim(), a:"", date:"", texte:t};
      var d2=/^(?:De|From)\s*:\s*(.+)$/im.exec(t), o2=/^(?:Objet|Subject)\s*:\s*(.+)$/im.exec(t), dt=/^(?:Date|Envoyé|Sent)\s*:\s*(.+)$/im.exec(t), a2=/^(?:À|A|To)\s*:\s*(.+)$/im.exec(t);
      if(!m.de && d2) m.de=d2[1].trim(); if(!m.objet && o2) m.objet=o2[1].trim(); if(dt) m.date=dt[1].trim(); if(a2) m.a=a2[1].trim();
      if(!m.date) m.date=dateLisible(new Date())+" (collé)";
      ajouterEmail(m, ""); O.enregistrer && O.enregistrer(); peindre(); s.fermer(); dire("E-mail joint.");
    });
    bas.appendChild(an); bas.appendChild(ok); s.f.appendChild(bas);
    setTimeout(function(){ tx.focus(); }, 50);
  }
  function construire(h){
    style();
    h.innerHTML="";
    var zone=el("div","pj-zone");
    var rang=el("div","row");
    var bF=el("button","act blue","Joindre un fichier"); bF.type="button";
    var bM=el("button","act ghost","Coller un e-mail"); bM.type="button";
    rang.appendChild(bF); rang.appendChild(bM);
    var cpt=el("span","pj-compte"); cpt.style.cssText="margin-left:auto;font-size:12.5px;color:var(--ink-3,#767D8B)"; rang.appendChild(cpt);
    zone.appendChild(rang);
    var lst=el("div","pj-liste"); zone.appendChild(lst);
    zone.appendChild(el("p","pj-aide","PDF, photo, plan, Word, Excel, ou un e-mail (.eml, .msg). Sur l'ordinateur : glissez-les ici, ou collez-les (Ctrl+V)."));
    var inp=document.createElement("input"); inp.type="file"; inp.multiple=true; inp.hidden=true;
    inp.accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.dwg,.dxf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv,.eml,.msg,image/*,application/pdf,message/rfc822";
    zone.appendChild(inp);
    h.appendChild(zone);
    bF.addEventListener("click", function(){ inp.value=""; inp.click(); });
    inp.addEventListener("change", function(){ ajouterFichiers(inp.files); });
    bM.addEventListener("click", collerEmail);
    /* glisser-déposer, sur le bloc */
    ["dragenter","dragover"].forEach(function(t){ zone.addEventListener(t, function(e){ if(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types||[], "Files")>=0){ e.preventDefault(); zone.classList.add("survol"); } }); });
    ["dragleave","drop"].forEach(function(t){ zone.addEventListener(t, function(){ zone.classList.remove("survol"); }); });
    zone.addEventListener("drop", function(e){ if(!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); ajouterFichiers(e.dataTransfer.files); });
    /* coller des fichiers (Ctrl+V), hors d'un champ de saisie */
    document.addEventListener("paste", function(e){
      var t=e.target, champ=t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName||""));
      var fs=e.clipboardData && e.clipboardData.files;
      if(champ || !fs || !fs.length || h.offsetParent===null) return;
      e.preventDefault(); ajouterFichiers(fs);
    });
    peindre();
  }

  /* ---------- déposer dans le dossier, à la publication de la fiche ---------- */
  function deposer(o){
    var l=liste().filter(function(j){ return !j.depose; });
    if(!l.length) return Promise.resolve({faits:0, echecs:0});
    var faits=0, echecs=0, derniere="";
    return l.reduce(function(pr, j, k){
      return pr.then(function(){
        if(o.etat) o.etat("Dépôt des pièces jointes ("+(k+1)+" sur "+l.length+")…");
        var ext=j.genre==="email" ? "pdf" : (j.ext==="jpeg" ? "jpg" : j.ext);
        if(!DEPOSABLES.test(ext||"")){ echecs++; derniere="format ."+(ext||"?")+" non accepté par le dossier"; return; }
        var u;
        try{ u = j.genre==="email" ? emailEnPdf(j) : j.contenu; }catch(e){ echecs++; derniere="PDF de l'e-mail impossible"; return; }
        var corps={pdf:String(u).split(",")[1]||"", ext:ext, chantier:o.ref, client:o.client||"", adresse:o.adresse||"",
          type:"technique", date:o.date, titre:String(j.nom||"Pièce jointe").slice(0, 120), visite:"Pièce jointe",
          etape:["Pièce jointe", o.origine].filter(Boolean).join(" · "), auteur:o.auteur||"", destinataires:[], dossier:true};
        return fetch(o.url("publier"), {method:"POST", headers:o.entetes(), body:JSON.stringify(corps)})
          .then(function(r){ return r.json().then(function(d){ return {ok:r.ok, d:d}; }, function(){ return {ok:r.ok, d:{}}; }); })
          .then(function(res){ if(res.ok){ j.depose=true; faits++; } else { echecs++; derniere=res.d.erreur||"refusée"; } })
          .catch(function(){ echecs++; derniere="pas de réseau"; });
      });
    }, Promise.resolve()).then(function(){ O.enregistrer && O.enregistrer(); peindre(); return {faits:faits, echecs:echecs, erreur:derniere}; });
  }

  window.PiecesJointes={
    installer:function(o){ O=o||{}; if(O.hote) construire(O.hote); },
    peindre:peindre,
    deposer:deposer,
    emails:function(){ return liste().filter(function(j){ return j.genre==="email"; }).map(function(j){ return j.email||{}; }); },
    lireEml:lireEml, lireMsg:lireMsg
  };
})();
