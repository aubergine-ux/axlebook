"""Fetches the garage status from an Axlebook server."""

from __future__ import annotations

import logging
from typing import Any

import aiohttp

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import CONF_TOKEN, CONF_URL, DOMAIN, STATUS_PATH, UPDATE_INTERVAL

_LOGGER = logging.getLogger(__name__)


class AxlebookAuthError(Exception):
    """The API token was refused."""


class AxlebookConnectionError(Exception):
    """The server could not be reached or answered with something unexpected."""


async def fetch_status(
    session: aiohttp.ClientSession, url: str, token: str
) -> dict[str, Any]:
    """Read /api/v1/status. Raises AxlebookAuthError or AxlebookConnectionError."""
    endpoint = f"{url.rstrip('/')}{STATUS_PATH}"
    try:
        async with session.get(
            endpoint,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            timeout=aiohttp.ClientTimeout(total=20),
        ) as response:
            if response.status in (401, 403):
                raise AxlebookAuthError
            if response.status != 200:
                raise AxlebookConnectionError(f"HTTP {response.status}")
            data = await response.json()
    except (aiohttp.ClientError, TimeoutError, ValueError) as err:
        raise AxlebookConnectionError(str(err)) from err
    if not isinstance(data, dict) or not isinstance(data.get("vehicles"), list):
        raise AxlebookConnectionError("not an Axlebook status response")
    return data


class AxlebookCoordinator(DataUpdateCoordinator[dict[int, dict[str, Any]]]):
    """Polls the server; `data` maps vehicle id to its status."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=UPDATE_INTERVAL,
        )
        self.entry = entry
        self.currency: str | None = None

    async def _async_update_data(self) -> dict[int, dict[str, Any]]:
        session = async_get_clientsession(self.hass)
        try:
            status = await fetch_status(
                session, self.entry.data[CONF_URL], self.entry.data[CONF_TOKEN]
            )
        except AxlebookAuthError as err:
            raise ConfigEntryAuthFailed("The API token was refused") from err
        except AxlebookConnectionError as err:
            raise UpdateFailed(f"Could not reach Axlebook: {err}") from err
        self.currency = status.get("currency")
        return {vehicle["id"]: vehicle for vehicle in status["vehicles"]}
