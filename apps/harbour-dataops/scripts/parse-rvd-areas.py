"""Extract the bilingual HKPR 2015 area appendix using Poppler word positions."""
import argparse,hashlib,json,re,subprocess,tempfile,xml.etree.ElementTree as E
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('pdf');p.add_argument('output');a=p.parse_args()
if hashlib.sha256(Path(a.pdf).read_bytes()).hexdigest() != '57ef417c228533aa74b5a1d1c4c25165ad59fd9e1df2786648517bbbacde6363':raise ValueError('Unrecognised PDF: this parser is pinned to the HKPR 2015 appendix.')
ns={'x':'http://www.w3.org/1999/xhtml'}
with tempfile.TemporaryDirectory() as d:
 xml=Path(d)/'words.xml';subprocess.run(['pdftotext','-bbox-layout',a.pdf,str(xml)],check=True);pages=E.parse(xml).findall('.//x:page',ns)
# Publisher table rows; codes are curated labels, not publisher identifiers.
districts=[('HK','CW','中西區','Central and Western'),('HK','WC','灣仔','Wan Chai'),('HK','EST','東區','Eastern'),('HK','STH','南區','Southern'),('KL','YTM','油尖旺','Yau Tsim Mong'),('KL','SSP','深水埗','Sham Shui Po'),('KL','KLC','九龍城','Kowloon City'),('KL','WTS','黃大仙','Wong Tai Sin'),('KL','KT','觀塘','Kwun Tong'),('NT','KTS','葵青','Kwai Tsing'),('NT','TW','荃灣','Tsuen Wan'),('NT','TM','屯門','Tuen Mun'),('NT','YL','元朗','Yuen Long'),('NT','NTH','北區','North'),('NT','TP','大埔','Tai Po'),('NT','ST','沙田','Sha Tin'),('NT','SK','西貢','Sai Kung'),('NT','ILD','離島','Islands')]
records=[]
for page_no,page in enumerate(pages,1):
 words=[(float(w.get('xMin')),float(w.get('yMin')),w.text or '') for w in page.findall('.//x:word',ns)]
 zhx=next(x for x,y,t in words if t=='地區內的分區名稱');enx=next(x for x,y,t in words if t=='Names');tpux=next(x for x,y,t in words if t=='Tertiary')
 starts=[]
 for area,code,zh,en in districts:
  hits=[y for x,y,t in words if t==zh and 90<x<zhx-5 and y>170]
  if hits:starts.append((min(hits),area,code,zh,en))
 starts.sort()
 def extract(x0,x1,y0,y1,joiner=' '):
  selected=sorted([(round(y),x,t) for x,y,t in words if x0-1<=x<x1-1 and y0-3<=y<y1-3]);return joiner.join(t for y,x,t in selected)
 for i,(y,area,code,zh,en) in enumerate(starts):
  end=starts[i+1][0] if i+1<len(starts) else (460 if page_no==4 else 720)
  rawzh=extract(zhx,enx,y,end,'');rawen=extract(enx,tpux,y,end);rawtpu=extract(tpux,600,y,end)
  # PDF embeds expanded Latin letter spacing in this one line.
  rawen=rawen.replace('Ya u Ya t Ts u e n','Yau Yat Tsuen').replace('Ta i Wo Pi n g','Tai Wo Ping')
  zn=[s for s in rawzh.split('、') if s];en_names=[s.strip() for s in rawen.split(',') if s.strip()]
  # Tung Chung is an explicitly nested entry, not a fifth peer island.
  zn=[s.replace('（包括東涌）','') for s in zn];en_names=[s.replace('(including Tung Chung)','').strip() for s in en_names]
  if len(zn)!=len(en_names):raise ValueError((code,zn,en_names))
  base=f'RVD:HKPR2015:p{page_no}:district-{code}'
  records.append(dict(sourceRecordId=base,kind='district',page=page_no,areaCode=area,districtCode=code,names={'en':en,'zh-hant':zh},tertiaryPlanningUnits=[s.strip() for s in rawtpu.split(',')],rawNames={'en':rawen,'zh-hant':rawzh}))
  for ordinal,(zhname,enname) in enumerate(zip(zn,en_names),1):
   records.append(dict(sourceRecordId=f'{base}:subdistrict-{ordinal}',kind='subdistrict',page=page_no,areaCode=area,districtCode=code,names={'en':enname,'zh-hant':zhname}))
   if enname=='Lantau Island':records.append(dict(sourceRecordId=f'{base}:subdistrict-{ordinal}:included-1',kind='included-locality',page=page_no,areaCode=area,districtCode=code,names={'en':'Tung Chung','zh-hant':'東涌'},includedIn=f'{base}:subdistrict-{ordinal}'))
if sum(r['kind']=='district' for r in records)!=18:raise ValueError('Expected 18 districts')
for code,en,zh,page in [('HK','Hong Kong','港島',1),('KL','Kowloon','九龍',1),('NT','New Territories','新界',2)]:records.append(dict(sourceRecordId=f'RVD:HKPR2015:area-{code}',kind='area',page=page,areaCode=code,names={'en':en,'zh-hant':zh}))
result=dict(schemaVersion=1,publisher='hkgov-rvd',publication='Hong Kong Property Review 2015',section='Areas and Districts',sourceUrl='https://www.rvd.gov.hk/doc/tc/hkpr15/06.pdf',publishedAt='2015-04-30',publicationEvidence='https://www.info.gov.hk/gia/general/201504/30/P201504300318.htm',pdfCreatedAt='2015-04-21T09:56:36+08:00',pdfModifiedAt='2015-04-27T15:38:52+08:00',sha256=hashlib.sha256(Path(a.pdf).read_bytes()).hexdigest(),excludedSections=['Office Sub-districts (separate classification; not area membership)'],records=records)
Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(f'{len(records)} records')
