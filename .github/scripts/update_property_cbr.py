"""Fetch official CBR USD and THB rates for today's Moscow date and save atomically."""
import argparse
import json
import math
import subprocess
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo


def parse_rate(xml: bytes, requested: date, verified_at: datetime) -> dict:
    root = ET.fromstring(xml)
    if root.tag != "ValCurs":
        raise ValueError("Unexpected CBR XML document")
    effective = datetime.strptime(root.attrib["Date"], "%d.%m.%Y").date()
    if effective > requested:
        raise ValueError("CBR returned a future rate")
    def normalized(code):
        item = next((item for item in root.findall("Valute") if item.findtext("CharCode") == code), None)
        if item is None:
            raise ValueError(code + " is missing from CBR XML")
        nominal = Decimal(item.findtext("Nominal"))
        value = Decimal(item.findtext("Value").replace(",", "."))
        if not nominal.is_finite() or nominal <= 0 or not value.is_finite() or value <= 0:
            raise ValueError("Invalid CBR " + code + " rate")
        rate = float(value / nominal)
        if not math.isfinite(rate) or rate <= 0:
            raise ValueError("Invalid normalized CBR " + code + " rate")
        return rate
    rate = normalized("USD")
    thb = normalized("THB")
    requested_text = requested.strftime("%d.%m.%Y")
    return {
        "currency": "USD",
        "rate": rate,
        "thbRub": thb,
        "date": effective.isoformat(),
        "checkedFor": requested.isoformat(),
        "verifiedAt": verified_at.astimezone(timezone.utc).isoformat(),
        "source": "https://www.cbr.ru/scripts/XML_daily.asp?date_req=" + requested.strftime("%d/%m/%Y"),
        "url": "https://www.cbr.ru/currency_base/daily/?UniDbQuery.Posted=True&UniDbQuery.To=" + requested_text,
    }


def write_rate(path: Path, data: dict, force: bool = False) -> bool:
    if path.exists() and not force:
        try:
            previous = json.loads(path.read_text())
            timestamp_valid = datetime.fromisoformat(previous["verifiedAt"]).astimezone(ZoneInfo("Europe/Moscow")).date().isoformat() == data["checkedFor"]
        except (ValueError, KeyError, TypeError):
            previous, timestamp_valid = {}, False
        fields = [key for key in data if key != "verifiedAt"]
        if timestamp_valid and all(previous.get(key) == data[key] for key in fields):
            return False
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", type=Path, default=Path("thai-payments/cbr.json"))
    parser.add_argument("--force-refresh", action="store_true", help="Refresh the verification timestamp for a manual publication check")
    arguments = parser.parse_args()
    path = arguments.path
    now = datetime.now(ZoneInfo("Europe/Moscow"))
    requested = now.date()
    source = "https://www.cbr.ru/scripts/XML_daily.asp?date_req=" + requested.strftime("%d/%m/%Y")
    # curl uses the runner's trusted system CA store. TLS verification stays enabled.
    result = subprocess.run([
        "curl", "--fail", "--silent", "--show-error", "--location",
        "--retry", "2", "--retry-delay", "2", "--max-time", "20", source,
    ], check=True, capture_output=True)
    data = parse_rate(result.stdout, requested, now)
    changed = write_rate(path, data, force=arguments.force_refresh)
    print(f"CBR USD {data['rate']} for {data['checkedFor']}: {'updated' if changed else 'already current'}")


if __name__ == "__main__":
    main()
