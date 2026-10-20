# Showroom

The Waterpark landing page as a MkDocs Material site, with the Freva components from
[freva-web-nextgen](https://github.com/freva-org/freva-web-nextgen): runnable code blocks
("Try in Python"), the notebook, the dataset tree, the STAC Browser and the Data Browser.
CI publishes it to GitHub Pages; each pull request uploads the built site as the `site` artifact
(serve it with `python3 -m http.server -d site`).

```sh
pip install -r requirements-docs.txt   # Python 3.12; Node 22.12 or newer for the Freva parts
./scripts/build.sh                     # into site/
./scripts/build.sh serve               # live reload on :8000
```

- Pages are in `data/`, images and styles in `assets/`. `high-level-access.md` and
  `technical-decisions.md` come from [grid-doctor](https://github.com/freva-org/grid-doctor).
- Example pages and their notebooks are generated from `examples/*.py` by
  `scripts/build_examples.py`; a fence written `{ .python .try-in-python }` gets a
  "Try in Python" button.
- `scripts/prepare.mjs` builds the Freva parts into `.prepared/`; `scripts/hooks.py` copies them
  into the site. The healpix-geo wheel (examples 01, 03, 07 and 08) is fetched by
  `scripts/fetch-wheels.sh`.
