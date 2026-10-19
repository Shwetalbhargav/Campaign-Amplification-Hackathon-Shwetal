"""Normalize captured public content; never creates campaign facts. Run after inspect-site.mjs."""
import json, re, uuid, hashlib, urllib.request, urllib.parse, time, io
import os, subprocess
if os.environ.get('WEBSITE_OWNER_PERMISSION_CONFIRMED') != 'true':
 raise SystemExit('Downloads disabled: Terms section 9 prohibits scraping. Obtain website owner permission before re-running.')
from pathlib import Path
from decimal import Decimal
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
BASE='https://campaign-one-pearl.vercel.app/'
NS=uuid.uuid5(uuid.NAMESPACE_URL,BASE)
def uid(key): return str(uuid.uuid5(NS,key))
def read(p): return json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
def write(p,value):
 target=ROOT/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def minor(value):
 if value is None:return None
 x=Decimal(str(value))*100
 if x!=x.to_integral_value():raise ValueError('Non-integral cents')
 return int(x)
pages=read('reports/raw/pages.json'); raw=read('reports/raw/public-campaigns.json')
js=(ROOT/'reports/raw/app.js').read_text(encoding='utf8');css=(ROOT/'reports/raw/styles.css').read_text(encoding='utf8')
for p in ['branding/logos','branding/icons','campaigns/covers','campaigns/stories','campaigns/advertisements','videos/campaigns','videos/advertisements','illustrations/homepage','illustrations/categories','placeholders']:
 d=ROOT/'assets'/p;d.mkdir(parents=True,exist_ok=True);(d/'.gitkeep').touch()
config=js[js.index('art:{label:'):js.index('},HB="other"')+1]
cats=[{'id':uid('category:'+slug),'name':name,'slug':slug,'description':None,'icon_name':icon,'display_order':None} for slug,name,icon in re.findall(r'(\w+):\{label:"([^"]+)",icon:"([^"]+)"',config)]
cats.sort(key=lambda c:c['name'].lower())
for n,c in enumerate(cats):c['display_order']=n
write('json/categories.json',cats)
category_ids={c['slug']:c['id'] for c in cats}
campaigns=[];stories=[];sources=[];targeting=[];creatives=[];provenance=[];campaign_assets=[];branding_assets=[];manifest=[];asset_by_url={}
for c in raw:
 cid=uid('campaign:'+c['id']);url=BASE+'campaign/'+c['slug']
 page=next(p for p in pages if p['url']==url);reach_match=re.search(r'If the campaign reaches its goal, about ([\d,]+) people',page['text']);reach_point=int(reach_match[1].replace(',','')) if reach_match else None
 campaigns.append({'id':cid,'creator_id':None,'category_id':category_ids[c['category']],'slug':c['slug'],'title':c['title'],'summary':c.get('short_description'),'creator_display_name':c.get('creator_name'),'website_id':c['id'],'source_page_url':url,'data_origin':'website_demo','is_featured':c['id'] in ['cmp-clean-water','cmp-transit-map'],'cover_asset_id':None,'funding_goal_minor':minor(c.get('funding_goal')),'amount_raised_minor':minor(c.get('funding_current')),'currency':c.get('currency','').upper() or None,'estimated_reach_min':None,'estimated_reach_max':None,'estimated_reach_point':reach_point,'duration_days':c.get('duration_days'),'status':'approved','published_at':None,'deadline_at':None,'created_at':None,'updated_at':None})
 for i,key in enumerate(['long_description','why_backers_should_care']):
  if c.get(key):stories.append({'id':uid(c['id']+':story:'+key),'campaign_id':cid,'section_type':'html','heading':None,'body':c[key],'asset_id':None,'caption':None,'image_credit':None,'display_order':i})
 for i,s in enumerate(c.get('campaign_sources',[])):
  sources.append({'id':uid(c['id']+':source:'+s),'campaign_id':cid,'title':None,'url':s,'description':None,'display_order':i})
 targeting.append({'id':uid(c['id']+':targeting'),'campaign_id':cid,'locations':[],'interests':[],'audience_characteristics':[c['target_audience']] if c.get('target_audience') else [],'distribution_channels':c.get('ad_platforms',[]),'budget_allocation':None,'duration_days':c.get('duration_days'),'created_at':None,'updated_at':None})
 provenance.append({'record_id':cid,'table':'campaigns','source_page_url':url,'source_record_id':c['id'],'evidence_file':'reports/raw/public-campaigns.json','data_origin':'website_demo','creator_identity':'Display name only; no Supabase Auth identity established','field_mapping':{'funding_goal_minor':'funding_goal * 100 (USD)','amount_raised_minor':'funding_current * 100 (USD)','status':'Approved -> approved'},'observed_funding_percentage':c.get('percent_funded'),'computed_funding_percentage':str(Decimal(c.get('funding_current',0))*100/Decimal(c['funding_goal'])),'omitted_dynamic_dates':{k:c.get(k) for k in ['created_at','createdAt','campaign_starts_at','launched_at']},'date_reason':'Website Ra() seeds timestamps relative to Date.now(); not real publication dates','omitted_demo_trust_score':c.get('trust_score'),'statistics':re.findall(r'[^<>]*\d[^<>]*',c.get('long_description','')),'statistics_verification':'Claims in website demo story, not independently verified'})

