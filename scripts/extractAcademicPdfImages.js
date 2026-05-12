const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const pdfRoot = path.resolve(projectRoot, "data/academics/manual_pdfs");
const imageRoot = path.resolve(projectRoot, "data/academics/pdf_images");
const manifestPath = path.resolve(projectRoot, "data/academics/pdf_image_manifest.json");

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) files.push(fullPath);
  }
  return files;
}

function parseContext(pdfPath) {
  const relative = path.relative(pdfRoot, pdfPath).replace(/\\/g, "/");
  const parts = relative.split("/");
  const classNumber = Number(String(parts[1] || "").match(/\d+/)?.[0] || 0);
  return {
    board: String(parts[0] || "").toUpperCase(),
    classNumber,
    subject: String(parts[2] || path.basename(pdfPath, ".pdf")).replace(/[_-]+/g, " ").trim(),
    sourcePdf: relative
  };
}

function main() {
  fs.mkdirSync(imageRoot, { recursive: true });
  const existing = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : [];
  const manifest = Array.isArray(existing) ? existing : Array.isArray(existing.images) ? existing.images : [];
  const known = new Set(manifest.map((item) => String(item.assetPath || "")));

  for (const pdfPath of walk(pdfRoot)) {
    const context = parseContext(pdfPath);
    const baseName = path.basename(pdfPath, ".pdf").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
    const outDir = path.join(imageRoot, context.board, `class_${context.classNumber}`, baseName);
    fs.mkdirSync(outDir, { recursive: true });
    const outPrefix = path.join(outDir, "img");
    const result = spawnSync("pdfimages", ["-png", pdfPath, outPrefix], { stdio: "inherit" });
    if (result.error || result.status !== 0) {
      console.warn(`Skipping image extraction for ${context.sourcePdf}. Install poppler pdfimages to enable this step.`);
      continue;
    }
    const generated = fs.readdirSync(outDir).filter((name) => /\.(png|jpg|jpeg|webp)$/i.test(name));
    generated.forEach((fileName, index) => {
      const assetPath = path.relative(imageRoot, path.join(outDir, fileName)).replace(/\\/g, "/");
      if (known.has(assetPath)) return;
      known.add(assetPath);
      manifest.push({
        id: `${baseName}-${index + 1}`,
        ...context,
        chapter: "",
        title: `Textbook image ${index + 1}`,
        caption: "",
        page: 0,
        assetPath
      });
    });
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify({ images: manifest }, null, 2)}\n`);
  console.log(`Academic image manifest updated: ${manifest.length} image(s).`);
}

main();
