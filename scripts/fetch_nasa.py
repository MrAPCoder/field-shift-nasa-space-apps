"""Fetch, validate and aggregate NASA POWER daily data. See docs/METHODS.md."""
import argparse
import gzip
import hashlib
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'src/config/config.json').read_text())
ENDPOINT = 'https://power.larc.nasa.gov/api/temporal/daily/point'
UNITS = {'T2M_MAX': 'C', 'T2M_MIN': 'C', 'PRECTOTCORR': 'mm/day',
         'RH2M': '%', 'ALLSKY_SFC_SW_DWN': 'MJ/m^2/day', 'GWETROOT': '1'}
BOUNDS = {'T2M_MAX': (-90, 65), 'T2M_MIN': (-90, 65), 'PRECTOTCORR': (0, 2000),
          'RH2M': (0, 100), 'ALLSKY_SFC_SW_DWN': (0, 50), 'GWETROOT': (0, 1)}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
    temporary.replace(path)


def request_chunk(farm, start, end):
    params = dict(parameters=','.join(UNITS), community='AG', latitude=farm['latitude'],
                  longitude=farm['longitude'], start=start.strftime('%Y%m%d'),
                  end=end.strftime('%Y%m%d'), format='JSON', **{'time-standard': 'LST'})
    for attempt in range(5):
        try:
            response = requests.get(ENDPOINT, params=params, timeout=(15, 120))
            if response.status_code == 429 or response.status_code >= 500:
                raise requests.ConnectionError(f'Transient HTTP {response.status_code}')
            response.raise_for_status()
            return response.json(), response.url
        except (requests.ConnectionError, requests.Timeout):
            if attempt == 4:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError('Unreachable')


def validate_chunk(payload, start, end):
    """Fail closed on malformed data; explicitly allow documented pre-1984 solar gap."""
    if payload.get('type') != 'Feature':
        raise ValueError('Expected NASA GeoJSON Feature')
    header = payload['header']
    if header['start'] != start.strftime('%Y%m%d') or header['end'] != end.strftime('%Y%m%d'):
        raise ValueError('Unexpected response date range')
    if header.get('time_standard') != 'LST' or header.get('fill_value') != -999:
        raise ValueError('Unexpected time standard or missing sentinel')
    values = payload['properties']['parameter']
    dates = pd.date_range(start, end)
    expected = set(dates.strftime('%Y%m%d'))
    frame = pd.DataFrame(index=dates)
    issues = list(payload.get('messages', []))
    for parameter, unit in UNITS.items():
        series = values.get(parameter)
        if series is None:
            if parameter == 'ALLSKY_SFC_SW_DWN' and end < pd.Timestamp('1984-01-01'):
                frame[parameter] = float('nan')
                issues.append('Solar radiation unavailable before 1984-01-01')
                continue
            raise ValueError(f'Missing parameter: {parameter}')
        if payload['parameters'][parameter]['units'] != unit:
            raise ValueError(f'Unexpected units for {parameter}')
        if set(series) != expected:
            raise ValueError(f'Inconsistent dates/length for {parameter}')
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in series.values()):
            raise ValueError(f'Non-numeric/non-finite values for {parameter}')
        frame[parameter] = [series[d] for d in dates.strftime('%Y%m%d')]
        frame[parameter] = frame[parameter].replace(-999, float('nan'))
        lo, hi = BOUNDS[parameter]
        invalid = frame[parameter].notna() & ~frame[parameter].between(lo, hi)
        if invalid.any():
            raise ValueError(f'Invalid {parameter} values: {int(invalid.sum())}')
    if (frame.T2M_MIN > frame.T2M_MAX).any():
        raise ValueError('Minimum temperature exceeds maximum')
    return frame, issues


def mean(values):
    valid = [v for v in values if v is not None]
    return sum(valid) / len(valid) if valid else None


