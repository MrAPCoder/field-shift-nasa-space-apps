"""Independent standard-library recalculation from the real cached NASA data."""
from datetime import date
import gzip
import hashlib
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class ArchiveTests(unittest.TestCase):
    def test_independent_annual_calculations_and_archive_hashes(self):
        for farm in ('skagit', 'yakima', 'palouse'):
            with self.subTest(farm=farm):
                directory = ROOT / 'public/data' / farm
                cached = json.loads((directory / 'climate.json').read_text())
                records = {}
                for source in cached['provenance']:
                    path = directory / source['file']
                    self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), source['sha256'])
                    with gzip.open(path, 'rt') as stream:
                        raw = json.load(stream)['response']['properties']['parameter']
                    for day in raw['T2M_MIN']:
                        self.assertNotIn(day, records)
                        records[day] = {key: values[day] for key, values in raw.items()}
                self.assertEqual(len(records), 16436)
                for annual in cached['annual']:
                    year = str(annual['year'])
                    days = sorted(day for day in records if day.startswith(year))
                    self.assertTrue(all(records[d][k] != -999 for d in days for k in ['PRECTOTCORR','T2M_MIN','T2M_MAX']))
                    self.assertAlmostEqual(sum(records[d]['PRECTOTCORR'] for d in days), annual['rainfall_mm'], places=7)
                    self.assertEqual(sum(records[d]['T2M_MAX'] >= 32 for d in days), annual['hot_days'])
                    spring = [d for d in days if d[4:6] <= '06' and records[d]['T2M_MIN'] <= 0]
                    fall = [d for d in days if d[4:6] >= '07' and records[d]['T2M_MIN'] <= 0]
                    expected = (date.fromisoformat(fall[0]) - date.fromisoformat(spring[-1])).days-1 if spring and fall else None
                    self.assertEqual(expected, annual['frost_free_days'])
                monthly_totals = {m: [] for m in range(1,13)}
                for year in range(1981,2026):
                    for month in range(1,13):
                        prefix = f'{year}{month:02}'
                        monthly_totals[month].append(sum(v['PRECTOTCORR'] for d,v in records.items() if d.startswith(prefix)))
                for monthly in cached['monthly']:
                    month = monthly['month']
                    self.assertAlmostEqual(sum(monthly_totals[month])/45, monthly['rainfall_normal_mm'], places=7)
                    wet = [v['GWETROOT'] for d,v in records.items() if int(d[4:6]) == month and v['GWETROOT'] != -999]
                    self.assertAlmostEqual(sum(wet)/len(wet), monthly['gwetroot_mean'], places=10)

if __name__ == '__main__': unittest.main()
