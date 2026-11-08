/**
 * Verifies that the scenario presets have different optimal outcomes when
 * scored against the real seeded shipments (CLAUDE.md §3.3 / §6).
 * Run: npx tsx test/scoring.test.ts
 */
import assert from 'node:assert/strict';
import { SCENARIOS } from '../src/scenarios';
import { scoreOptions } from '../src/scoring';
import { buildOrgSeed, SEED_ORGS } from '../src/seed';

const EXPECTED_WINNERS: Record<string, string> = {
  'amz-ransomware-3pl': 'alternate-dc',
  'amz-suez-blockage': 'split-air-cape',
  'amz-typhoon-yantian': 'split-divert',
  'cvs-ransomware-texas': 'air-critical-okc',
  'cvs-reefer-failure': 'backup-reefer',
  'mmk-pos-ransomware': 'phone-cash-carry',
  'mmk-ice-storm': 'detour',
};

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
let failures = 0;

for (const scenario of SCENARIOS) {
  const org = SEED_ORGS.find((o) => o.slug === scenario.orgSlug)!;
  const seed = buildOrgSeed(org);
  const routeIdByKey = Object.fromEntries(seed.routes.map((r) => [r.key, r.id]));
  const shipments = seed.shipments.filter((s) => scenario.planRouteKeys.includes(s.routeKey));
  assert.ok(shipments.length > 0, `${scenario.key} has no shipments to re-plan`);

  const results = scoreOptions(scenario.options, shipments, {
    durationHours: scenario.durationHours,
    backlogFactor: scenario.backlogFactor,
    holdCostPerUnitDay: org.holdCostPerUnitDay,
    routeIdByKey,
  }).sort((a, b) => a.rank - b.rank);

  console.log(`\n${scenario.key}  (${shipments.length} shipments)`);
  for (const r of results) {
    console.log(
      `  #${r.rank} ${r.key.padEnd(18)} score ${String(r.score).padStart(5)}  impact ${usd(r.expectedImpactUsd).padStart(12)}` +
        `  cost ${usd(r.addedCostUsd).padStart(10)}  delay ${String(r.avgDelayHours).padStart(6)}h  risk ${r.risk}`
    );
    for (const action of r.actions) {
      assert.ok(action.type !== 'shift' || action.toRouteId > 0, `${scenario.key}/${r.key} shifts to an unknown route`);
    }
  }

  const expected = EXPECTED_WINNERS[scenario.key];
  if (expected && results[0].key !== expected) {
    failures += 1;
    console.log(`  ✗ expected ${expected} to win, got ${results[0].key}`);
  }
}

const flagship = ['amz-ransomware-3pl', 'amz-suez-blockage', 'amz-typhoon-yantian'].map((key) => {
  const scenario = SCENARIOS.find((s) => s.key === key)!;
  const winner = scenario.options.find((o) => o.key === EXPECTED_WINNERS[key])!;
  return winner.strategy;
});
assert.equal(new Set(flagship).size, 3, 'Flagship scenarios must have distinct optimal strategies');

if (failures > 0) {
  console.error(`\n${failures} scenario(s) picked an unexpected winner`);
  process.exit(1);
}
console.log('\n✓ All scenarios rank as expected; flagship winners are distinct:', flagship.join(', '));
