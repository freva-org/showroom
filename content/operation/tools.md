---
title: Operator Tools
description: What data tiering means for a first read, and the services the hub is built from.
path: /docs/tools/
---

## Tiering, and what you will notice

Data on the hub is tiered. Everything stays **browsable** at all times, so
opening a dataset, listing its variables and reading its metadata works
whether or not the data itself is on disk.

What changes is the first read. Data nobody has touched for a long time is
moved to tape, and reading it again triggers a recall:

- the **first** read of an archived dataset takes minutes rather than seconds
- everything after it is at normal speed, until the data goes cold again
- nothing is ever deleted, and nothing needs restoring by hand

If you are working with a dataset intensively and would rather it stayed on
disk throughout, ask us to pin it. That is a deliberate decision with a name
and a reason attached, rather than something to work around.

[Contact support](mailto:waterpark@support.dkrz.de)

## Services

The hub is built from a few small services. Each has its own documentation;
this page is the index.

<div class="grid cards" markdown>

-   **[blobmap](https://waterpark.dkrz.de/tech/blobmap/)**

    ---

    Decides which zarr objects move to tape together, and reads that decision
    back. A store is millions of objects, which is too many to track
    individually and too few to treat as one unit: blobs are what sits in
    between and makes tiering tractable.

    [Documentation](https://waterpark.dkrz.de/tech/blobmap/) ·
    [Manifest format](https://waterpark.dkrz.de/tech/blobmap/latest/schema)

</div>

## Where things are

| Where | What |
| --- | --- |
| [Data Browser](/databrowser/) | search the catalogue |
| [STAC Browser](/stac-browser/) | the same holdings, as STAC |
| [Concepts](../storage-concepts/index.md) | why the data is laid out this way |
| [blobmap](https://waterpark.dkrz.de/tech/blobmap/) | how the tiering decision is made |
