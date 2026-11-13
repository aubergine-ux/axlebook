"""Binary sensors: does this vehicle need attention, and is anything overdue."""

from __future__ import annotations

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .coordinator import AxlebookCoordinator
from .entity import AxlebookEntity


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Add binary sensors for every vehicle, and for vehicles added later."""
    coordinator: AxlebookCoordinator = hass.data[DOMAIN][entry.entry_id]
    known: set[int] = set()

    @callback
    def add_new() -> None:
        new = [vid for vid in (coordinator.data or {}) if vid not in known]
        known.update(new)
        if new:
            async_add_entities(
                entity
                for vid in new
                for entity in (
                    AttentionSensor(coordinator, vid),
                    OverdueSensor(coordinator, vid),
                )
            )

    add_new()
    entry.async_on_unload(coordinator.async_add_listener(add_new))


class AttentionSensor(AxlebookEntity, BinarySensorEntity):
    """On when anything is overdue, due soon, expiring or under recall."""

    _attr_device_class = BinarySensorDeviceClass.PROBLEM

    def __init__(self, coordinator: AxlebookCoordinator, vehicle_id: int) -> None:
        super().__init__(coordinator, vehicle_id, "needs_attention")

    @property
    def is_on(self) -> bool | None:
        return bool(self.vehicle.get("needsAttention")) if self.vehicle else None


class OverdueSensor(AxlebookEntity, BinarySensorEntity):
    """On when at least one reminder is overdue."""

    _attr_device_class = BinarySensorDeviceClass.PROBLEM

    def __init__(self, coordinator: AxlebookCoordinator, vehicle_id: int) -> None:
        super().__init__(coordinator, vehicle_id, "service_overdue")

    @property
    def is_on(self) -> bool | None:
        return self.vehicle.get("overdue", 0) > 0 if self.vehicle else None
