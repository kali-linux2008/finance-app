"""Instellingen uit omgevingsvariabelen (zie .env.example)."""

import os
from pathlib import Path
from zoneinfo import ZoneInfo

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def _load_env(path: Path) -> None:
    """Leest .env (KEY=waarde per regel) zonder extra pakket; echte omgevingsvariabelen gaan voor."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


_load_env(ENV_PATH)

DATA_DIR = Path(os.environ.get("MERIDIAN_DATA", Path(__file__).resolve().parent.parent / "data"))
DB_PATH = DATA_DIR / "meridian.db"
# Waar build/android/bouw.sh de nieuwe app (meridian.apk + versie.json) neerzet.
APP_DIR = Path(os.environ.get("MERIDIAN_APP_DIR", Path(__file__).resolve().parent.parent.parent / "out"))

# Openbare blockchain-dienst voor je Trezor-saldo. Draai je later je eigen node met mempool,
# zet dan hier je eigen adres neer: dan ziet niemand anders welke adressen van jou zijn.
ESPLORA_URL = os.environ.get("MERIDIAN_ESPLORA_URL", "https://mempool.space/api")
OKX_URL = os.environ.get("MERIDIAN_OKX_URL", "https://www.okx.com")

TZ = ZoneInfo("Europe/Amsterdam")


KEY_PATH = DATA_DIR / "master.key"


def master_key(create: bool = False) -> str:
    """Sleutel waarmee de API-sleutels in de database versleuteld worden.

    Uit de omgevingsvariabele MERIDIAN_MASTER_KEY, anders uit data/master.key
    (alleen leesbaar voor de eigenaar). Zonder deze sleutel zijn opgeslagen geheimen onleesbaar.
    """
    key = os.environ.get("MERIDIAN_MASTER_KEY")
    if key:
        return key
    if KEY_PATH.exists():
        return KEY_PATH.read_text().strip()
    if not create:
        raise RuntimeError("Geen hoofdsleutel gevonden. Draai eerst: python -m meridian init")
    from cryptography.fernet import Fernet

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    key = Fernet.generate_key().decode()
    KEY_PATH.write_text(key + "\n")
    KEY_PATH.chmod(0o600)
    return key
