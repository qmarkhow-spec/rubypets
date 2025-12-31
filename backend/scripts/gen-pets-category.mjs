import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const candidates = [
  path.resolve(process.cwd(), "pets_category.xlsx"),
  path.resolve(process.cwd(), "../pets_category.xlsx"),
  path.resolve(process.cwd(), "../../pets_category.xlsx")
];

const input = candidates.find((p) => fs.existsSync(p));
const outDir = path.resolve(process.cwd(), "src/data");
const outFile = path.join(outDir, "pets-category.json");

if (!input) {
  console.error("pets_category.xlsx not found. Tried:", candidates.join(", "));
  process.exit(1);
}

const wb = xlsx.readFile(input);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

const classMap = new Map();

for (const r of rows) {
  const classKey = (r["class"] ?? "").toString().trim();
  const classLabel = (r["生物類"] ?? "").toString().trim();
  const speciesKey = (r["species"] ?? "").toString().trim();
  const speciesLabel = (r["物種"] ?? "").toString().trim();
  const breedKeyRaw = r["breed"];
  const breedLabelRaw = r["品種"];

  if (!classKey || !speciesKey) continue;

  if (!classMap.has(classKey)) {
    classMap.set(classKey, {
      key: classKey,
      label: classLabel || classKey,
      species: new Map()
    });
  }

  const c = classMap.get(classKey);
  if (!c.species.has(speciesKey)) {
    c.species.set(speciesKey, {
      key: speciesKey,
      label: speciesLabel || speciesKey,
      breeds: []
    });
  }

  const s = c.species.get(speciesKey);

  const breedKey = (breedKeyRaw ?? "").toString().trim();
  const breedLabel = (breedLabelRaw ?? "").toString().trim();

  if (breedKey) {
    s.breeds.push({ key: breedKey, label: breedLabel || breedKey });
  }
}

const classes = Array.from(classMap.values()).map((c) => {
  const species = Array.from(c.species.values()).map((s) => {
    const breeds = s.breeds;
    return {
      key: s.key,
      label: s.label,
      hasBreed: breeds.length > 0,
      breeds
    };
  });

  return { key: c.key, label: c.label, species };
});

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ classes }, null, 2), "utf-8");
console.log("generated:", outFile);
