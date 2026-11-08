/**
 * Profile photos for Communications: each branch (a department at a location) gets a portrait that matches its
 * role, used in the directory, the channel header and beside every message the branch sends. Bundled stock photos
 * (public/images/app/people, see public/images/CREDITS.md); the people are not real employees.
 */
const P = (name: string) => `/images/app/people/${name}.jpg`;

const RULES: { test: RegExp; photo: string | ((city: string) => string) }[] = [
  { test: /owner/i, photo: P('owner-1') },
  { test: /upper management|executive|leadership/i, photo: P('exec-1') },
  { test: /procure/i, photo: (city) => (/mumbai|india|delhi|bangalore/i.test(city) ? P('procurement-mum') : P('procurement-szx')) },
  { test: /purchas/i, photo: P('purchasing-1') },
  { test: /air/i, photo: P('airops-1') },
  { test: /security|cyber|it\b/i, photo: P('secops-1') },
  { test: /cold/i, photo: P('coldchain-1') },
  { test: /pharm/i, photo: P('pharmacy-1') },
  { test: /kitchen|culinary|chef/i, photo: P('chef-1') },
  { test: /distribution|warehouse|fulfil/i, photo: P('distribution-1') },
  { test: /logistic|transport|fleet|driver/i, photo: P('logistics-1') },
  { test: /supply chain|planning|operations/i, photo: P('scm-1') },
];

const FALLBACK = [P('driver-1'), P('purchasing-1'), P('scm-1'), P('logistics-1')];

export function branchPhoto(branch: { department: string; city: string; id: string }): string {
  for (const rule of RULES) {
    if (rule.test.test(branch.department)) return typeof rule.photo === 'function' ? rule.photo(branch.city) : rule.photo;
  }
  let hash = 0;
  for (const c of branch.id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return FALLBACK[hash % FALLBACK.length];
}
