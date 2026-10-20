"""
Small HEALPix helpers shared by the examples.

Every function here is short on purpose. The point of the examples is that
working with HEALPix needs no framework, only a handful of facts about the
grid, and this module is those facts written down once so the examples can
stay about the science.

Nothing in here is Waterpark-specific except :func:`open_hub`, which only
fills in the anonymous S3 credentials for the public endpoint.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Tuple

import matplotlib

matplotlib.use("Agg")  # the examples render headless, in CI and locally

import matplotlib.pyplot as plt
import numpy as np
import xarray as xr
from healpix_geo import nested

S3_ENDPOINT = os.environ.get("WATERPARK_S3_ENDPOINT", "https://s3.waterpark.dkrz.de")

#: Where a script's figure ends up. ``build_exmaples.py`` overrides this.
FIGURE_DIR = Path(os.environ.get("WATERPARK_EXAMPLES_FIGURES", "figures"))


def open_hub(url: str, **kwargs) -> xr.Dataset:
    """Open a public Waterpark store.

    ``chunks=None`` is the default on purpose. It gives plain lazy
    Zarr-backed arrays that slice in the size of the selection, rather than
    dask arrays whose chunk grid is built eagerly from the *global* shape.
    At the pyramid levels used in the examples either would work; at level
    16 only this one does, so it is the habit worth having.
    """
    kwargs.setdefault("chunks", None)
    kwargs.setdefault("consolidated", True)
    return xr.open_zarr(
        url,
        storage_options={"anon": True, "endpoint_url": S3_ENDPOINT},
        **kwargs,
    )


def level_of(ds: xr.Dataset | xr.DataArray) -> int:
    """Return the HEALPix level (``nside = 2**level``) of a store.

    Read from the CF grid mapping when it is there, and otherwise derived
    from the cell count, since ``npix = 12 * 4**level`` leaves no room for
    ambiguity.
    """
    order = str(ds.attrs.get("healpix_order", "nested")).lower()
    if order not in {"nested", "nest"}:
        raise ValueError(
            f"this store is in {order!r} ordering; everything here assumes nested"
        )
    for source in (ds.attrs, ds.coords.get("crs", xr.DataArray()).attrs):
        for key in ("healpix_level", "level"):
            if key in source:
                return int(source[key])
        if "healpix_nside" in source:
            return int(np.log2(int(source["healpix_nside"])))

    npix = ds.sizes["cell"]
    level = int(round(np.log2(npix / 12) / 2))
    if 12 * 4**level != npix:
        raise ValueError(f"{npix} cells is not a valid HEALPix map")
    return level


def cell_lonlat(ds: xr.Dataset | xr.DataArray) -> Tuple[np.ndarray, np.ndarray]:
    """Longitude and latitude of every cell centre, in degrees.

    Global pyramid levels ship materialised coordinates, so this usually
    just hands them back. High-level regional stores do not, because the
    arrays would cost hundreds of gigabytes to store information that is a
    pure function of the cell index, so they get computed instead.
    """
    if "longitude" in ds.coords and "latitude" in ds.coords:
        return (
            np.asarray(ds["longitude"].values, dtype="float64"),
            np.asarray(ds["latitude"].values, dtype="float64"),
        )

    cells = np.asarray(
        ds["cell"].values if "cell" in ds.coords else np.arange(ds.sizes["cell"])
    )
    lon, lat = nested.healpix_to_lonlat(cells.astype("uint64"), level_of(ds))
    return np.asarray(lon), np.asarray(lat)


def ring_index(latitude: np.ndarray) -> np.ndarray:
    """Map each cell onto its HEALPix ring, numbered from the south pole.

    A HEALPix map of level ``k`` has exactly ``4 * 2**k - 1`` rings of
    constant latitude, and every cell sits on one of them. The latitude
    coordinate is therefore not a continuous variable at all: it takes that
    many distinct values and no others, which is what makes grouping by it
    exact rather than a binning approximation.

    Rounding first is defensive. The values come out of a coordinate array
    that was computed and written by something else, and two cells on the
    same ring can differ in the last bit or two.
    """
    _, inverse = np.unique(np.round(latitude, 8), return_inverse=True)
    return inverse


def rasterize(
    values: np.ndarray,
    level: int,
    nlon: int = 1440,
    nlat: int = 720,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Sample a HEALPix map onto a plain lon/lat raster for plotting.

    This is nearest neighbour, not interpolation: each raster point is
    given the value of the cell it falls into. That is deliberate. It draws
    the real cell boundaries instead of smoothing them away, so a map made
    this way shows you the grid you actually have.

    Returns the raster together with the longitudes and latitudes of its
    points, ready for ``pcolormesh(..., transform=PlateCarree())``.
    """
    lon = np.linspace(-180.0, 180.0, nlon)
    lat = np.linspace(90.0, -90.0, nlat)
    mesh_lon, mesh_lat = np.meshgrid(lon, lat)

    cells = nested.lonlat_to_healpix(mesh_lon.ravel(), mesh_lat.ravel(), level).astype(
        "int64"
    )

    flat = np.asarray(values).ravel()
    return flat[cells].reshape(mesh_lat.shape), lon, lat


