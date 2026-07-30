# Math Quest — Public Beta Decision Register

- **Register revision:** `AR-PUBLIC-7`
- **Contract:** `docs/development/build-spec.md` version `3.2`
- **Contract SHA-256:** `2876334d29d3ff89cc44d8ca451f69a1dc54bd5d4a1e55049207af9d33446696`
- **Curriculum manifest:** `math-quest-curriculum` version `1.0.0` (schema `1`)
- **Manifest SHA-256:** `49e5265eed2fe6d17d660d8136de1b55b05398e6b86b2b8761571480580e1048`
- **Engine SHA-256:** `c206d4a348543b143d3eea1d7131da146d8fb65d1d70765cd7ceaf547b8542b3`
- **Approved child-string table:** `child-strings-v1`, 276 records, SHA-256 `27b00a31f060b80390c3049c44258c35329b0b424538e11572a53971598833be`
- **State schema:** `3`
- **Date:** `2026-07-29`

## Confirmed decisions

| ID | Area | Decision |
|---|---|---|
| PB-001 | Product | Math Quest is a child-playable, grown-up-supported mathematics game spanning pre-K through Grade 5. |
| PB-002 | Curriculum | The public journey is independently authored. It does not reuse an external curriculum's identifiers, wording, taxonomy, grouping, or sequence. |
| PB-003 | Manifest | One versioned canonical manifest defines public skills, order, prerequisites, stages, strands, representations, and skill-specific evidence requirements. |
| PB-004 | Derived values | Skill counts, level counts, level boundaries, stage mappings, and progress denominators are computed from the manifest rather than fixed in parallel constants. |
| PB-005 | Provenance | Mathematical ideas may be synthesized from lawful authoritative references, but public wording and compilation are original. Sources and reuse terms are recorded. |
| PB-006 | Engine | The exact engine in `index.html` remains deterministic, side-effect-free, uniquely marked, and tested from its shipped bytes. |
| PB-007 | State | Public Beta 2 saves use schema version `3` under the stable `math-quest:progress:v2` namespace. The key names the Public Beta 2 progress boundary, not the object schema. Exact schema-2 saves and backups migrate transactionally by adding only the neutral placement record and a zero-valued nonnegative placement-draft generation before full validation; unsupported or schema-3-to-schema-2 downgrade attempts fail without replacing live bytes. First-write and Beta 1 cutovers use constant non-PII `empty-to-protected-v1` and `beta1-to-protected-v1` values under `math-quest:progress:v2:beta1-migration-guard:v1` while holding the writer lease. A surviving marker makes reload recheck an interrupted blank or retry the newest Beta 1 source instead of trusting unproven protected bytes. Because external-marker cleanup can coincide with storage failure, boot also inspects Beta 1 whenever protected bytes validate and canonically equal the exact untouched initial state for their saved play day; a valid Beta 1 record outranks only that demonstrably virgin state, never changed Beta 2 progress. The exclusive writer lease prevents concurrent writers but does not promise mixed-version-tab compatibility. |
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
| PB-033 | Placement draft privacy and honesty | An unfinished starting-point check is resumable only through schema-4 `math-quest:placement-draft:v1`, separate from ordinary progress and backups. It is bounded to contract/generator identity, a local progress-baseline consistency fingerprint, the exact persisted nonnegative draft generation, a transactionally committed non-PII run nonce and derived seed, play day, theme, question identifiers, exact `correct` / `incorrect` / `not-sure` response kinds, a bounded visible feedback kind, and partial controls; it excludes nickname, age, timing, mastery evidence, logs, analytics, and other identifying data. A failed start commit exposes no run or draft; resume is deterministic and retry consumes a fresh nonce. A run uses bounded deterministic resampling/fallback and fails closed rather than repeat a child-visible semantic task. Discard removes the draft. Reset, import replacement, and successful apply atomically commit a generation greater than every valid current, imported, and safely parsed surviving-draft floor before attempting removal, including from unreadable-save recovery; a surviving prior-generation draft fails closed on reload, and maximum-safe-integer exhaustion mutates no input. Failed main commits preserve the prior generation and recoverable draft. The grown-up result is an unvalidated broad heuristic, reports separate response counts, marks confidence limited when Not sure was used, and never proves that each earlier skill was checked; application requires a delayed second action in a grown-up confirmation dialog. Fresh sound and automatic speech are off, while co-play and on-demand Replay guidance are explicit. |
| PB-034 | Engine coverage threshold | On 2026-07-29 the project owner set the exact-engine calibrated native branch-coverage minimum to 88 percent. This is a release-policy revision, not a harness workaround: calibration must still prove full, partial, and repeated-filename aggregation fixtures; the exact staged engine bytes, SHA-256, virtual filename, root source span, identical nonzero V8 range map, mutation families, and every other technical and external gate remain mandatory and fail closed. |

## Frozen release identifiers

The contract digest above binds this register to the exact current contract.
The manifest, engine, and approved child-string identities above bind this
register to the frozen Beta 2 candidate.
Changing the curriculum manifest, contract, engine, state contract, or governed
child wording invalidates the corresponding approval and requires the complete
release review again.
