import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function migrationFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return migrationFiles(filename);
    return entry.isFile() && /\.(sql|json)$/.test(entry.name) ? [filename] : [];
  }).sort();
}

function safeSource(filename) {
  let source = readFileSync(filename, "utf8");
  if (filename === "public/index.html") {
    const configurations = source.match(/const firebaseConfig=\{[\s\S]*?\};/g);
    if (!configurations || configurations.length !== 1) throw new Error("Unable to safely redact Firebase configuration.");
    source = source.replace(/const firebaseConfig=\{[\s\S]*?\};/, `const firebaseConfig={
 apiKey:"YOUR_FIREBASE_API_KEY",
 authDomain:"YOUR_FIREBASE_AUTH_DOMAIN",
 projectId:"YOUR_FIREBASE_PROJECT_ID",
 storageBucket:"YOUR_FIREBASE_STORAGE_BUCKET",
 messagingSenderId:"YOUR_FIREBASE_MESSAGING_SENDER_ID",
 appId:"YOUR_FIREBASE_APP_ID",
 measurementId:"YOUR_FIREBASE_MEASUREMENT_ID"
};`);
  }
  if (/AIza[\w-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)) {
    throw new Error("Export stopped because a possible credential was detected. No source contents were printed.");
  }
  return source;
}

function exportCode() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  process.chdir(root);
  const filenames = [
    "public/index.html",
    "public/community.js",
    "public/community.css",
    "public/code.html",
    "public/code.js",
    "public/code.css",
    "netlify/functions/community.mts",
    "db/schema.ts",
    "db/index.ts",
    "drizzle.config.ts",
    "netlify.toml",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    ".gitignore",
    "README.md",
    "scripts/export-code.mjs",
    ...migrationFiles("netlify/database/migrations"),
  ];
  const files = Object.fromEntries(filenames.map(filename => [filename, safeSource(filename)]));
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "studyhub-source-"));
  try {
    const projectDirectory = join(temporaryDirectory, "project");
    mkdirSync(projectDirectory);
    for (const [filename, source] of Object.entries(files)) {
      const destination = join(projectDirectory, filename);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, source, "utf8");
    }
    const archive = join(temporaryDirectory, "studyhub-source.zip");
    const result = spawnSync("zip", ["-q", "-r", archive, "."], { cwd: projectDirectory, encoding: "utf8" });
    if (result.error || result.status !== 0) throw new Error("Unable to create the source archive. Install the zip utility, then retry.");
    copyFileSync(archive, "public/studyhub-source.zip");
    writeFileSync("public/source-code.json", JSON.stringify({ version: 1, files }, null, 2) + "\n", "utf8");
    console.log(`Exported ${filenames.length} complete source files with Firebase configuration placeholders.`);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

exportCode();