def add_asset(url,role,campaign_id=None,page_url=BASE):
 url=urllib.parse.urljoin(BASE,url)
 if url in asset_by_url:return asset_by_url[url]
 aid=uid('asset:'+url);asset_by_url[url]=aid
 parsed=urllib.parse.urlparse(url);ext=Path(parsed.path).suffix.lower() or '.img'
 folder='videos/campaigns' if ext in ['.mp4','.webm','.mov'] else 'campaigns/covers' if campaign_id else 'branding/icons' if role=='favicon' else 'illustrations/homepage'
 name='campaign-'+next(c['slug'] for c in campaigns if c['id']==campaign_id)+'-cover' if campaign_id else Path(parsed.path).stem
 local=f'assets/{folder}/{name}-{aid[:8]}{ext}'
 entry={'id':aid,'campaign_id':campaign_id,'asset_role':role,'original_source_url':url,'local_file_path':None,'proposed_storage_path':local.removeprefix('assets/'),'file_extension':ext.lstrip('.') if ext!='.img' else None,'mime_type':None,'file_size':None,'width':None,'height':None,'duration_seconds':None,'credit':None,'download_status':'pending','content_hash':None,'source_page_url':page_url,'source_page_urls':[page_url],'rights_status':'unverified','upload_permitted':False,'rights_note':'Publicly served is not a redistribution license. Obtain owner permission before app distribution or Storage upload.'}
 if parsed.netloc!=urllib.parse.urlparse(BASE).netloc:
  entry['download_status']='skipped_rights_unverified'
 else:
  try:
   time.sleep(.2)
   req=urllib.request.Request(url,headers={'User-Agent':'CampaignHackathon-DataPreparation/1.0'})
   with urllib.request.urlopen(req,timeout=25) as r:data=r.read();mime=r.headers.get_content_type()
   if not mime.startswith(('image/','video/')):raise ValueError('Non-media Content-Type: '+mime)
   (ROOT/local).write_bytes(data)
   entry.update(local_file_path=local,mime_type=mime,file_size=len(data),content_hash=hashlib.sha256(data).hexdigest(),download_status='downloaded')
   if mime.startswith('image/') and mime!='image/svg+xml':
    with Image.open(io.BytesIO(data)) as im:entry.update(width=im.width,height=im.height)
   if mime=='image/svg+xml':
    match=re.search(rb'viewBox="[\d. -]+ ([\d.]+) ([\d.]+)"',data)
    if match:entry.update(width=int(float(match[1])),height=int(float(match[2])))
   if mime.startswith('video/'):
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=width,height','-of','json',str(ROOT/local)],text=True))
    entry.update(duration_seconds=float(probe['format']['duration']),width=probe['streams'][0]['width'],height=probe['streams'][0]['height'])
  except Exception as e:entry.update(download_status='failed',error=str(e))
 manifest.append(entry)
 asset={'id':aid,'campaign_id':campaign_id,'asset_type':'svg' if ext=='.svg' else 'video' if entry['mime_type'] and entry['mime_type'].startswith('video/') else 'image','asset_role':role,'original_url':url,'storage_bucket':None,'storage_path':None,'mime_type':entry['mime_type'],'width':entry['width'],'height':entry['height'],'duration_seconds':entry['duration_seconds'],'credit':None,'created_at':None}
 (campaign_assets if campaign_id else branding_assets).append(asset)
 return aid

for c,d in zip(raw,campaigns):
 aid=add_asset(c['thumbnail_url'],'cover',d['id'],d['source_page_url']);d['cover_asset_id']=aid
 creative_asset=add_asset(c['ad_image_url'],'advertisement',d['id'],d['source_page_url']) if c.get('ad_image_url') else None
 creatives.append({'id':uid(c['id']+':creative'),'campaign_id':d['id'],'asset_id':creative_asset,'headline':c.get('ad_headline'),'primary_text':c.get('ad_primary_text'),'distribution_channel':None})
