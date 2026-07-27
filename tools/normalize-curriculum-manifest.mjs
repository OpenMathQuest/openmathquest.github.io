import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "curriculum", "math-quest-manifest-v1.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const originalLocale = typeof manifest.locale === "object" && manifest.locale
  ? manifest.locale
  : manifest.localization;
const levelNumberById = new Map(manifest.levels.map((level, index) => [level.id, index + 1]));

manifest.manifestId = "math-quest-curriculum";
manifest.schemaVersion = 1;
manifest.locale = "en-CA";
manifest.localization = {
  language: "en-CA",
  region: "CA-NS",
  currency: "CAD",
  currencyMinorUnit: "cent",
  measurementSystem: "metric",
  gradeSpan: "pre-K-foundations-through-grade-5",
  ...(originalLocale || {}),
};
manifest.licence = {
  ...manifest.licence,
  spdx: "MIT",
  scope: "MIT covers only original Math Quest expression and code. It does not claim mathematical ideas or relicense upstream expression, marks, or excluded material.",
  benchmarkAdaptationNotices: [
    "England Department for Education Crown material is used under the Open Government Licence v3.0 except where otherwise stated.",
    "Australian Curriculum material is used under Creative Commons Attribution 4.0 International, subject to ACARA attribution terms and exclusions.",
  ],
};
manifest.familyEnum = [...new Set(manifest.skills.map((skill) => skill.family))].sort();
manifest.authorshipMethod = {
  ...manifest.authorshipMethod,
  summary: "Original objectives, neutral taxonomy, three-trail sequence, constraints and prerequisite links were written before concept-level comparison with the listed official benchmarks.",
  wordingPolicy: "No benchmark sentence is reproduced. England ids identify named year/domain sections and AC9 ids are stable Australian Curriculum Version 9 content-description codes.",
  excludedInputs: [
    "proprietary curricula",
    "commercial textbook sequences",
    "pre-existing pre-beta curriculum artifacts",
  ],
};
manifest.levels = manifest.levels.map((level, index) => ({
  number: index + 1,
  ...level,
}));
manifest.skills = manifest.skills.map((skill) => {
  const numericLevel = Number.isInteger(skill.level) ? skill.level : levelNumberById.get(skill.level);
  if (!numericLevel) throw new Error(`${skill.id} references unknown level ${skill.level}.`);
  const { ordinal: _ordinal, levelId: _levelId, ...authoredSkill } = skill;
  return {
    ...authoredSkill,
    level: numericLevel,
  };
});

