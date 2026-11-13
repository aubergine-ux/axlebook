"""Shared base: one Home Assistant device per vehicle."""

from __future__ import annotations

from typing import Any

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CONF_URL, DOMAIN
from .coordinator import AxlebookCoordinator


class AxlebookEntity(CoordinatorEntity[AxlebookCoordinator]):
    """An entity that reads one vehicle's status."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: AxlebookCoordinator, vehicle_id: int, key: str) -> None:
        super().__init__(coordinator)
        self.vehicle_id = vehicle_id
        entry_id = coordinator.entry.entry_id
        self._attr_unique_id = f"{entry_id}_{vehicle_id}_{key}"
        self._attr_translation_key = key
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{entry_id}_{vehicle_id}")},
            name=self.vehicle.get("name") if self.vehicle else None,
            manufacturer="Axlebook",
            configuration_url=(
                f"{coordinator.entry.data[CONF_URL]}/vehicles/{vehicle_id}"
            ),
        )

    @property
    def vehicle(self) -> dict[str, Any] | None:
        """This vehicle's status, or None once it's gone from the garage."""
        return self.coordinator.data.get(self.vehicle_id) if self.coordinator.data else None

    @property
    def available(self) -> bool:
        return super().available and self.vehicle is not None
