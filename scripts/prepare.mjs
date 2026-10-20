#!/usr/bin/env node
// Builds the Freva parts of the site (page bundle, Python add-ons, STAC Browser, notebook) into .prepared/.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".prepared");
const CACHE = join(ROOT, ".cache");
const require = createRequire(join(ROOT, "package.json"));
const esm = (specifier) => import.meta.resolve(specifier);
const PYTHON_EXE = process.env.WATERPARK_PYTHON ?? "python3";

const ENDPOINT = "https://s3.waterpark.dkrz.de";
const STAC_RECIPE = {
  repository: "https://github.com/freva-org/freva-web-nextgen.git",
  commit: "ebce33f6b0a21fdd5197682eace21d3fa95b85d6",
  path: "packages/stac-browser",
};
const START_NOTEBOOK = "era5_july_2021.ipynb";
const PYTHON = {
  profile: "freva-client",
  label: "Waterpark Python (xarray, Dask, Cartopy, freva-client)",
  packages: ["xarray", "zarr", "fsspec", "numcodecs", "cftime", "numpy", "micropip", "freva_client", "py_oidc_auth_client"],
  addons: ["cartopy-natural-earth-110m", "dask"],
  optionalAddons: ["cartopy-natural-earth-110m"],
  indexUrl: "https://cdn.jsdelivr.net/pyodide/v314.0.6/full/",
};
const SHOWROOM_SIZED = ["@freva-org/browser-python", "@freva-org/freva-client-terminal", "@freva-org/dataset-tree", "@freva-org/data-inspector"];

const log = (message) => process.stderr.write(`[prepare] ${message}\n`);
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const read = (path) => readFileSync(join(ROOT, path));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
  return result;
}

function packageRoot(name) {
  try {
    return dirname(require.resolve(`${name}/package.json`));
  } catch {
    let dir = dirname(fileURLToPath(esm(name)));
    while (!existsSync(join(dir, "package.json")) || JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name !== name) {
      dir = dirname(dir);
    }
    return dir;
  }
}

