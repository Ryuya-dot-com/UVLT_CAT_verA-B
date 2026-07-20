import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "../..");
const source = path.join(project, "cloudflare", "public-src");
const output = path.join(project, "dist");
const packageMetadata = JSON.parse(await readFile(path.join(project, "package.json"), "utf8"));
const appVersion = packageMetadata.version;

if (typeof appVersion !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(appVersion)) {
  throw new Error("package.json version is not a valid field appVersion");
}

const files = [
  [path.join(source, "index.html"), "index.html"],
  [path.join(project, "styles.css"), "styles.css"],
  [path.join(source, "field.css"), "field.css"],
  [path.join(source, "field-app.js"), "field-app.js"],
  [path.join(source, "field-task.js"), "field-task.js"]
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const manifest = [];
for (const [from, relative] of files) {
  const to = path.join(output, relative);
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { force: true });
  const bytes = await readFile(to);
  manifest.push({
    path: relative,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex")
  });
}

await writeFile(
  path.join(output, "build-manifest.json"),
  `${JSON.stringify({ schemaVersion: "uvlt-field-public-build-2", appVersion, files: manifest }, null, 2)}\n`,
  "utf8"
);

console.log(`Built ${manifest.length} allowlisted public assets for appVersion ${appVersion} in ${path.relative(project, output)}`);
