from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFilter
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = ROOT
DESKTOP_BASE = ROOT
PRICE_LIST_PDF = DESKTOP_BASE / "distribuidor_lista.pdf"
VADEMECUM_PDF = DESKTOP_BASE / "Vademecum_BIOCOM.pdf"
OUTPUT_DATA = SITE_DIR / "data" / "catalog.js"
OUTPUT_IMAGES = SITE_DIR / "assets" / "products"


CATEGORIES = {
    "limpieza-cutis": "Limpieza de cutis",
    "exfoliantes": "Exfoliantes",
    "lociones-tonicas": "Lociones tonicas",
    "concentrados-serums": "Concentrados & serums",
    "cremas-tratamientos": "Cremas & tratamientos",
    "descongestivos": "Descongestivos",
    "mascaras": "Mascaras",
    "crema-protectora": "Crema protectora",
}


@dataclass(frozen=True)
class ProductSeed:
    price_name: str
    category_id: str
    page_no: int
    product_no: str
    title: str
    slug: str
    color_variant: str | None = None


SEEDS: list[ProductSeed] = [
    ProductSeed("AGUA MICELAR PEPINO Y ALOE", "limpieza-cutis", 2, "01", "Agua Micelar con Aloe Vera y Pepino", "agua-micelar-pepino-aloe"),
    ProductSeed("EMULSION DE LIMPIEZA PEPINO Y ALOE", "limpieza-cutis", 3, "02", "Emulsion de Limpieza Pepino y Aloe", "emulsion-limpieza-pepino-aloe"),
    ProductSeed("GEL DE LIMPIEZA MANZANILLA Y CALENDULA", "limpieza-cutis", 4, "03", "Gel de Limpieza Manzanilla y Calendula", "gel-limpieza-manzanilla-calendula"),
    ProductSeed("DERMOPULIDO CREMA CON CUARZO", "exfoliantes", 7, "06", "Dermo Pulido Crema con Cuarzo", "dermopulido-crema-cuarzo"),
    ProductSeed("DERMOPULIDO GEL LIMON", "exfoliantes", 6, "05", "Dermo Pulido Gel Limon", "dermopulido-gel-limon"),
    ProductSeed("DERMOPULIDO GEL UVA", "exfoliantes", 5, "04", "Dermo Pulido Gel Uva", "dermopulido-gel-uva"),
    ProductSeed("LOCION TONICA HERBACEA", "lociones-tonicas", 9, "08", "Locion Tonica Herbacea", "locion-tonica-herbacea"),
    ProductSeed("LOCION HIGIENICA", "lociones-tonicas", 8, "07", "Locion Higienica", "locion-higienica"),
    ProductSeed("LOCION TERMAL", "lociones-tonicas", 10, "09", "Locion Termal", "locion-termal"),
    ProductSeed("LOCION NIACINAMIDA", "lociones-tonicas", 11, "10", "Locion Niacinamida", "locion-niacinamida"),
    ProductSeed("NEBLINA HIDRATANTE DESCONGESTIVA", "lociones-tonicas", 12, "11", "Neblina Hidratante Descongestiva", "neblina-hidratante-descongestiva"),
    ProductSeed("HIDRATANTE FACIAL CON HIDROLIZADOS", "concentrados-serums", 16, "15", "Hidratante Facial con Hidrolizados", "hidratante-facial-hidrolizados"),
    ProductSeed("HIALURONICO Y RETINOL", "concentrados-serums", 14, "13", "Hialuronico y Retinol", "hialuronico-retinol"),
    ProductSeed("VIT C Y RETINOL", "concentrados-serums", 13, "12", "Vitamina C y Retinol", "vitamina-c-retinol"),
    ProductSeed("NIACINAMIDA", "concentrados-serums", 15, "14", "Niacinamida", "niacinamida"),
    ProductSeed("HIDRATANTE CELULAR PROFUNDA", "cremas-tratamientos", 22, "21", "Hidratante Celular Profunda", "hidratante-celular-profunda"),
    ProductSeed("SERUM COMPLEX", "cremas-tratamientos", 20, "19", "Serum Complex", "serum-complex"),
    ProductSeed("HIALURONICO Y VIT C -GEL", "cremas-tratamientos", 18, "17", "Hialuronico y Vitamina C Gel", "hialuronico-vitamina-c-gel"),
    ProductSeed("CONCENTRADO HIALURONICO-GEL-", "cremas-tratamientos", 17, "16", "Concentrado Hialuronico Gel", "concentrado-hialuronico-gel"),
    ProductSeed("CREMA Q 10 LIPOSOMADA", "cremas-tratamientos", 19, "18", "Crema Q10 Liposomada", "crema-q10-liposomada"),
    ProductSeed("CELULAS MADRES - CREMA", "cremas-tratamientos", 21, "20", "Celulas Madre Crema", "celulas-madre-crema"),
    ProductSeed("MELON Y VIT C - GEL", "descongestivos", 27, "26", "Melon y Vitamina C Gel", "melon-vitamina-c-gel"),
    ProductSeed("MASCARA ANTIAGE C/AMINOACIDOS - RF", "mascaras", 25, "24", "Mascara Anti Age con Aminoacidos", "mascara-antiage-aminoacidos"),
    ProductSeed("MASCARA DE PEPINOS, MENTA Y ALOE", "mascaras", 23, "22", "Mascara de Pepinos, Menta y Aloe", "mascara-pepinos-menta-aloe"),
    ProductSeed("MASCARA E CHOCOLATE, KARITE Y CACAO", "mascaras", 24, "23", "Mascara de Chocolate, Karite y Cacao", "mascara-chocolate-karite-cacao"),
    ProductSeed("MASCARA DE NIACINAMIDA", "mascaras", 26, "25", "Mascara de Niacinamida", "mascara-niacinamida"),
    ProductSeed("CREMA CORRECTORA NATURAL FPS 35", "crema-protectora", 28, "27", "Crema Correctora Natural FPS 35", "crema-correctora-natural-fps-35", "Natural"),
    ProductSeed("CREMA CORRECTORA SIN COLOR FPS 35", "crema-protectora", 28, "27", "Crema Correctora Sin Color FPS 35", "crema-correctora-sin-color-fps-35", "Sin color"),
    ProductSeed("CREMA CORRECTORA FPS 45", "crema-protectora", 29, "27", "Crema Correctora FPS 45", "crema-correctora-fps-45"),
]


