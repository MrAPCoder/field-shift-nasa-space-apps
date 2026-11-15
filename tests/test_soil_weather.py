"""M6 offline provenance and transformation checks; no network."""
import gzip
import hashlib
import json
import unittest
from scripts import build_soil_weather as weather

class SoilWeatherTests(unittest.TestCase):
    def test_rebuild_exactly_matches_all_committed_weather(self):
        config=json.loads((weather.ROOT/'src/config/config.json').read_text())
        for farm in config['farms']:
            actual=weather.build(farm)
            saved=json.loads((weather.ROOT/'public/data'/farm['id']/'soil-weather.json').read_text())
            self.assertEqual(actual,saved)
            self.assertEqual(saved['days'],1826)
            for source in saved['sources']:
                path=weather.ROOT/'public'/source['path']
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),source['sha256'])

    def test_original_nasa_values_are_reused_without_interpolation(self):
        config=json.loads((weather.ROOT/'src/config/config.json').read_text())
        for farm in config['farms']:
            saved=weather.build(farm)
            original=json.loads(gzip.decompress((weather.ROOT/'public/data'/farm['id']/'raw/2021-2025.json.gz').read_bytes()))
            for key in list(weather.UNITS)[:6]:
                expected=[None if original['response']['properties']['parameter'][key][d]==-999 else original['response']['properties']['parameter'][key][d] for d in weather.DATES]
                self.assertEqual(expected,saved['series'][key])

    def test_smap_is_explicitly_unavailable_and_not_fabricated(self):
        status=json.loads((weather.ROOT/'public/data/smap-status.json').read_text())
        self.assertEqual(status['status'],'unavailable')
        self.assertIn('403',status['result'])
        self.assertNotIn('series',status)
