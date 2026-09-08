import { expect } from "./fixtures.mjs";

async function runtimeTokenSources(page) {
  return page.evaluate(() => {
    const projectionLink = document.querySelector('link[data-mq-design-token-projection="v1"]');
    const governedStyleElements = [...document.querySelectorAll("style[data-mq-functional-art]")];
    const styleElements = new Map(governedStyleElements.map((element) => [
      element, `style[data-mq-functional-art="${element.getAttribute("data-mq-functional-art")}"]`,
    ]));
    const declarations = [];
    const inaccessible = [];
    const unstructuredRules = [];
    const inspectStyle = (style, selector, origin) => {
      for (let index = 0; index < style.length; index += 1) {
        const cssProperty = style.item(index);
        declarations.push({ origin, selector, cssProperty, value: style.getPropertyValue(cssProperty) });
      }
    };
    const inspectRules = (rules, origin) => {
      for (let index = 0; index < rules.length; index += 1) {
        const rule = rules[index];
        let structured = false;
        if (rule.style) { inspectStyle(rule.style, rule.selectorText || `@rule-${index}`, origin); structured = true; }
        if (rule.cssRules) { inspectRules(rule.cssRules, origin); structured = true; }
        if (rule.styleSheet) {
          structured = true;
          try { inspectRules(rule.styleSheet.cssRules, `${origin}:import-${index}`); }
          catch (error) { inaccessible.push(`${origin}:import-${index}:${error.name}`); }
        }
        if (!structured) unstructuredRules.push({ origin, index, source: rule.cssText });
      }
    };
    const governedSources = governedStyleElements.map((element) => {
      const origin = styleElements.get(element);
      if (!element.sheet) inaccessible.push(`${origin}:sheet-not-parsed`);
      return { origin, source: element.textContent || "" };
    });
    [...document.styleSheets].forEach((sheet, index) => {
      if (sheet === projectionLink?.sheet || styleElements.has(sheet.ownerNode)) return;
      const origin = styleElements.get(sheet.ownerNode) || `sheet-${index}`;
      try { inspectRules(sheet.cssRules, origin); }
      catch (error) { inaccessible.push(`${origin}:${error.name}`); }
    });
    [...document.querySelectorAll("[style]")].forEach((element, index) => inspectStyle(element.style, `inline-${index}`, "inline-style"));
    return { declarations, inaccessible, unstructuredRules, governedSources };
  });
}

