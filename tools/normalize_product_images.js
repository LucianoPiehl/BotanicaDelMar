import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const siteDir = path.resolve(__dirname, "..");
const projectDir = path.resolve(siteDir, "..");

const sourceDir = path.join(projectDir, "imagenes", "productos_web_biocom");
const outputDir = path.join(siteDir, "assets", "products-web");
const canvasSize = 1000;

const images = [
  ["01-agua-micelar-pepino-aloe.webp", "agua-micelar-pepino-aloe"],
  ["02-Emulsion de Limpieza Pepino y Aloe .webp", "emulsion-limpieza-pepino-aloe"],
  ["03-gel-limpieza-manzanilla-calendula.jpg", "gel-limpieza-manzanilla-calendula"],
  ["04 Dermo Pulido Crema con Cuarzo .webp", "dermopulido-crema-cuarzo"],
  ["05 Dermo Pulido Gel Limon .webp", "dermopulido-gel-limon"],
  ["06 Dermo Pulido Gel Uva.webp", "dermopulido-gel-uva"],
  ["07 Locion Tonica Herbacea.webp", "locion-tonica-herbacea"],
  ["08 Locion Higienica.webp", "locion-higienica"],
  ["09-locion-termal.jpg", "locion-termal"],
  ["10-locion-niacinamida.webp", "locion-niacinamida"],
  ["11-neblina-hidratante-descongestiva.jpg", "neblina-hidratante-descongestiva"],
  ["12-hidratante-facial-hidrolizados.webp", "hidratante-facial-hidrolizados"],
  ["13-hialuronico-retinol.webp", "hialuronico-retinol"],
  ["14-vitamina-c-retinol.webp", "vitamina-c-retinol"],
  ["15-niacinamida.jpg", "niacinamida"],
  ["16Hidratante  celular profunda.webp", "hidratante-celular-profunda"],
  ["17-serum-complex.jpg", "serum-complex"],
  ["18 Hialuronico y Vitamina C Gel.webp", "hialuronico-vitamina-c-gel"],
  ["19 Concentrado Hialuronico Gel.webp", "concentrado-hialuronico-gel"],
  ["20-crema-q10-liposomada.jpg", "crema-q10-liposomada"],
  ["21 Celulas Madre Crema.webp", "celulas-madre-crema"],
  ["22-melon-vitamina-c-gel.webp", "melon-vitamina-c-gel"],
  ["23 Mascara Anti Age con Aminoacidos.webp", "mascara-antiage-aminoacidos"],
  ["24-mascara-pepinos-menta-aloe.webp", "mascara-pepinos-menta-aloe"],
  ["25-mascara-chocolate-karite-cacao.jpg", "mascara-chocolate-karite-cacao"],
  ["26 Mascara de Niacinamida .webp", "mascara-niacinamida"],
  ["27 Crema Correctora Natural FPS 35.webp", "crema-correctora-natural-fps-35"],
  ["Crema Correctora Sin Color FPS 35.webp", "crema-correctora-sin-color-fps-35"],
  ["29 Crema Correctora FPS 45 .webp", "crema-correctora-fps-45"],
];

await fs.mkdir(outputDir, { recursive: true });

for (const [sourceName, slug] of images) {
  const sourcePath = path.join(sourceDir, sourceName);
  const outputPath = path.join(outputDir, `${slug}.webp`);

  await sharp(sourcePath)
    .rotate()
    .trim({ threshold: 12 })
    .resize({
      width: canvasSize,
      height: canvasSize,
      fit: "contain",
      kernel: sharp.kernel.lanczos3,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .webp({
      quality: 95,
      effort: 6,
      smartSubsample: true,
    })
    .toFile(outputPath);
}

console.log(`Imagenes normalizadas: ${images.length}`);
console.log(`Salida: ${outputDir}`);
