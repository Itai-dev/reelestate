"""Stitch the four nested OpenStreetMap images used by the neighbourhood zoom (run from an empty work directory)."""
import math,subprocess,os,sys
from PIL import Image
LAT,LON=50.287956,18.648251
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'../../public/dw22/map')
SIZE=1280; T=256
os.makedirs('tiles',exist_ok=True)
def stitch(z,style,name):
    n=2**z
    x=(LON+180)/360*n
    y=(1-math.asinh(math.tan(math.radians(LAT)))/math.pi)/2*n
    px,py=x*T,y*T
    x0,y0=px-SIZE/2,py-SIZE/2
    im=Image.new('RGB',(SIZE,SIZE))
    for tx in range(int(x0//T),int((x0+SIZE)//T)+1):
        for ty in range(int(y0//T),int((y0+SIZE)//T)+1):
            f=f'tiles/{style}_{z}_{tx}_{ty}.png'
            if not os.path.exists(f) or os.path.getsize(f)<100:
                subprocess.run(['curl','-sS','-m','30','-o',f,'-A','dw22-tour-demo/0.1',f'https://tile.openstreetmap.org/{z}/{tx}/{ty}.png'],check=True)
            t=Image.open(f).convert('RGB')
            im.paste(t,(int(tx*T-x0),int(ty*T-y0)))
    im.save(f'{OUT}/{name}.webp',quality=80,method=6)
for i,z in enumerate((12,14,16,18)): stitch(z,'osm',f'z{i}')
