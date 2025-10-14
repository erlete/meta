import http from "node:http";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readdir, readFile } from "node:fs/promises";

const BASE_URL = "http://localhost:8080";
const BASE_PATH = "/versions"; // URL prefix
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = normalize(join(__dirname, "../versions"));
const MIME = {
  ".json": "application/schema+json",
  ".map": "application/json",
  "default": "application/octet-stream"
};

const log = (o) => console.log(JSON.stringify(o));

const printInventory = async (rootDir) => {
  const now = new Date().toISOString();
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

  let totalVersions = 0;
  console.log(`[startup] ${now} Serving "${rootDir}" at ${BASE_URL}${BASE_PATH}`);

  for (const name of dirs) {
    const dirPath = join(rootDir, name);
    const files = await readdir(dirPath, { withFileTypes: true }).catch(() => []);
    const versionFiles = files
      .filter(f => f.isFile() && f.name.endsWith(".json") && f.name !== "current.json")
      .map(f => f.name.replace(/\.json$/, ""));

    versionFiles.sort((a, b) => {
      const pa = a.split(".").map(n => parseInt(n, 10));
      const pb = b.split(".").map(n => parseInt(n, 10));
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const da = pa[i] ?? 0, db = pb[i] ?? 0;
        if (da !== db) return db - da;
      }
      return 0;
    });

    totalVersions += versionFiles.length;

    let current = null;
    try {
      const cj = JSON.parse(await readFile(join(dirPath, "current.json"), "utf8"));
      if (typeof cj.$ref === "string") current = cj.$ref.replace(/^.\//, "").replace(/\.json$/, "");
    } catch {}

    const encName = encodeURIComponent(name);
    const urls = versionFiles.map(v => `${BASE_URL}${BASE_PATH}/${encName}/${v}.json`);
    const currentUrl = `${BASE_URL}${BASE_PATH}/${encName}/current.json`;

    console.log(`[startup] - ${name}: ${versionFiles.length} version(s)` + (current ? ` (current -> ${current})` : ""));
    console.log(`[startup]   versions: ${versionFiles.join(", ") || "(none)"}`);
    console.log(`[startup]   urls:`);
    for (const u of urls) console.log(`[startup]     ${u}`);
    console.log(`[startup]   current: ${currentUrl}`);
  }

  console.log(`[startup] schemas=${dirs.length} versions=${totalVersions}`);
};


const srv = http.createServer((req, res) => {
  const t0 = process.hrtime.bigint();
  const id = randomUUID();
  let reqBytes = 0;
  req.on("data", (c) => (reqBytes += c.length));

  // Basic CORS + preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Content-Length": "0" }).end();
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    log({ id, ts: new Date().toISOString(), method: req.method, path: req.url, status: 204, reqBytes, resBytes: 0, ms: +dt.toFixed(3) });
    return;
  }

  // Only GET/HEAD
  if (!["GET", "HEAD"].includes(req.method || "")) {
    res.writeHead(405).end();
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    log({ id, ts: new Date().toISOString(), method: req.method, path: req.url, status: 405, reqBytes, resBytes: 0, ms: +dt.toFixed(3) });
    return;
  }

  try {
    const rawPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (!rawPath.startsWith(BASE_PATH + "/")) { res.writeHead(404).end(); return; }
    const urlPath = rawPath.slice(BASE_PATH.length); // keep leading slash
    const file = normalize(join(ROOT, urlPath));
    if (!file.startsWith(normalize(ROOT))) {
      res.writeHead(403).end();
      const dt = Number(process.hrtime.bigint() - t0) / 1e6;
      log({ id, ts: new Date().toISOString(), method: req.method, path: req.url, status: 403, reqBytes, resBytes: 0, ms: +dt.toFixed(3) });
      return;
    }

    const m = urlPath.match(/^\/([^/]+?)(?:\.json)?\/?$/);
    if (m) {
        const name = m[1];
        const dirPath = join(ROOT, name);
        const curPath = join(dirPath, "current.json");
        const cur = JSON.parse(readFileSync(curPath, "utf8"));
        const target = String(cur.$ref || "").replace(/^.\//, "");
        if (!target) { res.writeHead(404).end(); return; }
        const loc = `${BASE_PATH}/${encodeURIComponent(name)}/${target}`;
        res.writeHead(302, { Location: loc }).end();
        return;
    }

    const st = statSync(file, { throwIfNoEntry: false });
    if (!st || st.isDirectory()) {
      res.writeHead(404).end();
      const dt = Number(process.hrtime.bigint() - t0) / 1e6;
      log({ id, ts: new Date().toISOString(), method: req.method, path: req.url, status: 404, reqBytes, resBytes: 0, ms: +dt.toFixed(3) });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", MIME[extname(file)] || MIME.default);

    let resBytes = 0;
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Length": String(st.size) }).end();
      const dt = Number(process.hrtime.bigint() - t0) / 1e6;
      log({
        id, ts: new Date().toISOString(), method: req.method, path: req.url,
        status: 200, reqBytes, resBytes: 0, ms: +dt.toFixed(3), size: st.size
      });
      return;
    }

    const rs = createReadStream(file);
    rs.on("data", (c) => (resBytes += c.length));
    rs.on("error", () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
      const dt = Number(process.hrtime.bigint() - t0) / 1e6;
      log({ id, ts: new Date().toISOString(), method: req.method, path: req.url, status: 500, reqBytes, resBytes, ms: +dt.toFixed(3) });
    });
    rs.on("end", () => {
      const dt = Number(process.hrtime.bigint() - t0) / 1e6;
      log({
        id, ts: new Date().toISOString(), method: req.method, path: req.url,
        status: 200, reqBytes, resBytes, ms: +dt.toFixed(3), size: st.size,
        ua: req.headers["user-agent"] || undefined, ref: req.headers["referer"] || undefined
      });
    });
    rs.pipe(res);
  } catch {
    if (!res.headersSent) res.writeHead(500);
    res.end();
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    log({ id, ts: new Date().toISOString(), method: req.method, path: req.url, status: 500, reqBytes, resBytes: 0, ms: +dt.toFixed(3) });
  }
});

await printInventory(ROOT);

srv.listen(8080, () => {
  console.log("Serving ./versions on http://localhost:8080");
});
