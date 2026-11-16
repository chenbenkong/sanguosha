
import os
from PIL import Image, ImageDraw

REPO = r"C:\Users\cckj\Documents\deepseek-harness\default-workspace\repo"
RES = os.path.join(REPO, "android", "app", "src", "main", "res")
SRC = os.path.join(REPO, "public", "apple-touch-icon.png")

src = Image.open(SRC).convert("RGBA")
print("source:", src.size, src.mode)

DENS = {
    "mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0,
}

def ensure(d):
    p = os.path.join(RES, d)
    os.makedirs(p, exist_ok=True)
    return p

# 1) legacy square launcher icons (48dp)
for d, k in DENS.items():
    size = int(round(48 * k))
    p = ensure("mipmap-" + d)
    src.resize((size, size), Image.LANCZOS).convert("RGB").save(os.path.join(p, "ic_launcher.png"), "PNG")

# 2) legacy round launcher icons (48dp, circular mask)
for d, k in DENS.items():
    size = int(round(48 * k))
    p = ensure("mipmap-" + d)
    base = src.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask)
    out.save(os.path.join(p, "ic_launcher_round.png"), "PNG")

# 3) adaptive foreground (108dp canvas, content 60% => 安全区)
for d, k in DENS.items():
    canvas = int(round(108 * k))
    inner = int(round(canvas * 0.60))
    p = ensure("mipmap-" + d)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    art = src.resize((inner, inner), Image.LANCZOS)
    off = (canvas - inner) // 2
    out.paste(art, (off, off), art)
    out.save(os.path.join(p, "ic_launcher_foreground.png"), "PNG")

# 4) splash logo (nodpi，避免被密度缩放)
p = ensure("drawable-nodpi")
src.resize((256, 256), Image.LANCZOS).save(os.path.join(p, "splash_logo.png"), "PNG")

for root, dirs, fs in os.walk(RES):
    for f in sorted(fs):
        fp = os.path.join(root, f)
        print(os.path.relpath(fp, RES).replace("\\", "/"), os.path.getsize(fp))
