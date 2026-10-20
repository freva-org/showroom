"""
Every store, variable name and time window the exmamples touch.

This file exists so that a renamed variable or a re-published store is one
edit rather than eight. If an example fails with a ``KeyError`` on a
variable, the fix belongs here and nowhere else.

The windows are short on purpose. ERA5 at hourly resolution has close to a
million time steps; an example that forgets to slice time before doing
anything else is not a minimal example, it is an outage.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Store:
    """One Zarr store on the hub, plus what the examples need from it."""

    url: str
    variable: str
    label: str
    #: Printable units, used for axis labels. Read from the file when
    #: present; this is the fallback and the documentation of intent.
    units: str = ""


#: ECMWF ERA5 reanalysis, hourly, HEALPix level 4 (nside 16, ~440 km cells).
#: Coarse on purpose: it is the level where a whole map is a few tens of
#: kilobytes, which is what makes the examples runnable in CI.
ERA5 = Store(
    url="s3://reanalysis/healpix/era5/PT1H/level_4.zarr",
    variable="tas",
    label="ERA5",
    units="K",
)

#: The same ERA5 reanalysis as daily means. The hub is a pyramid in time as
#: well as in space, and anything whose output is daily should start here
#: rather than average an hourly store down by hand.
ERA5_DAILY = Store(
    url="s3://reanalysis/healpix/era5/P1D/level_4.zarr",
    variable="tas",
    label="ERA5",
    units="K",
)

#: nextGEMS ICON cycle 4 (ngc4008), daily, HEALPix level 5 (nside 32).
#: One level finer than ERA5 above, which is the whole point of the
#: cross-dataset example.
NGC4008 = Store(
    url="s3://nextgems/healpix/ngc4008/P1D/level_5.zarr",
    variable="tas",
    label="nextGEMS ngc4008",
    units="K",
)

#: The same nextGEMS store one level coarser. Used to check that stepping
#: down the pyramid and averaging four cells by hand give the same answer.
NGC4008_L4 = Store(
    url="s3://nextgems/healpix/ngc4008/P1D/level_4.zarr",
    variable="tas",
    label="nextGEMS ngc4008 (level 4)",
    units="K",
)

#: A single time step, used by the map examples.
TIMESTAMP = "2021-07-01T12:00"

#: A window both datasets cover, used by the time series and comparison
#: examples. Keep it to a year: it is long enough to average a season out
#: of and small enough to download in a CI job.
WINDOW = ("2021-01-01", "2021-12-31")

#: The box used by the region example: roughly Europe.
BOX = {"lon": (-15.0, 35.0), "lat": (35.0, 70.0), "name": "Europe"}
