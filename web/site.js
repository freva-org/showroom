// Connects the Freva packages to the MkDocs pages; configured by scripts/hooks.py (#wp-site).
import { initCodeCopy } from "@freva-org/browser-python/ui/copy";

const config = JSON.parse(document.getElementById("wp-site")?.textContent || "null");
const root = new URL(`${config?.base ?? "."}/`, document.baseURI);
const siteUrl = (path) => new URL(String(path).replace(/^\/+/, ""), root).href;
const absolute = (path) => (path && !/^[a-z]+:/i.test(path) ? siteUrl(path) : path);
const report = (what) => (error) => console.error(`[waterpark] ${what}:`, error);

function onDiscard(teardown) {
  const listener = (event) => {
    if (event.persisted) return;
    window.removeEventListener("pagehide", listener);
    teardown();
  };
  window.addEventListener("pagehide", listener);
}

const themeListeners = new Set();
const currentTheme = () => (document.body?.getAttribute("data-md-color-scheme") === "slate" ? "dark" : "light");

function followMaterialTheme() {
  const apply = () => {
    const theme = currentTheme();
    const changed = document.documentElement.getAttribute("data-theme") !== theme;
    document.documentElement.setAttribute("data-theme", theme);
    for (const listener of themeListeners) listener(theme);
    if (changed) window.dispatchEvent(new CustomEvent("portal:theme", { detail: { mode: theme } }));
  };
  apply();
  new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });
}

function playgroundConfig(playground) {
  return {
    ...playground,
    workerUrl: absolute(playground.workerUrl),
    addonBaseUrl: absolute(playground.addonBaseUrl),
    wheelhouseUrl: absolute(playground.wheelhouseUrl),
    siteWheels: playground.siteWheels.map((wheel) => ({ ...wheel, url: absolute(wheel.url) })),
    packagePolicy: { ...playground.packagePolicy, sources: { ...playground.packagePolicy.sources, addons: absolute(playground.packagePolicy.sources.addons) } },
    playgroundBase: root.pathname,
  };
}

async function openNotebook(request = {}) {
  const { openNotebook: openSheet } = await import("@freva-org/browser-python/ui/notebook/sheet");
  openSheet({ href: siteUrl(config.app.notebook.lab), frame: true, datasets: true, panel: true }, request);
}

let inspector = null;
async function openInspector(url) {
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) return;
  const { attachInspector } = await import("@freva-org/data-inspector");
  if (!inspector) {
    const element = document.createElement("data-inspector");
    element.className = "wp-inspector";
    document.body.append(element);
    inspector = { element, controller: attachInspector(element, { getAuthHeaders: () => ({}), isStore: () => true }) };
    element.addEventListener("inspector-close", () => element.removeAttribute("open"));
  }
  inspector.element.file = url;
  inspector.element.setAttribute("open", "");
  await inspector.controller.load(url);
}

async function mountTree(host) {
  const [{ mountDatasetTree }, { createS3Source }, recipes, { settleBlockBar, wireMaximizeControls }, { mountLayer }, bridge, { sha256Hex }, logos] =
    await Promise.all([
      import("@freva-org/dataset-tree"),
      import("@freva-org/dataset-tree/s3"),
      import("@freva-org/dataset-tree/recipes"),
      import("@freva-org/dataset-tree/ui"),
      import("@freva-org/freva-client-terminal/layers"),
      import("@freva-org/browser-python/ui/bridge"),
      import("@freva-org/browser-python/embed/examples"),
      import("@freva-org/browser-python/ui/notebook"),
    ]);
  const store = config.tree;
  const digests = Object.fromEntries(await Promise.all(recipes.TREE_RECIPES.map(async (r) => [r.id, await sha256Hex(r.template)])));
  const runnable = recipes.runnableRecipes(config.playground.packages);
  const block = bridge.registerPythonBlock({
    host,
    config: playgroundConfig({
      ...config.playground,
      examples: recipes.TREE_RECIPES.filter((r) => runnable.includes(r.id)).map((r) => ({ id: recipes.recipeExampleId(r.id), sha256: digests[r.id], title: r.label })),
      recipes: runnable,
      recipeDigests: digests,
      store,
    }),
    sources: new Map(recipes.TREE_RECIPES.map((r) => [recipes.recipeExampleId(r.id), { title: r.label, source: r.template }])),
    bind: (request, example) => {
      if (!example.source.includes(recipes.STORE_PLACEHOLDER)) return example;
      const binding = request.datasetId ? recipes.bindStore(request.datasetId, store) : null;
      const recipe = recipes.TREE_RECIPES.find((r) => recipes.recipeExampleId(r.id) === request.exampleId);
      if (!binding || !recipe) return null;
      return {
        title: `${binding.s3Path.replace(/\/+$/, "").split("/").pop()} · ${recipe.label}`,
        source: recipes.renderRecipe(recipe, binding, store.endpoint),
        notebookDataset: request.datasetId,
      };
    },
  });

  const panel = host.closest("[data-portal-tree-panel]");
  const expand = panel?.querySelector("[data-portal-tree-expand]");
  const notebookButton = document.createElement("button");
  notebookButton.type = "button";
  notebookButton.className = "dataset-tree__btn portal-tree-notebook";
  notebookButton.dataset.portalTreeNotebook = "";
  notebookButton.setAttribute("aria-label", "Open the notebook");
  const label = document.createElement("span");
  label.textContent = "Notebook";
  notebookButton.append(...logos.jupyterLogo(document), label);
  notebookButton.addEventListener("click", () => openNotebook());
  host.style.setProperty("--portal-jupyter-logo-light", `url("${logos.JUPYTER_LOGO}")`);
  host.style.setProperty("--portal-jupyter-logo-dark", `url("${logos.JUPYTER_LOGO_DARK}")`);

  const handle = mountDatasetTree(host, {
    source: createS3Source(store),
    toolbarExtras: [notebookButton, expand].filter(Boolean),
    accessExamples: (node) => recipes.recipeAccessExamples(node, { store, digests, runnable }),
    python: { enabled: true, onTry: (event) => void block.tryPython(event).catch(() => undefined) },
    onOpenNotebook: (node) => openNotebook({ dataset: node.id }),
    onInspect: (node) => openInspector(node.inspect),
    labels: { emptyBadge: "no data yet" },
    status: { tone: "live", label: "LIVE", code: store.endpoint },
  });
  host.querySelector('[data-dt-action="collapse-all"]')?.before(notebookButton);
  if (expand) settleBlockBar(panel);
  wireMaximizeControls(document, { mountLayer });
  onDiscard(() => handle.destroy());
}

