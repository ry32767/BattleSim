#!/usr/bin/env python3
"""Validate the audit bundle; this does not test a game implementation."""
from pathlib import Path
import json,re,hashlib,csv
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
def read(name):return json.loads((ROOT/'data'/name).read_text())
chars=read('characters.json');weapons=read('weapons.json');teams=read('teams.json');pools=read('help-pools.json')
assert len(chars)==64 and len({c['name'] for c in chars})==64
assert len(teams)==11 and all(len(t['members'])==4 for t in teams)
assert len(pools['I'])==4 and len(pools['II'])==7 and len(pools['III'])==9
assert set(t for team in teams for t in team['members'])|set(n for p in pools.values() for n in p)=={c['name'] for c in chars}
assert sum(c['group'].endswith('番隊') for c in chars)==44
assert len(weapons)==41 and len({w['name'] for w in weapons})==41
names={w['name'] for w in weapons}|{'FreeTrigger'}
for c in chars:
 assert c['simulation_loadout'] is None and c['skills_complete'] is False
 assert len(c['normal_loadout']['main'])==len(c['normal_loadout']['sub'])==4
 assert all(x in names for side in c['normal_loadout'].values() for x in side)
 assert all(c['simulation_stats_status'][k]==('secondary-summary' if v is not None else 'unconfirmed') for k,v in c['simulation_stats'].items())
 assert c['sources']['character'].startswith('https://w.atwiki.jp/')
for w in weapons:
 assert not w['runtime_enabled'] and all(v is None for v in w['simulation_values'].values())
 owners={c['name'] for c in chars if any(w['name'] in side for side in c['normal_loadout'].values())}
 assert owners==set(w['normal_owners'])
known=sum(v is not None for c in chars for v in c['simulation_stats'].values())
assert known==53
assert len(read('skills-index.json'))==55
for obs in read('weapon-row-observations.json'):
 assert obs['weapon_name'] is None and not obs['allowed_runtime_binding']
for obs in read('range-observations.json'):assert obs['weapon_binding'] is None and not obs['allowed_runtime_binding']
for item in read('reference-images.json'):
 path=ROOT/'docs'/'images'/item['file']
 assert hashlib.sha256(path.read_bytes()).hexdigest()==item['sha256'] and item['edited'] is False
for path in ROOT.rglob('*.md'):
 for target in re.findall(r'\]\(([^)]+)\)',path.read_text()):
  if target.startswith(('http:','https:','#')):continue
  assert (path.parent/target.split('#')[0]).exists(),(path,target)
for filename,count in [('characters.csv',64),('weapons.csv',41)]:
 with (ROOT/'data'/filename).open(encoding='utf-8-sig',newline='') as f:assert len(list(csv.DictReader(f)))==count
html=ROOT/'仕様書.html'
if html.exists():
 text=html.read_text();assert text.count('data:image/jpeg;base64,')>=3
 assert not re.search(r'<img[^>]+src="https?://',text)
 assert all('id="'+sec+'"' in text for sec in ['spec','visual','characters','weapons','sources'])
print('PASS: 64 characters, 41 loadout variants, 55 skill names, 53 known stat fields, image hashes, CSV and local links')
