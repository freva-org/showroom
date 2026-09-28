This is real Python, running in this page: no install, no account, no
download. The snippet asks Freva for Waterpark's ERA5 monthly means, opens the
Zarr store lazily, and maps July 2021 near-surface air temperature, one dot per
HEALPix cell.

Press **Try in Python** to run it. The code is yours to change: pick another
month, swap `tas` for another variable, or point the search at a different
dataset, then run it again. **Reset** brings the original back.

```python try-in-python title="ERA5, July 2021: near-surface temperature"
import xarray as xr
import matplotlib.pyplot as plt
import cartopy.crs as ccrs
from freva_client import databrowser

# Ask Freva what exists. This is metadata only; nothing is downloaded yet.
db = databrowser(
    project="waterpark",
    product="reanalysis-healpix",
    model="ifs-cy41r2",
    experiment="era5",
    time_frequency="mon",
    host="https://freva.dkrz.de",
)

url = list(db)[0]

# Open lazily, then read just one month.
ds = xr.open_zarr(url, chunks={})
tas = ds["tas"].sel(time="2021-07").compute()

ax = plt.axes(projection=ccrs.Robinson())
sc = ax.scatter(
    tas.longitude, tas.latitude,
    c=tas - 273.15,
    s=8,
    cmap="RdBu_r",
    transform=ccrs.PlateCarree(),
)

ax.coastlines()
ax.set_global()
plt.colorbar(sc, label="Temperature [°C]")
plt.show()
```

![What Try in Python draws with the code above: ERA5 near-surface temperature, July 2021.](../../assets/landing/playground-result.png#only-dark)
![What Try in Python draws with the code above: ERA5 near-surface temperature, July 2021.](../../assets/landing/playground-result-light.png#only-light)
/// caption
What Try in Python draws with the code above: ERA5 near-surface temperature, July 2021.
///

The first run loads Python and the scientific libraries into your browser, so
it takes a moment; after that, runs are quick. It uses your own CPU and
network: the search goes to `freva.dkrz.de` and the data comes straight from
`s3.waterpark.dkrz.de`.
