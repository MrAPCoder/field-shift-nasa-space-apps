"""Synthetic parser tests, never demonstration soil data."""
import importlib.util
import json
import unittest
import tempfile
from unittest.mock import patch
from urllib.error import URLError
from pathlib import Path
SPEC = importlib.util.spec_from_file_location('soils', Path(__file__).resolve().parents[1] / 'scripts/fetch_soils.py')
soil = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(soil)


class SoilTests(unittest.TestCase):
    def payload(self):
        row = {k: None for k in soil.COLUMNS}
        row.update(mukey='TEST', cokey='TEST-C', chkey='TEST-H', hzdept_r='0', hzdepb_r='20', awc_l='0.1', awc_r='0.15', awc_h='0.2', om_r='0', comppct_r='60')
        return {'Table': [soil.COLUMNS, [row[k] for k in soil.COLUMNS]]}

    def test_null_is_not_zero_and_ranges_remain_separate(self):
        row = soil.normalize(self.payload())[0]
        self.assertIsNone(row['ph1to1h2o_r'])
        self.assertEqual(row['om_r'], 0)
        self.assertEqual(row['awc_r'], .15)
        self.assertEqual(row['awc_l'], .1)

    def test_invalid_missing_and_duplicate_records_rejected(self):
        with self.assertRaises(ValueError): soil.normalize({})
        for key, value in [('awc_r', 'NaN'), ('om_r', '-1'), ('hzdepb_r', '0'), ('awc_h', '.05')]:
            payload = self.payload()
            payload['Table'][1][soil.COLUMNS.index(key)] = value
            with self.assertRaises(ValueError): soil.normalize(payload)
        payload = self.payload()
        payload['Table'].append(payload['Table'][1])
        with self.assertRaises(ValueError): soil.normalize(payload)

    def test_failed_refresh_preserves_previous_success(self):
        farm = {'id': 'test', 'latitude': 46, 'longitude': -117}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            soil.write_json(root / 'src/config/config.json', {'farms': [farm]})
            folder = root / 'public/data/test'
            soil.write_json(folder / 'soil.json', {'status': 'available', 'synthetic_test': True})
            soil.write_json(folder / 'soil-source.json', {'synthetic_test': True})
            before = (folder / 'soil.json').read_bytes()
            with patch.object(soil, 'ROOT', root), patch('sys.argv', ['fetch_soils.py']), patch.object(soil, 'urlopen', side_effect=URLError('synthetic outage')):
                self.assertEqual(soil.main(), 1)
            self.assertEqual((folder / 'soil.json').read_bytes(), before)
            self.assertEqual(json.loads((folder / 'soil-source.json').read_text()), {'synthetic_test': True})
            self.assertIn('synthetic outage', json.loads((folder / 'soil-last-failure.json').read_text())['error'])

    def test_failed_query_is_not_a_successful_soil_measurement(self):
        farm = {'id':'test','latitude':46,'longitude':-117}
        receipt={'farm':farm,'endpoint':soil.ENDPOINT,'request':{'query':soil.query(farm),'format':'JSON+COLUMNNAME'},'attempted_at':'2026-11-14T00:00:00Z','error':'URLError: 403 Forbidden','response':None}
        result=soil.summarize(farm,receipt,json.dumps(receipt).encode(),'test.json')
        self.assertEqual(result['status'],'unavailable')
        self.assertEqual(result['rows'],[])
        receipt['farm']={**farm,'latitude':47}
        with self.assertRaises(ValueError): soil.summarize(farm,receipt,b'','test.json')


if __name__ == '__main__': unittest.main()
