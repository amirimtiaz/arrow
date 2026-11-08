# Arrow

**Centralized, digitized and agentic supply chain intelligence.** Built at HackUTD 2026: Zero Day.

Supply chains power the global economy, yet critical decisions depend on separate systems for tracking shipments, managing vendors, responding to cyber incidents and evaluating risk. Arrow is an agentic supply-chain command center. It connects live operational data, disruption intelligence and cyber incident response in one interface. It detects problems, has AI agents investigate them and compare the options, and lets humans approve a response that actually changes the system's state.

> **All data is simulated.** The Amazon and CVS Health workspaces are demo workspaces built on synthetic data. Arrow is not affiliated with or endorsed by Amazon or CVS Health. Maple & Main Kitchen is fictional.

## What it does

| Area | What you see |
|---|---|
| **Silk Road** (`/app`) | A live 3D globe (or 2D map) of every lane: sea routes on real waypoints (Suez, Malacca, Panama, the Cape), air arcs, truck and rail. Shipments move in real time. Disruptions pulse red with a clickable "!" marker. |
| **Agentic response** | When a disruption appears, NVIDIA Nemotron agents start on their own: plan → tool calls → scored options → a proposal a manager approves. Approval runs a SpacetimeDB reducer and every viewer's globe redraws the reroute. |
| **Ask Arrow** | Ask a question in plain language. It becomes an agent run with tool calls over live data, not a chat box with canned answers. |
| **Grok News Scout** | A bot that reads this week's real headlines (Google News) about your ports, hubs and canals and uses Grok 4.7 (free via Puter.js) to flag storms, strikes, closures and cyberattacks that threaten your lanes. Findings appear as "N" markers. One click escalates a signal into a disruption, which wakes the Nemotron agents. |
| **Cyber Control Tower** (`/app/control-tower`) | An isolated, invite-only incident command center: NIST SP 800-61 incident record, scope register, timeline, tasks, real-time chat and a hash-chained audit log. |
| **Analytics** (`/app/analytics`) | Tiger Data time-series history: risk over time, security events per minute, riskiest lanes, and SQL z-score anomaly detection that can open disruptions on its own. |
| **Live feed** (`/app/feed`) | "No digging" updates: what changed, why it matters, what is recommended. Anyone can escalate an item to executives or export the feed as CSV. |

### Three plans, three scales

| Plan | Demo workspace | Network |
|---|---|---|
| **Gold · Enterprise** | Amazon (simulated) | Global multimodal: Asian suppliers, transpacific and Asia–Europe sea lanes, Amazon Air hubs, fulfillment centers, a 3PL partner, delivery stations |
| **Silver · National** | CVS Health (simulated) | National pharmacy network: imported generics, Puerto Rico ocean lane, regional DCs, cold-chain vaccine lanes, retail pharmacies |
| **Bronze · Essentials** | Maple & Main Kitchen (fictional) | A family restaurant in Richardson, TX: produce, seafood, meat, dairy, bakery and coffee deliveries |

Switch workspaces from the top bar. Each workspace has its own crisis scenarios plus a random disruption generator.

## Architecture

```
 Browser (Next.js 16, React 19, Tailwind v4, react-globe.gl, d3-geo, Recharts)
   │  SpacetimeDB TypeScript SDK: live subscriptions + reducer calls
   ├──► SpacetimeDB  arrow-ops   supply-chain state, 2 s simulation tick, scoring, approvals, agent runs/steps, feed
   ├──► SpacetimeDB  arrow-ir    ISOLATED incident response (separate database, separate identity)
   │  HTTP /api/worker/* (analytics only)
   └──► worker (Node + TS, thin; owns no state)
          ├─ Nemotron agents ──► build.nvidia.com (OpenAI-compatible API, tool calling)
          ├─ connects to arrow-ops as the authorised "agent" identity; changes state only via reducers; no IR access
          ├─ Tiger bridge: mirrors telemetry → hypertables; z-score anomaly SQL → report_disruption
          └─ analytics API over the route_risk_5m continuous aggregate
```

## Run it locally

**Quickest: the website against the team's live Maincloud databases** (no SpacetimeDB install, no keys):

