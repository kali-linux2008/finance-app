import os
import tempfile

# Tests mogen nooit in de echte data-map schrijven (hoofdsleutel, database).
os.environ["MERIDIAN_DATA"] = tempfile.mkdtemp(prefix="meridian-test-")

import pytest
from cryptography.fernet import Fernet

from meridian import portfolio, prices
from meridian.sources import trading212, trezor
from meridian.store import Store


@pytest.fixture
def store():
    return Store(":memory:", key=Fernet.generate_key().decode())


@pytest.fixture(autouse=True)
def clear_caches():
    prices._cache.clear()
    trading212._meta.clear()
    portfolio._cache.clear()
    trezor._preferred = None
    yield
