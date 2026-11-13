"""Sensors: odometer, next service and how many things are due."""

from __future__ import annotations

from datetime import date
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfLength, UnitOfTime
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .coordinator import AxlebookCoordinator
from .entity import AxlebookEntity

# Axlebook odometer unit → (Home Assistant unit, device class)
UNITS: dict[str, tuple[str, SensorDeviceClass]] = {
    "mi": (UnitOfLength.MILES, SensorDeviceClass.DISTANCE),
    "km": (UnitOfLength.KILOMETERS, SensorDeviceClass.DISTANCE),
    "hr": (UnitOfTime.HOURS, SensorDeviceClass.DURATION),
}


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Add sensors for every vehicle, and for vehicles added to the garage later."""
    coordinator: AxlebookCoordinator = hass.data[DOMAIN][entry.entry_id]
    known: set[int] = set()

    @callback
    def add_new() -> None:
        new = [vid for vid in (coordinator.data or {}) if vid not in known]
        known.update(new)
        entities: list[SensorEntity] = []
        for vid in new:
            entities += [
                OdometerSensor(coordinator, vid),
                NextServiceSensor(coordinator, vid),
                NextServiceDueSensor(coordinator, vid),
                ItemsDueSensor(coordinator, vid),
            ]
        if entities:
            async_add_entities(entities)

    add_new()
    entry.async_on_unload(coordinator.async_add_listener(add_new))


class OdometerSensor(AxlebookEntity, SensorEntity):
    """The latest odometer (or hour meter) reading."""

    _attr_state_class = SensorStateClass.TOTAL_INCREASING

    def __init__(self, coordinator: AxlebookCoordinator, vehicle_id: int) -> None:
        super().__init__(coordinator, vehicle_id, "odometer")
        unit, device_class = UNITS.get(
            (self.vehicle or {}).get("odometerUnit", "mi"), UNITS["mi"]
        )
        self._attr_native_unit_of_measurement = unit
        self._attr_device_class = device_class
        # Show the reading as it is on the dash, not converted to the house's unit system.
        self._attr_suggested_unit_of_measurement = unit
        self._attr_suggested_display_precision = 0

    @property
    def native_value(self) -> int | None:
        return self.vehicle.get("odometer") if self.vehicle else None


class NextServiceSensor(AxlebookEntity, SensorEntity):
    """The most urgent reminder, by name."""

    def __init__(self, coordinator: AxlebookCoordinator, vehicle_id: int) -> None:
        super().__init__(coordinator, vehicle_id, "next_service")

    @property
    def _next(self) -> dict[str, Any] | None:
        return (self.vehicle or {}).get("nextService")

    @property
    def native_value(self) -> str | None:
        return self._next["title"] if self._next else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        nxt = self._next or {}
        return {
            "status": nxt.get("status"),
            "due_date": nxt.get("dueDate"),
            "days_left": nxt.get("daysLeft"),
            "distance_left": nxt.get("distanceLeft"),
        }


class NextServiceDueSensor(AxlebookEntity, SensorEntity):
    """When the most urgent reminder comes due (its date, or the predicted one)."""

    _attr_device_class = SensorDeviceClass.DATE

    def __init__(self, coordinator: AxlebookCoordinator, vehicle_id: int) -> None:
        super().__init__(coordinator, vehicle_id, "next_service_due")

    @property
    def native_value(self) -> date | None:
        due = ((self.vehicle or {}).get("nextService") or {}).get("dueDate")
        try:
            return date.fromisoformat(due) if due else None
        except ValueError:
            return None


class ItemsDueSensor(AxlebookEntity, SensorEntity):
    """How many reminders, documents and recalls need attention."""

    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: AxlebookCoordinator, vehicle_id: int) -> None:
        super().__init__(coordinator, vehicle_id, "items_due")

    @property
    def native_value(self) -> int | None:
        v = self.vehicle
        if v is None:
            return None
        return (
            v.get("overdue", 0)
            + v.get("dueSoon", 0)
            + v.get("documentsExpiring", 0)
            + v.get("openRecalls", 0)
        )

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        v = self.vehicle or {}
        return {
            "overdue": v.get("overdue"),
            "due_soon": v.get("dueSoon"),
            "documents_expiring": v.get("documentsExpiring"),
            "open_recalls": v.get("openRecalls"),
        }
