"""Vorm van de data die de app krijgt. Bedragen in euro, tenzij `cur` iets anders zegt (koers)."""

from dataclasses import asdict, dataclass, field
from typing import Literal

Category = Literal["eq", "cr", "cash", "gold"]
Class = Literal["ETF", "Aandeel", "Crypto", "Cash", "Goud"]


@dataclass
class Wallet:
    name: str
    qty: str
    value: float
    icon: Literal["lock", "currency_exchange"]
    note: str


@dataclass
class Position:
    id: str
    tk: str
    name: str
    cls: Class
    cat: Category
    src: str
    value: float
    tile: int  # 1 aandelen, 2 crypto, 3 sparen, 4 betaal, 5 goud (kleurvak in de app)
    qty: float | None = None
    unit: str | None = None
    price: float | None = None
    cur: str | None = None
    cost: float | None = None
    dayChange: float | None = None  # % vandaag, als de bron dat weet
    wallets: list[Wallet] | None = None
    rate: str | None = None
    note: str | None = None
    manual: bool = False

    def to_json(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None and v is not False}


@dataclass
class SourceResult:
    id: str
    name: str
    positions: list[Position] = field(default_factory=list)
    change: float | None = None  # % vandaag over de hele bron
    sub: str | None = None
    warnings: list[str] = field(default_factory=list)

    @property
    def value(self) -> float:
        return sum(p.value for p in self.positions)