const englandSections = Object.freeze({
  "ENG-EYFS-EDU-MATH": "Section 1 / Educational Programmes / Mathematics",
  "ENG-EYFS-ELG-NUM": "Section 1 / Early Learning Goals / Number",
  "ENG-EYFS-ELG-NPAT": "Section 1 / Early Learning Goals / Numerical Patterns",
  "ENG-Y1-NPV": "Year 1 programme of study / Number - number and place value",
  "ENG-Y1-NAS": "Year 1 programme of study / Number - addition and subtraction",
  "ENG-Y1-NMD": "Year 1 programme of study / Number - multiplication and division",
  "ENG-Y1-NFRAC": "Year 1 programme of study / Number - fractions",
  "ENG-Y1-MEAS": "Year 1 programme of study / Measurement",
  "ENG-Y1-GSHAPE": "Year 1 programme of study / Geometry - properties of shapes",
  "ENG-Y1-GPOS": "Year 1 programme of study / Geometry - position and direction",
  "ENG-Y2-NPV": "Year 2 programme of study / Number - number and place value",
  "ENG-Y2-NAS": "Year 2 programme of study / Number - addition and subtraction",
  "ENG-Y2-NMD": "Year 2 programme of study / Number - multiplication and division",
  "ENG-Y2-NFRAC": "Year 2 programme of study / Number - fractions",
  "ENG-Y2-MEAS": "Year 2 programme of study / Measurement",
  "ENG-Y2-GSHAPE": "Year 2 programme of study / Geometry - properties of shapes",
  "ENG-Y2-GPOS": "Year 2 programme of study / Geometry - position and direction",
  "ENG-Y2-STAT": "Year 2 programme of study / Statistics",
  "ENG-Y3-NPV": "Year 3 programme of study / Number - number and place value",
  "ENG-Y3-NAS": "Year 3 programme of study / Number - addition and subtraction",
  "ENG-Y3-NMD": "Year 3 programme of study / Number - multiplication and division",
  "ENG-Y3-NFRAC": "Year 3 programme of study / Number - fractions",
  "ENG-Y3-MEAS": "Year 3 programme of study / Measurement",
  "ENG-Y3-GSHAPE": "Year 3 programme of study / Geometry - properties of shapes",
  "ENG-Y3-STAT": "Year 3 programme of study / Statistics",
  "ENG-Y4-NPV": "Year 4 programme of study / Number - number and place value",
  "ENG-Y4-NAS": "Year 4 programme of study / Number - addition and subtraction",
  "ENG-Y4-NMD": "Year 4 programme of study / Number - multiplication and division",
  "ENG-Y4-NFRAC": "Year 4 programme of study / Number - fractions (including decimals)",
  "ENG-Y4-MEAS": "Year 4 programme of study / Measurement",
  "ENG-Y4-GSHAPE": "Year 4 programme of study / Geometry - properties of shapes",
  "ENG-Y4-GPOS": "Year 4 programme of study / Geometry - position and direction",
  "ENG-Y4-STAT": "Year 4 programme of study / Statistics",
  "ENG-Y5-NPV": "Year 5 programme of study / Number - number and place value",
  "ENG-Y5-NAS": "Year 5 programme of study / Number - addition and subtraction",
  "ENG-Y5-NMD": "Year 5 programme of study / Number - multiplication and division",
  "ENG-Y5-NFRAC": "Year 5 programme of study / Number - fractions (including decimals and percentages)",
  "ENG-Y5-MEAS": "Year 5 programme of study / Measurement",
  "ENG-Y5-GSHAPE": "Year 5 programme of study / Geometry - properties of shapes",
  "ENG-Y5-GPOS": "Year 5 programme of study / Geometry - position and direction",
  "ENG-Y5-STAT": "Year 5 programme of study / Statistics",
  "ENG-Y6-NPV": "Year 6 programme of study / Number - number and place value",
  "ENG-Y6-ALG": "Year 6 programme of study / Algebra",
  "ENG-Y6-MEAS": "Year 6 programme of study / Measurement",
});

