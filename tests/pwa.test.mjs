import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

test("el manifiesto PWA es válido y apunta a iconos existentes", async () => {
  const manifest = JSON.parse(await readFile(resolve(dist, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "portrait-primary");
  assert.equal(manifest.start_url, "./");
  for (const icon of manifest.icons) await access(resolve(dist, icon.src.replace(/^\.\//, "")));
});

test("todos los archivos precargados por el service worker existen", async () => {
  const source = await readFile(resolve(dist, "sw.js"), "utf8");
  const block = source.match(/const APP_SHELL = \[([\s\S]*?)\];/)?.[1] || "";
  const entries = [...block.matchAll(/"(\.\/[^"?]+)"/g)].map((match) => match[1]);
  assert.ok(entries.length >= 10);
  for (const entry of entries) {
    if (entry === "./") continue;
    await access(resolve(dist, entry.slice(2)));
  }
});

test("la aplicación no depende de recursos remotos", async () => {
  const files = ["index.html", "styles.css", "sw.js", "manifest.webmanifest"];
  for (const file of files) {
    const source = await readFile(resolve(dist, file), "utf8");
    assert.doesNotMatch(source, /https?:\/\//i, `${file} contiene una URL remota`);
  }
});

test("cada referencia estática principal del HTML existe", async () => {
  const html = await readFile(resolve(dist, "index.html"), "utf8");
  const refs = [...html.matchAll(/(?:href|src)="(\.\/[^"?]+)"/g)].map((match) => match[1]);
  for (const ref of refs) await access(resolve(dist, ref.slice(2)));
});

test("todos los controles buscados por la interfaz están presentes en el HTML", async () => {
  const [html, app] = await Promise.all([
    readFile(resolve(dist, "index.html"), "utf8"),
    readFile(resolve(dist, "js/app.js"), "utf8"),
  ]);
  const ids = [...new Set([...app.matchAll(/byId\("([^"]+)"\)/g)].map((match) => match[1]))];
  for (const id of ids) assert.match(html, new RegExp(`id=["']${id}["']`), `falta #${id}`);
});
