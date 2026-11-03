"""Draws the NicheRadar app icon (build/icon.png + build/icon.ico). Run: python scripts/make-icon.py"""
from PIL import Image, ImageDraw

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
grad = Image.new("RGBA", (S, S))
gp = grad.load()
for y in range(S):
    for x in range(S):
        t = (x + y) / (2 * S)
        gp[x, y] = (int(255), int(122 - 45 * t), int(89 + 5 * t), 255)  # #ff7a59 -> #ff4d5e
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=230, fill=255)
img.paste(grad, (0, 0), mask)
d = ImageDraw.Draw(img)
c = S // 2
for r, a in ((304, 90), (176, 140)):
    d.ellipse((c - r, c - r, c + r, c + r), outline=(255, 255, 255, a), width=40)
d.line((c, c, c + 224, c - 224), fill="white", width=56)
d.ellipse((c - 28, c - 28, c + 28, c + 28), fill="white")
d.polygon([(c - 64, c - 104), (c + 112, c), (c - 64, c + 104)], fill="white")
d.ellipse((720 - 56, 640 - 56, 720 + 56, 640 + 56), fill="white")
img.resize((512, 512), Image.LANCZOS).save("build/icon.png")
img.save("build/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("wrote build/icon.png and build/icon.ico")
