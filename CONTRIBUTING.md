# Contributing

Thanks for helping improve Math Quest.

The [normative finished-work policy](AGENTS.md#what-counts-as-finished-work)
defines acceptance, evidence, scope, and completion status for all work in this
repository.

## Before opening an issue

- Reproduce the problem in a current browser.
- Record the neutral skill ID, level, tier, and sample number shown by Parent
  Test when available.
- Remove child and family information from text, filenames, and screenshots.
- Never upload a gameplay backup.

## Before submitting a pull request

1. Keep the engine as one expression between the required engine markers.
2. Treat `curriculum/math-quest-manifest-v1.json` as the curriculum source of
   truth. Do not add a second hand-maintained skill table or infer generator
   behavior from titles or identifiers.
3. Preserve the neutral 21-level, 126-skill manifest contract unless the change
   is an explicitly reviewed curriculum-version proposal.
4. Do not reintroduce a publisher's skill wording, identifiers, chapter
   taxonomy, grouping, sequence, or crosswalk.
5. Keep required runtime assets local. Do not add trackers, analytics, remote
   fonts, remote speech, or network-dependent play features. Never transmit
   child data automatically. Backup export is a local operation initiated only
   by a deliberate grown-up action; Math Quest must not upload the backup.
6. Preserve exact grading, deterministic generation, progress isolation in
   Parent Test, visible touch controls, keyboard operation, and the text-size
   floor.
7. Keep state-schema changes explicit and transactional. Do not reinterpret
   evidence from an incompatible curriculum.
8. Run `audit/run-audit.ps1 -DevelopmentOnly` on Windows plus every focused,
   effect-sensitive check required by the changed behavior. Report failures or
   skips honestly. `audit.bat` is reserved for the frozen release candidate
   immediately before public publication.
9. Run secret, personal-information, filename, metadata, archive, and
   third-party-rights scans over changed files.
10. Do not commit saves, generated screenshots, local audit reports, ZIP
    archives, private working notes, or reference material without confirmed
    redistribution rights.

Before implementation, record acceptance criteria in the existing issue,
plan, governing record, or active working plan. Record blockers, corrected
conclusions, and any owner-approved reduced scope there too; do not create an
ad hoc status file. A blocked or narrower deliverable does not complete the
original scope.

Revise an obsolete test only when its reason is documented in the existing
owning record and equal-or-stronger effect-sensitive protection preserves the
current behavior and the assertion's original safety or usability purpose.

Changes to curriculum order, mastery rules, child-facing wording, privacy
behavior, or release hashes require maintainer review and focused regression
coverage during development. A real production change whose focused checks
pass may be reported as **implemented**. It is **release-certified** only after
the complete gauntlet passes against the exact frozen candidate, and
**shipped** only when those certified bytes are actually published.

## Contribution license

By submitting a contribution, you agree that it may be distributed under the
project's [MIT License](LICENSE). Submit only material you have the right to
license. Third-party assets must retain their own notices and must not be
presented as MIT-licensed project code.
