(function installMathQuestProgressSource(root) {
  "use strict";

  function guardFacts(guardValue, values) {
    const migrationGuardPresent = guardValue === values?.migration;
    const emptyCutoverGuardPresent = guardValue === values?.emptyCutover;
    const retainedCutoverGuardPresent = guardValue === values?.retainedCutover;
    const retainedCompletePresent = guardValue === values?.retainedComplete;
    const activeGuardPresent = migrationGuardPresent || emptyCutoverGuardPresent || retainedCutoverGuardPresent;
    const guardPresent = guardValue !== null;
    return {
      guardValue,
      guardPresent,
      migrationGuardPresent,
      emptyCutoverGuardPresent,
      retainedCutoverGuardPresent,
      retainedCompletePresent,
      guardValid: !guardPresent || activeGuardPresent || retainedCompletePresent,
      activeGuardPresent,
    };
  }

  function sourceRequired({ currentRead, keysDiffer, activeGuardPresent, currentSave, currentSaveVirgin, guard }) {
    if (!currentRead?.ok || !keysDiffer) return false;
    return activeGuardPresent || currentSave === null || Boolean(currentSaveVirgin && !guard.retainedCompletePresent);
  }

  function beta1Selection(sourceNeeded, beta1Read, currentSave) {
    const beta1Save = sourceNeeded ? beta1Read?.value ?? null : null;
    const beta1Selected = Boolean(typeof beta1Save === "string" && beta1Save !== "");
    return { beta1Save, beta1Selected, sourceSave: beta1Selected ? beta1Save : currentSave };
  }

  function prerequisitesSatisfied({ currentRead, guardRead, guard, sourceNeeded, beta1Read, guardedBeta1Missing, retainedCompleteMissing }) {
    if (!currentRead?.ok || !guardRead?.ok || !guard.guardValid) return false;
    if (sourceNeeded && !beta1Read?.ok) return false;
    return !guardedBeta1Missing && !retainedCompleteMissing;
  }

  function emptyCutoverApplies({ prerequisitesOk, guard, beta1Selected, currentSave, currentSaveVirgin }) {
    if (!prerequisitesOk || guard.retainedCompletePresent || beta1Selected) return false;
    return currentSave === null || guard.emptyCutoverGuardPresent || currentSaveVirgin;
  }

  function selectProgressSource({ currentRead, guardRead, beta1Read, currentSaveVirgin = false, keysDiffer, guardValues } = {}) {
    const currentSave = currentRead?.value ?? null;
    const { activeGuardPresent, ...guard } = guardFacts(guardRead?.value ?? null, guardValues);
    const sourceNeeded = sourceRequired({ currentRead, keysDiffer, activeGuardPresent, currentSave, currentSaveVirgin, guard });
    const { beta1Save, beta1Selected, sourceSave } = beta1Selection(sourceNeeded, beta1Read, currentSave);
    const guardedBeta1Missing = (guard.migrationGuardPresent || guard.retainedCutoverGuardPresent) && !beta1Selected;
    const retainedCompleteMissing = guard.retainedCompletePresent && currentSave === null;
    const prerequisitesOk = prerequisitesSatisfied({ currentRead, guardRead, guard, sourceNeeded, beta1Read, guardedBeta1Missing, retainedCompleteMissing });
    const emptyCutoverSelected = emptyCutoverApplies({ prerequisitesOk, guard, beta1Selected, currentSave, currentSaveVirgin });
    return { currentSave, currentSaveVirgin, ...guard, sourceNeeded, beta1Save, beta1Selected, guardedBeta1Missing, retainedCompleteMissing, emptyCutoverSelected, prerequisitesOk, sourceSave };
  }

  root.MathQuestProgressSource = Object.freeze({ selectProgressSource });
})(globalThis);
