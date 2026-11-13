"""Loads the integration into a real Home Assistant core and checks what it exposes."""

from datetime import timedelta

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_fire_time_changed,
)

from custom_components.axlebook.const import DOMAIN

URL = "http://axlebook.local:8080"
STATUS = f"{URL}/api/v1/status"


def vehicle(**patch):
    base = {
        "id": 1,
        "name": "Taco",
        "category": "car",
        "odometer": 84217,
        "odometerUnit": "mi",
        "nextService": {
            "title": "Oil change",
            "status": "due_soon",
            "dueDate": "2026-12-01",
            "daysLeft": 18,
            "distanceLeft": 300,
        },
        "overdue": 0,
        "dueSoon": 1,
        "documentsExpiring": 1,
        "openRecalls": 0,
        "needsAttention": True,
        "costToDate": 1234560,
    }
    return {**base, **patch}


def status(*vehicles):
    return {"version": "1.1.0", "currency": "USD", "vehicles": list(vehicles)}


async def setup(hass: HomeAssistant) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN, data={"url": URL, "token": "axb_test"}, unique_id=URL
    )
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_sensors_for_each_vehicle(hass: HomeAssistant, aioclient_mock) -> None:
    aioclient_mock.get(
        STATUS,
        json=status(
            vehicle(),
            vehicle(
                id=2,
                name="Sled",
                odometer=61,
                odometerUnit="hr",
                nextService=None,
                dueSoon=0,
                documentsExpiring=0,
                needsAttention=False,
            ),
        ),
    )
    entry = await setup(hass)
    assert entry.state is ConfigEntryState.LOADED
    # The token goes in the Authorization header, nowhere else.
    assert aioclient_mock.mock_calls[0][3]["Authorization"] == "Bearer axb_test"

    odometer = hass.states.get("sensor.taco_odometer")
    assert odometer.state == "84217"
    assert odometer.attributes["unit_of_measurement"] == "mi"
    assert odometer.attributes["device_class"] == "distance"

    nxt = hass.states.get("sensor.taco_next_service")
    assert nxt.state == "Oil change"
    assert nxt.attributes["status"] == "due_soon"
    assert nxt.attributes["distance_left"] == 300
    assert hass.states.get("sensor.taco_next_service_due").state == "2026-12-01"

    due = hass.states.get("sensor.taco_items_due")
    assert due.state == "2"
    assert due.attributes["documents_expiring"] == 1
    assert hass.states.get("binary_sensor.taco_needs_attention").state == "on"
    assert hass.states.get("binary_sensor.taco_service_overdue").state == "off"

    # An hour meter is a duration, and a vehicle with nothing due says so.
    hours = hass.states.get("sensor.sled_odometer")
    assert hours.state == "61"
    assert hours.attributes["unit_of_measurement"] == "h"
    assert hass.states.get("sensor.sled_next_service").state == "unknown"
    assert hass.states.get("sensor.sled_next_service_due").state == "unknown"
    assert hass.states.get("binary_sensor.sled_needs_attention").state == "off"


async def test_updates_and_new_vehicles(hass: HomeAssistant, aioclient_mock) -> None:
    aioclient_mock.get(STATUS, json=status(vehicle()))
    await setup(hass)
    assert hass.states.get("sensor.civic_odometer") is None

    aioclient_mock.clear_requests()
    aioclient_mock.get(
        STATUS,
        json=status(
            vehicle(odometer=84500, overdue=1, dueSoon=0),
            vehicle(id=3, name="Civic", odometer=20100),
        ),
    )
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=16))
    await hass.async_block_till_done()

    assert hass.states.get("sensor.taco_odometer").state == "84500"
    assert hass.states.get("binary_sensor.taco_service_overdue").state == "on"
    # A vehicle added to the garage shows up without reloading the integration.
    assert hass.states.get("sensor.civic_odometer").state == "20100"


async def test_unavailable_when_the_server_is_down(hass: HomeAssistant, aioclient_mock) -> None:
    aioclient_mock.get(STATUS, json=status(vehicle()))
    await setup(hass)
    aioclient_mock.clear_requests()
    aioclient_mock.get(STATUS, status=502)
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=16))
    await hass.async_block_till_done()
    assert hass.states.get("sensor.taco_odometer").state == "unavailable"


async def test_bad_token_asks_for_a_new_one(hass: HomeAssistant, aioclient_mock) -> None:
    aioclient_mock.get(STATUS, status=401)
    entry = await setup(hass)
    assert entry.state is ConfigEntryState.SETUP_ERROR

    # Home Assistant opens a flow asking for a new token.
    flows = hass.config_entries.flow.async_progress()
    assert [f["step_id"] for f in flows] == ["reauth_confirm"]
    result = await hass.config_entries.flow.async_configure(
        flows[0]["flow_id"], {"token": "still-wrong"}
    )
    assert result["errors"] == {"base": "invalid_auth"}

    aioclient_mock.clear_requests()
    aioclient_mock.get(STATUS, json=status(vehicle()))
    result = await hass.config_entries.flow.async_configure(
        flows[0]["flow_id"], {"token": " axb_new "}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "reauth_successful"
    await hass.async_block_till_done()
    assert entry.data["token"] == "axb_new"
    assert entry.state is ConfigEntryState.LOADED
    assert hass.states.get("sensor.taco_odometer").state == "84217"


async def test_config_flow(hass: HomeAssistant, aioclient_mock) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] is FlowResultType.FORM

    # A wrong address, then a refused token: the form comes back with a reason.
    aioclient_mock.get(STATUS, exc=TimeoutError())
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"url": f"{URL}/", "token": "axb_test"}
    )
    assert result["errors"] == {"base": "cannot_connect"}
    aioclient_mock.clear_requests()
    aioclient_mock.get(STATUS, status=401)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"url": f"{URL}/", "token": "nope"}
    )
    assert result["errors"] == {"base": "invalid_auth"}
    aioclient_mock.clear_requests()
    aioclient_mock.get(STATUS, json={"hello": "not axlebook"})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"url": f"{URL}/", "token": "axb_test"}
    )
    assert result["errors"] == {"base": "cannot_connect"}

    aioclient_mock.clear_requests()
    aioclient_mock.get(STATUS, json=status(vehicle()))
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"url": f" {URL}/ ", "token": " axb_test "}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"] == {"url": URL, "token": "axb_test"}
    await hass.async_block_till_done()

    # The same server can't be added twice.
    again = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    again = await hass.config_entries.flow.async_configure(
        again["flow_id"], {"url": URL, "token": "axb_test"}
    )
    assert again["type"] is FlowResultType.ABORT
