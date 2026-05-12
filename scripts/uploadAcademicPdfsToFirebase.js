require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { getBucket } = require("../config/firebase");

const backendRoot = path.resolve(__dirname, "..");
const sourceDir = path.resolve(
  process.env.ACADEMICS_MANUAL_PDF_SOURCE_DIR ||
    path.join(backendRoot, "../acadamics/orin-data-pipeline/raw_data/manual_pdfs")
);
const manifestPath = path.resolve(
  process.env.ACADEMICS_MANUAL_PDF_MANIFEST ||
    path.join(backendRoot, "data/academics/manual_pdf_manifest.json")
);
const onlyPrefix = String(process.env.ACADEMICS_UPLOAD_ONLY_PREFIX || "").replace(/\\/g, "/").trim();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function normalizeBoard(value) {
  const text = String(value || "").trim().toUpperCase();
  if (text.startsWith("SSC")) return "SSC";
  if (text.startsWith("CBSE")) return "CBSE";
  if (text.startsWith("ICSE")) return "ICSE";
  return text.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function titleFromSlug(value) {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function classNumberFrom(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function subjectFromParts(parts, filePath) {
  if (parts.length >= 4) return titleFromSlug(slug(parts[2]));
  return titleFromSlug(slug(path.parse(filePath).name));
}

function walk(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return walk(nextPath);
    return entry.isFile() && entry.name.toLowerCase().endsWith(".pdf") ? [nextPath] : [];
  });
}

function loadExistingManifest() {
  if (!fs.existsSync(manifestPath)) return new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return new Map((parsed.pdfs || []).map((row) => [`${row.relativePath}|${row.sizeBytes}`, row]));
  } catch {
    return new Map();
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeManifest(rows) {
  const sortedRows = [...rows].sort((a, b) => `${a.board}/${a.classNumber}/${a.subject}/${a.fileName}`.localeCompare(`${b.board}/${b.classNumber}/${b.subject}/${b.fileName}`, undefined, { numeric: true }));
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), count: sortedRows.length, pdfs: sortedRows }, null, 2)}\n`, "utf8");
}

async function uploadOne(bucket, filePath) {
  const relativePath = path.relative(sourceDir, filePath).replace(/\\/g, "/");
  const parts = relativePath.split("/");
  if (parts.length < 3) return null;

  const board = normalizeBoard(parts[0]);
  const classNumber = classNumberFrom(parts[1]);
  const subject = subjectFromParts(parts, filePath);
  if (!board || !classNumber || !subject) return null;

  const fileName = path.basename(filePath);
  const storagePath = [
    "academics",
    "manual_pdfs",
    board,
    `class_${classNumber}`,
    slug(subject),
    fileName
  ].join("/");

  await bucket.upload(filePath, {
    destination: storagePath,
    resumable: fs.statSync(filePath).size > 8 * 1024 * 1024,
    metadata: {
      contentType: "application/pdf",
      cacheControl: "public, max-age=31536000"
    }
  });

  const [pdfUrl] = await bucket.file(storagePath).getSignedUrl({
    action: "read",
    expires: "03-01-2500"
  });

  return {
    board,
    classNumber,
    subject,
    fileName,
    relativePath,
    storagePath,
    pdfUrl,
    sizeBytes: fs.statSync(filePath).size
  };
}

async function uploadOneWithRetry(bucket, filePath, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await uploadOne(bucket, filePath);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.warn(`Retrying upload (${attempt}/${attempts}) for ${path.relative(sourceDir, filePath)}: ${error.message}`);
        await delay(1000 * attempt);
      }
    }
  }
  throw lastError;
}

async function main() {
  if (!fs.existsSync(sourceDir)) {
    fail(`Academic manual PDF source folder not found: ${sourceDir}`);
  }

  const bucket = getBucket();
  if (!bucket) {
    fail("Firebase Storage is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and FIREBASE_STORAGE_BUCKET.");
  }

  const pdfFiles = walk(sourceDir);
  const existingManifest = loadExistingManifest();
  const manifest = onlyPrefix
    ? [...existingManifest.values()].filter((row) => !String(row.relativePath || "").replace(/\\/g, "/").startsWith(onlyPrefix))
    : [];
  for (const filePath of pdfFiles) {
    const relativePath = path.relative(sourceDir, filePath).replace(/\\/g, "/");
    if (onlyPrefix && !relativePath.startsWith(onlyPrefix)) continue;
    const sizeBytes = fs.statSync(filePath).size;
    if (sizeBytes === 0) {
      console.warn(`Skipped empty PDF: ${relativePath}`);
      continue;
    }
    const existing = existingManifest.get(`${relativePath}|${sizeBytes}`);
    if (existing) {
      manifest.push(existing);
      console.log(`Reused ${relativePath} -> ${existing.storagePath}`);
      writeManifest(manifest);
      continue;
    }
    const row = await uploadOneWithRetry(bucket, filePath);
    if (row) {
      manifest.push(row);
      console.log(`Uploaded ${row.relativePath} -> ${row.storagePath}`);
      writeManifest(manifest);
    }
  }

  writeManifest(manifest);

  console.log(`Wrote ${path.relative(backendRoot, manifestPath)} with ${manifest.length} PDFs`);
}

main().catch((error) => fail(error.stack || error.message || String(error)));
