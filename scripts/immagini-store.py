# Prepara le immagini della scheda store in store/immagini/:
#  - screenshot-1..5.png (1280x800) dalle catture headless della prova end-to-end
#  - tile-440x280.png (tile promozionale piccola)
# Uso: python scripts/immagini-store.py <cartella con le catture>
# Serve Pillow. Le catture vengono da test/e2e (Chrome headless, pagina d'esempio inventata).
import os
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

QUI = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(QUI, "..", "store", "immagini")
BLU = (35, 65, 123)
ARANCIO = (216, 111, 34)
COLORI = [(160, 37, 43), (72, 127, 61), (206, 158, 43), BLU, ARANCIO]


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


def con_popup(pagina, popup):
    """Pagina 1280x800 con il popup appoggiato in alto a destra, con ombra."""
    base = Image.open(pagina).convert("RGBA")
    pop = Image.open(popup).convert("RGBA")
    x, y = base.width - pop.width - 24, 12
    ombra = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(ombra).rounded_rectangle([x + 2, y + 6, x + pop.width + 2, y + pop.height + 6], 10, fill=(0, 0, 0, 90))
    base = Image.alpha_composite(base, ombra.filter(ImageFilter.GaussianBlur(10)))
    maschera = Image.new("L", pop.size, 0)
    ImageDraw.Draw(maschera).rounded_rectangle([0, 0, pop.width - 1, pop.height - 1], 10, fill=255)
    base.paste(pop, (x, y), maschera)
    return base.convert("RGB")


def tile():
    w, h = 440, 280
    im = Image.new("RGB", (w, h), (250, 249, 246))
    d = ImageDraw.Draw(im)
    # cinque cornici inclinate, come nel marchio
    for i, c in enumerate(COLORI):
        cx, cy, s = 52 + i * 84, 70, 54
        cornice = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        dc = ImageDraw.Draw(cornice)
        dc.rectangle([0, 0, s - 1, s - 1], fill=c + (255,))
        dc.rectangle([9, 9, s - 10, s - 14], fill=(250, 249, 246, 255))
        cornice = cornice.rotate([-8, 6, -4, 7, -6][i], expand=True, resample=Image.BICUBIC)
        im.paste(cornice, (int(cx - cornice.width / 2), int(cy - cornice.height / 2)), cornice)
    icona = Image.open(os.path.join(QUI, "..", "src", "icone", "icona-128.png")).convert("RGBA").resize((72, 72), Image.LANCZOS)
    im.paste(icona, (28, 150), icona)
    d.text((114, 150), "WebG Voice", font=font(38, True), fill=BLU)
    d.text((116, 198), "Legge ad alta voce in italiano.", font=font(18), fill=(60, 60, 64))
    d.text((116, 222), "Gratis, sul tuo computer, offline.", font=font(18), fill=(60, 60, 64))
    return im


if __name__ == "__main__":
    src = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    scatti = [
        ("store-1-lettura.png", None),
        ("store-1-lettura.png", "store-popup.png"),
        ("download.png", None),
        ("store-4-scuro.png", None),
        ("store-5-opzioni.png", None),
    ]
    for i, (pag, pop) in enumerate(scatti, 1):
        p = os.path.join(src, pag)
        im = con_popup(p, os.path.join(src, pop)) if pop else Image.open(p).convert("RGB")
        assert im.size == (1280, 800), (pag, im.size)
        im.save(os.path.join(OUT, f"screenshot-{i}.png"))
    tile().save(os.path.join(OUT, "tile-440x280.png"))
    print("immagini dello store pronte in store/immagini/")
