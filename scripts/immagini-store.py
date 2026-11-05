# Prepara le immagini della scheda store in store/immagini/:
#  - screenshot-1..6.png (1280x800) dalle catture headless di test/e2e/catture-store.mjs
#  - tile-440x280.png (riquadro promozionale piccolo)
# Uso: python scripts/immagini-store.py <cartella con le catture>
# Serve Pillow. Le catture vengono da Chrome headless, con pagine d'esempio inventate.
import os
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

QUI = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(QUI, "..", "store", "immagini")
# colori del marchio (cornici WebG), come in src/tema.css
BLU = (38, 75, 147)
VERDE = (52, 125, 62)
ROSSO = (178, 48, 44)
GIALLO = (231, 183, 41)
ARANCIO = (219, 113, 35)
CORNICI = [ROSSO, VERDE, GIALLO, BLU, ARANCIO]
SFONDO = (246, 247, 251)
TESTO = (31, 36, 52)
TENUE = (88, 96, 116)


def font(dim, grassetto=False):
    nomi = (["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"] if grassetto
            else ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"])
    cartelle = [os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Fonts"), "/usr/share/fonts/truetype/dejavu"]
    for c in cartelle:
        for n in nomi:
            p = os.path.join(c, n)
            if os.path.exists(p):
                return ImageFont.truetype(p, dim)
    return ImageFont.load_default()


def cornice(lato, colore, angolo, spessore=None, fondo=SFONDO):
    """Quadrato inclinato con il bordo colorato, come nel marchio."""
    s = spessore or max(3, lato // 8)
    im = Image.new("RGBA", (lato * 4, lato * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, lato * 4 - 1, lato * 4 - 1], lato // 2, fill=colore + (255,))
    d.rounded_rectangle([s * 4, s * 4, lato * 4 - 1 - s * 4, lato * 4 - 1 - s * 4], lato // 3, fill=fondo + (255,))
    im = im.resize((lato, lato), Image.LANCZOS)
    return im.rotate(angolo, expand=True, resample=Image.BICUBIC)


def ombra_e_incolla(base, img, x, y, raggio=12):
    base = base.convert("RGBA")
    o = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(o).rounded_rectangle([x + 2, y + 8, x + img.width + 2, y + img.height + 8], raggio, fill=(20, 24, 40, 80))
    base = Image.alpha_composite(base, o.filter(ImageFilter.GaussianBlur(14)))
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.width - 1, img.height - 1], raggio, fill=255)
    base.paste(img.convert("RGB"), (x, y), m)
    return base.convert("RGB")


def pannello(src, nome, altezza_max=None, scala=0.5):
    """Il pannello catturato a doppia densita', riportato a 1x (o alla scala chiesta)."""
    im = Image.open(os.path.join(src, nome)).convert("RGB")
    if altezza_max:
        im = im.crop((0, 0, im.width, min(im.height, altezza_max)))
    return im.resize((round(im.width * scala), round(im.height * scala)), Image.LANCZOS)


def pagina_con_pannello(src, pagina, nome_pannello, altezza_max=None, y=12):
    base = Image.open(os.path.join(src, pagina)).convert("RGB")
    pop = pannello(src, nome_pannello, altezza_max)
    return ombra_e_incolla(base, pop, base.width - pop.width - 24, y)


def tre_funzioni(src):
    """Il pannello in grande a destra, a sinistra cosa fa in tre righe."""
    im = Image.new("RGB", (1280, 800), SFONDO)
    d = ImageDraw.Draw(im)
    for i, c in enumerate(CORNICI):
        cr = cornice(34, c, [-8, 6, -4, 7, -6][i])
        im.paste(cr, (96 + i * 50, 96 + [0, -4, -6, -4, 0][i]), cr)
    d.text((92, 168), "Leggi, detta,", font=font(54, True), fill=TESTO)
    d.text((92, 232), "trascrivi.", font=font(54, True), fill=TESTO)
    d.text((94, 312), "In italiano, tutto sul tuo computer.", font=font(24), fill=TENUE)
    righe = [
        (BLU, "Leggi", "Alt+Q legge la selezione o l'articolo"),
        (VERDE, "Detta", "tieni premuto Ctrl+Spazio e parla"),
        (ROSSO, "Trascrivi la call", "Meet, Teams, Zoom nel browser"),
    ]
    y = 400
    for colore, titolo, testo in righe:
        cr = cornice(30, colore, -5, fondo=SFONDO)
        im.paste(cr, (94, y + 4), cr)
        d.text((146, y - 2), titolo, font=font(24, True), fill=TESTO)
        d.text((146, y + 30), testo, font=font(19), fill=TENUE)
        y += 86
    d.text((94, 680), "Niente account, niente abbonamento. Gratis.", font=font(18), fill=TENUE)
    pop = pannello(src, "pannello-riposo.png", scala=0.74)
    return ombra_e_incolla(im, pop, 1280 - pop.width - 96, (800 - pop.height) // 2, 16)


def tile():
    w, h = 440, 280
    im = Image.new("RGB", (w, h), SFONDO)
    d = ImageDraw.Draw(im)
    for i, c in enumerate(CORNICI):
        cr = cornice(34, c, [-8, 6, -4, 7, -6][i])
        im.paste(cr, (34 + i * 46, 34 + [0, -3, -5, -3, 0][i]), cr)
    d.text((32, 98), "WebG Voice", font=font(44, True), fill=TESTO)
    d.text((34, 160), "Leggi · Detta · Trascrivi", font=font(22, True), fill=BLU)
    d.text((34, 198), "In italiano, sul tuo computer.", font=font(18), fill=TENUE)
    d.text((34, 224), "Gratis, anche offline.", font=font(18), fill=TENUE)
    return im


if __name__ == "__main__":
    src = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    immagini = [
        pagina_con_pannello(src, "pagina-lettura.png", "pannello-lettura.png"),
        tre_funzioni(src),
        Image.open(os.path.join(src, "pagina-dettatura.png")).convert("RGB"),
        # il pannello della call tagliato sotto "Esporta come"
        pagina_con_pannello(src, "pagina-call.png", "pannello-call.png", y=150),
        Image.open(os.path.join(src, "benvenuto.png")).convert("RGB"),
        Image.open(os.path.join(src, "opzioni-scuro.png")).convert("RGB"),
    ]
    for i, im in enumerate(immagini, 1):
        assert im.size == (1280, 800), (i, im.size)
        im.save(os.path.join(OUT, f"screenshot-{i}.png"), optimize=True)
    tile().save(os.path.join(OUT, "tile-440x280.png"), optimize=True)
    print("immagini dello store pronte in store/immagini/")