async function preparePlayground() {
  const host = document.querySelector("[data-portal-python-playground]");
  if (host) host.setAttribute("data-portal-python-playground", JSON.stringify(playgroundConfig(JSON.parse(host.getAttribute("data-portal-python-playground")))));
  const [{ preparePythonPlayground }, { loadLocalChunks }, { mountRunnableCode }] = await Promise.all([
    import("@freva-org/browser-python/ui"),
    import("@freva-org/browser-python/ui/local"),
    import("@freva-org/browser-python/ui/code"),
  ]);
  await mountRunnableCode();
  preparePythonPlayground(loadLocalChunks);
}

async function mountStac(mount) {
  document.body.classList.add("waterpark-stac-page");
  const markRoute = () => {
    const path = (window.location.hash || "").replace(/^#/, "").split("?")[0].replace(/\/+$/, "");
    document.body.classList.toggle("waterpark-stac-root", path === "");
  };
  markRoute();
  window.addEventListener("hashchange", markRoute);
  for (const [id, attributes] of [
    ["meta-description", { name: "description", content: "" }],
    ["og-title", { property: "og:title", content: document.title }],
    ["og-description", { property: "og:description", content: "" }],
    ["og-locale", { property: "og:locale", content: "en" }],
    ["og-url", { property: "og:url", content: window.location.href }],
  ]) {
    const meta = document.getElementById(id) ?? document.head.appendChild(Object.assign(document.createElement("meta"), { id }));
    for (const [key, value] of Object.entries(attributes)) meta.setAttribute(key, value);
  }
  for (const style of config.app.stac.styles) {
    document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href: siteUrl(style) }));
  }
  try {
    const settings = await import(/* @vite-ignore */ siteUrl("assets/stac-browser.config.js")).catch(() => ({}));
    window.STAC_BROWSER_CONFIG = { ...(settings.default ?? {}), pathPrefix: new URL(".", window.location.href).pathname, historyMode: "hash" };
    await import(/* @vite-ignore */ siteUrl(config.app.stac.entry));
  } catch (error) {
    mount.append(Object.assign(document.createElement("div"), { className: "waterpark-stac-error", textContent: "The STAC Browser could not be loaded. Please try again later." }));
    report("STAC Browser")(error);
  }
}

async function mountDatabrowser(mount) {
  document.body.classList.add("waterpark-databrowser-page");
  const typeset = mount.closest(".md-typeset");
  if (typeset) (typeset.closest(".md-content") ?? document.body).append(mount);
  const [widget, settings] = await Promise.all([
    import("@freva-org/databrowser"),
    import(/* @vite-ignore */ siteUrl("assets/databrowser.config.js")).catch(() => ({})),
  ]);
  const options = { ...(settings.default ?? settings.config ?? {}) };
  options.overlayRoot = document.body.appendChild(Object.assign(document.createElement("div"), { id: "waterpark-databrowser-overlay" }));
  options.theme = { ...(options.theme ?? {}), mode: currentTheme() === "dark" ? "night" : "day" };
  const handle = widget.mountDataBrowser(mount, options);
  const listener = (theme) => handle.setTheme(theme === "dark" ? "night" : "day");
  themeListeners.add(listener);
  onDiscard(() => {
    themeListeners.delete(listener);
    handle.destroy();
    options.overlayRoot.remove();
  });
}

function start() {
  followMaterialTheme();
  if (document.querySelector("[data-portal-copy]")) initCodeCopy();
  if (!config) return;
  import("@freva-org/browser-python/ui/notebook").then((m) => m.initNotebookLinks(siteUrl(config.app.notebook.lab))).catch(report("notebook"));
  const trees = Promise.all([...document.querySelectorAll("[data-wp-dataset-tree]")].map((host) => mountTree(host).catch(report("dataset tree"))));
  if (document.querySelector("[data-portal-python-playground], [data-wp-dataset-tree]")) trees.then(preparePlayground).catch(report("Python"));
  const stac = document.getElementById("stac-browser-mount");
  if (stac) mountStac(stac);
  const databrowser = document.getElementById("databrowser-mount");
  if (databrowser) mountDatabrowser(databrowser).catch(report("Data Browser"));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