const benchmarkIdsBySkill = Object.freeze({
  "MQ-001": ["ENG-EYFS-ELG-NUM", "AC9MFN03"],
  "MQ-002": ["ENG-EYFS-ELG-NUM", "AC9MFN03"],
  "MQ-003": ["ENG-EYFS-ELG-NPAT", "AC9MFN03"],
  "MQ-004": ["ENG-EYFS-EDU-MATH", "AC9MFA01"],
  "MQ-005": ["ENG-EYFS-EDU-MATH", "AC9MFSP01"],
  "MQ-006": ["ENG-EYFS-EDU-MATH", "AC9MFM01"],
  "MQ-007": ["AC9MFST01"],
  "MQ-008": ["ENG-EYFS-ELG-NUM", "AC9MFN03"],
  "MQ-009": ["ENG-EYFS-ELG-NUM", "AC9MFN02"],
  "MQ-010": ["ENG-EYFS-ELG-NUM", "AC9MFN01"],
  "MQ-011": ["ENG-EYFS-ELG-NUM", "AC9MFN04"],
  "MQ-012": ["ENG-EYFS-EDU-MATH", "AC9MFM01"],
  "MQ-013": ["ENG-EYFS-ELG-NUM", "AC9MFN05"],
  "MQ-014": ["ENG-EYFS-ELG-NUM", "AC9MFN05"],
  "MQ-015": ["ENG-EYFS-EDU-MATH", "AC9MFN06"],
  "MQ-016": ["ENG-EYFS-EDU-MATH", "AC9MFA01"],
  "MQ-017": ["ENG-EYFS-EDU-MATH", "AC9MFSP02"],
  "MQ-018": ["AC9MFST01"],
  "MQ-019": ["ENG-EYFS-ELG-NUM", "AC9MFN01"],
  "MQ-020": ["ENG-EYFS-ELG-NUM", "AC9MFN02"],
  "MQ-021": ["ENG-EYFS-ELG-NPAT", "AC9MFN03"],
  "MQ-022": ["ENG-EYFS-ELG-NUM", "AC9MFN04"],
  "MQ-023": ["ENG-EYFS-ELG-NUM", "AC9MFN04"],
  "MQ-024": ["ENG-EYFS-EDU-MATH", "AC9MFSP01"],
  "MQ-025": ["ENG-Y1-NPV", "AC9MFN01"],
  "MQ-026": ["ENG-Y1-NPV", "AC9MFN01"],
  "MQ-027": ["ENG-Y1-NPV", "AC9MFN03"],
  "MQ-028": ["ENG-Y1-NAS", "AC9MFN05"],
  "MQ-029": ["ENG-Y1-NAS", "AC9MFN05"],
  "MQ-030": ["ENG-Y1-NFRAC", "AC9MFN06"],
  "MQ-031": ["ENG-Y1-NPV", "AC9MFN01"],
  "MQ-032": ["ENG-Y1-NMD", "AC9MFN06"],
  "MQ-033": ["ENG-Y1-NPV", "AC9MFA01"],
  "MQ-034": ["ENG-Y1-GPOS", "AC9MFSP02"],
  "MQ-035": ["ENG-Y1-MEAS", "AC9MFM01"],
  "MQ-036": ["AC9MFST01"],
  "MQ-037": ["ENG-Y1-NPV", "AC9M1N01"],
  "MQ-038": ["ENG-Y1-NPV", "AC9M1N02"],
  "MQ-039": ["ENG-Y1-NPV", "AC9M1A01"],
  "MQ-040": ["ENG-Y1-NAS", "AC9M1N04"],
  "MQ-041": ["ENG-Y1-NAS", "AC9M1N04"],
  "MQ-042": ["ENG-Y1-MEAS", "AC9M2M04"],
  "MQ-043": ["ENG-Y1-NAS", "AC9M2A02"],
  "MQ-044": ["ENG-Y1-NAS", "AC9M1N04"],
  "MQ-045": ["ENG-Y1-NMD", "AC9M1N06"],
  "MQ-046": ["ENG-Y1-MEAS", "AC9M1M02"],
  "MQ-047": ["ENG-Y1-NFRAC", "AC9M2N03"],
  "MQ-048": ["ENG-Y1-MEAS", "AC9M1N05"],
  "MQ-049": ["ENG-Y1-NAS", "AC9M1N04"],
  "MQ-050": ["ENG-Y1-NPV", "AC9M1N02"],
  "MQ-051": ["ENG-Y1-MEAS", "AC9M1N05"],
  "MQ-052": ["ENG-Y1-GSHAPE", "AC9M1SP01"],
  "MQ-053": ["ENG-Y1-GPOS", "AC9M1SP02"],
  "MQ-054": ["AC9M1ST01", "AC9M1ST02"],
  "MQ-055": ["ENG-Y2-NPV", "AC9M2N01"],
  "MQ-056": ["ENG-Y2-NPV", "AC9M2N02"],
  "MQ-057": ["ENG-Y2-NPV", "AC9M2N01"],
  "MQ-058": ["ENG-Y2-NAS", "AC9M2A02"],
  "MQ-059": ["ENG-Y2-NAS", "AC9M2N04"],
  "MQ-060": ["ENG-Y2-NAS", "AC9M2N04"],
  "MQ-061": ["ENG-Y2-NMD", "AC9M2A03"],
  "MQ-062": ["ENG-Y2-NMD", "AC9M3A03"],
  "MQ-063": ["ENG-Y2-NMD", "AC9M2N05"],
  "MQ-064": ["ENG-Y2-NFRAC", "AC9M2N03"],
  "MQ-065": ["ENG-Y2-MEAS", "AC9M2N06"],
  "MQ-066": ["ENG-Y2-MEAS", "AC9M2M04"],
  "MQ-067": ["ENG-Y2-NPV", "AC9M2N02"],
  "MQ-068": ["ENG-Y2-NPV", "AC9M2A01"],
  "MQ-069": ["ENG-Y2-MEAS", "AC9M3M01", "AC9M3M02"],
  "MQ-070": ["ENG-Y2-GSHAPE", "AC9M2SP01"],
  "MQ-071": ["ENG-Y2-GPOS", "AC9M2SP02"],
  "MQ-072": ["ENG-Y2-STAT", "AC9M2ST01", "AC9M2ST02"],
  "MQ-073": ["ENG-Y3-NPV", "AC9M3N01"],
  "MQ-074": ["ENG-Y3-NPV", "AC9M3N01"],
  "MQ-075": ["ENG-Y3-NPV", "AC9M4N07"],
  "MQ-076": ["ENG-Y3-NAS", "AC9M3N03"],
  "MQ-077": ["ENG-Y3-NMD", "AC9M3A03"],
  "MQ-078": ["ENG-Y3-NMD", "AC9M3A03"],
  "MQ-079": ["ENG-Y3-NMD", "AC9M3N04"],
  "MQ-080": ["ENG-Y3-NMD", "AC9M3N04"],
  "MQ-081": ["ENG-Y3-NFRAC", "AC9M3N02"],
  "MQ-082": ["ENG-Y3-NFRAC", "AC9M3N02"],
  "MQ-083": ["ENG-Y3-NAS", "AC9M3A01"],
  "MQ-084": ["ENG-Y3-NPV", "AC9M3N07"],
  "MQ-085": ["ENG-Y3-MEAS", "AC9M3M06"],
  "MQ-086": ["ENG-Y3-MEAS", "AC9M3M04"],
  "MQ-087": ["ENG-Y3-MEAS", "AC9M4M02"],
  "MQ-088": ["ENG-Y3-GSHAPE", "AC9M2SP01", "AC9M3M05"],
  "MQ-089": ["ENG-Y4-GPOS", "AC9M3SP02"],
  "MQ-090": ["AC9M3P02"],
  "MQ-091": ["ENG-Y5-NPV", "AC9M3N01"],
  "MQ-092": ["ENG-Y4-NPV", "AC9M4N05"],
  "MQ-093": ["ENG-Y4-NPV", "AC9M4N07"],
  "MQ-094": ["ENG-Y4-NPV"],
  "MQ-095": ["ENG-Y4-NAS", "AC9M4N06"],
  "MQ-096": ["ENG-Y4-NMD", "AC9M4N06"],
  "MQ-097": ["ENG-Y2-NMD", "AC9M4N02"],
  "MQ-098": ["ENG-Y4-NFRAC", "AC9M4N03"],
  "MQ-099": ["ENG-Y4-NFRAC", "AC9M4N01", "AC9M4N03"],
  "MQ-100": ["ENG-Y4-NFRAC", "AC9M5N01"],
  "MQ-101": ["ENG-Y4-NAS", "AC9M4A01"],
  "MQ-102": ["ENG-Y4-MEAS", "AC9M4N08"],
  "MQ-103": ["ENG-Y4-NPV", "AC9M4N09"],
  "MQ-104": ["ENG-Y4-NFRAC", "AC9M5N05"],
  "MQ-105": ["ENG-Y4-MEAS", "AC9M4M02"],
  "MQ-106": ["ENG-Y4-GSHAPE", "AC9M4SP03"],
  "MQ-107": ["ENG-Y4-STAT", "AC9M4ST01", "AC9M4ST03"],
  "MQ-108": ["AC9M4P01"],
  "MQ-109": ["ENG-Y6-NPV"],
  "MQ-110": ["ENG-Y5-NFRAC", "AC9M5N01"],
  "MQ-111": ["ENG-Y5-NPV", "ENG-Y5-NAS", "AC9M5N08"],
  "MQ-112": ["ENG-Y5-NMD", "AC9M5N02"],
  "MQ-113": ["ENG-Y5-NMD", "AC9M5N06"],
  "MQ-114": ["ENG-Y5-NMD", "AC9M5N07"],
  "MQ-115": ["ENG-Y5-NFRAC", "AC9M5N05"],
  "MQ-116": ["ENG-Y5-NFRAC", "AC9M5N04"],
  "MQ-117": ["ENG-Y5-NFRAC"],
  "MQ-118": ["ENG-Y5-NAS", "ENG-Y5-NMD", "AC9M5N09"],
  "MQ-119": ["ENG-Y6-ALG"],
  "MQ-120": ["ENG-Y5-MEAS", "AC9M5M01"],
  "MQ-121": ["ENG-Y5-MEAS", "AC9M5M02"],
  "MQ-122": ["ENG-Y6-MEAS"],
  "MQ-123": ["ENG-Y5-MEAS", "AC9M5M03"],
  "MQ-124": ["ENG-Y5-GSHAPE", "AC9M5M04"],
  "MQ-125": ["ENG-Y5-GPOS", "AC9M5SP02", "AC9M5SP03"],
  "MQ-126": ["ENG-Y5-STAT", "AC9M5ST01", "AC9M5ST02"],
});

