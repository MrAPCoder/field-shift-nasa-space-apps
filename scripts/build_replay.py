"""Build compact daily replay files from the archived NASA POWER responses.

Offline only: reads public/data/<farm>/raw/*.json.gz (never modified) and writes
public/data/<farm>/replay.json (schema "field-shift-replay" v1). No network
access. See the "M5 historical replay simulator" section of docs/METHODS.md.

    python scripts/build_replay.py           # build / refresh all farms
    python scripts/build_replay.py --check   # verify committed files, write nothing
"""
import argparse
import gzip
import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / 'src/config/config.json'
DATA = ROOT / 'public/data'
SCHEMA = 'field-shift-replay'
SCHEMA_VERSION = 1
EXPECTED_DAYS = 16436
FILL = -999
# Daily variables the simulator replays, with the units the archive must declare.
UNITS = {'PRECTOTCORR': 'mm/day', 'T2M_MAX': 'C', 'T2M_MIN': 'C', 'GWETROOT': '1'}
# Error screens identical to scripts/fetch_nasa.py; not climatological validation.
BOUNDS = {'PRECTOTCORR': (0, 2000), 'T2M_MAX': (-90, 65), 'T2M_MIN': (-90, 65), 'GWETROOT': (0, 1)}


class ReplayError(ValueError):
    """Raised when the archive cannot produce a valid replay. Fail closed."""


def load_config(path=CONFIG_PATH):
    return json.loads(Path(path).read_text())


def clean(value):
    """-999 becomes None; a real zero stays zero; everything else rounds to 2 dp."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ReplayError(f'Non-numeric or non-finite value: {value!r}')
    if value == FILL:
        return None
    return round(float(value), 2)


def read_envelope(path):
    with gzip.open(path, 'rt') as stream:
        return json.load(stream)


def build_farm(farm, config, data_dir=DATA):
    """Return the replay document for one farm, without built_at."""
    start, end = pd.Timestamp(config['period']['start']), pd.Timestamp(config['period']['end'])
    expected = pd.date_range(start, end)
    raw_dir = Path(data_dir) / farm['id'] / 'raw'
    archives = sorted(raw_dir.glob('*.json.gz'))
    if not archives:
        raise ReplayError(f'No raw archives for {farm["id"]}: {raw_dir}')
    values = {name: {} for name in UNITS}
    raw_files = []
    for archive in archives:
        envelope = read_envelope(archive)
        if envelope.get('farm') != farm:
            raise ReplayError(f'Coordinate mismatch with config: {archive}')
        response = envelope['response']
        header = response['header']
        if header.get('time_standard') != 'LST' or header.get('fill_value') != FILL:
            raise ReplayError(f'Unexpected time standard or missing sentinel: {archive}')
        chunk_dates = None
        for name, unit in UNITS.items():
            if response['parameters'][name]['units'] != unit:
                raise ReplayError(f'Unit mismatch for {name} in {archive}')
            series = response['properties']['parameter'][name]
            if chunk_dates is None:
                chunk_dates = set(series)
            elif set(series) != chunk_dates:
                raise ReplayError(f'Inconsistent dates between variables in {archive}')
            for day, value in series.items():
                if day in values[name]:
                    raise ReplayError(f'Duplicate date {day} for {name} ({archive})')
                values[name][day] = clean(value)
        raw_files.append({'path': f'data/{farm["id"]}/raw/{archive.name}',
                          'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()})
    keys = list(expected.strftime('%Y%m%d'))
    if len(keys) != EXPECTED_DAYS:
        raise ReplayError(f'Configured period has {len(keys)} days, expected {EXPECTED_DAYS}')
    series_out = {}
    for name in UNITS:
        if len(values[name]) != EXPECTED_DAYS or set(values[name]) != set(keys):
            raise ReplayError(f'{farm["id"]} {name}: not exactly {EXPECTED_DAYS} consecutive days')
        column = [values[name][key] for key in keys]
        lo, hi = BOUNDS[name]
        if any(v is not None and not lo <= v <= hi for v in column):
            raise ReplayError(f'{farm["id"]} {name}: value outside sanity bounds')
        series_out[name] = column
    if any(lo is not None and hi is not None and lo > hi
           for lo, hi in zip(series_out['T2M_MIN'], series_out['T2M_MAX'])):
        raise ReplayError(f'{farm["id"]}: minimum temperature exceeds maximum')
    return {
        'schema': SCHEMA, 'schema_version': SCHEMA_VERSION,
        'farm': {'id': farm['id'], 'latitude': farm['latitude'], 'longitude': farm['longitude']},
        'start': start.strftime('%Y-%m-%d'), 'end': end.strftime('%Y-%m-%d'),
        'time_standard': 'LST', 'days': EXPECTED_DAYS,
        'units': dict(UNITS), 'series': series_out,
        'provenance': {'source': 'NASA POWER daily point, community AG', 'raw_files': raw_files,
                       'built_at': None, 'builder': 'scripts/build_replay.py'},
    }


def without_built_at(document):
    copy = json.loads(json.dumps(document))
    copy['provenance']['built_at'] = None
    return copy


def serialize(document):
    """Readable header, one compact line per series (keeps diffs and size small)."""
    head = {key: value for key, value in document.items() if key not in ('series', 'provenance')}
    lines = [json.dumps(head, indent=2, allow_nan=False)[:-2] + ',', '  "series": {']
    names = list(document['series'])
    for i, name in enumerate(names):
        body = json.dumps(document['series'][name], separators=(',', ':'), allow_nan=False)
        lines.append(f'    {json.dumps(name)}: {body}' + (',' if i < len(names) - 1 else ''))
    lines.append('  },')
    provenance = json.dumps(document['provenance'], indent=2, allow_nan=False).replace('\n', '\n  ')
    lines.append(f'  "provenance": {provenance}')
    lines.append('}')
    text = '\n'.join(lines) + '\n'
    if json.loads(text) != document:
        raise ReplayError('Serialization round-trip mismatch')
    return text


def write_atomic(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(text)
    temporary.replace(path)


def run(check=False, config=None, data_dir=DATA, out=print):
    config = config or load_config()
    problems = 0
    for farm in config['farms']:
        target = Path(data_dir) / farm['id'] / 'replay.json'
        try:
            built = build_farm(farm, config, data_dir)
        except (ReplayError, KeyError, OSError, json.JSONDecodeError) as error:
            out(f'{farm["id"]}: FAILED — {error}')
            problems += 1
            continue
        existing = json.loads(target.read_text()) if target.exists() else None
        current = existing is not None and without_built_at(existing) == built
        nulls = {name: sum(v is None for v in column) for name, column in built['series'].items()}
        summary = f'{built["days"]} days, {len(built["provenance"]["raw_files"])} raw archives, nulls {nulls}'
        if check:
            if current:
                out(f'{farm["id"]}: OK — replay.json matches the archive ({summary})')
            else:
                out(f'{farm["id"]}: FAILED — replay.json is missing or differs from the archive')
                problems += 1
        elif current:
            out(f'{farm["id"]}: unchanged ({summary})')
        else:
            built['provenance']['built_at'] = datetime.now(timezone.utc).isoformat(timespec='seconds')
            write_atomic(target, serialize(built))
            out(f'{farm["id"]}: wrote {target.relative_to(ROOT) if target.is_relative_to(ROOT) else target} ({summary})')
    return problems


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--check', action='store_true', help='Verify committed replay files against the archive; write nothing')
    sys.exit(1 if run(parser.parse_args().check) else 0)