def savefig(fig: plt.Figure, name: str | None = None) -> Path:
    """Write the figure the page will show.

    One figure per example, named after the script, so the build script can
    pair a page with its plot without being told.
    """
    import __main__

    stem = name or Path(getattr(__main__, "__file__", "example")).stem
    FIGURE_DIR.mkdir(parents=True, exist_ok=True)
    path = FIGURE_DIR / f"{stem}.png"
    fig.savefig(path, dpi=110, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"wrote {path}")
    return path


def coastlines(ax) -> None:
    """Draw coastlines, and carry on without them if they cannot be fetched.

    Cartopy downloads the Natural Earth shapefiles on first use and caches
    them. That download is the single flakiest thing in this examples: it is
    a third-party host, it is unrelated to the data being plotted, and a
    rate limit there should not turn into a failed documentation build.
    """
    import cartopy.feature as cfeature

    feature = cfeature.NaturalEarthFeature("physical", "coastline", "110m")
    try:
        # Touch the geometries now. Cartopy otherwise defers the download to
        # draw time, where the failure surfaces inside savefig and takes the
        # whole figure with it.
        list(feature.geometries())
    except Exception as error:  # pragma: no cover - network dependent
        print(f"coastlines unavailable ({error}); drawing without them")
        return
    ax.add_feature(feature, linewidth=0.4, edgecolor="0.25", facecolor="none")


def basemap(
    ax_or_none=None,
    projection: str = "Robinson",
    **subplot_kwargs,
):
    """A map axis with coastlines, or a bare one if cartopy is missing.

    Cartopy is the only heavy dependency in the examples and the only one
    that is not strictly needed: without it every map still renders, just
    without coastlines. Keeping that path alive means a contributor can run
    an example without a conda environment.
    """
    try:
        import cartopy.crs as ccrs

        proj = getattr(ccrs, projection)()
        fig, ax = plt.subplots(subplot_kw={"projection": proj}, **subplot_kwargs)
        coastlines(ax)
        ax.set_global()
        return fig, ax, ccrs.PlateCarree()
    except ImportError:  # pragma: no cover - depends on the environment
        fig, ax = plt.subplots(**subplot_kwargs)
        ax.set_xlim(-180, 180)
        ax.set_ylim(-90, 90)
        ax.set_aspect("equal")
        return fig, ax, None


def map_panel(fig, nrows: int, ncols: int, index: int, projection: str = "Robinson"):
    """One map panel inside an existing figure. Same fallback as `basemap`."""
    try:
        import cartopy.crs as ccrs

        ax = fig.add_subplot(
            nrows, ncols, index, projection=getattr(ccrs, projection)()
        )
        coastlines(ax)
        ax.set_global()
        return ax, ccrs.PlateCarree()
    except ImportError:  # pragma: no cover - depends on the environment
        ax = fig.add_subplot(nrows, ncols, index)
        ax.set_xlim(-180, 180)
        ax.set_ylim(-90, 90)
        ax.set_aspect("equal")
        return ax, None


def transform_kwargs(transform) -> dict:
    """``transform=`` for cartopy, nothing at all without it."""
    return {"transform": transform} if transform is not None else {}