// Material's root font size is 125%; Showroom's rem lengths are rewritten onto --wp-rem (assets/showroom.css).
function remToWpRem(text) {
  return text
    .split(/(@(?:media|container|supports)[^{]*\{)/)
    .map((part, i) => (i % 2 ? part : part.replace(/(?<![\w.#-])(-?)(\d*\.?\d+)rem\b/g, "calc($1$2 * var(--wp-rem, 1rem))")))
    .join("");
}

function rootsFrom(listing) {
  const meta = listing.datasets ?? {};
  return listing.buckets.map((bucket) => {
    const entry = meta[bucket] ?? {};
    const root = { name: entry.title || bucket, bucket };
    if (entry.label) root.description = entry.label;
    if (/^https:\/\//.test(entry.href ?? "")) root.link = { href: entry.href };
    if (entry.locked) root.planned = typeof entry.locked === "string" ? entry.locked : "coming soon";
    return root;
  });
}

async function prepareWeb() {
  const esbuild = await import(pathToFileURL(require.resolve("esbuild")).href);
  const sized = SHOWROOM_SIZED.map((name) => realpathSync(packageRoot(name)) + sep);
  const outdir = join(OUT, "app", "web");
  const common = {
    bundle: true,
    format: "esm",
    minify: true,
    target: ["es2022"],
    outdir,
    metafile: true,
    logLevel: "warning",
    entryNames: "[name].[hash]",
    chunkNames: "chunks/[name].[hash]",
    assetNames: "assets/[name].[hash]",
    plugins: [
      {
        name: "showroom-rem",
        setup(build) {
          build.onLoad({ filter: /\.(css|js|mjs)$/ }, (args) => {
            if (!sized.some((root) => args.path.startsWith(root))) return undefined;
            const text = readFileSync(args.path, "utf8");
            return /\drem\b/.test(text) ? { contents: remToWpRem(text), loader: args.path.endsWith(".css") ? "css" : "js" } : undefined;
          });
        },
      },
    ],
  };
  const page = await esbuild.build({ ...common, splitting: true, entryPoints: { site: join(ROOT, "web/site.js"), ui: join(ROOT, "web/ui.css") } });
  const worker = await esbuild.build({ ...common, entryPoints: { "browser-python.worker": fileURLToPath(esm("@freva-org/browser-python/worker")) } });
  const outputs = Object.entries({ ...page.metafile.outputs, ...worker.metafile.outputs });
  const find = (suffix) => {
    const [file] = outputs.find(([, output]) => output.entryPoint?.endsWith(suffix));
    return relative(OUT, resolve(file)).split(sep).join("/");
  };
  return { site: find("web/site.js"), ui: find("web/ui.css"), worker: find("browser-python.worker.js") };
}

function prepareAddons() {
  const cli = join(packageRoot("@freva-org/browser-python"), "bin", "freva-browser-python.mjs");
  run(process.execPath, [cli, "prepare-addons", "--out", join(OUT, "app/python/addons"), "--addons", PYTHON.addons.join(",")]);
  run(process.execPath, [cli, "prepare-freva-wheelhouse", "--out", join(OUT, "app/python/freva-wheels")]);
  return "app/python/addons/";
}

// The wheels scripts/fetch-wheels.sh left in .python-wheels/ (healpix-geo and marray), if any.
function prepareWheels() {
  const dir = join(ROOT, ".python-wheels");
  const names = existsSync(join(dir, "wheels.json")) ? JSON.parse(readFileSync(join(dir, "wheels.json"), "utf8")) : [];
  mkdirSync(join(OUT, "app/python/wheels"), { recursive: true });
  return names.map((name) => {
    cpSync(join(dir, name), join(OUT, "app/python/wheels", name));
    return { url: `app/python/wheels/${name}`, sha256: sha256(readFileSync(join(dir, name))) };
  });
}

async function prepareStac() {
  const checkout = join(CACHE, "stac-recipe", STAC_RECIPE.commit);
  const git = (...args) => run("git", ["-C", checkout, ...args]);
  if (!existsSync(join(checkout, STAC_RECIPE.path, "upstream.json"))) {
    rmSync(join(CACHE, "stac-recipe"), { recursive: true, force: true });
    mkdirSync(checkout, { recursive: true });
    git("init", "-q");
    git("remote", "add", "origin", process.env.WATERPARK_STAC_RECIPE_REPOSITORY || STAC_RECIPE.repository);
    git("sparse-checkout", "set", "--no-cone", `/${STAC_RECIPE.path}/`);
    git("fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", STAC_RECIPE.commit);
    git("checkout", "-q", "--detach", "FETCH_HEAD");
  }
  const recipe = join(checkout, STAC_RECIPE.path);
  const materials = join(CACHE, "stac-materials");
  run(process.execPath, [join(recipe, "scripts/prepare.mjs"), "--out", materials], {
    cwd: recipe,
    env: { ...process.env, FREVA_STAC_CHECKOUT_DIR: join(CACHE, "stac-upstream") },
  });
  const manifest = JSON.parse(readFileSync(join(materials, "materials.json"), "utf8"));
  const target = join(OUT, "app/stac");
  cpSync(materials, target, { recursive: true });
  rmSync(join(target, "materials.json"));
  const postcss = (await import(pathToFileURL(require.resolve("postcss")).href)).default;
  const prefixer = (await import(pathToFileURL(require.resolve("postcss-prefix-selector")).href)).default;
  const scope = "#stac-browser-mount";
  // Contain Bootstrap inside the mount so it cannot restyle Material.
  const transform = (prefix, selector, prefixed, _file, rule) => {
    const s = selector.trim();
    if (rule?.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return selector;
    if (/(^|[\s>+~(,])#stac-browser(-mount)?(?![\w-])/.test(s)) return s;
    if (/^\[data-bs-theme/.test(s)) return prefix + s;
    if (/^(:root|html|body)(?![\w-])/.test(s)) return s.replace(/^(:root|html|body)/, prefix);
    if (/^\*(::before|::after)?$/.test(s)) return `${prefix} ${s}`;
    return prefixed;
  };
  for (const style of manifest.styles) {
    const file = join(target, style);
    writeFileSync(file, remToWpRem(postcss([prefixer({ prefix: scope, transform })]).process(readFileSync(file, "utf8"), { from: undefined }).css));
  }
  return { entry: `app/stac/${manifest.entry}`, styles: manifest.styles.map((style) => `app/stac/${style}`) };
}

async function prepareNotebook(addonBase, wheels, roots) {
  const seedDir = mkdtempSync(join(tmpdir(), "waterpark-seeds-"));
  run(PYTHON_EXE, [join(ROOT, "scripts/build_examples.py"), "--notebooks", seedDir]);
  const seeds = readdirSync(join(ROOT, "notebooks")).filter((name) => name.endsWith(".ipynb")).sort().map((name) => ({ name, text: read(`notebooks/${name}`).toString() }))
    .concat(readdirSync(seedDir).sort().map((name) => ({ name: `examples/${name}`, text: readFileSync(join(seedDir, name), "utf8") })));
  rmSync(seedDir, { recursive: true, force: true });
  const { buildPanelData, dataPanelSite } = await import(esm("@freva-org/jupyterlite-freva-data/site"));
  const { prepareNotebookSite } = await import(esm("@freva-org/jupyterlite-freva-kernel/prepare"));
  const panel = dataPanelSite({
    data: buildPanelData({ instanceId: "home", s3: { endpoint: ENDPOINT, origin: ENDPOINT, style: "path", roots }, packages: PYTHON.packages }),
    siteName: "Waterpark",
    title: "Waterpark data",
    iconSvg: read("assets/icons/tree.svg").toString(),
    seedNotebooks: seeds,
    startNotebook: START_NOTEBOOK,
    defaultAction: "open-in-notebook",
    gridlook: true,
  });
  const inventory = await prepareNotebookSite({
    out: join(OUT, "notebook"),
    settings: {
      runtimeIndexUrl: PYTHON.indexUrl,
      addonBaseUrl: `../../${addonBase}`,
      wheelhouseUrl: "../../app/python/freva-wheels/",
      siteWheels: wheels.map((w) => ({ ...w, url: `../../${w.url}` })),
      maxLiveInterpreters: 2,
      setups: [{ id: "default", label: PYTHON.label, profile: PYTHON.profile, addons: PYTHON.addons, optionalAddons: PYTHON.optionalAddons, runStarter: false }],
    },
    seeds,
    appName: "Waterpark Notebook",
    favicon: { path: "favicon.ico", bytes: read("assets/favicon.ico"), type: "image/x-icon" },
    pythonExecutable: PYTHON_EXE,
    cacheDir: join(CACHE, "jupyterlite"),
    lab: {
      extensions: [join(packageRoot("@freva-org/jupyterlite-freva-data"), "labextension")],
      overrides: panel.overrides,
      disabledExtensions: ["@jupyterlite/application-extension:logo"],
      files: panel.files,
    },
    log: (message) => log(`notebook: ${message}`),
  });
  return { lab: `notebook/${inventory.labEntry}`, seeds: seeds.map((s) => s.name) };
}

async function main() {
  const inputs = [".python-wheels/wheels.json", "package-lock.json", "scripts/prepare.mjs", "scripts/build_examples.py", "web/site.js", "web/ui.css", "assets/waterpark-datasets.json", "assets/icons/tree.svg", "assets/favicon.ico"]
    .concat(readdirSync(join(ROOT, "examples")).filter((f) => f.endsWith(".py")).map((f) => `examples/${f}`))
    .concat(readdirSync(join(ROOT, "notebooks")).map((f) => `notebooks/${f}`));
  const key = sha256(inputs.map((path) => `${path}:${existsSync(join(ROOT, path)) ? sha256(read(path)) : "-"}`).join("\n"));
  if (!process.argv.includes("--force") && existsSync(join(OUT, "manifest.json")) && JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8")).key === key) {
    log("up to date");
    return;
  }
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const roots = rootsFrom(JSON.parse(read("assets/waterpark-datasets.json")));
  log("web");
  const web = await prepareWeb();
  log("python add-ons");
  const addonBase = prepareAddons();
  const wheels = prepareWheels();
  log("STAC Browser");
  const stac = await prepareStac();
  log("notebook");
  const notebook = await prepareNotebook(addonBase, wheels, roots);
  const { JUPYTER_LOGO, JUPYTER_LOGO_DARK } = await import(esm("@freva-org/browser-python/ui/notebook"));
  const runtime = new URL(PYTHON.indexUrl).origin;
  const manifest = {
    key,
    app: { ...web, stac, notebook },
    tree: { endpoint: ENDPOINT, style: "path", roots },
    jupyterLogo: { light: JUPYTER_LOGO, dark: JUPYTER_LOGO_DARK },
    playground: {
      profile: PYTHON.profile,
      packages: PYTHON.packages,
      autostart: "never",
      maxSessions: 2,
      maxLiveSessions: 2,
      addons: PYTHON.addons,
      optionalAddons: PYTHON.optionalAddons,
      connectOrigins: [ENDPOINT, "https://freva.dkrz.de"],
      persistCredentials: false,
      network: "https",
      runtimeIndexUrl: PYTHON.indexUrl,
      addonBaseUrl: addonBase,
      wheelhouseUrl: "app/python/freva-wheels/",
      workerUrl: web.worker,
      siteWheels: wheels,
      packagePolicy: { kind: "open", anyHttpsOrigin: true, packageIndex: true, origins: [runtime], sources: { runtime, addons: addonBase } },
      terminal: { osControls: "auto", alwaysOnTop: true, rememberAppearance: true },
      notebook: true,
      notebookSameOrigin: true,
    },
  };
  writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  log("ready");
}

main().catch((error) => {
  log(`error: ${error?.stack ?? error}`);
  process.exit(1);
});
