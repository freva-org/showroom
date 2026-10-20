# Examples

Each `NN_name.py` here is a complete program that stands entirely on its
own. It imports nothing from this repository, declares its own store URL,
and saves its own figure. Clone the repository, install `requirements.txt`,
run one, and you get the figure that appears on the matching examples page.

```bash
pip install -r requirements.txt
python 01_first_map.py          # writes 01_first_map.png next to it
```

That property is the point of the directory, and it is the thing to protect
when changing anything in it.

## The format

The scripts are literate, in the `# %%` cell format that Jupytext, Spyder
and VS Code all understand, so an example opens as a notebook with no
conversion step.

| marker            | becomes                                     |
| ----------------- | ------------------------------------------- |
| module docstring  | the page title (first line) and its lead    |
| `# %% [md]`       | prose, written as comments                  |
| `# %%`            | a Python code block on the page             |
| `# %% [figure]`   | where the figure is placed                  |

`scripts/build_examples.py` does the translation. It never edits a script, so
the example on disk and the page on the site cannot drift apart. It runs
each one in a scratch directory and collects the single PNG it produced,
which is why the scripts can use a plain relative `savefig` the way a reader
would.

## Which store an example uses

There is no catalogue file; each script names its own store, at the top,
where a reader will look. The choices are deliberate and the pages explain
them:

| example | store | why |
| ------- | ----- | --- |
| 01, 03, 04 | ERA5 `P1M` level 7 | maps and profiles, where detail is the point |
| 02, 05, 06 | ERA5 `P1M` level 4 | hundreds of time steps, or cell geometry you can see |
| 07 | ERA5 `P1M` levels 5 and 4 | checks the pyramid against itself |
| 08 | ERA5 `P1M` level 5, ngc4008 `P1D` level 5 | cross-dataset comparison |

Matching both the level *and* the frequency to the question is the single
biggest lever anybody has over how long an analysis takes, so the examples
demonstrate it rather than describing it.

## Adding one

1. Write `09_your_topic.py` following the format above. One figure, saved
   with `fig.savefig("09_your_topic.png", ...)`.
2. Copy the `S3 = {...}` line verbatim from an existing example.
3. Keep it small. The whole examples routine runs in a couple of minutes because no
   example downloads more than a few tens of megabytes, and that is worth
   more than the extra detail.
4. Run it and render the page:
   ```bash
   cd ..
   python scripts/build_examples.py --run --only 09
   just build
   ```
5. Add the page to the `nav:` block in `mkdocs.yml`. The strict build fails
   with a clear message if you forget.
6. Commit the figure and thumbnail in `assets/examples/` with the updated
   `examples.lock`. Figures are committed on purpose: the docs build stays
   offline and reproducible, and a changed plot arrives as a diff someone
   can look at in a pull request.

## When a figure goes stale

`python scripts/build_examples.py --check` compares each script against the
hash recorded when its figure was made, and reports the ones that no longer
match. It needs no network. CI runs it on every pull request that touches
this directory.

To refresh them, run `just examples` in `landingpage/` locally, or trigger the `examples`
workflow from the Actions tab and let it open a pull request.
