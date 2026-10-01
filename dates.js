/* =====================================================================
   dates.js — les dates et les heures à l'heure du téléphone
   ---------------------------------------------------------------------
   Le site garde chaque moment (publication, lecture, message, saisie)
   en heure universelle : « 2026-10-01T06:20:00.000Z ». Couper cette
   chaîne pour l'afficher donnait l'heure universelle — deux heures de
   moins l'été, une l'hiver — et, entre minuit et deux heures, la date
   de la veille. De même, « aujourd'hui » pris dans cette chaîne était
   la veille passé minuit. Ici, tout repasse par l'heure locale.

   jourLocal(d)      « AAAA-MM-JJ » du jour d (aujourd'hui sans d), à l'heure locale
   dateLocale(x)     la date locale d'un moment ; une date seule (AAAA-MM-JJ) reste telle quelle
   heureLocale(x)    « HH:MM » locale d'un moment
   Chargé tout en haut de chaque page, avant ses propres scripts.
   ===================================================================== */
(function(){
  function deux(n){ return String(n).padStart(2, "0"); }
  function jourLocal(d){
    d = d instanceof Date ? d : (d != null ? new Date(d) : new Date());
    if(isNaN(d)) d = new Date();
    return d.getFullYear()+"-"+deux(d.getMonth()+1)+"-"+deux(d.getDate());
  }
  /* un moment complet : une date suivie d'une heure (« T » ou espace) */
  function estMoment(x){ return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(String(x||"")); }
  function enDate(x){
    var s=String(x);
    /* « AAAA-MM-JJ HH:MM » sans fuseau : déjà une heure locale */
    if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) && !/Z|[+-]\d{2}:?\d{2}$/.test(s)) s=s.replace(" ", "T");
    return new Date(s);
  }
  function dateLocale(x){
    if(!x) return "";
    if(!estMoment(x)) return String(x).slice(0, 10);
    var d=enDate(x); return isNaN(d) ? String(x).slice(0, 10) : jourLocal(d);
  }
  function heureLocale(x){
    if(!x || !estMoment(x)) return "";
    var d=enDate(x); if(isNaN(d)) return String(x).slice(11, 16);
    return deux(d.getHours())+":"+deux(d.getMinutes());
  }
  window.jourLocal=jourLocal; window.dateLocale=dateLocale; window.heureLocale=heureLocale;
})();