const australianStrands = Object.freeze({
  N: "Number",
  A: "Algebra",
  M: "Measurement",
  SP: "Space",
  ST: "Statistics",
  P: "Probability",
});
const australianSection = (id) => {
  const match = /^AC9M(F|[1-5])(SP|ST|N|A|M|P)(\d{2})$/u.exec(id);
  if (!match) throw new Error(`Invalid Australian Curriculum descriptor code ${id}.`);
  const year = match[1] === "F" ? "Foundation" : `Year ${match[1]}`;
  return `${year} / ${australianStrands[match[2]]} / content description ${id}`;
};

for (const skill of manifest.skills) {
  const benchmarkIds = benchmarkIdsBySkill[skill.id];
  if (!benchmarkIds?.length) throw new Error(`No concept-level benchmark mapping for ${skill.id}.`);
  skill.benchmarkIds = [...benchmarkIds];
}

const usedBenchmarkIds = [...new Set(manifest.skills.flatMap((skill) => skill.benchmarkIds))].sort();
manifest.benchmarkIndex = usedBenchmarkIds.map((id) => {
  if (englandSections[id]) {
    return {
      id,
      sourceId: id.startsWith("ENG-EYFS-") ? "SRC-ENG-EYFS" : "SRC-ENG-MATH",
      section: englandSections[id],
    };
  }
  return {
    id,
    sourceId: "SRC-AUS-MRAC",
    section: australianSection(id),
  };
});