for p in pages:
 for image in p.get('images',[]):
  if image['src']:add_asset(image['src'],'illustration',page_url=p['url'])
 for bg in p.get('backgrounds',[]):
  for url in re.findall(r'url\(["\']?(.*?)["\']?\)',bg):add_asset(url,'illustration',page_url=p['url'])
 for video in p.get('videos',[]):
  if video:add_asset(video,'video',page_url=p['url'])
add_asset('/favicon.svg','favicon');add_asset('/og-image.jpg','social_preview')
for a in manifest:
 a['source_page_urls']=sorted(set([a['source_page_url']]+[p['url'] for p in pages if a['original_source_url'] in json.dumps(p.get('images',[]))+json.dumps(p.get('backgrounds',[]))]))
 a['campaign_associations']=[{'campaign_id':d['id'],'roles':[r for r,k in [('cover','thumbnail_url'),('advertisement','ad_image_url')] if urllib.parse.urljoin(BASE,c.get(k,''))==a['original_source_url']]} for c,d in zip(raw,campaigns) if any(urllib.parse.urljoin(BASE,c.get(k,''))==a['original_source_url'] for k in ['thumbnail_url','ad_image_url'])]
write('reports/media-manifest.json',manifest);write('reports/provenance.json',provenance)
for file,data in [('campaigns',campaigns),('campaign-stories',stories),('campaign-sources',sources),('campaign-assets',campaign_assets),('campaign-targeting',targeting),('advertising-creatives',creatives)]:
 write('demo/demo-'+file+'.json',data);write('json/'+file+'.json',[])
write('json/campaign-assets.json',branding_assets)
for file in ['profiles','campaign-updates','distribution-reports']:write('json/'+file+'.json',[])
for file in ['users','contributions','notifications','campaign-updates','distribution-reports']:write('demo/demo-'+file+'.json',[])
variables=dict(re.findall(r'(--ue-[\w-]+):\s*([^;}]+)',css))
write('src/constants/design-tokens.json',{'source_url':BASE,'evidence':['reports/raw/home.html','reports/raw/styles.css','reports/raw/pages.json'],'verified':True,'site_name':'Campaigns','logo_url':None,'logo_note':'Header uses text Campaigns; no separate logo image verified.','favicon_url':BASE+'favicon.svg','colors':{'primary':'#4f46e5','secondary':'#4338ca','background':'#f8fafc','dark_background':'#0b1120','text':'#0f172a','muted':'#64748b','surface':'#ffffff'},'typography':{'heading_font':'Plus Jakarta Sans','body_font':'Inter','icon_font':'Material Symbols Outlined','font_files_downloaded':False},'border_radius':{'campaign_card_px':16,'details_px':14,'back_button_px':14},'button':{'selector':'.ue216 .ue-back-btn','min_height_px':52,'font_weight':800,'font_size_px':17,'background':'#4f46e5','color':'#ffffff','border_radius_px':14},'card':{'selector':'.ue216 .ue-card','border':'1px solid var(--ue-border)','background':'#ffffff','border_radius_px':16,'shadow':variables.get('--ue-shadow')},'css_variables':variables,'computed_samples':pages[0].get('samples')})
write('json/website-metadata.json',{'site_name':'Campaigns','base_url':BASE,'extracted_on':'2026-10-19','purpose':'Community-funded advertising distribution and message amplification; not charitable donations','public_campaign_records':len(campaigns),'verified_real_campaigns':0,'website_demo_campaigns':len(campaigns),'category_count':len(cats),'campaign_dataset':'demo/demo-campaigns.json','robots':'/robots.txt returned the SPA HTML, not a robots directive file','access_method':'HTTP public HTML/CSS/JS plus anonymous Playwright rendering and the same public campaign listing fetch used by the page','provenance_file':'reports/provenance.json','media_manifest':'reports/media-manifest.json','auth_users_created':False,'missing_fields':['verified creator identity','real publication dates','fixed funding deadline','verified source titles','verified estimated reach range','measured distribution performance','copyright licenses','separate image logo'],'not_imported':['synthetic trust scores','relative runtime dates','NaN/undefined impact metrics','private/admin demo records','guest receipts','payment references'],'pages':[{'url':p['url'],'title':p.get('title'),'text_snapshot':'reports/raw/pages.json'} for p in pages]})
print(json.dumps({'campaigns':len(campaigns),'categories':len(cats),'downloaded':sum(a['download_status']=='downloaded' for a in manifest),'manifest_assets':len(manifest)}))
