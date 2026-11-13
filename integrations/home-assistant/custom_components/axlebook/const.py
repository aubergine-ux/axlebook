"""Constants for the Axlebook integration."""

from datetime import timedelta

DOMAIN = "axlebook"
CONF_URL = "url"
CONF_TOKEN = "token"
# Odometers and due dates change a few times a day at most.
UPDATE_INTERVAL = timedelta(minutes=15)
STATUS_PATH = "/api/v1/status"
