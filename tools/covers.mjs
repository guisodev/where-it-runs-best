// Descarga la portada de cada juego de EmuReady hacia data/covers.json.
// uso: node covers.mjs          solo los juegos que aún no tienen portada guardada
//      node covers.mjs --full   recorre todo el catálogo (~130 peticiones)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, "data");
const CFILE = path.join(DIR, "covers.json");
const BASE = "https://www.emuready.com/api/mobile/trpc/";
const UA = "where-it-runs-best (non-commercial compatibility viewer)";
const PAUSE = 2500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(proc, input){
  const url = BASE + proc + "?input=" + encodeURIComponent(JSON.stringify({json: input}));
  for (let i = 0; i < 8; i++){
    try {
      const r = await fetch(url, {headers: {"User-Agent": UA}});
      if (r.ok) return (await r.json()).result.data.json;
      if (r.status === 404) return null;
      const wait = Math.max((Number(r.headers.get("retry-after")) || 0) * 1000, 30000 * (i + 1));
      console.error(proc, r.status, "esperando", wait / 1000, "s"); await sleep(wait);
    } catch(e){ console.error(proc, e.message); await sleep(15000 * (i + 1)); }
  }
  throw new Error("Falló " + proc);
}
const entry = g => ({img: g.boxartUrl || g.imageUrl || null, nsfw: !!g.isErotic});
const covers = fs.existsSync(CFILE) ? JSON.parse(fs.readFileSync(CFILE, "utf8")) : {};
const save = () => { fs.writeFileSync(CFILE + ".tmp", JSON.stringify(covers)); fs.renameSync(CFILE + ".tmp", CFILE); };

try {
  if (process.argv.includes("--full") || !Object.keys(covers).length){
    let page = 1, pages = 1;
    while (page <= pages){
      const d = await call("games.get", {page, limit: 50});
      pages = d.pagination.pages;
      for (const g of d.games) covers[g.id] = entry(g);
      if (page % 20 === 0){ console.log(`página ${page}/${pages}`); save(); }
      page++; await sleep(PAUSE);
    }
  } else {
    const listings = JSON.parse(fs.readFileSync(path.join(DIR, "listings.json"), "utf8"));
    const missing = [...new Set(listings.map(l => l.g))].filter(id => id && !(id in covers));
    console.log("portadas pendientes:", missing.length);
    for (const id of missing.slice(0, 300)){
      const g = await call("games.byId", {id});
      covers[id] = g ? entry(g) : {img: null, nsfw: false};
      await sleep(PAUSE);
    }
  }
} catch(e){ console.error(e.message); }
finally { save(); console.log("portadas:", Object.keys(covers).length); }