manifest.sources = [
  {
    id: "SRC-ENG-MATH",
    title: "National curriculum in England: mathematics programmes of study",
    publisher: "England Department for Education",
    edition: "Published 11 September 2013; HTML updated 28 September 2021; key stages 1 and 2 PDF reference DFE-00180-2013",
    url: "https://www.gov.uk/government/publications/national-curriculum-in-england-mathematics-programmes-of-study/national-curriculum-in-england-mathematics-programmes-of-study",
    licence: "Open Government Licence v3.0 except where otherwise stated",
    accessed: "2026-07-27",
    use: "Normative concept check by named year/domain section; no statutory requirement sentence is reproduced.",
  },
  {
    id: "SRC-ENG-EYFS",
    title: "Early years foundation stage statutory framework for group and school-based providers",
    publisher: "England Department for Education",
    edition: "Dated 14 July 2025; effective 1 September 2025; 55-page framework",
    url: "https://assets.publishing.service.gov.uk/media/68c024cb8c6d992f23edd79c/Early_years_foundation_stage_statutory_framework_-_for_group_and_school-based_providers.pdf.pdf",
    licence: "Open Government Licence v3.0 for Crown material except where otherwise stated",
    accessed: "2026-07-27",
    use: "Normative early-years concept check by named mathematics programme or early-learning-goal section; no requirement sentence is reproduced.",
  },
  {
    id: "SRC-UK-OGL",
    title: "Open Government Licence for public sector information",
    publisher: "The National Archives",
    edition: "Version 3.0",
    url: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    licence: "Licence instrument",
    accessed: "2026-07-27",
    use: "Rights control and required fallback acknowledgement for Crown benchmark material.",
  },
  {
    id: "SRC-AUS-MRAC",
    title: "Machine Readable Australian Curriculum Version 9: Mathematics",
    publisher: "Australian Curriculum, Assessment and Reporting Authority",
    edition: "MRAC/2024/04/LA/MAT; files updated 7 June 2024",
    url: "https://vocabulary.curriculum.edu.au/MRAC/2024/04/LA/MAT/export/MRAC/2024/04/LA/MAT.jsonld",
    sha256: "4d6b7a01d10517dc97ad709055c62c171b9b90ea33e0d0fc395e9bd2f96e48b1",
    licence: "Creative Commons Attribution 4.0 International unless otherwise indicated",
    accessed: "2026-07-27",
    use: "Normative concept check by stable Version 9 content-description code; benchmark expression is not reproduced.",
  },
  {
    id: "SRC-AUS-MATH",
    title: "Australian Curriculum Version 9.0: Mathematics - learning-area structure",
    publisher: "Australian Curriculum, Assessment and Reporting Authority",
    edition: "Version 9.0, endorsed 10 May 2022",
    url: "https://www.australiancurriculum.edu.au/curriculum-information/understand-this-learning-area/mathematics",
    licence: "Creative Commons Attribution 4.0 International unless otherwise indicated",
    accessed: "2026-07-27",
    use: "High-level strand and proficiency structure check only.",
  },
  {
    id: "SRC-AUS-VERSION",
    title: "Australian Curriculum version history",
    publisher: "Australian Curriculum, Assessment and Reporting Authority",
    edition: "Page records Version 9.0 as endorsed 10 May 2022",
    url: "https://www.australiancurriculum.edu.au/help/f-10-curriculum-overview/version-history",
    licence: "Creative Commons Attribution 4.0 International unless otherwise indicated",
    accessed: "2026-07-27",
    use: "Edition control for the Version 9 benchmark.",
  },
  {
    id: "SRC-AUS-TERMS",
    title: "Australian Curriculum copyright and terms of use",
    publisher: "Australian Curriculum, Assessment and Reporting Authority",
    edition: "Terms last updated April 2021",
    url: "https://www.australiancurriculum.edu.au/copyright-and-terms-of-use/",
    licence: "Licence control documenting CC BY 4.0 coverage, attribution and exclusions",
    accessed: "2026-07-27",
    use: "Rights control; excluded material was not used.",
  },
  ...[
    ["SRC-NS-MATH-P", "Mathematics Primary", "https://curriculum.novascotia.ca/english-programs/course/mathematics-primary", "Updated 8 August 2022"],
    ["SRC-NS-MATH-1", "Mathematics 1", "https://curriculum.novascotia.ca/english-programs/course/mathematics-1", "Updated 26 July 2022"],
    ["SRC-NS-MATH-2", "Mathematics 2", "https://curriculum.novascotia.ca/english-programs/course/mathematics-2", "Updated 26 July 2022"],
    ["SRC-NS-MATH-3", "Mathematics 3", "https://curriculum.novascotia.ca/english-programs/course/mathematics-3", "Updated 26 July 2022"],
    ["SRC-NS-MATH-4", "Mathematics 4", "https://curriculum.novascotia.ca/english-programs/course/mathematics-4", "Updated 26 July 2022"],
    ["SRC-NS-MATH-5", "Mathematics 5", "https://curriculum.novascotia.ca/english-programs/course/mathematics-5", "Updated 26 July 2022"],
  ].map(([id, title, url, edition]) => ({
    id,
    title,
    publisher: "Nova Scotia Department of Education and Early Childhood Development",
    edition,
    url,
    licence: "Reference-only facts check; no reuse licence is relied upon",
    accessed: "2026-07-27",
    use: "Grade-matched localization and local-scope review only; not a normative benchmark and no wording is copied.",
  })),
  {
    id: "SRC-CA-MINT",
    title: "Canadian Circulation",
    publisher: "Royal Canadian Mint",
    edition: "Live circulation-denomination index",
    url: "https://www.mint.ca/en/discover/canadian-circulation",
    licence: "Reference-only facts check; no reuse licence is relied upon",
    accessed: "2026-07-27",
    use: "Factual check for the selected Canadian circulation-coin denominations; no imagery or wording is reused.",
  },
  {
    id: "SRC-CA-SI",
    title: "GEN-50 - Use in trade of units of measurement defined in the Weights and Measures Act",
    publisher: "Measurement Canada, Innovation, Science and Economic Development Canada",
    edition: "Published and effective 28 January 2026",
    url: "https://ised-isde.canada.ca/site/measurement-canada/en/laws-and-requirements/gen-50-use-trade-units-measurement-defined-weights-and-measures-act",
    licence: "Reference-only facts check",
    accessed: "2026-07-27",
    use: "Factual check that SI/metric units and symbols are defined for Canadian use; no wording is copied.",
  },
];

