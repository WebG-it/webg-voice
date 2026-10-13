# Disegna le icone col marchio WebG: una cornice inclinata (come nel logo) con
# dentro le onde sonore. Uso: python scripts/icone.py   (serve Pillow)
from PIL import Image, ImageDraw
import os, math

BLU = (35, 65, 123, 255)
ARANCIO = (216, 111, 34, 255)
ROSSO = (160, 37, 43, 255)
VERDE = (72, 127, 61, 255)
GIALLO = (206, 158, 43, 255)
BIANCO = (255, 255, 255, 255)
S = 1024


def ruota(punti, ang, c):
    a = math.radians(ang)
    return [(c[0] + (x - c[0]) * math.cos(a) - (y - c[1]) * math.sin(a),
             c[1] + (x - c[0]) * math.sin(a) + (y - c[1]) * math.cos(a)) for x, y in punti]


def icona(piccola=False):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = (S / 2, S / 2)
    m = S * (0.06 if piccola else 0.12)   # margine
    sp = S * (0.14 if piccola else 0.17)  # spessore cornice
    ang = 0 if piccola else -8            # a 16 px l'inclinazione sfoca i bordi
    est = [(m, m), (S - m, m), (S - m, S - m), (m, S - m)]
    inn = [(m + sp, m + sp), (S - m - sp, m + sp), (S - m - sp, S - m - sp * 1.25), (m + sp, S - m - sp * 1.25)]
    d.polygon(ruota(est, ang, c), fill=BLU)
    d.polygon(ruota(inn, ang, c), fill=BIANCO)
    # onde: punto + due archi, centrate nella finestra bianca
    if piccola:
        cx, cy = S * 0.33, S * 0.46
        r0 = S * 0.11
        d.ellipse([cx - r0, cy - r0, cx + r0, cy + r0], fill=ARANCIO)
        r = S * 0.30
        d.arc([cx - r, cy - r, cx + r, cy + r], start=-50, end=50, fill=ARANCIO, width=int(S * 0.12))
    else:
        cx, cy = S * 0.36, S * 0.47
        r0 = S * 0.07
        d.ellipse([cx - r0, cy - r0, cx + r0, cy + r0], fill=ARANCIO)
        for r in (S * 0.19, S * 0.31):
            d.arc([cx - r, cy - r, cx + r, cy + r], start=-48, end=48, fill=ARANCIO, width=int(S * 0.075))
    return img


def salva(img, n, percorso):
    img.resize((n, n), Image.LANCZOS).save(percorso)


if __name__ == "__main__":
    qui = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(qui, "..", "src", "icone")
    os.makedirs(out, exist_ok=True)
    im = icona()
    pic = icona(piccola=True)
    for n in (16, 32, 48, 128):
        salva(pic if n <= 32 else im, n, os.path.join(out, f"icona-{n}.png"))
    store = os.path.join(qui, "..", "store", "immagini")
    os.makedirs(store, exist_ok=True)
    salva(im, 128, os.path.join(store, "icona-store-128.png"))
    # anteprima ingrandita delle misure piccole, solo per controllo a occhio
    if '--anteprima' not in __import__('sys').argv:
        print('ok'); raise SystemExit
    prova = Image.new("RGBA", (16 * 8 + 32 * 4 + 48 * 2 + 40, 140), (255, 255, 255, 255))
    x = 10
    for n, k in ((16, 8), (32, 4), (48, 2)):
        prova.paste((pic if n <= 32 else im).resize((n, n), Image.LANCZOS).resize((n * k, n * k), Image.NEAREST), (x, 5))
        x += n * k + 10
    prova.save(os.path.join(qui, "..", "dist", "anteprima-icone.png"))
    print("ok")
