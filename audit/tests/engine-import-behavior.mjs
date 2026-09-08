// Ordered behavioral assertions retained under the original BEH-27 result.
function hostileImportIsolation({ engine, assert, createState, canonicalStringify, cloneJson, state }) {
  state.live = createState(engine);
  state.before = canonicalStringify(state.live);
  for (const value of [
    { schemaVersion: 1 },
    { schemaVersion: 999 },
    { ...cloneJson(state.live), curriculumSha256: "f".repeat(64) },
    "not-json",
  ]) {
    let rejected = false;
    try {
      const payload = typeof value === "string" ? value : JSON.stringify(value);
      const result = engine.importState(state.live, payload, 21_000);
      rejected = Boolean(result?.ok === false || result?.error);
    } catch {
      rejected = true;
    }
    assert.ok(rejected, canonicalStringify(value));
    assert.equal(canonicalStringify(state.live), state.before);
  }
}

function baselineImportAndReset({ engine, assert, canonicalStringify, cloneJson, state }) {
  const baselineRun = engine.createPlacementRun({ state: state.live, playDay: 21_000, seed: 0x65706f63 });
  const baselineImport = engine.importState(state.live, state.before, 21_000);
  assert.equal(baselineImport.ok, true, baselineImport.error);
  assert.equal(baselineImport.state.placementDraftGeneration, state.live.placementDraftGeneration + 1);
  const importProjection = cloneJson(baselineImport.state);
  importProjection.placementDraftGeneration = state.live.placementDraftGeneration;
  assert.equal(canonicalStringify(importProjection), state.before, "baseline-identical import changes only its draft generation");
  assert.match(engine.validatePlacementRun(baselineRun, baselineImport.state).error, /stale/iu);
  const reset = engine.createResetState(state.live, 21_000);
  assert.equal(reset.placementDraftGeneration, state.live.placementDraftGeneration + 1);
  const resetProjection = cloneJson(reset);
  resetProjection.placementDraftGeneration = state.live.placementDraftGeneration;
  assert.equal(canonicalStringify(resetProjection), state.before, "baseline-identical reset changes only its draft generation");
  assert.match(engine.validatePlacementRun(baselineRun, reset).error, /stale/iu);
}

function generationFloors({ engine, assert, cloneJson, state }) {
  const laterEpochBackup = cloneJson(state.live);
  laterEpochBackup.placementDraftGeneration = 7;
  const laterEpochImport = engine.importState(state.live, engine.exportState(laterEpochBackup), 21_000);
  assert.equal(laterEpochImport.ok, true, laterEpochImport.error);
  assert.equal(laterEpochImport.state.placementDraftGeneration, 8, "import advances beyond both local and imported generations");
  const draftFloorReset = engine.createResetState(state.live, 21_000, 11);
  assert.equal(draftFloorReset.placementDraftGeneration, 12, "reset advances beyond a surviving placement-draft generation");
  const draftFloorImport = engine.importState(state.live, state.before, 21_000, 13);
  assert.equal(draftFloorImport.ok, true, draftFloorImport.error);
  assert.equal(draftFloorImport.state.placementDraftGeneration, 14, "import advances beyond a surviving placement-draft generation");
}

function exhaustedCurrentGeneration({ engine, assert, canonicalStringify, cloneJson, state }) {
  const exhaustedCurrent = cloneJson(state.live);
  exhaustedCurrent.placementDraftGeneration = Number.MAX_SAFE_INTEGER;
  const exhaustedBefore = canonicalStringify(exhaustedCurrent);
  assert.throws(
    () => engine.createResetState(exhaustedCurrent, 21_000),
    /generation is exhausted/iu,
  );
  assert.equal(canonicalStringify(exhaustedCurrent), exhaustedBefore, "failed reset cannot mutate its input");
  const exhaustedImport = engine.importState(exhaustedCurrent, state.before, 21_000);
  assert.equal(exhaustedImport.ok, false);
  assert.equal(exhaustedImport.state, exhaustedCurrent);
  assert.match(exhaustedImport.error, /generation is exhausted/iu);
  assert.equal(canonicalStringify(exhaustedCurrent), exhaustedBefore, "failed import cannot mutate current progress");
}

function exhaustedDraftFloor({ engine, assert, canonicalStringify, state }) {
  const floorExhaustedImport = engine.importState(state.live, state.before, 21_000, Number.MAX_SAFE_INTEGER);
  assert.equal(floorExhaustedImport.ok, false);
  assert.equal(floorExhaustedImport.state, state.live);
  assert.match(floorExhaustedImport.error, /generation is exhausted/iu);
  assert.equal(canonicalStringify(state.live), state.before, "overflow through a draft floor cannot mutate current progress");
}

function exhaustedBackupGeneration({ engine, assert, canonicalStringify, cloneJson, state }) {
  const exhaustedBackupObject = cloneJson(state.live);
  exhaustedBackupObject.placementDraftGeneration = Number.MAX_SAFE_INTEGER;
  const exhaustedBackupBefore = canonicalStringify(exhaustedBackupObject);
  const exhaustedBackupImport = engine.importState(state.live, exhaustedBackupObject, 21_000);
  assert.equal(exhaustedBackupImport.ok, false);
  assert.equal(exhaustedBackupImport.state, state.live);
  assert.match(exhaustedBackupImport.error, /generation is exhausted/iu);
  assert.equal(canonicalStringify(exhaustedBackupObject), exhaustedBackupBefore, "failed import cannot mutate its backup input");
  assert.equal(canonicalStringify(state.live), state.before, "failed backup-generation overflow cannot mutate current progress");
}

export function assertImportBehavior(context) {
  context = { ...context, state: {} };
  hostileImportIsolation(context);
  baselineImportAndReset(context);
  generationFloors(context);
  exhaustedCurrentGeneration(context);
  exhaustedDraftFloor(context);
  exhaustedBackupGeneration(context);
}
