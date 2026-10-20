# Example gallery

Below you can find short, complete examples that do something useful with the
data in the hub. Browse through them an select the example you are interested in.
Every one of them runs on its own against the public endpoint, needs no
credentials, and finishes in seconds, because they all work at coarse pyramid
levels where a global field is a few tens of kilobytes.

They are also a HEALPix tutorial in disguise. The grid makes some things
easier than a lon/lat grid does and a few things harder, and the examples are
ordered so that each one introduces exactly one of those.

!!! tip "Running them"

    ```bash
    git clone https://github.com/freva-org/waterpark
    cd waterpark/landingpage/examples
    pip install -r requirements.txt
    python 01_first_map.py
    ```

    Every figure on these pages was produced by that command in an automatic
    CI pipeline, against the live data hub, so if a page renders, the code on
    it worked.

<!-- examples-cards -->

## Where to go next

The examples stay at coarse levels to stay fast. For the regional stores at
levels 16 and above, where the full cell axis cannot be held in memory at all
and every selection has to be index-driven, see
[Tips and tricks](../high-level-access.md).
