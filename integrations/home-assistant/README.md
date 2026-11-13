# Axlebook for Home Assistant

Shows each vehicle in your Axlebook garage as a device in Home Assistant, with its odometer, its
next service and whether anything needs attention. It polls your own Axlebook server every 15
minutes over your network; nothing goes anywhere else.

## What you get

One device per vehicle (archived vehicles are left out), each with:

| Entity                                    | State                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `sensor.<vehicle>_odometer`               | Latest reading, in the vehicle's own unit (mi, km, or hours for hour meters)                                         |
| `sensor.<vehicle>_next_service`           | Name of the most urgent reminder. Attributes: `status`, `due_date`, `days_left`, `distance_left`                     |
| `sensor.<vehicle>_next_service_due`       | The date it comes due. For distance reminders this is the date Axlebook predicts from how much the vehicle is driven |
| `sensor.<vehicle>_items_due`              | How many things need attention. Attributes: `overdue`, `due_soon`, `documents_expiring`, `open_recalls`              |
| `binary_sensor.<vehicle>_needs_attention` | On when anything is overdue, due soon, expiring or under an open recall                                              |
| `binary_sensor.<vehicle>_service_overdue` | On when at least one reminder is overdue                                                                             |

A vehicle added to Axlebook later appears on the next poll without reloading the integration.

## Install

1. In Axlebook, open **Settings → API tokens** and create a token (it starts with `axb_`).
2. Copy the `custom_components/axlebook` folder from this directory into the `custom_components`
   folder of your Home Assistant configuration, then restart Home Assistant.
3. In Home Assistant, go to **Settings → Devices & services → Add integration**, search for
   **Axlebook**, and enter your server's address and the token.

The address is whatever you open Axlebook at, for example `http://192.168.1.20:8080`, or
`https://cars.example.com/axlebook` if it sits behind a reverse proxy at a subpath.

The token sees what its owner sees: that person's vehicles and the ones shared with them. A token
for a view-only account is enough.

## Example automation

```yaml
automation:
  - alias: Tell me when the truck needs something
    trigger:
      - platform: state
        entity_id: binary_sensor.taco_needs_attention
        to: "on"
    action:
      - service: notify.mobile_app_phone
        data:
          title: Taco needs attention
          message: >
            Next up: {{ states('sensor.taco_next_service') }}
            ({{ state_attr('sensor.taco_next_service', 'status') }}).
```

## Without installing anything

The integration reads one endpoint, `GET /api/v1/status`, and Home Assistant's built-in REST
sensor can read it too:

```yaml
rest:
  - resource: http://192.168.1.20:8080/api/v1/status
    headers:
      Authorization: Bearer axb_your_token
    scan_interval: 900
    sensor:
      - name: Taco odometer
        value_template: "{{ value_json.vehicles | selectattr('name', 'eq', 'Taco') | map(attribute='odometer') | first }}"
        unit_of_measurement: mi
      - name: Taco next service
        value_template: "{{ (value_json.vehicles | selectattr('name', 'eq', 'Taco') | first).nextService.title | default('None') }}"
    binary_sensor:
      - name: Taco needs attention
        value_template: "{{ (value_json.vehicles | selectattr('name', 'eq', 'Taco') | first).needsAttention }}"
```

The response is documented with the rest of the API at `/api/docs` on your server.

## Developing

```bash
cd integrations/home-assistant
python -m venv .venv && .venv/bin/pip install -r requirements-test.txt
.venv/bin/python -m pytest
```

The tests load the integration into a real Home Assistant core with a stubbed server.
