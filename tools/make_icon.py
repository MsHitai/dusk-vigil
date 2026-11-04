"""Renders the launcher icon (vampire hunter under a blood moon) into android/res/mipmap-*/ic_launcher.png."""
import os
from PIL import Image, ImageDraw

KNIGHT = [
    '......rr........',
    '.....rkkkk......',
    '....kssssdk.....',
    '....ksssssdk....',
    '....kskkkkdk....',
    '....ksssssdk..w.',
    '.....kddddk..kwk',
    '....kbbybbbk.kwk',
    '...kbbbybbbbkkwk',
    '..kskbbybbbkskyk',
    '..kskBBBBBBkskk.',
    '...kkBBBBBBkkk..',
    '....kdddddk.....',
    '....kdk.kdk.....',
    '...kddk.kddk....',
    '...kkkk.kkkk....',
]
PAL = {'k': '#1b1424', 's': '#c4ccd8', 'd': '#6b7385', 'b': '#3b6fd1', 'B': '#24438a',
       'y': '#e8c547', 'w': '#eef4fa', 'r': '#d04040'}
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}

root = os.path.join(os.path.dirname(__file__), '..', 'android', 'res')

# Draw at 24x24 "pixels" (sprite plus a stone frame), then scale up with nearest-neighbour.
base = Image.new('RGBA', (24, 24), (0, 0, 0, 0))
d = ImageDraw.Draw(base)
d.rounded_rectangle([0, 0, 23, 23], radius=4, fill='#1b1424')
d.rounded_rectangle([1, 1, 22, 22], radius=3, fill='#5a1a26')
d.rectangle([2, 2, 21, 21], fill='#160f20')
d.ellipse([12, 2, 20, 10], fill='#c8283c')  # blood moon
d.ellipse([14, 3, 19, 8], fill='#e04050')
d.rectangle([2, 18, 21, 21], fill='#1f2a1c')  # forest floor
d.ellipse([5, 17, 18, 21], fill='#141c12')
for y, row in enumerate(KNIGHT):
    for x, ch in enumerate(row):
        if ch in PAL:
            base.putpixel((x + 4, y + 4), Image.new('RGB', (1, 1), PAL[ch]).getpixel((0, 0)) + (255,))

for name, size in SIZES.items():
    out = os.path.join(root, 'mipmap-' + name)
    os.makedirs(out, exist_ok=True)
    base.resize((size, size), Image.NEAREST).save(os.path.join(out, 'ic_launcher.png'))
base.resize((512, 512), Image.NEAREST).save(os.path.join(root, '..', 'icon-512.png'))
print('icons written')
