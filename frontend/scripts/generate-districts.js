const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'public', 'tw_cities_districts.csv');
const outPath = path.join(__dirname, '..', 'src', 'data', 'taiwan-districts.ts');

const csv = fs.readFileSync(csvPath, 'utf8');
const rows = csv
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => l.split(','))
  .filter((a) => a.length >= 2);

const cities = [];
const cityDict = {};
const regionDict = {};

let ci = 1;
for (const [city, region] of rows) {
  let c = cities.find((x) => x.label === city);
  if (!c) {
    const code = `c${ci++}`;
    c = { code, label: city, regions: [] };
    cities.push(c);
    cityDict[code] = city;
  }
  const rcode = `${c.code}-r${c.regions.length + 1}`;
  c.regions.push({ code: rcode, label: region });
  regionDict[rcode] = region;
}

let out = '// Auto-generated from public/tw_cities_districts.csv\n';
out += 'export const TAIWAN_CITIES = [\n';
for (const c of cities) {
  out += `  { code: '${c.code}', label: '${c.label}', regions: [\n`;
  for (const r of c.regions) {
    out += `    { code: '${r.code}', label: '${r.label}' },\n`;
  }
  out += '  ] },\n';
}
out += '] as const;\n';

out += 'export const CITY_DICTIONARY = {\n';
for (const k of Object.keys(cityDict)) {
  out += `  '${k}': '${cityDict[k]}',\n`;
}
out += '} as const;\n';

out += 'export const REGION_DICTIONARY = {\n';
for (const k of Object.keys(regionDict)) {
  out += `  '${k}': '${regionDict[k]}',\n`;
}
out += '} as const;\n';

fs.mkdirSync(path.join(__dirname, '..', 'src', 'data'), { recursive: true });
fs.writeFileSync(outPath, out, 'utf8');
console.log(`Generated ${cities.length} cities to ${outPath}`);