```bash
npm --prefix client install
cp client/.env.example client/.env.local   # already points at Maincloud; add TIGER_DATABASE_URL for the Analytics charts
npm run dev:client                          # http://localhost:3100
```

The agents run in one shared worker (on the demo laptop), so only one teammate starts `npm run dev:worker`. There is no Arrow login: each browser gets its own SpacetimeDB identity automatically and picks a name and role on first visit.

**Full local stack. Prerequisites:** Node 20+ and the [SpacetimeDB CLI](https://spacetimedb.com/install) (2.14+).

```bash
npm run install:all          # installs client, worker and both modules
spacetime start              # local SpacetimeDB on :3000 (keep it running)
npm run setup                # publishes arrow-ops + arrow-ir, generates bindings, authorises the agent worker
npm run ir:bootstrap         # prints the one-time code that creates the first Control Tower admin
cp worker/.env.example worker/.env   # then add NVIDIA_API_KEY (and TIGER_DATABASE_URL)
npm run dev:worker           # Nemotron agents + Tiger bridge (no inbound port)
npm run dev:client           # http://localhost:3100
```

- **Tiger Data:** in Tiger Console, open your service and click **Connect**. Copy either the full connection string into `TIGER_DATABASE_URL`, or the host, port and password into `TIGER_HOST` / `TIGER_PORT` / `TIGER_PASSWORD`. Put it in `worker/.env` (bridge + anomaly detection) and `client/.env.local` (the website's `/api/analytics` routes). Then run `npm --prefix worker run tiger:setup`, which applies `scripts/tiger/schema.sql` and backfills 7 days of history. Project "client credentials" (the public/secret key pair) are for Tiger's API and CLI; Arrow doesn't need them.
- **Grok News Scout:** no key needed. Grok runs through Puter.js in the browser (Puter's "user-pays" model). Click **Scan** once to sign in to Puter; after that it auto-scans every 30 minutes while Silk Road is open.
- **Choosing a Nemotron model:** `npm --prefix worker run bench:models` runs Arrow's real first agent turn against several Nemotron models and reports latency and valid tool-call rate.
- **Deploy (no local pieces):**
  - **SpacetimeDB on Maincloud:** see the next bullet.
  - **Website on Vercel:** root directory `client`; copy the `NEXT_PUBLIC_*` values and `TIGER_DATABASE_URL` from `client/.env.local`.
  - **Worker on any always-on container host:** `worker/Dockerfile`, with `AGENT_TOKEN` set from `worker/.agent-token-maincloud.spacetimedb.com`.
- **SpacetimeDB Maincloud:** run `spacetime login`, then `node scripts/setup.mjs --cloud <unique-name>`. That publishes `<name>-ops` and `<name>-ir`, rewrites `worker/.env` and `client/.env.local`, and authorises the agent. Add `--ir-local` to keep the Control Tower on a self-hosted server. `node scripts/setup.mjs --use-local` switches back.
- **Fresh demo:** `npm run setup:reset` wipes and republishes `arrow-ops`. Managers can also click **Reset** in Crisis Scenarios.
- **Two users on one machine:** use a normal window and an incognito window. Each browser gets its own SpacetimeDB identity.
- **Tests:**
  - `npm test` runs the scoring tests and the agent end-to-end test. Stop the worker first; the e2e test acts as the agent.
  - `npm run ir:smoke` runs the 67-check Control Tower security test against a throwaway `arrow-ir-smoke` database.
- **First Control Tower admin:** run `npm run ir:bootstrap`, open `/app/control-tower`, choose **First-time setup**, then enter the code and your name. The code works once.

## Demo path

1. **Open Silk Road** (Amazon, Gold). Lanes are live, shipments are moving and the "Simulated" badge is visible.
2. **Crisis Scenarios → Ransomware · 3PL.** The Dallas lanes turn red, the "!" pulses and the feed updates.
3. **The agents start on their own.** The trace streams: plan → tool calls with arguments and latency → handoff → scored options → proposal → the Risk Auditor's independent verdict.
4. **Approve** (operations manager). The globe redraws the reroute in cyan **in every open window**, and the Recovery Monitor posts the verified before/after.
5. **Control Tower.** Turn the agent's incident draft into an incident, invite a responder with a one-time code (second window), chat, advance the phase and click **Verify audit chain**.
6. **Analytics.** Tiger shows the risk spike and security events.
7. **Suez blockage.** The agents pick a different plan: high-priority cargo flies, the rest sails around the Cape.
8. **Live news (Grok).** Click **Scan**, then escalate a real-world signal. It becomes a disruption, and the same agents take over.

## Who can see what

Arrow is open by default. Any employee at any level can view Silk Road, the live feed and analytics, and share briefings and reports. Two things are gated:

| Area | Who | Enforced by |
|---|---|---|
| Silk Road, feed, analytics, reports | Any employee | No gate |
| Approving a reroute, vendor switch or expedite | Managers | Role check in `approve_action` / `reject_action` |
| Cyber Control Tower | Invited incident-response members only | Separate `arrow-ir` database; every IR reducer checks the caller's role |

Ops roles (analyst, operations manager, executive) are self-selected when joining the demo workspace; the ops side is designed for broad visibility. The Control Tower is different: membership is invite-only and enforced server-side.

### Control Tower access screen

Opening the Control Tower without incident-response membership shows an access screen instead of incident data. No incident data loads until the user is an active member.

The access screen:
- says plainly that this area is for the incident response team only and is isolated from corporate accounts and networks
- asks for the one-time access code an admin shared in person or by phone
- calls `redeem_invite(code)`; on success, the Control Tower opens with the role on that invite
- shows a clear message for a wrong or expired code, a revoked member, or lockdown (no new members allowed)
- on a fresh install, accepts the one-time bootstrap code that creates the first admin

**In the demo:** window 1 is the incident commander, who clicks "Invite responder" and reads the code aloud. Window 2 opens the Control Tower, lands on the access screen, enters the code and joins the incident chat live.

**The screen is the front door, not the lock.** The server enforces access: IR reducers reject anyone who is not an active member, and IR data is readable only by members. Skipping the screen or calling the database directly does not get around this.

## Sponsor tracks

### Spacetime: what runs on SpacetimeDB

All application state and business logic lives in two SpacetimeDB TypeScript modules. The worker is a thin client that only calls reducers.

**`arrow-ops`** (`spacetime/ops/src/`)
- **Tables:** `org`, `scenario_preset`, `user_profile`, `ops_state`, `agent_service`, `tick_timer` (scheduled), `node`, `route`, `shipment`, `vendor`, `disruption`, `route_option`, `agent_run`, `agent_step`, `action_proposal`, `feed_item`, `risk_sample`, `telemetry`, `security_event`, `news_signal`, `news_scan`.
- **News pipeline:** `request_news_scan` (any employee), `schedule_news_scan`, `claim_news_scan`, `record_news_signal`, `finish_news_scan` (bot-only), and `escalate_news_signal` / `dismiss_news_signal` (human decision). `resume_agent_run` lets the Recovery Monitor continue a run after approval.
- **Deployment:** runs on a local `spacetime start` or on **SpacetimeDB Maincloud** (`node scripts/setup.mjs --cloud <name>`). The Control Tower can stay self-hosted with `--ir-local`.
- **Simulation and seeding:**
  - `tick`, a scheduled reducer every 2 s, moves shipments, accrues delays, samples org risk, emits telemetry and security events, and prunes rolling tables.
  - `init` seeds all three workspaces.
  - `reset_org` reseeds one.
- **Scenarios and detection:** `trigger_scenario`, `trigger_random_scenario`, `simulate_congestion`, `report_disruption` (worker-only, from Tiger anomalies), `resolve_disruption`.
- **Decisions:**
  - `evaluate_alternatives` computes every option's added cost, delay, SLA-breach value, residual risk, expected impact and score deterministically (`scoring.ts`).
  - `approve_action` executes the plan atomically: it shifts or reroutes routes, holds shipments, and activates standby lanes. `reject_action` declines a proposal.
  - `acknowledge_ir_draft` records the human-gated ops → IR hand-off.
- **Agent bookkeeping:** `start_agent_run`, `claim_agent_run`, `log_agent_step`, `propose_action`, `finish_agent_run`, `agent_heartbeat` (all agent-identity-only); `ask_arrow` (any employee).
- **People and feed:** `join_workspace`, `switch_org`, `post_feed_item`, `escalate_feed_item`, `set_sim_paused`, `set_agent_identity` (owner-only).

**`arrow-ir`** (`spacetime/ir/src/`): see the Cyber Control Tower section below.

Clients use live subscriptions (`client/src/lib/spacetime/live-client.tsx`). Every approval, scenario, chat message and status change shows up instantly in every open window.

### NVIDIA: Nemotron beyond a chatbot

The agent code is in `worker/src/agent/`.
- **Event-driven:** a new `disruption` row (from a scenario, the random generator or a Tiger anomaly) starts a run automatically. Nobody prompts it.
- **Multi-agent workflow (five agents, one run, every handoff visible):**
  1. The **Disruption Analyst** records an explicit plan (`submit_plan`, with re-planning), investigates with `get_disruption`, `list_affected_shipments`, `query_route_history` (Tiger) and `check_vendor_risk`, then hands off.
  2. The **Recovery Planner** calls `evaluate_route_alternatives` (a SpacetimeDB reducer), proposes one option with a cited rationale (`propose_action`) and posts a briefing.
  3. The **Risk Auditor** reviews the proposal independently before any human sees it (`get_current_proposal`, `review_proposal`). If it challenges the plan, the Planner either revises (the new proposal replaces the old one) or keeps it with a justification. The manager sees the verdict next to Approve.
  4. For cyber incidents, **Cyber Triage** drafts a NIST/CISA incident for the Control Tower (`draft_ir_incident`) without touching IR.
  5. After a manager approves, the **Recovery Monitor** measures the result (`measure_recovery`: on-time %, value at risk and risk index before vs after) and posts a verified outcome. This closes the plan → act → verify loop.
- **External tools:** live Tiger Data history; Grok news signals feed the same event stream (see SpaceXSI below).
- **Humans decide:** state-changing actions always wait for an operations manager. Low-risk briefings run automatically.
- **Code calculates, the LLM chooses:** every number comes from a tool output. The scoring is unit-tested (`spacetime/ops/test/scoring.test.ts`), and the three flagship scenarios have three different optimal strategies.
- **Visible trace:** every plan, tool call (arguments, result, latency), handoff and error streams to the UI.
- **Robustness:**
  - tool arguments are validated against schemas, with one retry on malformed calls
  - per-agent turn limits keep every run bounded
  - failures, including a missing API key, are shown as failed runs; nothing is faked
- **Model:** `nvidia/nemotron-3-super-120b-a12b` via build.nvidia.com (`NEMOTRON_MODEL` to change). It's a mixture-of-experts model built for agentic tool calling, with about 12B active parameters per token, so it's fast enough for a live demo. `npm --prefix worker run bench:models` compares it with Ultra, Nano and Lightning on Arrow's real workload.

### Tiger Data

The Tiger code is in `worker/src/tiger/` and `scripts/tiger/schema.sql`.
- **Hypertables:** `route_metrics`, `shipment_events` and `security_events`, plus the `route_risk_5m` continuous aggregate (real-time).
- **Live mirror:** SpacetimeDB telemetry streams into Tiger, and 7 days of history are backfilled.
- **Anomaly detection in SQL:** the latest minute of risk is compared with a 24 h z-score baseline. A hit calls `report_disruption`, which wakes the agents. Use **Simulate congestion** to see Tiger catch a build-up that was never declared.
- **Real queries everywhere:** the Analytics charts and the agent's `query_route_history` tool both read Tiger.

### SpaceXSI: Grok bot automation

The code is in `client/src/lib/grok-scout.ts`, `client/src/app/api/news/route.ts`, `client/src/components/silk-road/NewsSignals.tsx`, and the `news_signal` / `news_scan` tables in `spacetime/ops`.
- **What it does:** the Grok News Scout is an automated bot.
  - **Inputs:** it fetches real headlines from the last 7 days (Google News RSS, free) about the workspace's ports, hubs and canals.
  - **Analysis:** it asks **Grok 4.7** (`x-ai/grok-4.7` via Puter.js, free for us: the signed-in Puter user covers usage) which headlines threaten which lanes.
  - **Output:** it writes the findings to SpacetimeDB as news signals.
  - **When it runs:** on click, then automatically every 30 minutes while Silk Road is open.
- **Why it matters:** scenarios and Tiger anomalies are internal signals; Grok adds real-world sensing. A person reviews each signal and can escalate it into a disruption, which hands it to the Nemotron agents. The bot never changes the network itself.
- **Honesty:** every signal must cite a real article, and the server rejects uncited signals. The UI labels news as real and network data as simulated.
- **Cursor:** the track also asks for Cursor as the core coding agent. Describe your actual tool use in the AI tools section below.

### Cyber Control Tower (Winstead PC)

The code is in `spacetime/ir/src/`, `client/src/components/control-tower/` and `client/src/lib/ir/`.

**Isolation**
- `arrow-ir` is a separate SpacetimeDB database with its own identities. The agent worker has no IR configuration at all.
- The Control Tower UI loads nothing from external services: fonts are self-hosted, and there is no CDN or third-party API.
- It runs on an isolated laptop or LAN with `spacetime start`.
- AI is not used inside the Control Tower. The ops agent can only produce a *draft*, which an authenticated member reviews before the incident exists (one-way and human-gated).

**Identity and access**
- No corporate SSO, email or Slack.
- **First admin:** created with an 80-bit one-time bootstrap code. The owner arms it with `set_bootstrap_code_hash`, so only its hash is stored, and it works only while the team is empty.
- **Invites:** the inviter's browser generates a random one-time code with Web Crypto and sends only its SHA-256 hash, role and expiry (5–1440 min). `redeem_invite` hashes the code and binds the caller's identity.
- **Brute force:** 5 wrong codes lock an identity for 10 minutes. A global rate limit pauses redemption when wrong codes flood in.
- **Lockdown** freezes invites, redemptions and role changes. Revocation works instantly: a revoked member's live data stops flowing (measured at about 35 ms in the smoke test) and their reducer calls fail.

**Read restriction**
- All 10 IR tables are **private**.
- Clients read through per-user **views** (`ir_incidents`, `ir_scope`, `ir_timeline`, `ir_tasks`, `ir_messages`, `ir_members`, `ir_audit`, `ir_status`, `ir_invites`). They return rows only when the caller is an active member; invites are visible to admins and commanders, never with hashes.
- A non-member gets only `my_access`, their own status.

**Deny-by-default RBAC in every reducer** (24 reducers):

| Action | Admin | Commander | Responder | Legal & comms | Exec viewer |
|---|---|---|---|---|---|
| Invite responder, legal or viewer | ✓ | ✓ | | | |
| Invite admin or commander; revoke; change role; lockdown | ✓ | | | | |
| Create incident; edit record, IOCs and lessons; escalate SEV | ✓ | ✓ | ✓ | | |
| Lower SEV; change phase or status; assign commander | ✓ | ✓ | | | |
| Record materiality | ✓ | ✓ | | ✓ | |
| Add or update affected data (scope register) | ✓ | ✓ | ✓ | | |
| Timeline notes, handoffs, chat | ✓ | ✓ | ✓ | ✓ | |
| Read everything | ✓ | ✓ | ✓ | ✓ | ✓ |

**Tamper-evident audit log**
- Every reducer appends an entry with `hash = SHA-256(JSON.stringify([prevHash, seq, tsMicros, actorHex, actorName, action, target, payload]))`. A JSON array is used so one field can't run into the next.
- **Verify audit chain** recomputes the chain in the browser and names the first broken entry. It checkpoints the head hash, so a full rewrite is also caught.
- **Simulate tampering** edits a local copy to demonstrate detection.

**Incident documentation (NIST SP 800-61 and CISA fields)**
- **Lifecycle and record:** the four lifecycle phases with checklists; SEV1–4; detected, reported, contained and closed timestamps; category; attack vector; functional and information impact; recoverability; IOCs; and the linked ops disruption.
- **Timeline:** append-only, auto-timestamped and attributed.
- **Scope register:** one row per affected data asset, with data class, confidence, status (`encrypted_ransomware`, `exfiltrated`, …) and a "notification may be required" flag.
- **Working together:** tasks and real-time chat (out-of-band by design).

**Ease of use**
- **At a glance:** severity, phase, commander, time since detection, affected-data counts, last update and **one Next step card**.
- **Quick actions:** "+ Affected data", "+ Timeline note", "Escalate SEV" and "Invite responder".
- **Templates:** ransomware, exfiltration and BEC.
- **Keyboard:** `N` adds a note, `/` opens the command palette.
- **Safety:** destructive actions ask for confirmation.

**Extras**
- Cyber → physical **blast radius** button (opens the affected lanes on Silk Road).
- Regulatory notification clocks (GDPR 72 h, SEC 8-K Item 1.05), labelled *informational, not legal advice*.
- Offline post-incident report export with the audit head hash.
- Shift-handoff notes.

**Threat model.** Arrow assumes the attacker controls the corporate network, the identity provider, email and Slack. The Control Tower stays usable because it depends on none of them.
- **What it does not protect against:**
  - a compromised responder device (malware there can act as that responder)
  - a compromised IR host, or theft of the database owner's CLI token, which can read private tables (keep it on the isolated host)
  - denied reducer calls are not audited, because they roll back; failed code attempts are audited
- This is a hackathon prototype. It makes no enterprise-grade security claims beyond what is listed here.

## What we learned

<!--
  FILL-IN TEMPLATE (Beginner track: "show us what you learned").
  Replace every _TODO_ in your own words, then delete these HTML comments.
  Comments like this one are hidden on GitHub but visible in the editor.
  Keep it honest and specific: judges reward "here is what clicked for us" over buzzwords.
-->

We are two first-time hackers. Before HackUTD 2026, _TODO: one or two sentences on your backgrounds (classes, languages, what you had and had not built before)._

### New technologies, and what clicked

| Technology | Before this weekend | What we learned |
|---|---|---|
| **SpacetimeDB** | _TODO_ | _TODO_ <!-- e.g. the database IS the backend: tables + reducers replace an API server; subscriptions push changes to every browser, which is why an approval shows up in two windows at once; scheduled reducers run the simulation tick. --> |
| **NVIDIA Nemotron agents** | _TODO_ | _TODO_ <!-- e.g. tool calling; splitting one job into 5 agents (Analyst, Planner, Auditor, Cyber Triage, Monitor); "the LLM chooses and explains, code calculates" so every number traces to a tool output; a human approves before anything changes. --> |
| **Tiger Data (TimescaleDB)** | _TODO_ | _TODO_ <!-- e.g. hypertables for time-series, a continuous aggregate (route_risk_5m) with time_bucket, and a z-score anomaly query that wakes the agents. --> |
| **Cyber incident response** | _TODO_ | _TODO_ <!-- e.g. the NIST SP 800-61 phases, scope registers, why the response room must be isolated from a compromised company network, invite codes stored only as hashes, a hash-chained audit log. --> |
| **Grok via Puter.js** | _TODO_ | _TODO_ <!-- e.g. calling an LLM from the browser with no API key (user-pays), grounding it in real headlines and dropping anything it can't cite. --> |
| **Next.js, React, three.js globe** | _TODO_ | _TODO_ |

### The hardest problem we hit

_TODO: describe one real bug or blocker, what you tried, and what finally fixed it._

<!-- Real ones from this build you could pick from (only use one you actually understood):
  - Deploying to SpacetimeDB Maincloud: logging in replaced our local identity, and a database created on the website skipped the module's init until we republished it.
  - Keeping secrets out of a public repo: real keys live only in gitignored .env files, never in .env.example.
  - The 3D globe rendered blank until we found React StrictMode double-mounting it.
  - Making the agent trustworthy: it failed visibly instead of inventing numbers when the model or a tool errored. -->

### What we would do differently

- _TODO_
- _TODO_

### What we want to build next

- _TODO_ <!-- e.g. Conquest GIS (market expansion), the open trade exchange, real carrier and port data feeds. -->

### How we split the work

- **_TODO name_:** _TODO_
- **_TODO name_:** _TODO_

## AI tools used

This project was built with AI coding assistance. The team should list the tools they actually used (for example Claude Code, Cursor) accurately here before submitting.

## Credits

- **Hero photo:** "People looking up in the sky" by cottonbro studio, [Pexels](https://www.pexels.com/photo/people-looking-up-in-the-sky-9940760/), used under the Pexels License (see `client/public/images/CREDITS.md`).
- **Country shapes:** [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth).