PRICE_LINE = re.compile(
    r"^(?P<name>.+?)\s+(?P<presentation>\d+\s*(?:CC|G|GR|ML|KG))\s+\$(?P<final>[\d,]+\.\d{2})\s+\$(?P<suggested>[\d,]+\.\d{2})$",
    re.IGNORECASE,
)

NOISE_SNIPPETS = (
    "laboratorios.biocom@gmail.com",
    "Resistencia, Chaco",
    "@laboratorios.biocom",
    "@Laboratorios Biocom",
    "362-4539467",
    "BIOCOM - Laboratorio de Cosmiatra Medica",
    "Formulaciones de alta tecnologia disenadas",
    "Rutina de limpieza profesional",
    "Tratamientos de cabinete para una piel radiante y renovada",
)


def normalize(text: str) -> str:
    cleaned = unicodedata.normalize("NFKD", text)
    cleaned = "".join(ch for ch in cleaned if not unicodedata.combining(ch))
    cleaned = cleaned.upper().strip()
    cleaned = re.sub(r"[^A-Z0-9]+", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def repair_text(text: str) -> str:
    cleaned = (text or "").replace("\xa0", " ").strip()
    if any(marker in cleaned for marker in ("\u00c3", "\u00c2", "\u00e2")):
        for encoding in ("latin-1", "cp1252"):
            try:
                candidate = cleaned.encode(encoding).decode("utf-8")
            except UnicodeError:
                continue
            if candidate:
                cleaned = candidate
                break
    return re.sub(r"\s+", " ", cleaned).strip()


def parse_money(value: str) -> int:
    return int(round(float(value.replace(",", ""))))


def parse_price_lines() -> dict[str, dict[str, int | str]]:
    reader = PdfReader(str(PRICE_LIST_PDF))
    items: dict[str, dict[str, int | str]] = {}

    for page in reader.pages:
        text = page.extract_text() or ""
        for raw_line in text.splitlines():
            line = re.sub(r"\s+", " ", raw_line).strip()
            match = PRICE_LINE.match(line)
            if not match:
                continue
            name = normalize(match.group("name"))
            items[name] = {
                "raw_name": repair_text(match.group("name").strip()),
                "presentation": repair_text(match.group("presentation").strip()),
                "base_price": parse_money(match.group("final")),
                "suggested_price": parse_money(match.group("suggested")),
            }

    return items


def page_lines(document: fitz.Document, page_no: int) -> list[str]:
    text = document.load_page(page_no - 1).get_text("text")
    return [repair_text(re.sub(r"\s+", " ", line).strip()) for line in text.splitlines() if line.strip()]


def lines_between(lines: list[str], start_marker: str, end_markers: tuple[str, ...]) -> list[str]:
    start_index = next((index for index, line in enumerate(lines) if start_marker in line), -1)
    if start_index == -1:
        return []

    collected: list[str] = []
    for line in lines[start_index + 1 :]:
        if any(marker in line for marker in end_markers):
            break
        if line.startswith("Pagina ") or any(snippet in line for snippet in NOISE_SNIPPETS):
            continue
        collected.append(line)
    return collected


def collapse_lines(lines: list[str]) -> str:
    return repair_text(" ".join(lines))


def parse_actives(lines: list[str]) -> list[str]:
    actives_block = lines_between(lines, "ACTIVOS", ("PRESENTACION",))
    actives: list[str] = []
    for line in actives_block:
        if line.startswith("-"):
            actives.append(repair_text(line.lstrip("- ").strip()))
        elif actives:
            actives[-1] = repair_text(f"{actives[-1]} {line}")
    return actives


def parse_presentation(lines: list[str]) -> str:
    block = lines_between(lines, "PRESENTACION", ("USO PROFESIONAL EXCLUSIVO", "Pagina "))
    block = [line for line in block if not line.startswith("Pagina ") and not any(snippet in line for snippet in NOISE_SNIPPETS)]
    return collapse_lines(block)


def parse_title_bundle(lines: list[str], product_no: str) -> tuple[str, str, list[str]]:
    marker_index = next((index for index, line in enumerate(lines) if line == product_no), -1)
    if marker_index == -1:
        raise ValueError(f"No se encontro el marcador de producto {product_no!r}.")

    title = ""
    subtitle = ""
    benefits: list[str] = []

    if marker_index + 1 < len(lines):
        title = repair_text(lines[marker_index + 1])
    if marker_index + 2 < len(lines) and not lines[marker_index + 2].startswith("+"):
        subtitle = repair_text(lines[marker_index + 2])

    for line in lines[marker_index + 2 :]:
        if line.startswith("+"):
            benefits.append(repair_text(line.lstrip("+ ").strip()))
        elif benefits:
            break

    return title, subtitle, benefits


def pick_product_xref(document: fitz.Document, page_no: int) -> int:
    page = document.load_page(page_no - 1)
    page_rect = page.rect
    candidates: list[tuple[float, int]] = []

    for image_meta in page.get_images(full=True):
        xref = int(image_meta[0])
        for rect in page.get_image_rects(xref, transform=False):
            if rect.width < 60 or rect.height < 60:
                continue
            if rect.x0 < page_rect.width * 0.6:
                continue
            if rect.y0 < 40 or rect.y1 > page_rect.height * 0.72:
                continue
            candidates.append((rect.width * rect.height, xref))

    if not candidates:
        raise ValueError(f"No se encontro imagen de producto para la pagina {page_no}.")

    return max(candidates, key=lambda item: item[0])[1]


def clean_product_cutout(product_image: Image.Image) -> Image.Image:
    width, height = product_image.size
    source_pixels = product_image.load()
    mask = Image.new("L", product_image.size)
    mask_pixels = mask.load()

    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = source_pixels[x, y]
            if red < 16 and green < 16 and blue < 16:
                mask_pixels[x, y] = 0
            elif red < 42 and green < 42 and blue < 42:
                mask_pixels[x, y] = min(alpha, 120)
            else:
                mask_pixels[x, y] = alpha

    mask = mask.filter(ImageFilter.MedianFilter(3))
    mask = mask.filter(ImageFilter.GaussianBlur(0.6))

    cleaned = product_image.copy()
    cleaned.putalpha(mask)
    cleaned_pixels = cleaned.load()
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = cleaned_pixels[x, y]
            if 0 < alpha < 220:
                lift = ((220 - alpha) / 220) * 0.62
                cleaned_pixels[x, y] = (
                    min(255, int(red + (255 - red) * lift)),
                    min(255, int(green + (255 - green) * lift)),
                    min(255, int(blue + (255 - blue) * lift)),
                    alpha,
                )

    bbox = cleaned.getbbox()
    return cleaned.crop(bbox) if bbox else cleaned


def extract_product_image(document: fitz.Document, page_no: int, slug: str) -> str:
    OUTPUT_IMAGES.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_IMAGES / f"{slug}.png"

    xref = pick_product_xref(document, page_no)
    pix = fitz.Pixmap(document, xref)
    product_image = Image.open(BytesIO(pix.tobytes("png"))).convert("RGBA")
    product_image = clean_product_cutout(product_image)

    canvas = Image.new("RGBA", (720, 720), (255, 255, 255, 0))
    draw = ImageDraw.Draw(canvas)
    panel_bounds = (72, 52, 648, 668)
    draw.rounded_rectangle(panel_bounds, radius=32, fill=(248, 239, 244, 255), outline=(224, 189, 204, 255), width=4)

    inset_width = panel_bounds[2] - panel_bounds[0] - 72
    inset_height = panel_bounds[3] - panel_bounds[1] - 72
    product_image.thumbnail((inset_width, inset_height), Image.LANCZOS)
    paste_x = panel_bounds[0] + (panel_bounds[2] - panel_bounds[0] - product_image.width) // 2
    paste_y = panel_bounds[1] + (panel_bounds[3] - panel_bounds[1] - product_image.height) // 2
    canvas.alpha_composite(product_image, (paste_x, paste_y))

    canvas.save(output_path)
    return f"assets/products/{slug}.png"


def build_catalog() -> list[dict[str, object]]:
    prices = parse_price_lines()
    vademecum = fitz.open(str(VADEMECUM_PDF))
    catalog: list[dict[str, object]] = []

    for seed in SEEDS:
        key = normalize(seed.price_name)
        if key not in prices:
            raise KeyError(f"No se encontro precio para {seed.price_name!r}.")

        price_data = prices[key]
        lines = page_lines(vademecum, seed.page_no)
        _, subtitle, benefits = parse_title_bundle(lines, seed.product_no)
        description = collapse_lines(lines_between(lines, "DESCRIPCION Y BENEFICIOS", ("MODO DE APLICACION",)))
        how_to_use = collapse_lines(lines_between(lines, "MODO DE APLICACION", ("ACTIVOS", "ACTIVOS PRINCIPALES")))
        actives = parse_actives(lines)
        presentation = parse_presentation(lines) or str(price_data["presentation"])
        image_path = extract_product_image(vademecum, seed.page_no, seed.slug)

        current_price = int(price_data["base_price"])
        suggested_price = int(price_data["suggested_price"])
        short_description = description.split(". ")[0].strip()
        if short_description and not short_description.endswith("."):
            short_description = f"{short_description}."

        catalog.append(
            {
                "id": seed.slug,
                "slug": seed.slug,
                "brand": "Biocom",
                "categoryId": seed.category_id,
                "categoryName": CATEGORIES[seed.category_id],
                "name": seed.title,
                "colorVariant": seed.color_variant,
                "presentation": str(price_data["presentation"]),
                "presentationDetail": repair_text(presentation),
                "basePrice": current_price,
                "suggestedPrice": suggested_price,
                "summary": repair_text(short_description),
                "description": repair_text(description),
                "subtitle": repair_text(subtitle),
                "howToUse": repair_text(how_to_use),
                "actives": [repair_text(active) for active in actives],
                "benefits": [repair_text(benefit) for benefit in benefits],
                "image": image_path,
                "vademecumPage": seed.page_no,
                "productNo": seed.product_no,
            }
        )

    return catalog


def write_catalog_file(catalog: list[dict[str, object]]) -> None:
    OUTPUT_DATA.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "brandOptions": [{"id": "biocom", "label": "Biocom"}],
        "categories": [{"id": key, "label": label} for key, label in CATEGORIES.items()],
        "products": catalog,
        "defaultMarkupPercent": 50,
    }
    js = "export const catalogData = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"
    OUTPUT_DATA.write_text(js, encoding="utf-8")


def main() -> None:
    catalog = build_catalog()
    write_catalog_file(catalog)
    print(f"Productos generados: {len(catalog)}")
    print(f"Data: {OUTPUT_DATA}")
    print(f"Imagenes: {OUTPUT_IMAGES}")


if __name__ == "__main__":
    main()

