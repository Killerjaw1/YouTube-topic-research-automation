"""Draws the NicheRadar app icon (build/icon.png + build/icon.ico) to match src/renderer/public/logo.svg.
Run: python scripts/make-icon.py  (needs Pillow)"""
from PIL import Image, ImageDraw

S = 1024
u = S / 32  # logo.svg uses a 32-unit grid
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(8 * u), fill=(59, 110, 240, 255))
w = int(2.4 * u)

def arc(r, alpha):
    c = 16 * u
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(layer).arc((c - r * u, c - r * u, c + r * u, c + r * u), start=135, end=315, fill=(255, 255, 255, alpha), width=w)
    img.alpha_composite(layer)

arc(10.6, 140)
arc(5.4, 205)
d = ImageDraw.Draw(img)
d.line((16 * u, 16 * u, 23.5 * u, 8.5 * u), fill="white", width=w)
for (x, y) in ((16, 16), (23.5, 8.5)):
    d.ellipse(((x * u) - w / 2, (y * u) - w / 2, (x * u) + w / 2, (y * u) + w / 2), fill="white")
d.ellipse((16 * u - 2.6 * u, 16 * u - 2.6 * u, 16 * u + 2.6 * u, 16 * u + 2.6 * u), fill="white")
img.resize((512, 512), Image.LANCZOS).save("build/icon.png")
img.save("build/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("wrote build/icon.png and build/icon.ico")