function canonicalCss(value) {
  return String(value).replace(
    /\\([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?/giu,
    (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)),
  ).toLowerCase();
}

function tokenNamesIn(value) {
  return [...value.matchAll(/var\(\s*(--mq-conservatory-[a-z0-9-]+)\s*\)/gu)].map((match) => match[1]);
}

function inspectDeclaration(record, state) {
  const { origin, selector, cssProperty, value } = record;
  const tokenNames = tokenNamesIn(value);
  if (tokenNames.length) state.consumers.push({ origin, selector: selector.toLowerCase(), cssProperty, tokenNames });
  if (canonicalCss(cssProperty).includes("--mq-conservatory-")) state.unparsed.push(`${origin}:${selector}:${cssProperty}:custom-property-declaration`);
  const namespaceUses = [...canonicalCss(value).matchAll(/--mq-conservatory-/gu)].length;
  if (namespaceUses !== tokenNames.length) state.unparsed.push(`${origin}:${selector}:${cssProperty}:unparsed-namespace-use`);
}

function inspectGovernedSource({ origin, source: rawSource }, state) {
  const source = canonicalCss(rawSource);
  let parsedNamespaceUses = 0;
  for (const block of source.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    const selector = block[1].trim().replace(/\s+/gu, " ");
    for (const declaration of block[2].split(";")) {
      const separator = declaration.indexOf(":");
      if (separator < 1) continue;
      const cssProperty = declaration.slice(0, separator).trim();
      const value = declaration.slice(separator + 1);
      const tokenNames = tokenNamesIn(value);
      if (tokenNames.length) state.consumers.push({ origin, selector, cssProperty, tokenNames });
      parsedNamespaceUses += tokenNames.length;
    }
  }
  const declaredNamespaceUses = [...source.matchAll(/--mq-conservatory-/gu)].length;
  if (declaredNamespaceUses !== parsedNamespaceUses) state.unparsed.push(`${origin}:unparsed-namespace-use`);
}

async function runtimeConsumerState(page) {
  const sources = await runtimeTokenSources(page);
  const state = { consumers: [], unparsed: [] };
  for (const source of sources.governedSources) inspectGovernedSource(source, state);
  for (const declaration of sources.declarations) inspectDeclaration(declaration, state);
  for (const rule of sources.unstructuredRules) {
    if (canonicalCss(rule.source).includes("--mq-conservatory-")) state.unparsed.push(`${rule.origin}:rule-${rule.index}:unparsed-namespace-rule`);
  }
  state.consumers.sort((left, right) => `${left.origin}\u0000${left.selector}\u0000${left.cssProperty}`.localeCompare(`${right.origin}\u0000${right.selector}\u0000${right.cssProperty}`, "en"));
  return { consumers: state.consumers, inaccessible: [...new Set(sources.inaccessible)].sort(), unparsed: [...new Set(state.unparsed)].sort() };
}

async function projectionCssom(page) {
  return page.evaluate(({ expectedPathname, prefix, selector }) => {
    const projectionLinks = [...document.querySelectorAll("link[href]")]
      .filter((candidate) => new URL(candidate.getAttribute("href"), document.baseURI).pathname === expectedPathname);
    const markerLinks = [...document.querySelectorAll("link[data-mq-design-token-projection]")];
    const link = document.querySelector(selector);
    const sheet = link?.sheet || null;
    const rules = sheet ? [...sheet.cssRules] : [];
    const rootRule = rules[0] || null;
    const properties = rootRule?.style
      ? Array.from({ length: rootRule.style.length }, (_, index) => rootRule.style.item(index)) : [];
    const attribute = (name) => link?.getAttribute(name) || null;
    return {
      exactProjectionLinkCount: projectionLinks.length,
      exactMarkerLinkCount: markerLinks.length,
      projectionLinkIsMarkerLink: projectionLinks[0] === markerLinks[0],
      href: attribute("href"), rel: attribute("rel"), loaded: Boolean(sheet),
      ruleCount: rules.length, rootSelector: rootRule?.selectorText || null,
      properties, namespaceClosed: properties.every((property) => property.startsWith(prefix)),
    };
  }, {
    expectedPathname: "/assets/design/math-quest-design-tokens-v1.css",
    prefix: "--mq-conservatory-",
    selector: 'link[data-mq-design-token-projection="v1"]',
  });
}

async function expectProjectedStylesheet(page, expectedProperties) {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator('link[data-mq-design-token-projection="v1"]')).toHaveCount(1);
  const cssom = await projectionCssom(page);
  expect(cssom).toMatchObject({
    exactProjectionLinkCount: 1, exactMarkerLinkCount: 1, projectionLinkIsMarkerLink: true,
    href: "assets/design/math-quest-design-tokens-v1.css", rel: "stylesheet", loaded: true,
    ruleCount: 1, rootSelector: ":root", namespaceClosed: true,
  });
  expect(cssom.properties).toHaveLength(64);
  expect([...cssom.properties].sort()).toEqual([...expectedProperties].sort());
}

async function expectUnlistedStylesheetConsumer(page, expectedState) {
  const unlistedConsumer = await page.addStyleTag({
    content: ".future-only-state{transform:translateX(var(--mq-conservatory-dimension-body-min))}",
  });
  expect((await runtimeConsumerState(page)).consumers).toHaveLength(expectedState.consumers.length + 1);
  await unlistedConsumer.evaluate((element) => element.remove());
  expect(await runtimeConsumerState(page)).toEqual(expectedState);
}

async function expectInlineConsumer(page, expectedState) {
  await page.locator("#app").evaluate((element) => { element.style.transform = "translateX(var(--mq-conservatory-dimension-body-min))"; });
  expect((await runtimeConsumerState(page)).consumers).toHaveLength(expectedState.consumers.length + 1);
  await page.locator("#app").evaluate((element) => { element.style.transform = ""; });
  expect(await runtimeConsumerState(page)).toEqual(expectedState);
}

async function expectUnparsedPropertyRule(page, expectedState) {
  const unparsedProperty = await page.addStyleTag({
    content: "@property --mq-conservatory-future-length{syntax:'<length>';inherits:false;initial-value:0px}",
  });
  expect((await runtimeConsumerState(page)).unparsed.length).toBeGreaterThan(0);
  await unparsedProperty.evaluate((element) => element.remove());
  expect(await runtimeConsumerState(page)).toEqual(expectedState);
}

async function expectResolvedTokenValues(page, expectedProperties) {
  const values = await page.evaluate((names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(document.documentElement).getPropertyValue(name).trim()])), expectedProperties);
  expect(Object.keys(values).sort()).toEqual([...expectedProperties].sort());
  expect(Object.values(values).every((value) => value.length > 0)).toBe(true);
}

export async function exerciseActivatedDesignTokens(page, expectedProperties, expectedConsumers) {
  await expectProjectedStylesheet(page, expectedProperties);
  const expectedState = { consumers: expectedConsumers, inaccessible: [], unparsed: [] };
  expect(await runtimeConsumerState(page)).toEqual(expectedState);
  await expectUnlistedStylesheetConsumer(page, expectedState);
  await expectInlineConsumer(page, expectedState);
  await expectUnparsedPropertyRule(page, expectedState);
  await expectResolvedTokenValues(page, expectedProperties);
}
