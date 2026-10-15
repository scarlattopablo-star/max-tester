# Arma UNA sola imagen con los 5 colores disponibles (correcciones de Rodrigo, 14 oct 2026):
# en vez de mandar una foto por color, Max manda public/colores/colores.jpg.
# Las muestras son las fotos REALES de public/capitoneado/.
#
#   python3 armar_colores.py
import os
from PIL import Image, ImageDraw, ImageFont, ImageOps

AQUI = os.path.dirname(os.path.abspath(__file__))
MUESTRAS = os.path.join(AQUI, "public", "capitoneado")
SALIDA = os.path.join(AQUI, "public", "colores", "colores.jpg")
FONTS = os.path.join(AQUI, "..", "instagram_disenos", "fonts")

# color -> (archivo, recorte relativo x0, y0, lado) para quedarse con el material sin el piso
COLORES = [
    ("ROJO", "rojo.jpg", (0.08, 0.20, 0.84)),
    ("AZUL", "negro-azul.jpg", (0.08, 0.22, 0.84)),
    ("OCRE", "negro-naranja.jpg", (0.12, 0.15, 0.58)),
    ("GRIS", "negro-blanco.jpg", (0.06, 0.20, 0.84)),
    ("NEGRO", "negro.jpg", (0.08, 0.20, 0.84)),
]
W, H = 1200, 1400
LADO, GAP, MARGEN = 340, 40, 60
FONDO, ROJO, BLANCO, GRIS = (13, 13, 16), (200, 30, 30), (255, 255, 255), (190, 190, 190)


def fuente(nombre, tam):
    try:
        return ImageFont.truetype(os.path.join(FONTS, nombre), tam)
    except OSError:
        return ImageFont.load_default()


def recorte(archivo, x0, y0, lado):
    im = ImageOps.exif_transpose(Image.open(os.path.join(MUESTRAS, archivo))).convert("RGB")
    s = int(im.width * lado)
    x, y = int(im.width * x0), int(im.height * y0)
    return im.crop((x, y, x + s, y + s)).resize((LADO, LADO), Image.LANCZOS)


def centrado(d, y, txt, f, col):
    w = d.textlength(txt, font=f)
    d.text(((W - w) / 2, y), txt, font=f, fill=col)


def main():
    im = Image.new("RGB", (W, H), FONDO)
    d = ImageDraw.Draw(im)
    centrado(d, 70, "COLORES DISPONIBLES", fuente("BebasNeue-Regular.ttf", 110), BLANCO)
    d.rectangle(((W - 180) / 2, 200, (W + 180) / 2, 206), fill=ROJO)
    centrado(d, 228, "Rojo · Azul · Ocre · Gris · Negro", fuente("Montserrat-SemiBold.ttf", 38), GRIS)
    etiqueta = fuente("BebasNeue-Regular.ttf", 64)
    # 3 arriba y 2 abajo, centrados
    filas = [COLORES[:3], COLORES[3:]]
    y = 330
    for fila in filas:
        ancho = len(fila) * LADO + (len(fila) - 1) * GAP
        x = (W - ancho) // 2
        for nombre, archivo, (x0, y0, lado) in fila:
            muestra = recorte(archivo, x0, y0, lado)
            d.rounded_rectangle((x - 4, y - 4, x + LADO + 4, y + LADO + 4), radius=18, fill=(40, 40, 46))
            mascara = Image.new("L", (LADO, LADO), 0)
            ImageDraw.Draw(mascara).rounded_rectangle((0, 0, LADO, LADO), radius=16, fill=255)
            im.paste(muestra, (x, y), mascara)
            w = d.textlength(nombre, font=etiqueta)
            d.text((x + (LADO - w) / 2, y + LADO + 14), nombre, font=etiqueta, fill=BLANCO)
            x += LADO + GAP
        y += LADO + 120
    centrado(d, H - 70, "La Casa del Cubreasiento", fuente("Montserrat-Bold.ttf", 34), ROJO)
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    im.save(SALIDA, quality=88)
    print("->", SALIDA)


if __name__ == "__main__":
    main()
