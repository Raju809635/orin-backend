const fs = require("fs");
const path = require("path");

const backendRoot = path.resolve(__dirname, "..");
const defaultSource = path.resolve(
  backendRoot,
  "../acadamics/orin-data-pipeline/final_dataset/orin_academic_dataset.json"
);
const defaultSourceDir = path.resolve(backendRoot, "../acadamics/orin-data-pipeline/final_dataset");
const defaultDestination = path.resolve(backendRoot, "data/academics/orin_academic_dataset.json");
const defaultDestinationDir = path.resolve(backendRoot, "data/academics/final_dataset");
const defaultManualPdfSourceDir = path.resolve(backendRoot, "../acadamics/orin-data-pipeline/raw_data/manual_pdfs");
const defaultManualPdfDestinationDir = path.resolve(backendRoot, "data/academics/manual_pdfs");

const sourcePath = path.resolve(process.env.ACADEMICS_SYNC_SOURCE || defaultSource);
const destinationPath = path.resolve(process.env.ACADEMICS_SYNC_DESTINATION || defaultDestination);
const sourceDir = path.resolve(process.env.ACADEMICS_SYNC_SOURCE_DIR || defaultSourceDir);
const destinationDir = path.resolve(process.env.ACADEMICS_SYNC_DESTINATION_DIR || defaultDestinationDir);
const manualPdfSourceDir = path.resolve(process.env.ACADEMICS_SYNC_MANUAL_PDF_SOURCE_DIR || defaultManualPdfSourceDir);
const manualPdfDestinationDir = path.resolve(process.env.ACADEMICS_SYNC_MANUAL_PDF_DESTINATION_DIR || defaultManualPdfDestinationDir);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(sourcePath)) {
  fail(`Academic dataset source not found: ${sourcePath}`);
}

let dataset;
try {
  dataset = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
} catch (error) {
  fail(`Academic dataset source is not valid JSON: ${error.message}`);
}

if (!dataset || typeof dataset !== "object" || Array.isArray(dataset)) {
  fail("Academic dataset source must be a board/class/subject object.");
}

fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
fs.writeFileSync(destinationPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");

function copyDirRecursive(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

copyDirRecursive(sourceDir, destinationDir);
copyDirRecursive(manualPdfSourceDir, manualPdfDestinationDir);

const boards = Object.keys(dataset);
const classCount = boards.reduce((total, board) => total + Object.keys(dataset[board] || {}).length, 0);
const subjectCount = boards.reduce(
  (total, board) =>
    total +
    Object.values(dataset[board] || {}).reduce((classTotal, subjects) => classTotal + Object.keys(subjects || {}).length, 0),
  0
);

console.log(`Synced academic dataset to ${path.relative(backendRoot, destinationPath)}`);
console.log(`Synced academic final_dataset folder to ${path.relative(backendRoot, destinationDir)}`);
console.log(`Synced academic manual PDFs folder to ${path.relative(backendRoot, manualPdfDestinationDir)}`);
console.log(`Boards: ${boards.length}, classes: ${classCount}, subjects: ${subjectCount}`);