def aggregate(frame, config=CONFIG):
    if frame.index.has_duplicates:
        raise ValueError('Duplicate dates')
    expected = pd.date_range(config['period']['start'], config['period']['end'])
    if not frame.index.equals(expected):
        raise ValueError('Missing dates/months or unexpected historical range')
    annual, monthly = [], []
    for year, data in frame.groupby(frame.index.year):
        # Strict 100% completeness: missing days cannot be classified as non-events.
        complete_min = data.T2M_MIN.notna().all()
        complete_max = data.T2M_MAX.notna().all()
        complete_rain = data.PRECTOTCORR.notna().all()
        spring = data.loc[data.index.month <= 6, 'T2M_MIN']
        fall = data.loc[data.index.month >= 7, 'T2M_MIN']
        s = spring[spring <= config['frostThresholdC']]
        f = fall[fall <= config['frostThresholdC']]
        last = s.index[-1] if spring.notna().all() and len(s) else None
        first = f.index[0] if fall.notna().all() and len(f) else None
        annual.append(dict(year=int(year), rainfall_mm=float(data.PRECTOTCORR.sum()) if complete_rain else None,
                           frost_days=int((data.T2M_MIN <= config['frostThresholdC']).sum()) if complete_min else None,
                           last_spring_frost=last.strftime('%Y-%m-%d') if last is not None else None,
                           first_fall_frost=first.strftime('%Y-%m-%d') if first is not None else None,
                           frost_free_days=(first-last).days-1 if last is not None and first is not None else None,
                           hot_days=int((data.T2M_MAX >= config['hotDayThresholdC']).sum()) if complete_max else None))
    for month in range(1, 13):
        data = frame.loc[frame.index.month == month]
        totals = [float(group.PRECTOTCORR.sum()) for _, group in data.groupby(data.index.year)
                  if group.PRECTOTCORR.notna().all()]
        wet = data.GWETROOT.dropna()
        monthly.append(dict(month=month, rainfall_normal_mm=mean(totals), rainfall_valid_years=len(totals),
                            gwetroot_mean=float(wet.mean()) if len(wet) else None, gwetroot_valid_days=len(wet),
                            gwetroot_expected_days=len(data), gwetroot_first_date=wet.index.min().strftime('%Y-%m-%d') if len(wet) else None,
                            gwetroot_last_date=wet.index.max().strftime('%Y-%m-%d') if len(wet) else None))
    normals = [m['rainfall_normal_mm'] for m in monthly]
    denominator = sum(normals) if all(v is not None for v in normals) else None
    for m in monthly:
        m['rainfall_share_percent'] = m['rainfall_normal_mm'] / denominator * 100 if denominator else None
    coverage = {}
    for parameter in UNITS:
        valid = frame[parameter].dropna()
        coverage[parameter] = dict(valid_days=len(valid), expected_days=len(frame), missing_days=len(frame)-len(valid),
                                   percent=100*len(valid)/len(frame), first_valid_date=valid.index.min().strftime('%Y-%m-%d') if len(valid) else None,
                                   last_valid_date=valid.index.max().strftime('%Y-%m-%d') if len(valid) else None,
                                   missing_months=[str(period) for period, group in frame[parameter].groupby(frame.index.to_period('M')) if group.isna().all()])
    summary = {}
    for key in ('rainfall_mm', 'frost_free_days', 'hot_days'):
        summary['mean_' + key] = mean([a[key] for a in annual])
        summary[key + '_valid_years'] = sum(a[key] is not None for a in annual)
    warnings = [f'{k}: {v["missing_days"]} missing days' for k, v in coverage.items() if v['missing_days']]
    warnings += [f'Review annual rainfall: {a["year"]}: {a["rainfall_mm"]} mm' for a in annual
                 if a['rainfall_mm'] is not None and a['rainfall_mm'] > config['rainfallReviewAnnualMm']]
    return dict(summary=summary, annual=annual, monthly=monthly, coverage=coverage,
                quality=dict(duplicate_dates=0, missing_dates=0, invalid_values=0, warnings=warnings))


def run(offline=False):
    output = ROOT / 'public/data'
    comparison = []
    for farm in CONFIG['farms']:
        directory = output / farm['id']
        raw_dir = directory / 'raw'
        raw_dir.mkdir(parents=True, exist_ok=True)
        frames, provenance = [], []
        period_start, period_end = pd.Timestamp(CONFIG['period']['start']), pd.Timestamp(CONFIG['period']['end'])
        if period_start.month != 1 or period_start.day != 1 or period_end.month != 12 or period_end.day != 31:
            raise ValueError('Climate summaries require complete calendar-year request boundaries')
        for year in range(period_start.year, period_end.year + 1, CONFIG['chunkYears']):
            start, end = pd.Timestamp(year, 1, 1), pd.Timestamp(min(year+CONFIG['chunkYears']-1, period_end.year), 12, 31)
            archive = raw_dir / f'{start.year}-{end.year}.json.gz'
            if archive.exists():
                with gzip.open(archive, 'rt') as stream:
                    envelope = json.load(stream)
            elif offline:
                raise FileNotFoundError(archive)
            else:
                payload, url = request_chunk(farm, start, end)
                validate_chunk(payload, start, end)
                envelope = dict(farm=farm, url=url, retrieved_at=datetime.now(timezone.utc).isoformat(), response=payload)
                with gzip.open(archive, 'wt') as stream:
                    json.dump(envelope, stream, allow_nan=False)
            if envelope['farm'] != farm:
                raise ValueError(f'Cached coordinates do not match configuration: {archive}')
            frame, messages = validate_chunk(envelope['response'], start, end)
            frames.append(frame)
            provenance.append(dict(file=f'raw/{archive.name}', sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
                                   url=envelope['url'], retrieved_at=envelope['retrieved_at'], messages=messages,
                                   header=envelope['response']['header']))
            print(f'{farm["id"]}: {start.year}-{end.year} validated', flush=True)
        frame = pd.concat(frames).sort_index()
        result = dict(schema_version=1, farm=farm, period=CONFIG['period'], units=UNITS,
                      thresholds=dict(hot_day_c=CONFIG['hotDayThresholdC'], frost_day_c=CONFIG['frostThresholdC']),
                      provenance=provenance, **aggregate(frame))
        write_json(directory / 'climate.json', result)
        comparison.append(dict(farm=farm['name'], **result['summary'], gwetroot_coverage=result['coverage']['GWETROOT']))
    write_json(output / 'comparison.json', comparison)
    print(json.dumps(comparison, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true', help='Recompute and validate using only cached raw responses')
    run(parser.parse_args().offline)
