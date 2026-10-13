import importlib.util
import json
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "update_property_cbr.py"
spec = importlib.util.spec_from_file_location("property_cbr", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def xml(day="13.10.2026", nominal="1", value="83,9153", code="USD"):
    return f'<ValCurs Date="{day}"><Valute><CharCode>{code}</CharCode><Nominal>{nominal}</Nominal><Value>{value}</Value></Valute></ValCurs>'.encode()


class CbrTest(unittest.TestCase):
    requested = date(2026, 10, 13)
    now = datetime(2026, 10, 13, 6, tzinfo=timezone.utc)

    def parse(self, body):
        return module.parse_rate(body, self.requested, self.now)

    def test_official_usd_and_nominal_normalization(self):
        self.assertEqual(self.parse(xml())["rate"], 83.9153)
        self.assertEqual(self.parse(xml(nominal="100", value="8391,53"))["rate"], 83.9153)

    def test_previous_working_day_is_valid_for_requested_day(self):
        rate = self.parse(xml(day="09.10.2026"))
        self.assertEqual(rate["checkedFor"], "2026-10-13")
        self.assertEqual(rate["date"], "2026-10-09")

    def test_future_document_or_missing_usd_are_rejected(self):
        for body in [xml(day="14.10.2026"), xml(code="EUR"), b"<html>Error</html>"]:
            with self.assertRaises(ValueError):
                self.parse(body)

    def test_invalid_money_is_rejected(self):
        for body in [xml(value="0"), xml(value="-1"), xml(nominal="0"), xml(value="NaN"), xml(value="1E999")]:
            with self.assertRaises(ValueError):
                self.parse(body)

    def test_same_day_does_not_create_hourly_commits(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cbr.json"
            first = self.parse(xml())
            self.assertTrue(module.write_rate(path, first))
            later = {**first, "verifiedAt": "2026-10-13T12:00:00+00:00"}
            self.assertFalse(module.write_rate(path, later))
            self.assertEqual(json.loads(path.read_text())["verifiedAt"], first["verifiedAt"])
            tomorrow = {**first, "checkedFor": "2026-10-14", "verifiedAt": "2026-10-14T03:00:00+00:00"}
            self.assertTrue(module.write_rate(path, tomorrow))

    def test_bad_snapshot_is_replaced_only_with_valid_official_data(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cbr.json"
            path.write_text("broken JSON")
            self.assertTrue(module.write_rate(path, self.parse(xml())))
            self.assertEqual(json.loads(path.read_text())["rate"], 83.9153)

    def test_manual_refresh_can_verify_the_publication_path(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cbr.json"
            first = self.parse(xml())
            module.write_rate(path, first)
            later = {**first, "verifiedAt": "2026-10-13T12:00:00+00:00"}
            self.assertTrue(module.write_rate(path, later, force=True))
            self.assertEqual(json.loads(path.read_text())["verifiedAt"], later["verifiedAt"])


if __name__ == "__main__":
    unittest.main()
