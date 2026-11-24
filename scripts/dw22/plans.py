"""Crop each apartment plan from its PDF card and read room names, areas and label positions:  plans.py <dir with the PDFs> <out dir>
Writes <out dir>/M*.webp (copy to public/dw22/plans) and plans.json (copy to src/plans.json). Needs pdftoppm and pdftotext."""
import subprocess,re,json,sys,os
from PIL import Image
import numpy as np
D=sys.argv[1]; OUT=sys.argv[2]; os.makedirs(OUT,exist_ok=True)
DPI=200; K=DPI/72
res={}
for n in range(1,27):
    pdf=f'{D}/M{n}-KARTA-MIESZKANIA-{n}.pdf'
    subprocess.run(['pdftoppm','-r',str(DPI),'-png','-singlefile',pdf,f'{D}/r{n}'],check=True)
    im=Image.open(f'{D}/r{n}.png').convert('RGB'); a=np.asarray(im).astype(int)
    H,W=a.shape[:2]
    bb=subprocess.run(['pdftotext','-bbox',pdf,'-'],capture_output=True,text=True).stdout
    words=[(float(x0),float(y0),float(x1),float(y1),w) for x0,y0,x1,y1,w in re.findall(r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<',bb)]
    labels={}
    for i,w in enumerate(words):
        if w[4]=='Pom.' and i+1<len(words) and re.fullmatch(r'\d{3}',words[i+1][4]):
            x0,y0,x1,y1=w[0],w[1],words[i+1][2],w[3]
            box=a[int(y0*K):int(y1*K)+1,int(x0*K):int(x1*K)+1]
            dark=(box.sum(axis=2)<200).mean()
            if dark>0.03: labels.setdefault(words[i+1][4],[]).append(((x0+x1)/2*K,(y0+y1)/2*K,round(float(dark),2)))
    txt=subprocess.run(['pdftotext','-layout',pdf,'-'],capture_output=True,text=True).stdout
    rooms=[]
    for m in re.finditer(r'^\s*(\d{3})\s+(\S.*?)\s{2,}(\d+,\d+)\s*$',txt,re.M):
        rooms.append({'n':m.group(1),'name':m.group(2).strip(),'area':float(m.group(3).replace(',','.'))})
    head=re.search(r'(PARTER|\d\s*PIĘTRO)[^\n]*',txt)
    # plan bbox: non-white pixels between header rule and compass
    y0,y1=int(H*0.16),int(H*0.615)
    sub=a[y0:y1]; mask=(sub.sum(axis=2)<600)
    ys=np.where(mask.any(axis=1))[0]; xs=np.where(mask.any(axis=0))[0]
    pad=24
    cx0,cx1=max(0,xs[0]-pad),min(W,xs[-1]+pad); cy0,cy1=max(0,y0+ys[0]-pad),min(H,y0+ys[-1]+pad)
    crop=im.crop((cx0,cy0,cx1,cy1)); crop.save(f'{OUT}/M{n}.webp',quality=82,method=6)
    cw,ch=crop.size
    for r in rooms:
        ls=labels.get(r['n'],[])
        r['pts']=[[round((x-cx0)/cw,4),round((y-cy0)/ch,4)] for x,y,_ in ls]
    res[f'M{n}']={'head':head.group(0).strip() if head else '','w':cw,'h':ch,'rooms':rooms}
    print(n,res[f'M{n}']['head'],cw,ch,[(r['n'],r['name'],r['area'],len(r['pts'])) for r in rooms])
json.dump(res,open(f'{OUT}/plans.json','w'),ensure_ascii=False,indent=1)
