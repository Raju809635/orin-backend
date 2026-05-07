const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const backendRoot = path.resolve(__dirname, "..");
const defaultSource = path.resolve(
  backendRoot,
  "../acadamics/orin-data-pipeline/final_dataset/orin_academic_dataset.json"
);
const defaultSourceDir = path.resolve(backendRoot, "../acadamics/orin-data-pipeline/final_dataset");
const defaultDestination = path.resolve(backendRoot, "data/academics/orin_academic_dataset.json");
const defaultDestinationDir = path.resolve(backendRoot, "data/academics/final_dataset");
const defaultReportSourceDir = path.resolve(backendRoot, "../acadamics/orin-data-pipeline/reports");
const defaultReportDestinationDir = path.resolve(backendRoot, "data/academics/manual_pdf_scan_reports");

const sourcePath = path.resolve(process.env.ACADEMICS_SYNC_SOURCE || defaultSource);
const destinationPath = path.resolve(process.env.ACADEMICS_SYNC_DESTINATION || defaultDestination);
const sourceDir = path.resolve(process.env.ACADEMICS_SYNC_SOURCE_DIR || defaultSourceDir);
const destinationDir = path.resolve(process.env.ACADEMICS_SYNC_DESTINATION_DIR || defaultDestinationDir);
const reportSourceDir = path.resolve(process.env.ACADEMICS_SYNC_REPORT_SOURCE_DIR || defaultReportSourceDir);
const reportDestinationDir = path.resolve(process.env.ACADEMICS_SYNC_REPORT_DESTINATION_DIR || defaultReportDestinationDir);
const uploadPdfs = process.argv.includes("--upload-pdfs");

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
copyDirRecursive(reportSourceDir, reportDestinationDir);

if (uploadPdfs) {
  const result = spawnSync(process.execPath, [path.join(__dirname, "uploadAcademicPdfsToFirebase.js")], {
    cwd: backendRoot,
    env: process.env,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    fail(`Academic PDF upload failed with exit code ${result.status}`);
  }
}

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
console.log(`Synced academic scan reports folder to ${path.relative(backendRoot, reportDestinationDir)}`);
console.log(uploadPdfs ? "Uploaded academic PDFs to Firebase Storage and refreshed manifest" : "Skipped academic PDF upload; pass --upload-pdfs to refresh Firebase manifest");
console.log(`Boards: ${boards.length}, classes: ${classCount}, subjects: ${subjectCount}`);
