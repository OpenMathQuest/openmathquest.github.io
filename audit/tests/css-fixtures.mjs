// A deliberately bounded static CSS fixture for the child-UX assertions.
// It preserves the existing selector subset and does not emulate browser layout.
function cssRules(source) {
  const rows = [];
  const leafRule = /([^{}]+)\{([^{}]*)\}/gu;
  let order = 0;
  for (const match of source.matchAll(leafRule)) {
    const selectorText = match[1].trim();
    if (!selectorText || selectorText.startsWith("@")) continue;
    const declarations = [];
    for (const part of match[2].split(";")) {
      const colon = part.indexOf(":");
      if (colon < 1) continue;
      const property = part.slice(0, colon).trim().toLowerCase();
      let value = part.slice(colon + 1).trim();
      const important = /\s*!important\s*$/iu.test(value);
      value = value.replace(/\s*!important\s*$/iu, "").trim();
      declarations.push({ property, value, important });
    }
    for (const selector of selectorText.split(",")) {
      rows.push({ selector: selector.trim(), declarations, order });
    }
    order += 1;
  }
  return rows;
}

export function fixture(tag, { classes = [], attributes = {}, parent = null } = {}) {
  return {
    tag: String(tag).toLowerCase(),
    classes: new Set(classes),
    attributes: new Map(Object.entries(attributes).map(([key, value]) => [
      key.toLowerCase(),
      String(value),
    ])),
    parent,
  };
}

function selectorParts(selector) {
  if (/[:+~]/u.test(selector)) return null;
  const tokens = selector.replace(/>/gu, " > ").trim().split(/\s+/u).filter(Boolean);
  const compounds = [];
  const combinators = [];
  let pending = null;
  for (const token of tokens) {
    if (token === ">") {
      pending = ">";
      continue;
    }
    if (compounds.length) combinators.push(pending || " ");
    compounds.push(token);
    pending = null;
  }
  return pending || !compounds.length ? null : { compounds, combinators };
}

function attributeMatches(element, expression) {
  const equality = expression.match(/^([\w-]+)\s*=\s*["']?([^"']+)["']?$/u);
  if (equality) return element.attributes.get(equality[1].toLowerCase()) === equality[2];
  return /^[\w-]+$/u.test(expression) && element.attributes.has(expression.toLowerCase());
}

function selectorTag(compound) {
  return compound
    .replace(/\[[^\]]+\]/gu, "")
    .replace(/#[\w-]+/gu, "")
    .replace(/\.[\w-]+/gu, "")
    .replace(/\*/gu, "")
    .trim();
}

function compoundMatches(element, compound) {
  for (const match of compound.matchAll(/\[([^\]]+)\]/gu)) {
    if (!attributeMatches(element, match[1].trim())) return false;
  }
  for (const match of compound.matchAll(/#([\w-]+)/gu)) {
    if (element.attributes.get("id") !== match[1]) return false;
  }
  for (const match of compound.matchAll(/\.([\w-]+)/gu)) {
    if (!element.classes.has(match[1])) return false;
  }
  const residual = selectorTag(compound);
  return !residual || residual.toLowerCase() === element.tag;
}

function selectorMatches(element, selector) {
  const parsed = selectorParts(selector);
  if (!parsed) return false;
  const { compounds, combinators } = parsed;
  function visit(candidate, index) {
    if (!candidate || !compoundMatches(candidate, compounds[index])) return false;
    if (index === 0) return true;
    if (combinators[index - 1] === ">") return visit(candidate.parent, index - 1);
    for (let ancestor = candidate.parent; ancestor; ancestor = ancestor.parent) {
      if (visit(ancestor, index - 1)) return true;
    }
    return false;
  }
  return visit(element, compounds.length - 1);
}

function specificity(selector) {
  const idCount = (selector.match(/#[\w-]+/gu) || []).length;
  const classCount = (selector.match(/\.[\w-]+|\[[^\]]+\]/gu) || []).length;
  const parsed = selectorParts(selector);
  const elementCount = parsed
    ? parsed.compounds.filter((compound) => Boolean(selectorTag(compound))).length
    : 0;
  return [idCount, classCount, elementCount];
}

function compareSpecificity(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function declarationOutranks(candidate, winner) {
  if (!winner) return true;
  if (candidate.important !== winner.important) return Number(candidate.important) > Number(winner.important);
  const comparison = compareSpecificity(candidate.specificity, winner.specificity);
  return comparison > 0 || (comparison === 0 && candidate.order >= winner.order);
}

function computedDeclaration(rules, element, property) {
  let winner = null;
  for (const rule of rules) {
    if (!selectorMatches(element, rule.selector)) continue;
    const weight = specificity(rule.selector);
    for (const declaration of rule.declarations) {
      if (declaration.property !== property) continue;
      const candidate = { ...declaration, specificity: weight, order: rule.order, selector: rule.selector };
      if (declarationOutranks(candidate, winner)) winner = candidate;
    }
  }
  return winner;
}

export function createCssFixture(source) {
  const rules = cssRules(source);
  return (element, property) => computedDeclaration(rules, element, property);
}
