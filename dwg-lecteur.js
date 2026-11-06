/* =====================================================================
   dwg-lecteur.js — le lecteur DWG (LibreDWG, en WebAssembly), à part
   ---------------------------------------------------------------------
   Lire un gros DWG prend plusieurs secondes : fait ici, dans un « worker »,
   la page du module Plan reste vivante (elle affiche l'avancement, on peut
   continuer à cliquer). Reçoit {buf, type: "dwg"|"dxf"}, renvoie {ok, db}
   (les entités, telles que les rend LibreDwg.convert) ou {ok:false, err}.
   ===================================================================== */
import { LibreDwg, Dwg_File_Type } from "./vendor/libredwg-web-0.7.14/dist/libredwg-web.js";

let lib = null;
self.onmessage = async (e) => {
  const d = e.data || {};
  try {
    if (!lib) { self.postMessage({ etape: "chargement" }); lib = await LibreDwg.create(); }
    self.postMessage({ etape: "lecture" });
    const brut = lib.dwg_read_data(d.buf, d.type === "dxf" ? Dwg_File_Type.DXF : Dwg_File_Type.DWG);
    if (brut == null) throw new Error("illisible");
    self.postMessage({ etape: "conversion" });
    const db = lib.convert(brut);
    try { lib.dwg_free(brut); } catch (er) { /* déjà libéré */ }
    self.postMessage({ ok: true, db });
  } catch (er) {
    self.postMessage({ ok: false, err: String((er && er.message) || er) });
  }
};
