"""Synthetic fixtures only; these are not NASA measurements."""
import copy
import unittest
from unittest.mock import patch, Mock
import pandas as pd
import requests
from scripts.fetch_nasa import CONFIG, UNITS, aggregate, validate_chunk, request_chunk

class ClimateTests(unittest.TestCase):
    def setUp(self):
        self.config = copy.deepcopy(CONFIG)
        self.config['period'] = {'start': '2020-01-01', 'end': '2020-12-31'}
        self.frame = pd.DataFrame({k: 1.0 for k in UNITS}, index=pd.date_range('2020-01-01', '2020-12-31'))
        self.frame['T2M_MAX'] = 31.0
        self.frame.loc['2020-04-01', 'T2M_MIN'] = 0
        self.frame.loc['2020-10-01', 'T2M_MIN'] = -1
        self.frame.loc['2020-07-01', 'T2M_MAX'] = 32

    def test_thresholds_calendar_and_leap_year(self):
        result = aggregate(self.frame, self.config)
        year = result['annual'][0]
        self.assertEqual(year['frost_days'], 2)
        self.assertEqual(year['frost_free_days'], 182)
        self.assertEqual(year['hot_days'], 1)
        self.assertEqual(year['rainfall_mm'], 366)
        self.assertEqual(result['monthly'][1]['rainfall_normal_mm'], 29)
        self.assertAlmostEqual(sum(m['rainfall_share_percent'] for m in result['monthly']), 100)

    def test_incomplete_month_and_year_excluded(self):
        self.frame.loc['2020-02-02', 'PRECTOTCORR'] = float('nan')
        result = aggregate(self.frame, self.config)
        self.assertIsNone(result['monthly'][1]['rainfall_normal_mm'])
        self.assertIsNone(result['summary']['mean_rainfall_mm'])
        self.assertTrue(all(m['rainfall_share_percent'] is None for m in result['monthly']))

    def test_missing_temperature_invalidates_counts_and_boundary(self):
        self.frame.loc['2020-01-02', ['T2M_MIN', 'T2M_MAX']] = float('nan')
        year = aggregate(self.frame, self.config)['annual'][0]
        for key in ['frost_days', 'hot_days', 'last_spring_frost', 'frost_free_days']:
            self.assertIsNone(year[key])

    def test_no_frost_boundary_unavailable(self):
        self.frame['T2M_MIN'] = 1
        self.assertIsNone(aggregate(self.frame, self.config)['annual'][0]['frost_free_days'])

    def test_zero_rain(self):
        self.frame['PRECTOTCORR'] = 0
        self.assertTrue(all(m['rainfall_share_percent'] is None for m in aggregate(self.frame, self.config)['monthly']))

    def test_missing_wetness_coverage(self):
        self.frame.loc['2020-01-01':'2020-01-31', 'GWETROOT'] = float('nan')
        result = aggregate(self.frame, self.config)
        self.assertIsNone(result['monthly'][0]['gwetroot_mean'])
        self.assertEqual(result['coverage']['GWETROOT']['missing_days'], 31)
        self.assertEqual(result['coverage']['GWETROOT']['missing_months'], ['2020-01'])

    def test_duplicates_and_missing_dates_rejected(self):
        for frame in [pd.concat([self.frame, self.frame.iloc[:1]]), self.frame.iloc[1:]]:
            with self.assertRaises(ValueError):
                aggregate(frame, self.config)

    def payload(self):
        return {'type': 'Feature', 'header': {'start': '20200101', 'end': '20200101', 'fill_value': -999, 'time_standard': 'LST'},
                'properties': {'parameter': {k: {'20200101': 1} for k in UNITS}},
                'parameters': {k: {'units': v} for k,v in UNITS.items()}}

    def validate(self, payload):
        return validate_chunk(payload, pd.Timestamp('2020-01-01'), pd.Timestamp('2020-01-01'))

    def test_missing_sentinel_cleaned(self):
        payload = self.payload()
        payload['properties']['parameter']['GWETROOT']['20200101'] = -999
        self.assertTrue(pd.isna(self.validate(payload)[0].GWETROOT.iloc[0]))

    def test_bad_units_lengths_values_and_structure(self):
        for kind in ['units', 'dates', 'range', 'nan', 'parameter', 'type', 'temperature']:
            payload = self.payload()
            if kind == 'units': payload['parameters']['GWETROOT']['units'] = 'mm'
            if kind == 'dates': payload['properties']['parameter']['GWETROOT'] = {}
            if kind == 'range': payload['properties']['parameter']['GWETROOT']['20200101'] = 2
            if kind == 'nan': payload['properties']['parameter']['GWETROOT']['20200101'] = float('nan')
            if kind == 'parameter': del payload['properties']['parameter']['RH2M']
            if kind == 'type': payload['type'] = 'error'
            if kind == 'temperature': payload['properties']['parameter']['T2M_MIN']['20200101'] = 5
            with self.subTest(kind=kind), self.assertRaises(ValueError): self.validate(payload)

    def test_transient_retry(self):
        response = Mock(status_code=200, url='https://example.test')
        response.json.return_value = self.payload()
        with patch('scripts.fetch_nasa.requests.get', side_effect=[requests.Timeout(), response]) as get, patch('scripts.fetch_nasa.time.sleep') as sleep:
            request_chunk(CONFIG['farms'][0], pd.Timestamp('2020-01-01'), pd.Timestamp('2020-01-01'))
            self.assertEqual(get.call_count, 2)
            sleep.assert_called_once_with(1)

    def test_early_solar_omission_is_explicit(self):
        payload = self.payload()
        payload['header'].update(start='19810101', end='19810101')
        for key in UNITS:
            payload['properties']['parameter'][key] = {'19810101': 1}
        del payload['properties']['parameter']['ALLSKY_SFC_SW_DWN']
        frame, issues = validate_chunk(payload, pd.Timestamp('1981-01-01'), pd.Timestamp('1981-01-01'))
        self.assertTrue(frame.ALLSKY_SFC_SW_DWN.isna().all())
        self.assertTrue(issues)

    def test_http_retries_exhaust_with_backoff(self):
        for status in [429, 503]:
            response = Mock(status_code=status)
            with self.subTest(status=status), patch('scripts.fetch_nasa.requests.get', return_value=response) as get, patch('scripts.fetch_nasa.time.sleep') as sleep:
                with self.assertRaises(requests.ConnectionError):
                    request_chunk(CONFIG['farms'][0], pd.Timestamp('2020-01-01'), pd.Timestamp('2020-01-01'))
                self.assertEqual(get.call_count, 5)
                self.assertEqual([call.args[0] for call in sleep.call_args_list], [1, 2, 4, 8])

    def test_permanent_failure_not_retried(self):
        response = Mock(status_code=400)
        response.raise_for_status.side_effect = requests.HTTPError()
        with patch('scripts.fetch_nasa.requests.get', return_value=response) as get, self.assertRaises(requests.HTTPError):
            request_chunk(CONFIG['farms'][0], pd.Timestamp('2020-01-01'), pd.Timestamp('2020-01-01'))
        self.assertEqual(get.call_count, 1)

if __name__ == '__main__': unittest.main()
