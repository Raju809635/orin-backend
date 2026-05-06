const fs = require("fs");
const path = require("path");

const backendRoot = path.resolve(__dirname, "..");
const defaultSource = path.resolve(
  backendRoot,
  "../acadamics/orin-data-pipeline/final_dataset/orin_academic_dataset.json"
);
const defaultDestination = path.resolve(backendRoot, "data/academics/orin_academic_dataset.json");

const sourcePath = path.resolve(process.env.ACADEMICS_SYNC_SOURCE || defaultSource);
const destinationPath = path.resolve(process.env.ACADEMICS_SYNC_DESTINATION || defaultDestination);

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

const boards = Object.keys(dataset);
const classCount = boards.reduce((total, board) => total + Object.keys(dataset[board] || {}).length, 0);
const subjectCount = boards.reduce(
  (total, board) =>
    total +
    Object.values(dataset[board] || {}).reduce((classTotal, subjects) => classTotal + Object.keys(subjects || {}).length, 0),
  0
);

console.log(`Synced academic dataset to ${path.relative(backendRoot, destinationPath)}`);
console.log(`Boards: ${boards.length}, classes: ${classCount}, subjects: ${subjectCount}`);
