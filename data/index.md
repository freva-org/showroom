---
title: Waterpark
description: The HEALPix data hub on S3 - reanalyses, climate model output, campaign data and satellite products on one equal-area grid, ready to read from anywhere.
template: home.html
hide:
  - navigation
  - toc
  - footer
---

<div class="portal-hero-row" data-columns="two" data-aside="wide">
<div class="portal-hero-lead">
<section class="portal-hero">
<p class="portal-eyebrow">The HEALPix data hub on S3</p>
<h1 class="portal-hero-heading">Every dataset on one grid. Read only what you need.</h1>
<p class="portal-hero-text">Reanalyses, climate model output, campaign data and satellite products, remapped once onto the same equal-area HEALPix grid and served as multi-resolution Zarr pyramids over S3. Nothing to download and nothing to regrid: explore at a coarse level, analyse at a fine one, and compare datasets cell by cell.</p>
<div class="portal-hero-actions">
<a class="portal-button portal-button-primary" href="databrowser/">Find data</a>
<a class="portal-button" href="stac-browser/">Browse as STAC</a>
<a class="portal-button" href="examples/">Learn by example</a>
<a class="portal-button" data-wp-notebook="lab">Open the notebook</a>
</div>
</section>
</div>
<div class="portal-hero-aside">
<section class="portal-dataset-tree-block" data-portal-tree-panel>
<div class="portal-dataset-tree-bar">
<div class="portal-dataset-tree-head">
<h2 class="portal-block-heading">Currently available datasets</h2>
<p class="portal-dataset-tree-summary">Collections published on the hub. Expand a row for its endpoint, an example read, and where the project is documented.</p>
</div>
<button type="button" class="portal-tree-expand" data-portal-tree-expand aria-expanded="false" aria-label="Maximize the dataset browser">
<svg class="portal-tree-expand-icon" data-icon="grow" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-6.5 6.5M10 4H4v6M4 4l6.5 6.5M14 20h6v-6M20 20l-6.5-6.5M10 20H4v-6M4 20l6.5-6.5"></path></svg>
<svg class="portal-tree-expand-icon" data-icon="shrink" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 4l-6.5 6.5M13.5 4.5v6h6M4 4l6.5 6.5M10.5 4.5v6h-6M20 20l-6.5-6.5M13.5 19.5v-6h6M4 20l6.5-6.5M10.5 19.5v-6h-6"></path></svg>
<span class="portal-tree-expand-text">Maximize</span>
</button>
</div>
<div class="portal-dataset-tree" data-wp-dataset-tree>
<noscript><p class="portal-note">The dataset browser needs JavaScript. The same holdings are in the <a href="stac-browser/">STAC Browser</a>.</p></noscript>
</div>
</section>
</div>
</div>

<div class="md-typeset wp-home-rest" markdown>

![MODIS SST on HEALPix level 10](assets/modis-aqua.png){ width="600" .img-center }

/// caption
Sea surface temperature seen by MODIS AQUA, remapped to HEALPix level 10.
///

### Cross dataset comparison is easy and intuitive, no regridding:

```python
import xarray as xr

S3 = {"anon": True, "endpoint_url": "https://s3.waterpark.dkrz.de"}

era5 = xr.open_zarr(
    "s3://reanalysis/healpix/era5/P1M/level_5.zarr", storage_options=S3, chunks=None
)
model = xr.open_zarr(
    "s3://nextgems/healpix/ngc4008/P1D/level_5.zarr", storage_options=S3, chunks=None
)

bias = (
    model["tas"].sel(time="2021").mean("time")
    - era5["tas"].sel(time="2021").mean("time")
)
```

Paths are `<project>/healpix/<dataset>/<frequency>/level_<n>.zarr`. Every
dataset is written at a range of levels and frequencies; develop against a
coarse monthly store, then change two numbers in the URL.


<div class="grid cards" markdown>

-   :material-magnify:{ .lg .middle } __Find a dataset__

    ---

    Search by dataset, variable, level and frequency, and copy the store URL.

    [:octicons-arrow-right-16: Data Browser](databrowser.md)

-   :material-file-tree:{ .lg .middle } __Walk the catalogue__

    ---

    The same holdings as STAC, for tools that already speak it.

    [:octicons-arrow-right-16: STAC Browser](stac-browser.md)

-   :material-chart-box-outline:{ .lg .middle } __Learn by example__

    ---

    Eight short programs, one plot each, from a first map to a cross-dataset
    comparison.

    [:octicons-arrow-right-16: Examples](examples/index.md)

-   :material-rocket-launch-outline:{ .lg .middle } __Read the guide__

    ---

    Chunking, regional selection at high levels, and the usual mistakes.

    [:octicons-arrow-right-16: Tips and tricks](high-level-access.md)

</div>


## What you can count on

- **No regridding.** Everything is HEALPix, nested, on one sphere.
- **Equal-area cells.** A global mean is `field.mean("cell")`, no `cos(lat)`.
- **Read only what you need.** Zarr chunks over HTTP.
- **A pyramid in space and time.** Coarse and monthly, or fine and hourly.
- **No mounted filesystem.** The same URL from a laptop, Levante or a batch job.

## How it got this way

Each source grid is remapped once, conservatively, with
[`grid-doctor`](https://github.com/freva-org/grid-doctor). Coarser levels come
from hierarchical coarsening rather than from remapping again.

[Why HEALPix?](storage_concepts/why-healpix.md) ·
[Why Zarr and S3?](storage_concepts/zarr-and-s3.md) ·
[Remapping decisions](technical-decisions.md) ·
[Benchmark](appendix-remapping-benchmark.md)

## Status

A prototype. The interface is meant to stay stable, but data still comes from
DKRZ file systems through an S3-compatible gateway rather than dedicated object
storage.

</div>
