# Arrow

**Centralized, digitized and agentic supply chain intelligence.** Built at HackUTD 2026.

Supply chains power the global economy. The people running them switch between separate systems to track shipments, manage vendors, respond to cyber incidents and judge risk. Arrow puts all of it in one live command center. When something breaks, Arrow detects it, a team of NVIDIA Nemotron agents investigates and compares the options, and a manager approves a response that changes the live network for everyone at once.

> **All data is simulated.** The Amazon and CVS Health workspaces are demo workspaces built on synthetic data. Arrow is not affiliated with or endorsed by Amazon or CVS Health. Maple & Main Kitchen is fictional.

## Who we are

- **Amir Imtiaz**, University of Texas at Dallas
- **Messiah Kallus Ford**, University of Texas at Dallas

We are business students and first-time hackers. We know supply chains as a business: suppliers, freight lanes, distribution centers, risk and cost. At HackUTD we learned how they run as software. We built Arrow by directing AI coding agents, reviewing what they produced and testing every screen ourselves (see [What we learned](#what-we-learned)).

## Why it matters

- **Real disruptions are expensive and slow to untangle.** In 2017 the NotPetya malware cost Maersk an estimated $250M to $300M, and its IT team rebuilt 45,000 PCs and 4,000 servers in about ten days. In 2024 the Change Healthcare ransomware attack cost UnitedHealth $3.09B that year and exposed data on about 190 million people, while pharmacies struggled to fill prescriptions.
- **Cyber and physical are one problem.** A ransomware hit on a warehouse is also a frozen shipping lane. Arrow shows the cyber incident and its physical blast radius on the same globe, and responders run the incident in an isolated command center.
- **One system for every size of business.** The same data model and the same agents run three workspaces:

| Plan | Workspace | Network |
|---|---|---|
| **Bronze · Essentials** | Maple & Main Kitchen (fictional family restaurant, Richardson, TX) | Local produce, seafood, meat, dairy and bakery deliveries |
| **Silver · National** | CVS Health (simulated) | Imported generics, a Puerto Rico ocean lane, regional DCs, cold-chain vaccine lanes, retail pharmacies |
| **Gold · Enterprise** | Amazon (simulated) | Global multimodal network across Asia, North America, Europe and South America: sea lanes on real waypoints, Amazon Air hubs, fulfillment centers, delivery stations |

A mom-and-pop shop gets the same early warning and agent support as a global retailer.

## Features

| Feature | What it does |
|---|---|
| **Silk Road** (`/app`) | A live 3D globe (or 2D map) of every lane. Ships, planes, trains and trucks move in real time, every lane ends in an arrow at its destination, and an activity heatmap shades countries blue and raises pillars on busy hubs. Hover a hub for a simulated live camera view with its live lane counts. Disruptions pulse red with a clickable "!" marker. |
| **Autonomous agent response** | A disruption wakes five Nemotron agents on their own: Disruption Analyst, Recovery Planner, Risk Auditor, Cyber Triage and Recovery Monitor. They plan, call tools, score options and propose one response. A manager approves, a SpacetimeDB reducer reroutes the network, and every open window redraws. |
| **Talk to the agents** (`/app/agents`) | Chat with any one to five of the agents. Each answers from its own role using live data. Every disruption shows a photo and a map pin sized by severity. |
| **Ask Arrow dashboards** | Ask in plain language, for example "dashboard of value at risk by lane for sea freight". Nemotron picks the charts, code computes every number from live data, and Arrow draws real charts. Each chart downloads as a PNG, and the data downloads as CSV for Excel, Google Sheets, Tableau and Power BI. |
| **Live Feed** (`/app/feed`) | Plain-language updates: what changed, why it matters, what to do. Each entry offers three response options with steps, a time estimate and an importance level, and each one runs a real action. |
| **Communications** (`/app/communications`) | Branch-to-branch messages and reports with a role photo for every division. The Shenzhen office writes in Chinese, and one click translates it to English. |
| **Cyber Control Tower** (`/app/control-tower`) | An isolated, invite-only incident command center: NIST SP 800-61 incident record, scope register of affected data, timeline, tasks, live chat and a hash-chained audit log anyone can verify. |
| **Analytics** (`/app/analytics`) | Tiger Data time-series history and SQL anomaly detection that can open a disruption by itself. |
| **Grok News Scout** | A bot that reads this week's real headlines about your ports and hubs, flags threats with Grok, and lets a person escalate a signal into a disruption for the agents. |
| **Conquest GIS** (`/app/conquest`) | Market expansion for business owners: candidate sites on a city map with foot traffic, nearby competitors, contract rates, 5-year cost projections, landlord ratings from past tenants, a message thread with the landlord, a deal-strength score computed in code and a Nemotron deal memo. |

## Built for the judging criteria

| Criterion | How Arrow answers it |
|---|---|
| **Innovation and creativity** | Connects a cyber incident to its physical supply-chain blast radius in one system. Agents act on events with nobody prompting them, then a human approves. |
| **Technical complexity** | Two SpacetimeDB modules hold all state and logic with live sync. A five-agent Nemotron tool-calling workflow with a built-in critic. Tiger hypertables, a continuous aggregate and z-score anomaly SQL. Server-side role checks, private tables with per-user views and a SHA-256 audit chain. |
| **Completeness** | Every visible button runs a real action. Loading, empty and error states on every page. Failed agent runs show as failures and never fake an answer. |
| **Design** | A dark command-center UI built around the globe. Status always uses color, icon and text. Photos, live camera cards and charts make the data easy to read at a glance. |
| **Impact** | Grounded in NotPetya and Change Healthcare. One workflow scales from a family restaurant to a global retailer. |
| **Presentation** | One incident story: ransomware hits a warehouse, agents respond, a manager approves, responders contain the breach in the Control Tower. |

## Tracks

| Track | Where to look |
|---|---|
| **Spacetime: Main Track** | All state and business logic in SpacetimeDB (`spacetime/ops`, `spacetime/ir`) |
| **NVIDIA: Use Nemotron Beyond a Chatbot** | Event-driven five-agent workflow (`worker/src/agent/`) |
| **Winstead PC: Cyber Incident Response Dashboard** | Cyber Control Tower (`spacetime/ir`, `client/src/components/control-tower/`) |
| **HackUTD: Beginner** | Two first-time hackers ([What we learned](#what-we-learned)) |
| **MLH: Best Use of Tiger Data** | Time-series history and anomaly detection (`worker/src/tiger/`, `scripts/tiger/schema.sql`) |
| **MLH: SpaceXSI (Cursor + Grok Bot)** | Grok News Scout (`client/src/lib/grok-scout.ts`) |

## Technology

| Technology | Its job in Arrow |
|---|---|
| **SpacetimeDB** (Maincloud) | The backend: every table, rule, score, approval, role check and live update |
| **NVIDIA Nemotron** (`nemotron-3.5-super-vl-120b-a12b` via build.nvidia.com) | All reasoning: the five event-driven agents, agent chat, Ask Arrow and dashboards, the Conquest deal memo |
| **Tiger Data** (TimescaleDB) | History and analytics: hypertables, a continuous aggregate, anomaly SQL |
| **Grok** (free via Puter.js) | Reads real news headlines and flags lane threats |
| **Next.js 16, React 19, Tailwind v4** | The website and command center |
| **react-globe.gl, three.js, d3-geo, Recharts** | Globe, map, vehicle icons, heatmap and charts |
| **Node.js worker** | A thin process that runs the agents and the Tiger bridge and owns no state |

```
 Browser (Next.js, React, react-globe.gl, Recharts)
   │  SpacetimeDB SDK: live subscriptions + reducer calls
   ├──► SpacetimeDB arrow-ops   supply-chain state, 2 s simulation tick, scoring, approvals, agent runs, feed
   ├──► SpacetimeDB arrow-ir    isolated incident response (separate database, separate identities)
   │  HTTP /api/analytics (Tiger queries)
   └──► worker (Node + TS, owns no state)
          ├─ Nemotron agents ──► build.nvidia.com (OpenAI-compatible tool calling)
          ├─ changes state only through arrow-ops reducers; has no IR access
          └─ Tiger bridge: telemetry → hypertables; z-score anomaly SQL → report_disruption
```

## Demo path

1. **Silk Road** (Amazon, Gold). Lanes are live and vehicles are moving across four continents.
2. **Crisis Scenarios → Ransomware · 3PL.** Dallas lanes turn red and the "!" pulses.
3. **The agents start on their own.** The trace streams the plan, tool calls, scored options, proposal and the Risk Auditor's verdict.
4. **Approve.** The globe redraws the reroute in every open window, and the Recovery Monitor posts the measured result.
5. **Control Tower.** Turn the agent's draft into an incident, invite a responder with a one-time code in a second window, chat, advance the phase and verify the audit chain.
6. **Ask Arrow:** "Build me a dashboard of value at risk by lane, mode and status." Real charts appear with PNG and CSV downloads.
7. **Suez blockage.** The agents pick a different plan: urgent cargo flies and the rest sails around the Cape.
8. **Switch to Bronze**, then open **Conquest GIS** to show the same platform helping a family restaurant pick its next location.

## Sponsor details

<details>
<summary><b>Spacetime: what runs on SpacetimeDB</b></summary>

All application state and business logic lives in two SpacetimeDB TypeScript modules. The worker is a thin client that only calls reducers.

**`arrow-ops`** (`spacetime/ops/src/`)
- **Tables:** `org`, `scenario_preset`, `user_profile`, `ops_state`, `agent_service`, `tick_timer` (scheduled), `node`, `route`, `shipment`, `vendor`, `disruption`, `route_option`, `agent_run`, `agent_step`, `action_proposal`, `feed_item`, `risk_sample`, `telemetry`, `security_event`, `news_signal`, `news_scan`.
- **Simulation:** `tick` is a scheduled reducer every 2 s that moves shipments, accrues delays, samples risk, emits telemetry and security events and prunes rolling tables. `init` seeds all three workspaces and `reset_org` reseeds one.
- **Scenarios and detection:** `trigger_scenario`, `trigger_random_scenario`, `simulate_congestion`, `report_disruption` (worker-only, from Tiger anomalies), `resolve_disruption`.
- **Decisions:** `evaluate_alternatives` computes each option's added cost, delay, SLA-breach value, residual risk and score deterministically (`scoring.ts`, unit-tested). `approve_action` executes a plan atomically by rerouting lanes, holding shipments and activating standby lanes. `reject_action` declines it. `acknowledge_ir_draft` records the human-gated hand-off to incident response.
- **Agent bookkeeping:** `start_agent_run`, `claim_agent_run`, `log_agent_step`, `propose_action`, `finish_agent_run`, `agent_heartbeat` (agent identity only), and `ask_arrow` (any employee).
- **News pipeline:** `request_news_scan`, `schedule_news_scan`, `claim_news_scan`, `record_news_signal`, `finish_news_scan`, `escalate_news_signal`, `dismiss_news_signal`.
- **People and feed:** `join_workspace`, `switch_org`, `post_feed_item`, `escalate_feed_item`, `set_sim_paused`, `set_agent_identity`.

**`arrow-ir`** (`spacetime/ir/src/`): see the Control Tower section.

Clients use live subscriptions (`client/src/lib/spacetime/live-client.tsx`), so every approval, scenario, chat message and status change appears instantly in every open window.

</details>

<details>
<summary><b>NVIDIA: Nemotron beyond a chatbot</b></summary>

Agent code: `worker/src/agent/`.
- **Event-driven:** a new `disruption` row from a scenario, the random generator, a Tiger anomaly or an escalated news signal starts a run with no prompt.
- **Five agents in one run, every handoff visible:**
  1. **Disruption Analyst** records a plan (`submit_plan`, with re-planning), investigates with `get_disruption`, `list_affected_shipments`, `query_route_history` (Tiger) and `check_vendor_risk`, then hands off.
  2. **Recovery Planner** calls `evaluate_route_alternatives` (a SpacetimeDB reducer), proposes one option with a cited rationale (`propose_action`) and posts a briefing.
  3. **Risk Auditor** reviews the proposal independently (`get_current_proposal`, `review_proposal`). A challenge sends it back to the Planner for one revise-or-justify round.
  4. **Cyber Triage** drafts a NIST/CISA incident for the Control Tower (`draft_ir_incident`) and never touches IR itself.
  5. **Recovery Monitor** runs after approval, measures on-time %, value at risk and risk index before and after (`measure_recovery`) and posts a verified outcome.
- **Agent chat:** the Current AI Agents tab routes a question to any one to five agents. Each answers in turn from its role over the same read-only tools (`handleAgentChat` in `runner.ts`).
- **Dashboards:** the `build_dashboard` tool lets Nemotron choose metrics, groupings, chart types and filters from a fixed menu. The tool computes every value from live SpacetimeDB rows and the UI renders the charts.
- **Deal memo:** in Conquest GIS the Deal Evaluator reads one listing's facts plus a score computed in code and writes a verdict, risks and a negotiation ask.
- **Rules:** code calculates and the model chooses and explains, so every number traces to a tool output. State-changing actions always wait for an operations manager. Tool arguments are schema-validated with one retry, turn limits bound every run, and failures show as failed runs.
- **Model:** `nvidia/nemotron-3.5-super-vl-120b-a12b` with thinking enabled, so the reasoning streams into the trace. `npm --prefix worker run bench:models` compares Nemotron models on Arrow's real workload.

</details>

<details>
<summary><b>Winstead PC: Cyber Control Tower</b></summary>

Code: `spacetime/ir/src/`, `client/src/components/control-tower/`, `client/src/lib/ir/`.

**Isolation.** `arrow-ir` is a separate SpacetimeDB database with its own identities. The agent worker has no IR configuration. The UI loads nothing from outside services (self-hosted fonts, no CDN), and it runs on an isolated laptop or LAN with `spacetime start`. The ops agent can only produce a draft, which a signed-in member reviews before an incident exists.

**Identity and access.** No corporate SSO, email or Slack. The first admin uses an 80-bit one-time bootstrap code stored only as a hash. Invites are random one-time codes made in the browser with Web Crypto; only the SHA-256 hash, role and expiry reach the server. Five wrong codes lock an identity for ten minutes, and a global rate limit pauses redemption under a flood. Lockdown freezes membership changes, and revocation cuts off a member's live data at once.

**Who can see what.**

| Area | Who | Enforced by |
|---|---|---|
| Silk Road, feed, analytics, reports | Any employee | Open by design |
| Approving a reroute, vendor switch or expedite | Operations managers | Role check in `approve_action` / `reject_action` |
| Cyber Control Tower | Invited incident-response members | Separate `arrow-ir` database, role check in every IR reducer, private tables |

Opening the Control Tower without membership shows an access screen and loads no incident data. The server does the enforcing: all 10 IR tables are private, clients read through per-user views (`ir_incidents`, `ir_scope`, `ir_timeline`, `ir_tasks`, `ir_messages`, `ir_members`, `ir_audit`, `ir_status`, `ir_invites`) that return rows only to active members, and all 24 IR reducers deny by default.

| Action | Admin | Commander | Responder | Legal & comms | Exec viewer |
|---|---|---|---|---|---|
| Invite responder, legal or viewer | ✓ | ✓ | | | |
| Invite admin or commander; revoke; change role; lockdown | ✓ | | | | |
| Create incident; edit record and IOCs; escalate SEV | ✓ | ✓ | ✓ | | |
| Lower SEV; change phase or status; assign commander | ✓ | ✓ | | | |
| Record materiality | ✓ | ✓ | | ✓ | |
| Add or update affected data | ✓ | ✓ | ✓ | | |
| Timeline notes, handoffs, chat | ✓ | ✓ | ✓ | ✓ | |
| Read everything | ✓ | ✓ | ✓ | ✓ | ✓ |

**Tamper-evident audit log.** Every reducer appends `hash = SHA-256(JSON.stringify([prevHash, seq, tsMicros, actorHex, actorName, action, target, payload]))`. **Verify audit chain** recomputes it in the browser and names the first broken entry.

**Incident documentation.** NIST SP 800-61 phases with checklists, SEV1 to SEV4, detection to close timestamps, category, attack vector, functional and information impact, recoverability, IOCs, an append-only timeline, and a scope register with data class, confidence, status (for example `encrypted_ransomware` or `exfiltrated`) and a notification flag.

**Ease of use.** Severity, phase, commander, time since detection, affected-data counts and one Next step card are visible at a glance. Quick actions, templates for ransomware, exfiltration and BEC, keyboard shortcuts (`N` note, `/` command palette), and confirmations on destructive actions. Extras: the cyber-to-physical blast radius on Silk Road, informational regulatory clocks (GDPR 72 h, SEC 8-K Item 1.05), shift handoffs and an offline post-incident report.

**Threat model.** Arrow assumes the attacker controls the corporate network, identity provider, email and Slack; the Control Tower depends on none of them. It does not protect against a compromised responder device, a compromised IR host or a stolen database-owner token. `npm run ir:smoke` runs a 67-check security test. This is a hackathon prototype and makes no security claims beyond this list.

</details>

<details>
<summary><b>Tiger Data</b></summary>

Code: `worker/src/tiger/`, `scripts/tiger/schema.sql`.
- **Hypertables:** `route_metrics`, `shipment_events`, `security_events`, plus the real-time continuous aggregate `route_risk_5m`.
- **Live mirror:** SpacetimeDB telemetry streams into Tiger, with 7 days of backfilled history.
- **Anomaly detection in SQL:** the latest minute of risk is compared with a 24 h z-score baseline. A hit calls `report_disruption`, which wakes the agents. **Simulate congestion** shows Tiger catching a build-up nobody declared.
- **Real queries:** the Analytics charts and the agents' `query_route_history` tool both read Tiger.
- **BI tools:** Tiger is PostgreSQL, so Tableau and Power BI can connect to it directly with their built-in PostgreSQL connectors.

</details>

<details>
<summary><b>SpaceXSI: Grok bot automation</b></summary>

Code: `client/src/lib/grok-scout.ts`, `client/src/app/api/news/route.ts`, `client/src/components/silk-road/NewsSignals.tsx`, and the `news_signal` / `news_scan` tables.
- The Grok News Scout fetches the last 7 days of real headlines (Google News RSS) about the workspace's ports, hubs and canals, asks **Grok 4.7** (via Puter.js) which ones threaten which lanes, and writes the findings to SpacetimeDB as "N" markers on the globe.
- It runs on click and then every 30 minutes while Silk Road is open.
- Every signal must cite a real article, and the server rejects uncited ones. A person decides whether to escalate a signal into a disruption, which hands it to the Nemotron agents.

</details>

## Run it

**Website against the team's live Maincloud databases** (no install of SpacetimeDB, no keys):

```bash
npm --prefix client install
cp client/.env.example client/.env.local
npm run dev:client          # http://localhost:3100
```

**Agents:** one shared worker runs on the demo laptop (`npm run dev:worker`, with `NVIDIA_API_KEY` and `TIGER_DATABASE_URL` in `worker/.env`). Run only one copy at a time.

**Full local stack** (Node 20+, SpacetimeDB CLI 2.14+):

```bash
npm run install:all
spacetime start
npm run setup               # publishes arrow-ops + arrow-ir, generates bindings, authorises the agent
npm run ir:bootstrap        # one-time code for the first Control Tower admin
npm run dev:worker
npm run dev:client
```

- **Deploy:** SpacetimeDB on Maincloud (`node scripts/setup.mjs --cloud <name>`); the website on Vercel with root directory `client` and the `NEXT_PUBLIC_*` and `TIGER_DATABASE_URL` values from `client/.env.local`; the worker on any always-on host (`worker/Dockerfile`).
- **Tests:** `npm test` (scoring and agent end-to-end), `npm run ir:smoke` (Control Tower security).
- **Two users on one machine:** use a normal window and an incognito window.

## What we learned

We are business students with nontechnical backgrounds. We understood supply chains as a business problem: lead times, carrier costs, inventory risk. This weekend we learned what the software behind them looks like and how to build it.

**We learned to build with agentic AI tools.** We used **Claude** as our engineering partner for the backend. We described what the system needed to do in business terms, and Claude designed and wrote the SpacetimeDB tables and reducers, the scoring logic, the agent workflow and the Tiger pipeline. Our job was to make the product decisions, read what it produced, ask why, and test every screen in the browser until it worked. We used **Cursor** to make the interface look better: layout, spacing, colors and visual polish.

**We learned how the sector works on the technology side.**
- **A database can be the whole backend.** In SpacetimeDB the tables and reducers are the server, and live subscriptions are why an approval in one window appears in every other window instantly.
- **AI agents need rules to be trusted.** Our agents choose and explain, code calculates every number, and a manager approves anything that changes the network. That is how a business can put agents in front of real decisions.
- **Time-series data catches problems early.** Tiger's hypertables and a simple z-score query can spot a lane going wrong before anyone reports it.
- **Incident response is its own discipline.** We learned the NIST SP 800-61 lifecycle, why a response room has to stay isolated from a compromised company network, and how a hash chain makes an audit log tamper-evident.
- **Shipping software is a process.** Keys stay out of a public repo, deploys can break things that worked locally, and every button on screen has to do something real.

**What we would build next:** live carrier and port data feeds, real connectors that publish Arrow dashboards into Google Sheets, Tableau and Power BI, and an open trade exchange where businesses can barter spare capacity.

## AI tools used

- **Claude (Claude Code):** backend and system design, SpacetimeDB modules, agent workflow, Tiger pipeline, debugging and documentation.
- **Cursor:** interface work and visual polish.
- **In the product:** NVIDIA Nemotron runs every agent, and Grok (via Puter.js) powers the News Scout.

## Credits

- Photos: Unsplash, Pexels and Wikimedia Commons, all bundled locally and credited in `client/public/images/CREDITS.md`.
- Country shapes: [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth).
- Case-study figures: Supply Chain Dive and SecurityWeek (Maersk), Becker's Hospital Review and HHS (Change Healthcare), linked on the landing page.
