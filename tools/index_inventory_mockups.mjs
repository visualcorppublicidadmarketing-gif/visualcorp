import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [baseSource, brandSource] = process.argv.slice(2);
if (!baseSource || !brandSource) {
  throw new Error('Uso: node tools/index_inventory_mockups.mjs <PNG_transparentes/Finales> <Variantes_Marcas/Finales>');
}

const outputRoot = path.resolve('public/inventory-reference-library');
const imageRoot = path.join(outputRoot, 'images');
await fs.mkdir(imageRoot, { recursive: true });

const pngFiles = async (folder) => (await fs.readdir(folder, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /\.png$/i.test(entry.name))
  .map((entry) => entry.name)
  .sort((a, b) => Number(a.match(/^\d+/)?.[0]) - Number(b.match(/^\d+/)?.[0]));

const baseFiles = await pngFiles(baseSource);
const brandFiles = await pngFiles(brandSource);
const byNumber = (files) => new Map(files.map((file) => [Number(file.match(/^\d+/)?.[0]), file]));
const baseByNumber = byNumber(baseFiles);
const brandByNumber = byNumber(brandFiles);
const numbers = [...new Set([...baseByNumber.keys(), ...brandByNumber.keys()])].sort((a, b) => a - b);
const toTitle = (value) => value.replace(/\.png$/i, '').replace(/^\d+_/, '').replace(/_(Visual_Corp|VisualCorp)$/i, '').replace(/_/g, ' ').trim();
const records = [];

for (const number of numbers) {
  const baseName = baseByNumber.get(number);
  const brandName = brandByNumber.get(number);
  const productName = toTitle(baseName || brandName).replace(/_Visual_Corp$/i, '').replace(/Visual Corp$/i, '').trim();
  const record = { id: String(number).padStart(2, '0'), name: productName, category: 'Mockup de producto', tags: ['referencia visual', 'mockup', 'impresión'], images: [] };
  for (const [series, filename, folder] of [['Visual Corp', baseName, baseSource], ['Marcas', brandName, brandSource]]) {
    if (!filename) continue;
    const sourcePath = path.join(folder, filename);
    const sourceSuffix = series === 'Visual Corp' ? 'visual-corp' : 'marcas';
    const outputName = `${record.id}-${sourceSuffix}.webp`;
    const outputPath = path.join(imageRoot, outputName);
    await sharp(sourcePath).rotate().resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78, effort: 5, alphaQuality: 90 }).toFile(outputPath);
    const metadata = await sharp(outputPath).metadata();
    const brandLabel = series === 'Marcas' ? toTitle(filename) : 'Visual Corp';
    record.images.push({ series, label: brandLabel || series, source: filename, path: `/inventory-reference-library/images/${outputName}`, width: metadata.width, height: metadata.height });
  }
  records.push(record);
}

const manifest = {
  title: 'Biblioteca de referencias visuales de inventario',
  generatedAt: new Date().toISOString(),
  provenance: [path.basename(path.dirname(baseSource)), path.basename(path.dirname(brandSource))],
  note: 'Mockups visuales para identificar productos relacionados. No representan fotografías ni cantidades de stock.',
  count: records.reduce((sum, record) => sum + record.images.length, 0),
  products: records,
};
await fs.writeFile(path.join(outputRoot, 'index.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await fs.mkdir(path.resolve('src/data'), { recursive: true });
await fs.writeFile(path.resolve('src/data/inventory-reference-index.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Indexadas ${records.length} familias y ${manifest.count} miniaturas en ${outputRoot}`);
