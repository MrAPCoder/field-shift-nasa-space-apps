"""Read-only NRCS SDA point query. No third-party dependencies or inferred soil values.
Run normally to acquire; --offline reconstructs from saved request receipts.
Failed requests are archived and produce explicit unavailable records (exit 1).
"""
import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = 'https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest'
COLUMNS = ['mukey', 'muname', 'areasymbol', 'saversion', 'saverest', 'cokey',
           'compname', 'comppct_r', 'drainagecl', 'slope_r', 'chkey', 'hzname',
           'hzdept_r', 'hzdepb_r', 'awc_l', 'awc_r', 'awc_h', 'om_r', 'ph1to1h2o_r', 'texture']
NUMERIC = {'comppct_r': (0, 100), 'slope_r': (0, 1000), 'hzdept_r': (0, 10000),
           'hzdepb_r': (0, 10000), 'awc_l': (0, 1), 'awc_r': (0, 1),
           'awc_h': (0, 1), 'om_r': (0, 100), 'ph1to1h2o_r': (0, 14)}
UNITS = {'depth': 'cm', 'available_water_capacity': 'cm water / cm soil',
         'organic_matter': '% by weight', 'slope': '%', 'component_share': '%', 'pH': '1:1 water'}


def query(farm):
    lon, lat = float(farm['longitude']), float(farm['latitude'])
    if not math.isfinite(lon) or not math.isfinite(lat) or not -180 <= lon <= 180 or not -90 <= lat <= 90:
        raise ValueError('Invalid configured coordinate')
    return f"""SELECT mu.mukey, mu.muname, l.areasymbol, sa.saversion, sa.saverest,
c.cokey, c.compname, c.comppct_r, c.drainagecl, c.slope_r,
h.chkey, h.hzname, h.hzdept_r, h.hzdepb_r, h.awc_l, h.awc_r, h.awc_h,
h.om_r, h.ph1to1h2o_r,
(SELECT MAX(t.texdesc) FROM chtexturegrp t WHERE t.chkey=h.chkey AND t.rvindicator='Yes') AS texture
FROM mapunit mu JOIN legend l ON l.lkey=mu.lkey
LEFT JOIN sacatalog sa ON sa.areasymbol=l.areasymbol
LEFT JOIN component c ON c.mukey=mu.mukey
LEFT JOIN chorizon h ON h.cokey=c.cokey
WHERE mu.mukey IN (SELECT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point({lon} {lat})'))
ORDER BY mu.mukey, c.comppct_r DESC, c.cokey, h.hzdept_r"""


def normalize(payload):
    table = payload.get('Table')
    if not isinstance(table, list) or not table or table[0] != COLUMNS:
        raise ValueError('SDA response has missing/unexpected column headers')
    rows = []
    seen = set()
    for values in table[1:]:
        if len(values) != len(COLUMNS):
            raise ValueError('SDA row length mismatch')
        row = dict(zip(COLUMNS, values))
        for key, bounds in NUMERIC.items():
            value = row[key]
            row[key] = None if value is None or value == '' else float(value)
            if row[key] is not None and (not math.isfinite(row[key]) or not bounds[0] <= row[key] <= bounds[1]):
                raise ValueError(f'Invalid {key}')
        for key in set(COLUMNS) - set(NUMERIC):
            row[key] = None if row[key] is None or row[key] == '' else str(row[key])
        if not row['mukey']:
            raise ValueError('Missing map unit identifier')
        identity = (row['mukey'], row['cokey'], row['chkey'])
        if identity in seen:
            raise ValueError('Duplicate component/horizon row')
        seen.add(identity)
        if row['hzdept_r'] is not None and row['hzdepb_r'] is not None and row['hzdepb_r'] <= row['hzdept_r']:
            raise ValueError('Invalid horizon depth interval')
        awc = [row[k] for k in ('awc_l', 'awc_r', 'awc_h') if row[k] is not None]
        if awc != sorted(awc):
            raise ValueError('Reversed available-water-capacity range')
        rows.append(row)
    return rows


def summarize(farm, receipt, raw_bytes, raw_path):
    expected = {'query': query(farm), 'format': 'JSON+COLUMNNAME'}
    if receipt.get('farm') != farm or receipt.get('request') != expected or receipt.get('endpoint') != ENDPOINT:
        raise ValueError('Receipt does not match configured location/query/endpoint')
    rows, reason = [], receipt.get('error')
    if not reason:
        try:
            rows = normalize(receipt['response'])
            if not rows:
                reason = 'NRCS returned no map-unit rows at this coordinate.'
        except (ValueError, KeyError, TypeError) as error:
            reason = f'Response validation failed: {error}'
    return {'schema_version': 1, 'farm': farm, 'status': 'unavailable' if reason else 'available',
            'reason': reason, 'rows': rows, 'units': UNITS,
            'provenance': {'source': 'USDA NRCS Soil Data Access / SSURGO', 'endpoint': ENDPOINT,
                           'retrieved_at': receipt['attempted_at'], 'raw_path': raw_path,
                           'sha256': hashlib.sha256(raw_bytes).hexdigest()},
            'limitations': ['Map-unit components are survey estimates, not confirmed soil at the point.',
                           'All components and horizons retained; no dominant-component or depth averaging.',
                           'Missing properties remain null. No field measurement or soil-health score is inferred.',
                           'Restrictive depth is not retrieved by this query; no rooting restriction is assumed.']}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    farms = json.loads((ROOT / 'src/config/config.json').read_text())['farms']
    failed = False
    for farm in farms:
        folder = ROOT / 'public/data' / farm['id']
        raw_path = folder / 'soil-source.json'
        if not args.offline:
            receipt = {'farm': farm, 'endpoint': ENDPOINT,
                       'attempted_at': datetime.now(timezone.utc).isoformat(),
                       'request': {'query': query(farm), 'format': 'JSON+COLUMNNAME'},
                       'response': None, 'error': None}
            try:
                request = Request(ENDPOINT, data=json.dumps(receipt['request']).encode(),
                                  headers={'Content-Type': 'application/json'})
                with urlopen(request, timeout=30) as response:
                    receipt['response'] = json.load(response)
            except Exception as error:
                receipt['error'] = f'{type(error).__name__}: {error}'
            candidate_bytes = (json.dumps(receipt, indent=2, allow_nan=False) + '\n').encode()
            candidate = summarize(farm, receipt, candidate_bytes, f'data/{farm["id"]}/soil-source.json')
            # Keep a previous successful cache on acquisition or validation failure.
            if candidate['status'] != 'available' and (folder / 'soil.json').exists() and json.loads((folder / 'soil.json').read_text())['status'] == 'available':
                write_json(folder / 'soil-last-failure.json', receipt)
                print(f"{farm['id']}: refresh failed; retained previous data: {candidate['reason']}")
                failed = True
                continue
            write_json(raw_path, receipt)
        raw_bytes = raw_path.read_bytes()
        summary = summarize(farm, json.loads(raw_bytes), raw_bytes, f'data/{farm["id"]}/soil-source.json')
        write_json(folder / 'soil.json', summary)
        failed |= summary['status'] != 'available'
        print(f"{farm['id']}: {summary['status']}; {summary['reason'] or str(len(summary['rows'])) + ' horizon rows'}")
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
