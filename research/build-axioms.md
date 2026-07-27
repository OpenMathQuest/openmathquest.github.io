# Math Quest — Public Beta Decision Register

- **Register revision:** `AR-PUBLIC-4`
- **Contract:** `docs/development/build-spec.md` version `3.0`
- **Contract SHA-256:** `77866043bc6ee75bd9648689ab6eee85a535545fb65ef00b3c771f6eb1527be5`
- **Curriculum manifest:** `math-quest-curriculum` version `1.0.0` (schema `1`)
- **Manifest SHA-256:** `49e5265eed2fe6d17d660d8136de1b55b05398e6b86b2b8761571480580e1048`
- **Engine SHA-256:** `07ec69208431d24698ba5f3e07b17e6428075d888b9f2127bee7035d1ab3392a`
- **Approved child-string table:** `263` records, SHA-256 `2a3ec6a773fe52959005a096554ee6864cf22643ae18fe28abecb66446685b6a`
- **State schema:** `2`
- **Date:** `2026-07-27`

## Confirmed decisions

| ID | Area | Decision |
|---|---|---|
| PB-001 | Product | Math Quest is a child-playable, grown-up-supported mathematics game spanning pre-K through Grade 5. |
| PB-002 | Curriculum | The public journey is independently authored. It does not reuse an external curriculum's identifiers, wording, taxonomy, grouping, or sequence. |
| PB-003 | Manifest | One versioned canonical manifest defines public skills, order, prerequisites, stages, strands, representations, and skill-specific evidence requirements. |
| PB-004 | Derived values | Skill counts, level counts, level boundaries, stage mappings, and progress denominators are computed from the manifest rather than fixed in parallel constants. |
| PB-005 | Provenance | Mathematical ideas may be synthesized from lawful authoritative references, but public wording and compilation are original. Sources and reuse terms are recorded. |
| PB-006 | Engine | The exact engine in `index.html` remains deterministic, side-effect-free, uniquely marked, and tested from its shipped bytes. |
| PB-007 | State | Public beta saves use schema version `2` and a version-2 storage namespace. Unsupported versions are rejected transactionally. |
| PB-008 | Legacy boundary | Pre-beta mastery and evidence are not migrated into the independent manifest. Earlier browser data is left untouched. |
| PB-009 | Localization | Primary contexts use Canadian money and metric units. Ordinary coins are 5 cents, 10 cents, 25 cents, 1 dollar, and 2 dollars. |
| PB-010 | CPA | Every skill declares its applicable ordered Concrete, Pictorial, and Abstract phases. On-screen manipulatives are Pictorial; scaffolded work is non-evidentiary. |
| PB-011 | Spacing | Review intervals are `1, 1, 2, 4, 7, 12` play days. One skill earns at most one mastery success per play day. |
| PB-012 | Mastery | Normal mastery needs three clean construction days, or four clean days when a counted witness is guess-prone selection, plus all applicable hard, model, and applied witnesses. |
| PB-013 | Fast track | Fast track lowers only the day floor to two construction days or three guess-prone-selection days. It never skips CPA or required witnesses. |
| PB-014 | Demotion | An incorrect scheduled review demotes a solid skill, resets its spacing, and preserves evidence. Recovery requires new spaced clean evidence. |
| PB-015 | Level re-teaching | Seven or fewer clean results in the latest 12 current-level cold tests activates re-teaching; eight or more does not. Active re-teaching blocks promotion. |
| PB-016 | Promotion | Promotion requires no active level re-teaching, every current-level gateway solid, and at least 80% of current-level skills solid. |
| PB-017 | Chronic re-teaching | Three misses in the latest six attempts for a skill across at least two sessions triggers model-then-copy re-teaching. |
| PB-018 | Timing | Stage soft caps are `360000 / 480000 / 600000 / 840000 ms` for pre-K, Kindergarten, Grades 1–2, and Grades 3–5. |
| PB-019 | Feedback latency | Stage thresholds are `30000 / 25000 / 20000 / 30000 ms`. Latency never changes feedback or mastery. |
| PB-020 | Fatigue | The valid-attempt window is `5`; slopes are `4000 / 3500 / 3000 / 5000 ms`; rapid thresholds are `1800 / 1600 / 1400 / 1200 ms`; streaks are `2 / 3 / 3 / 3`; idle thresholds are `45000 / 60000 / 75000 / 90000 ms`. Fatigue may offer a stop but never changes evidence. |
| PB-021 | Selection | Selection uses select-then-confirm with a `600 ms` deliberate-change debounce. Fewer-than-four-option selections are non-evidentiary. |
| PB-022 | Child UX | Early play is speech-supported and icon-first, with at least 18 px child text, at least 16 px other visible text, large targets, truthful models, and no avoidable desktop scrolling. |
| PB-023 | Access | Essential play supports touch, mouse, keyboard, and switch-style activation without hover, drag-only input, fine precision, or colour-only meaning. Reduced motion is respected. |
| PB-024 | Parent Test | Parent Test may exercise every manifest skill and variant but is strictly non-evidentiary and cannot mutate the child save. |
| PB-025 | Privacy | The optional child display name and progress remain in local browser storage. There are no accounts, analytics, advertising, remote speech, or cloud synchronization. |
| PB-026 | Offline | Required runtime assets are inline or local. The desktop build blocks non-loopback requests; hosted play makes no runtime network request after load. |
| PB-027 | Strings | Child-facing feedback uses neutral process or observation language and no scores, prizes, ability labels, comparative praise, or reward economy. The exact approved table is canonicalized and hashed. |
| PB-028 | Public release | Rights, privacy, technical, browser, visual, and deployment reviews all fail closed and bind their approval to the exact manifest and engine hashes. |
| PB-029 | Task witnesses | Each skill declares semantic task types. Every required task type needs a clean evidentiary witness before the skill can become solid. |
| PB-030 | Hosted offline use | The reviewed hosted shell registers a same-origin service worker and caches only the versioned first-party runtime allowlist for offline reopening after a successful first load. |
| PB-031 | Open components | Every bundled asset, adapted or quoted source, and executable workflow component must be original MIT work, verified public domain/CC0, or under a compatible reviewed open licence permitting commercial use, redistribution, and modification. Exact assets are hash-registered, Actions are commit-pinned, restrictive or unknown terms fail closed, and BBC RemArc recordings and platform emoji artwork are ineligible. |
| PB-032 | Public origin | The public beta uses the organization-root origin `https://openmathquest.github.io`, served only from `OpenMathQuest/openmathquest.github.io`, with no CNAME or custom domain. The `OpenMathQuest` organization remains exclusive to Math Quest Pages so unrelated sites cannot share its origin-wide storage or root service-worker scope. |

## Frozen release identifiers

The identifiers above bind this review to the exact contract, canonical
manifest, and shipped engine bytes. Changing the curriculum manifest or engine
invalidates the corresponding approval and requires the complete release
review again.
