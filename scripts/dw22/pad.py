# Frame extension, step 1 (run per frame before sending the canvas to the image model)
"""pad.py <frame.webp> <out.jpg>: put a 2000x1600 frame on a 2000x2000 canvas (300 px above, 100 below), bands pre-filled with a blurred stretch of the nearest edge."""
import sys
from PIL import Image, ImageFilter
TOP, BOT = 300, 100
f = Image.open(sys.argv[1]).convert('RGB')
c = Image.new('RGB', (2000, 2000))
top = f.crop((0, 0, 2000, 120)).resize((2000, TOP)).transpose(Image.FLIP_TOP_BOTTOM).filter(ImageFilter.GaussianBlur(40))
bot = f.crop((0, 1500, 2000, 1600)).resize((2000, BOT)).transpose(Image.FLIP_TOP_BOTTOM).filter(ImageFilter.GaussianBlur(40))
c.paste(top, (0, 0)); c.paste(f, (0, TOP)); c.paste(bot, (0, TOP + 1600))
c.save(sys.argv[2], quality=93)
