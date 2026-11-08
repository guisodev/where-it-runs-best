// Descarga el detalle de cada reporte de EmuReady (FPS promedio y configuración usada).
// El listado de la API no los incluye, así que se piden de uno en uno, despacio.
// Cada ejecución procesa como mucho MAX reportes (los más nuevos primero) y guarda el progreso,
// de modo que el relleno inicial se reparte en varios días.
// uso: node details.mjs [--max 1500]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, "data");
const argMax = process.argv.indexOf("--max");
const MAX = Number(argMax > 0 ? process.argv[argMax + 1] : process.env.DETAILS_MAX || 1500);
const BASE = "https://www.emuready.com/api/mobile/trpc/";
const UA = "where-it-runs-best (non-commercial compatibility viewer)";
const PAUSE = 2500;
const SKIP = /youtube|screenshot|blog post|game version|average fps/i;   // campos que no son ajustes
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function byId(id){
  const url = BASE + "listings.byId?input=" + encodeURIComponent(JSON.stringify({json: {id}}));
  for (let i = 0; i < 8; i++){
    try {
      const r = await fetch(url, {headers: {"User-Agent": UA}});
      if (r.ok) return (await r.json()).result.data.json;
      if (r.status === 404) return null;
      const wait = Math.max((Number(r.headers.get("retry-after")) || 0) * 1000, 30000 * (i + 1));
      console.error("byId", r.status, "esperando", wait / 1000, "s"); await sleep(wait);
    } catch(e){ console.error("byId", e.message); await sleep(15000 * (i + 1)); }
  }
  throw new Error("EmuReady no responde; se guarda el progreso y se sigue mañana");
}

// "29-30fps" → 29.5, "30 to 40" → 35, "60" → 60, "N/A" → null
function parseFps(v){
  const nums = String(v ?? "").replace(",", ".").match(/\d+(\.\d+)?/g);
  if (!nums) return null;
  const a = nums.slice(0, 2).map(Number).filter(n => n > 0 && n <= 240);
  if (!a.length) return null;
  return Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10;
}
function cfgValue(c){
  const d = c.customFieldDefinition, v = c.value;
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "true" : "false";
  const opt = Array.isArray(d.options) && d.options.find(o => String(o.value) === String(v));
  if (opt && opt.label) return String(opt.label).trim();
  return String(v).split("|||")[0].trim() + (d.type === "RANGE" && d.rangeUnit ? " " + d.rangeUnit : "");
}

const LFILE = path.join(DIR, "listings.json"), DFILE = path.join(DIR, "details.json");
const listings = JSON.parse(fs.readFileSync(LFILE, "utf8"));
const details = fs.existsSync(DFILE) ? JSON.parse(fs.readFileSync(DFILE, "utf8")) : {};
const live = new Set(listings.map(l => l.id));
for (const id of Object.keys(details)) if (!live.has(id)) delete details[id];   // reportes borrados
const save = () => { fs.writeFileSync(DFILE + ".tmp", JSON.stringify(details)); fs.renameSync(DFILE + ".tmp", DFILE); };

const todo = listings.filter(l => !details[l.id]).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
console.log(`detalles: ${Object.keys(details).length} hechos, ${todo.length} pendientes; esta vez hasta ${MAX}`);
let done = 0;
try {
  for (const l of todo.slice(0, MAX)){
    const j = await byId(l.id);
    if (j){
      const cf = j.customFieldValues || [];
      const fpsField = cf.find(c => /average fps/i.test(c.customFieldDefinition?.label || ""));
      const cfg = {};
      for (const c of cf){
        const label = c.customFieldDefinition?.label;
        if (!label || SKIP.test(label)) continue;
        const v = cfgValue(c);
        if (v !== null) cfg[label] = v;
      }
      details[l.id] = {fps: parseFps(fpsField?.value), cfg};
    } else details[l.id] = {fps: null, cfg: {}};
    done++;
    if (done % 100 === 0){ save(); console.log(`  ${done} nuevos detalles`); }
    await sleep(PAUSE);
  }
} catch(e){
  console.error(e.message);   // no se considera fallo: lo pendiente se retoma en la próxima ejecución
} finally {
  save();
  console.log(`detalles: +${done}, total ${Object.keys(details).length} de ${listings.length}`);
}
