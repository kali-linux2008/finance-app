"""Netwerkhulp: één keer opnieuw proberen bij een korte storing, alleen bij opvragen (GET).

Een order (POST) wordt nooit automatisch herhaald: dan zou hij dubbel kunnen gaan.
"""

import asyncio

import httpx

RETRY_AFTER = 1.0
_sleep = asyncio.sleep  # in tests te vervangen


async def request(client: httpx.AsyncClient, method: str, url: str, **kwargs) -> httpx.Response:
    try:
        return await client.request(method, url, **kwargs)
    except httpx.TransportError:  # verbinding mislukt of time-out; geen antwoord van de server
        if method.upper() != "GET":
            raise
        await _sleep(RETRY_AFTER)
        return await client.request(method, url, **kwargs)
