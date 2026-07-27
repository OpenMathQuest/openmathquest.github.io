# Contributing

Thanks for helping improve Math Quest.

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
   fonts, remote speech, or network-dependent play features.
6. Preserve exact grading, deterministic generation, progress isolation in
   Parent Test, visible touch controls, keyboard operation, and the text-size
   floor.
7. Keep state-schema changes explicit and transactional. Do not reinterpret
   evidence from an incompatible curriculum.
8. Run `audit.bat` on Windows and report failures or skips honestly.
9. Run secret, personal-information, filename, metadata, archive, and
   third-party-rights scans over changed files.
10. Do not commit saves, generated screenshots, local audit reports, ZIP
    archives, private working notes, or reference material without confirmed
    redistribution rights.

Changes to curriculum order, mastery rules, child-facing wording, privacy
behavior, or release hashes require maintainer review and a new complete
release audit.

## Contribution license

By submitting a contribution, you agree that it may be distributed under the
project's [MIT License](LICENSE). Submit only material you have the right to
license. Third-party assets must retain their own notices and must not be
presented as MIT-licensed project code.
