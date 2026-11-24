"""Read the apartment table from a saved copy of dw22.pl/dw22/:  extract.py site.html src/flats.json"""
import re,json,sys
h=open(sys.argv[1],encoding='utf8').read()
flats=[]
for r in re.findall(r'<tr class="tr_[a-z]+" data-id="M\d+">.*?</tr>',h,flags=re.S):
    g=lambda c:re.search(r'<td class="table-%s[^>]*?(?:data-order="([^"]*)")?[^>]*>(.*?)</td>'%c,r,re.S)
    tds=re.findall(r'<td class="([^"]+)"([^>]*)>(.*?)</td>',r,re.S)
    f={'id':re.search(r'data-id="(M\d+)"',r).group(1)}
    nums=[]
    for cls,attr,body in tds:
        o=re.search(r'data-order="([^"]*)"',attr); s=re.search(r'data-search="([^"]*)"',attr)
        txt=re.sub(r'<[^>]+>','',body).strip()
        if 'table-typ' in cls: f['type']=o.group(1)
        elif 'table-pietro' in cls: f['floor']=int(o.group(1))
        elif 'table-pokoje' in cls: f['rooms']=int(o.group(1))
        elif 'table-number' in cls and o: nums.append(float(o.group(1)))
        elif 'table-number' in cls and s: f['extra']=txt; f['extraKind']=s.group(1)
        elif 'table-text' in cls and s: f['status']=s.group(1)
        elif 'table-price' in cls: f['price']=txt
    f['area']=nums[0]; f['outdoor']=nums[1] if len(nums)>1 else None
    flats.append(f)
json.dump(flats,open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
for f in flats: print(f)
