/**
 * Which bundled photo represents a disruption (800×520, public/images/app). Keywords in the title win over the kind,
 * so "Ice storm closes US-75" shows ice rather than a generic storm. Shared by the Agents tab and the Live Feed.
 */
const EVENTS = '/images/app/events';
const HUBS = '/images/app/hubs';

/** Checked in order: the first title match wins. */
const TITLE_RULES: [RegExp, string][] = [
  [/ransomware|malware|encrypt/i, `${EVENTS}/cyber-1.jpg`],
  [/phish|exfiltrat|breach|credential|ddos|hack/i, `${EVENTS}/cyber-2.jpg`],
  [/\b(ice|icy|snow|blizzard|freez|sleet|winter)/i, `${EVENTS}/ice-1.jpg`],
  [/hurricane|cyclone/i, `${EVENTS}/hurricane-1.jpg`],
  [/typhoon|storm|monsoon|flood|tornado|weather/i, `${EVENTS}/storm-1.jpg`],
  [/reefer|cold[- ]?chain|refrigerat|vaccine|temperature/i, `${EVENTS}/reefer-1.jpg`],
  [/breakdown|broke down|mechanical|engine failure/i, `${EVENTS}/breakdown-1.jpg`],
  [/canal|suez|panama|strait|blocked|grounded/i, `${EVENTS}/canal-1.jpg`],
  [/congestion|backlog|queue/i, `${EVENTS}/congestion-1.jpg`],
  [/strike|walkout|labou?r|union/i, `${EVENTS}/strike-1.jpg`],
  [/naval|military|missile|houthi|red sea|piracy|conflict|sanction|security incident/i, `${EVENTS}/naval-1.jpg`],
  [/crash|collision|accident|traffic|highway|interstate|\b(I|US)-\d+/i, `${EVENTS}/traffic-1.jpg`],
];

/** Fallback by kind. Also covers feed categories (agent, news, action, …) so the Live Feed can reuse it. */
const KIND_PHOTOS: Record<string, string> = {
  cyber: `${EVENTS}/cyber-2.jpg`,
  weather: `${EVENTS}/storm-1.jpg`,
  blockage: `${EVENTS}/canal-1.jpg`,
  port_congestion: `${HUBS}/port-1.jpg`,
  accident: `${EVENTS}/traffic-1.jpg`,
  strike: `${EVENTS}/strike-1.jpg`,
  geopolitical: `${EVENTS}/naval-1.jpg`,
  agent: `${EVENTS}/ai-1.jpg`,
  briefing: `${EVENTS}/briefing-1.jpg`,
  action: `${EVENTS}/control-1.jpg`,
  news: `${EVENTS}/news-1.jpg`,
  scenario: `${EVENTS}/briefing-1.jpg`,
};

export function disruptionPhoto(d: { kind: string; title: string }): string {
  for (const [pattern, src] of TITLE_RULES) if (pattern.test(d.title)) return src;
  return KIND_PHOTOS[d.kind] ?? `${EVENTS}/news-1.jpg`;
}
