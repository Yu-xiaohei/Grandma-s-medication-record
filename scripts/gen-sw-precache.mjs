import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, sep, posix } from "node:path";

const OUT = "out";
const SW_SRC = "public/sw.js";
const SW_DST = join(OUT, "sw.js");
const VERSION_FILE = join(OUT, "sw-version.json");

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function shouldCache(rel) {
  if (rel === "sw.js" || rel === "sw-version.json") return false;
  if (rel.endsWith(".map")) return false;
  if (rel.startsWith("_next/static/")) return true;
  return /\.(html|css|js|svg|png|webmanifest|woff2?)$/.test(rel);
}

const files = (await walk(OUT))
  .map((f) => posix.join(...relative(OUT, f).split(sep)))
  .filter(shouldCache);

const hash = createHash("sha256");
for (const rel of files.sort()) {
  const info = await stat(join(OUT, ...rel.split("/")));
  hash.update(rel);
  hash.update(String(info.size));
}
const version = hash.digest("hex").slice(0, 12);

const sw = (await readFile(SW_SRC, "utf8"))
  .replace("__BUILD_VERSION__", version)
  .replace("__PRECACHE_LIST__", JSON.stringify(files));

await writeFile(SW_DST, sw, "utf8");
await writeFile(VERSION_FILE, JSON.stringify({ version, files: files.length, at: new Date().toISOString() }), "utf8");

console.log(`[sw] v${version} · ${files.length} files precached`);