import type { AssetInventory, ClientProfile } from '@stackfit/schema';

/**
 * What each step has been told, as a boolean per step.
 *
 * Every step in this wizard is genuinely optional, so this is deliberately not
 * a validity check and the nav does not gate on it. It answers a different
 * question: has this step been *answered*.
 *
 * The reason to answer it is that a six-step form with no sense of position is
 * a form people abandon. Seeing three of six filled in, and which three, is
 * what makes the remaining work feel finite, and it is also the only thing on
 * screen that tells an analyst coming back to a half-finished session where
 * they stopped. Six identical buttons cannot.
 *
 * The test for each step is "did something get entered here that the defaults
 * would not have produced", so loading a preset legitimately lights up the
 * steps the preset filled in, and nothing lights up for a blank session.
 */
export function stepsAnswered(
  profile: ClientProfile,
  inventory: AssetInventory,
): readonly boolean[] {
  const counts = Object.values(inventory).filter(
    (entry): entry is { count: number } =>
      typeof entry === 'object' && entry !== null && 'count' in entry,
  );

  return [
    // Organisation: a name is the one field that is never a default.
    profile.orgName.trim() !== '',
    // Estate: any counted asset class at all.
    counts.some((entry) => entry.count > 0),
    // Compliance: a framework ticked. "None applies" is a real answer an
    // analyst cannot currently record, which is a gap in the step rather than
    // in this function.
    profile.compliance.length > 0,
    // Budget: either cap. They bind independently, so either one is an answer.
    profile.budget.annualCap !== null || profile.budget.oneTimeCap !== null,
    // Preferences: anything moved off its default.
    profile.environment !== 'not_asked' ||
      profile.deploymentConstraint !== 'none' ||
      profile.procurementBias !== 'no_preference' ||
      profile.retainedTools.length > 0 ||
      profile.excludedProducts.length > 0,
    // Review produces nothing; it reports. Counting it would put a step in the
    // denominator that can never be filled in.
    false,
  ];
}
