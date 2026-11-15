"""M5 replay builder checks.

Real-archive tests recompute from the committed NASA POWER responses with the
standard library. Fixture tests use SYNTHETIC values only; they are not NASA
measurements and are written to a temporary directory, never to public/data.
"""
import contextlib
import copy
import gzip
import hashlib
import io
import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

from scripts import build_replay, fetch_nasa

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'src/config/config.json').read_text())
FARMS = [farm['id'] for farm in CONFIG['farms']]
START = date(1981, 1, 1)
NAMES = ('PRECTOTCORR', 'T2M_MAX', 'T2M_MIN', 'GWETROOT')


def replay(farm):
    return json.loads((ROOT / 'public/data' / farm / 'replay.json').read_text())


class RealArchiveReplayTests(unittest.TestCase):
    def test_contract_and_exact_calendar(self):
        for farm in CONFIG['farms']:
            with self.subTest(farm=farm['id']):
                data = replay(farm['id'])
                self.assertEqual((data['schema'], data['schema_version']), ('field-shift-replay', 1))
                self.assertEqual(data['farm'], {k: farm[k] for k in ('id', 'latitude', 'longitude')})
                self.assertEqual((data['start'], data['end'], data['time_standard']), ('1981-01-01', '2025-12-31', 'LST'))
                self.assertEqual(data['days'], 16436)
                self.assertEqual((date(2025, 12, 31) - START).days + 1, 16436)
                self.assertEqual(data['units'], {'PRECTOTCORR': 'mm/day', 'T2M_MAX': 'C', 'T2M_MIN': 'C', 'GWETROOT': '1'})
                self.assertEqual(list(data['series']), list(NAMES))
                for name in NAMES:
                    self.assertEqual(len(data['series'][name]), 16436)
                self.assertEqual(data['provenance']['builder'], 'scripts/build_replay.py')

    def test_values_match_raw_archive_including_leap_days_and_sentinels(self):
        """Independent rebuild: every index maps to start + i days; -999 -> null; zero kept."""
        for farm in FARMS:
            with self.subTest(farm=farm):
                data = replay(farm)
                raw, seen = {name: {} for name in NAMES}, 0
                for path in sorted((ROOT / 'public/data' / farm / 'raw').glob('*.json.gz')):
                    with gzip.open(path, 'rt') as stream:
                        parameters = json.load(stream)['response']['properties']['parameter']
                    for name in NAMES:
                        for day, value in parameters[name].items():
                            self.assertNotIn(day, raw[name], 'duplicate date in archive')
                            raw[name][day] = value
                for name in NAMES:
                    self.assertEqual(len(raw[name]), 16436)
                    for i, value in enumerate(data['series'][name]):
                        original = raw[name][(START + timedelta(days=i)).strftime('%Y%m%d')]
                        if original == -999:
                            self.assertIsNone(value)
                        else:
                            self.assertIsNotNone(value)
                            self.assertAlmostEqual(value, original, places=2)
                            seen += value == 0
                self.assertGreater(seen, 0, 'real zero-precipitation days must survive as 0, not null')
                for leap in (date(1984, 2, 29), date(2000, 2, 29), date(2024, 2, 29)):
                    index = (leap - START).days
                    self.assertAlmostEqual(data['series']['T2M_MAX'][index], raw['T2M_MAX'][leap.strftime('%Y%m%d')], places=2)
                self.assertEqual((date(1984, 3, 1) - START).days - (date(1984, 2, 28) - START).days, 2)

    def test_raw_hashes_match_provenance_and_m1_records(self):
        """Raw archives are unchanged: same SHA-256 as recorded by M1 in climate.json."""
        for farm in FARMS:
            with self.subTest(farm=farm):
                directory = ROOT / 'public/data' / farm
                recorded = {f'data/{farm}/{item["file"]}': item['sha256']
                            for item in json.loads((directory / 'climate.json').read_text())['provenance']}
                files = replay(farm)['provenance']['raw_files']
                self.assertEqual(len(files), 9)
                self.assertEqual({item['path']: item['sha256'] for item in files}, recorded)
                for item in files:
                    actual = hashlib.sha256((ROOT / 'public' / item['path']).read_bytes()).hexdigest()
                    self.assertEqual(actual, item['sha256'])

    def test_monthly_precipitation_normals_match_climate_json(self):
        for farm in FARMS:
            with self.subTest(farm=farm):
                rain = replay(farm)['series']['PRECTOTCORR']
                totals = {}
                for i, value in enumerate(rain):
                    day = START + timedelta(days=i)
                    totals[(day.year, day.month)] = totals.get((day.year, day.month), 0) + value
                cached = json.loads((ROOT / 'public/data' / farm / 'climate.json').read_text())['monthly']
                for row in cached:
                    values = [total for (_, month), total in totals.items() if month == row['month']]
                    self.assertEqual(len(values), 45)
                    self.assertAlmostEqual(sum(values) / 45, row['rainfall_normal_mm'], delta=0.1)

    def test_committed_files_pass_check_without_writing(self):
        before = {farm: (ROOT / 'public/data' / farm / 'replay.json').read_bytes() for farm in FARMS}
        lines = []
        self.assertEqual(build_replay.run(check=True, out=lines.append), 0)
        self.assertEqual(len(lines), 3)
        self.assertTrue(all('OK' in line for line in lines))
        for farm in FARMS:
            self.assertEqual((ROOT / 'public/data' / farm / 'replay.json').read_bytes(), before[farm])

    def test_fetch_nasa_offline_output_is_unchanged_by_the_simulation_config(self):
        """The M1 pipeline ignores the new `simulation` key: identical climate.json/comparison.json."""
        self.assertEqual(fetch_nasa.CONFIG.get('simulation', {}).get('status', 'provisional'), 'provisional')
        captured = {}
        with patch.object(fetch_nasa, 'write_json', lambda path, value: captured.__setitem__(Path(path), value)), \
                contextlib.redirect_stdout(io.StringIO()):
            fetch_nasa.run(offline=True)
        self.assertEqual(len(captured), 4)
        for path, value in captured.items():
            self.assertEqual(json.loads(json.dumps(value, allow_nan=False)), json.loads(path.read_text()), path.name)


