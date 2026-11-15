"""M6: preserve original archives; add WS2M/PS and build 2021–2025 soil weather.
Default is offline. --fetch downloads missing supplemental archives only.
--check verifies derived files without writing. Standard library only.
"""
import argparse
import datetime as dt
import gzip
import hashlib
import json
import math
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
UNITS = {'PRECTOTCORR':'mm/day','T2M_MAX':'C','T2M_MIN':'C','RH2M':'%',
         'ALLSKY_SFC_SW_DWN':'MJ/m^2/day','GWETROOT':'1','WS2M':'m/s','PS':'kPa'}
BOUNDS = {'PRECTOTCORR':(0,2000),'T2M_MAX':(-90,65),'T2M_MIN':(-90,65),
          'RH2M':(0,100),'ALLSKY_SFC_SW_DWN':(0,60),'GWETROOT':(0,1),'WS2M':(0,100),'PS':(40,110)}
START, END = dt.date(2021,1,1), dt.date(2025,12,31)
DATES = [(START + dt.timedelta(days=i)).strftime('%Y%m%d') for i in range((END-START).days+1)]


def build(farm, fetch=False):
    folder = ROOT / 'public/data' / farm['id']
    extra = folder / 'soil-weather-raw/2021-2025-wind-pressure.json.gz'
    url = ('https://power.larc.nasa.gov/api/temporal/daily/point?parameters=WS2M,PS&community=AG'
           f'&longitude={farm["longitude"]}&latitude={farm["latitude"]}&start=20210101&end=20251231&format=JSON')
    if not extra.exists() and fetch:
        with urlopen(url, timeout=60) as response:
            payload = json.load(response)
        # Validate before preserving any new archive.
        if payload.get('header',{}).get('time_standard') != 'LST':
            raise ValueError('Invalid supplemental response')
        envelope = {'farm':farm,'url':url,'retrieved_at':dt.datetime.now(dt.timezone.utc).isoformat(),'response':payload}
        extra.parent.mkdir(parents=True,exist_ok=True)
        extra.write_bytes(gzip.compress(json.dumps(envelope).encode(),mtime=0))
    original = folder / 'raw/2021-2025.json.gz'
    archives = [original, extra]
    series, sources, elevation = {}, [], None
    for path in archives:
        envelope = json.loads(gzip.decompress(path.read_bytes()))
        if envelope['farm'] != farm: raise ValueError('Farm mismatch')
        response = envelope['response']
        coords = response['geometry']['coordinates']
        if abs(coords[0]-farm['longitude']) > .001 or abs(coords[1]-farm['latitude']) > .001:
            raise ValueError('Response coordinates do not match requested farm')
        elevation = coords[2]
        if response['header']['time_standard'] != 'LST' or response['header']['fill_value'] != -999:
            raise ValueError('Unexpected time standard or fill')
        expected = ['WS2M','PS'] if path == extra else list(UNITS)[:6]
        for key in expected:
            if response['parameters'][key]['units'] != UNITS[key]: raise ValueError(f'Bad units: {key}')
            raw = response['properties']['parameter'][key]
            if set(raw) != set(DATES): raise ValueError(f'Date mismatch: {key}')
            column = []
            for date in DATES:
                v = raw[date]
                if isinstance(v,bool) or not isinstance(v,(float,int)) or not math.isfinite(v): raise ValueError('Invalid number')
                if v == -999: column.append(None)
                elif not BOUNDS[key][0] <= v <= BOUNDS[key][1]: raise ValueError(f'Out of bounds: {key}')
                else: column.append(v)
            series[key] = column
        sources.append({'path':str(path.relative_to(ROOT / 'public')),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'url':envelope['url'],'retrieved_at':envelope['retrieved_at']})
    if any(a is not None and b is not None and a>b for a,b in zip(series['T2M_MIN'],series['T2M_MAX'])):
        raise ValueError('Minimum exceeds maximum')
    document = {'schema':'field-shift-soil-weather','schema_version':1,'farm':farm,'start':str(START),'end':str(END),
                'time_standard':'LST','elevation_m':elevation,'units':UNITS,'days':len(DATES),'series':series,'sources':sources}
    canonical = json.dumps({'farm':farm,'start':str(START),'end':str(END),'elevation_m':elevation,'series':series},sort_keys=True,separators=(',',':'))
    document['fingerprint'] = hashlib.sha256(canonical.encode()).hexdigest()
    return document

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--fetch',action='store_true');parser.add_argument('--check',action='store_true');args=parser.parse_args()
    for farm in json.loads((ROOT/'src/config/config.json').read_text())['farms']:
        data=build(farm,args.fetch);path=ROOT/'public/data'/farm['id']/'soil-weather.json'
        if args.check:
            if json.loads(path.read_text()) != data: raise SystemExit(f'{farm["id"]}: mismatch')
        else: path.write_text(json.dumps(data,separators=(',',':'))+'\n')
        print(f'{farm["id"]}: {data["days"]} daily records, missing: '+str({k:v.count(None) for k,v in data['series'].items()}))
