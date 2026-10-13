let sources = null;
let completeCode = "";

function element(id) {
  return document.getElementById(id);
}

function status(message, error = false) {
  element("copyStatus").textContent = message;
  element("copyStatus").classList.toggle("error", error);
}

function selectedSource() {
  return sources?.[element("sourceFile").value] ?? "";
}

function renderFile() {
  const filename = element("sourceFile").value;
  const source = selectedSource();
  element("sourceCode").textContent = source;
  element("fileName").textContent = filename;
  const lines = source.trimEnd().split("\n").length;
  const bytes = new TextEncoder().encode(source).byteLength;
  element("fileDetails").textContent = `${lines.toLocaleString()} lines · ${(bytes / 1024).toFixed(1)} KB`;
  element("sourcePreview").scrollTop = 0;
  element("sourcePreview").scrollLeft = 0;
  element("manualCopy").hidden = true;
  element("manualCopyText").value = "";
}

function restorationScript(files) {
  return `const files = ${JSON.stringify(files, null, 2)};
const { mkdirSync, writeFileSync } = require("node:fs");
const { dirname } = require("node:path");
for (const [filename, source] of Object.entries(files)) {
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, source, "utf8");
}
console.log("StudyHub files created. Fill the Firebase placeholders, then run npm ci.");
`;
}

async function loadSources() {
  sources = null;
  completeCode = "";
  element("copyAll").disabled = true;
  element("copyFile").disabled = true;
  element("sourceFile").disabled = true;
  element("downloadProject").hidden = true;
  element("retryLoad").hidden = true;
  status("Loading your code…");
  try {
    const response = await fetch("source-code.json", { cache: "no-cache", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error("The source files could not load. Try again.");
    const bundle = await response.json();
    const files = bundle.files;
    if (!files || typeof files !== "object" || Array.isArray(files) || !Object.keys(files).length || Object.values(files).some(source => typeof source !== "string")) {
      throw new Error("The source export is unavailable. Try again.");
    }
    sources = files;
    completeCode = restorationScript(files);
    const selector = element("sourceFile");
    selector.replaceChildren();
    for (const filename of Object.keys(files)) {
      const option = document.createElement("option");
      option.value = filename;
      option.textContent = filename;
      selector.append(option);
    }
    if (files["public/index.html"]) selector.value = "public/index.html";
    renderFile();
    element("sourceCount").textContent = `${Object.keys(files).length} complete project files`;
    element("copyAll").disabled = false;
    element("copyFile").disabled = false;
    selector.disabled = false;
    element("downloadProject").hidden = false;
    status("Ready. Choose a copy button above or beside the file selector.");
  } catch (error) {
    status(error.message || "Unable to load the code. Try again.", true);
    element("sourceCode").textContent = "The code could not load. Use Retry loading to try again.";
    element("retryLoad").hidden = false;
  }
}

function legacyCopy(text) {
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.append(input);
  const focused = document.activeElement;
  let copied = false;
  try {
    input.select();
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    input.remove();
    focused?.focus();
  }
  return copied;
}

async function copyCode(text, button, label) {
  if (!text || button.disabled) return;
  button.disabled = true;
  element("manualCopy").hidden = true;
  element("manualCopyText").value = "";
  let copied = false;
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch {
    copied = false;
  }
  if (!copied) copied = legacyCopy(text);
  if (copied) {
    status(`${label} copied! Paste it wherever you need it.`);
  } else {
    element("manualCopy").hidden = false;
    const manual = element("manualCopyText");
    manual.value = text;
    manual.focus();
    manual.select();
    status("Your browser blocked automatic copying. The code below is selected; press Ctrl+C or Command+C, or use your device's Copy option.", true);
  }
  button.disabled = false;
}

element("sourceFile").addEventListener("change", renderFile);
element("copyFile").addEventListener("click", () => copyCode(selectedSource(), element("copyFile"), element("sourceFile").value));
element("copyAll").addEventListener("click", () => copyCode(completeCode, element("copyAll"), "Complete project code"));
element("retryLoad").addEventListener("click", loadSources);
loadSources();