class SyntheticReplayBuilderTests(unittest.TestCase):
    """SYNTHETIC fixtures only."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.data = Path(self.tmp.name)
        self.farm = {'id': 'synthetic', 'name': 'SYNTHETIC TEST FARM', 'latitude': 1.5, 'longitude': -2.5}
        self.config = {'period': copy.deepcopy(CONFIG['period']), 'farms': [self.farm]}
        days = [(START + timedelta(days=i)).strftime('%Y%m%d') for i in range(16436)]
        self.parameters = {
            'PRECTOTCORR': {day: 1.234 for day in days},
            'T2M_MAX': {day: 20 for day in days},
            'T2M_MIN': {day: 5 for day in days},
            'GWETROOT': {day: 0.5 for day in days},
        }
        self.parameters['PRECTOTCORR'][days[0]] = 0
        self.parameters['PRECTOTCORR'][days[1]] = -999
        self.parameters['GWETROOT'][days[2]] = -999
        self.units = dict(build_replay.UNITS)
        self.envelope_farm = dict(self.farm)

    def write(self, name='1981-2025.json.gz', parameters=None):
        raw = self.data / 'synthetic' / 'raw'
        raw.mkdir(parents=True, exist_ok=True)
        envelope = {'farm': self.envelope_farm, 'url': 'https://example.invalid/synthetic', 'retrieved_at': '2026-11-15T00:00:00+00:00',
                    'response': {'header': {'time_standard': 'LST', 'fill_value': -999},
                                 'parameters': {name: {'units': unit} for name, unit in self.units.items()},
                                 'properties': {'parameter': parameters or self.parameters}}}
        with gzip.open(raw / name, 'wt') as stream:
            json.dump(envelope, stream)

    def run_builder(self, check=False):
        lines = []
        return build_replay.run(check=check, config=self.config, data_dir=self.data, out=lines.append), lines

    def test_sentinel_null_zero_preserved_rounding_and_atomic_write(self):
        self.write()
        self.assertEqual(self.run_builder()[0], 0)
        target = self.data / 'synthetic' / 'replay.json'
        data = json.loads(target.read_text())
        rain = data['series']['PRECTOTCORR']
        self.assertEqual(rain[0], 0)
        self.assertIsNotNone(rain[0])
        self.assertIsNone(rain[1])
        self.assertEqual(rain[2], 1.23)
        self.assertIsNone(data['series']['GWETROOT'][2])
        self.assertEqual(data['days'], 16436)
        self.assertEqual(data['farm'], {'id': 'synthetic', 'latitude': 1.5, 'longitude': -2.5})
        self.assertFalse(list(target.parent.glob('*.tmp')))
        self.assertNotIn('NaN', target.read_text())
        # Rebuilding identical content leaves the file (and built_at) alone; --check passes.
        first = target.read_bytes()
        self.assertEqual(self.run_builder()[0], 0)
        self.assertEqual(target.read_bytes(), first)
        self.assertEqual(self.run_builder(check=True)[0], 0)

    def test_check_detects_difference_and_never_writes(self):
        self.write()
        code, lines = self.run_builder(check=True)
        self.assertEqual(code, 1)
        self.assertFalse((self.data / 'synthetic' / 'replay.json').exists())
        self.run_builder()
        target = self.data / 'synthetic' / 'replay.json'
        tampered = json.loads(target.read_text())
        tampered['series']['T2M_MAX'][10] = 21
        target.write_text(json.dumps(tampered))
        before = target.read_bytes()
        self.assertEqual(self.run_builder(check=True)[0], 1)
        self.assertEqual(target.read_bytes(), before)

    def assert_fails(self, text):
        code, lines = self.run_builder()
        self.assertEqual(code, 1)
        self.assertIn(text, lines[0])
        self.assertFalse((self.data / 'synthetic' / 'replay.json').exists())

    def test_missing_day_fails(self):
        for name in NAMES:
            del self.parameters[name]['20000229']
        self.write()
        self.assert_fails('not exactly 16436 consecutive days')

    def test_extra_day_outside_period_fails(self):
        for name in NAMES:
            self.parameters[name]['20260101'] = 1
        self.write()
        self.assert_fails('not exactly 16436 consecutive days')

    def test_duplicate_dates_across_archives_fail(self):
        self.write()
        self.write('2021-2025.json.gz', {name: {'20210101': 1} for name in NAMES})
        self.assert_fails('Duplicate date')

    def test_coordinate_mismatch_fails(self):
        self.envelope_farm = {**self.farm, 'latitude': 1.6}
        self.write()
        self.assert_fails('Coordinate mismatch')

    def test_unit_mismatch_fails(self):
        self.units['PRECTOTCORR'] = 'mm/hour'
        self.write()
        self.assert_fails('Unit mismatch')

    def test_non_finite_value_fails(self):
        self.parameters['T2M_MAX']['19810105'] = float('nan')
        self.write()
        self.assert_fails('Non-numeric or non-finite')


if __name__ == '__main__':
    unittest.main()