manifest.localizationReview = {
  status: "reference-only-localization-check",
  normativeBenchmark: false,
  rule: "Nova Scotia sources never appear in skill benchmarkIds. Each school band is checked only against its grade-matched public course overview; pre-K foundations have no asserted Nova Scotia grade mapping.",
  bandSources: {
    PREK: [],
    K: ["SRC-NS-MATH-P"],
    G1: ["SRC-NS-MATH-1"],
    G2: ["SRC-NS-MATH-2"],
    G3: ["SRC-NS-MATH-3"],
    G4: ["SRC-NS-MATH-4"],
    G5: ["SRC-NS-MATH-5"],
  },
  contextSources: ["SRC-CA-MINT", "SRC-CA-SI"],
};

const constraintType = (value) => {
  if (Array.isArray(value)) {
    const itemTypes = [...new Set(value.map((item) => {
      if (Array.isArray(item)) return "array";
      if (item === null) return "null";
      return typeof item;
    }))].sort();
    return `array:${itemTypes.join("|") || "empty"}`;
  }
  if (value === null) return "null";
  return typeof value;
};
const constraintTypesByKey = new Map();
for (const skill of manifest.skills) {
  for (const [key, value] of Object.entries(skill.constraints || {})) {
    if (!constraintTypesByKey.has(key)) constraintTypesByKey.set(key, new Set());
    constraintTypesByKey.get(key).add(constraintType(value));
  }
}
manifest.constraintSchema = {
  version: 1,
  closed: true,
  keyTypes: Object.fromEntries(
    [...constraintTypesByKey.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, types]) => [key, [...types].sort()]),
  ),
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const escapeCell = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const localSourceByBand = manifest.localizationReview.bandSources;
const crosswalkLines = [
  "# Math Quest curriculum benchmark crosswalk",
  "",
  "> Generated by `node tools/normalize-curriculum-manifest.mjs`; do not edit by hand.",
  "",
  "This is a traceability index, not a claim that Math Quest is an official curriculum, that grade labels are equivalent across jurisdictions, or that either source endorses the product. Math Quest titles are original. Upstream curriculum sentences are deliberately omitted.",
  "",
  "England anchors identify the exact year/domain heading (or EYFS mathematics/ELG heading) recorded in `benchmarkIndex`. Australian anchors are stable Version 9 content-description codes from ACARA's `MRAC/2024/04/LA/MAT` dataset. Cross-year anchors are intentional when they are the closest concept-level comparator.",
  "",
  "Nova Scotia pages are reference-only, grade-matched localization checks. They are never skill benchmarks. `PREK` is deliberately shown as `—` because no Nova Scotia grade mapping is asserted.",
  "",
  "| Skill | Level | Band | Original Math Quest title | England section anchor(s) | Australian V9 descriptor code(s) | Nova Scotia localization page |",
  "|---|---:|---|---|---|---|---|",
  ...manifest.skills.map((skill) => {
    const england = skill.benchmarkIds.filter((id) => id.startsWith("ENG-")).join(", ") || "—";
    const australia = skill.benchmarkIds.filter((id) => id.startsWith("AC9")).join(", ") || "—";
    const novaScotia = localSourceByBand[skill.band].join(", ") || "—";
    return `| ${skill.id} | ${skill.level} | ${skill.band} | ${escapeCell(skill.title)} | ${england} | ${australia} | ${novaScotia} |`;
  }),
  "",
];
await writeFile(
  path.join(root, "research", "curriculum-benchmark-crosswalk.md"),
  `${crosswalkLines.join("\n")}\n`,
  "utf8",
);

console.log(`Normalized ${manifest.manifestId} v${manifest.version}: ${manifest.levels.length} levels, ${manifest.skills.length} skills; regenerated concept crosswalk.`);
