# CLAUDE.md — Arrow (HackUTD 2026)

This file is the source of truth for building Arrow. Read all of it before writing code. When a choice is unclear, pick whatever protects the **demo path (§6)** and satisfies the **track requirements (§3)**. A working demo path beats more features.

---

## 0. Hard constraints

- **Deadlines (Central Time):**
  - **Sat Nov 7, 11:00 PM:** register the team and create the initial Devpost submission. It can be incomplete.
  - **Sun Nov 8, 12:00 PM:** final submission. That means the Devpost write-up, a **public** GitHub repo, the selected tracks, a demo video of **2 minutes or less**, and all code pushed.
  - **Sun 1–4 PM:** science-fair judging. The team must be present. **5 PM:** closing ceremony.
- All code must be written during HackUTD. The team is **2 people, both first-time hackers**.
- Track entry: up to **3 company tracks**, **1 HackUTD track** and **unlimited MLH tracks**. Every project is also judged automatically in **General**.
- Data: **synthetic only**. Show a visible "Simulated" badge in the UI. By team decision (Nov 7), the Gold and Silver demo workspaces use **real company names** (Amazon, CVS Health) for authenticity. All their data is still simulated, the UI labels it as simulated (since Nov 8 in the workspace dropdown instead of a top-bar badge, see §10), the landing page says "not affiliated with or endorsed by", and no company logos are used. The Bronze workspace is a fictional local restaurant.

## 1. What Arrow is

**Arrow: Centralized, Digitized, and Agentic Supply Chain Intelligence.**

**Pitch (use this framing, not "supply chains have no innovation"):** Supply chains power the global economy. Yet critical decisions depend on separate systems for tracking shipments, managing vendors, responding to cyber incidents and evaluating risk. Arrow is an agentic supply-chain command center. It connects live operational data, disruption intelligence and cyber incident response in one interface. It detects problems, has AI agents investigate them and compare the options, and lets humans approve a response that actually changes the system's state.

**Signature story:** a cyberattack or physical disruption hits a logistics node. Arrow shows the blast radius on a 3D globe, investigates it with a Nemotron agent and proposes a reroute. A manager approves it and every operator sees the change live. Responders then run the cyber incident in an isolated command center.

- **Visual centerpiece:** Silk Road (the globe).
- **Technical centerpiece:** the event-driven agent workflow.

## 2. Tracks entered

| Slot | Track | Prizes |
|---|---|---|
| Company 1 | **Spacetime: Main Track** | $2,048 / $1,024 / $512 per team |
| Company 2 | **NVIDIA: Use Nemotron Beyond a Chatbot** | 1st: 2× RTX 5080 + $200 Brev credits; 2nd: 1× RTX 5080 + $200 Brev |
| Company 3 | **Winstead PC: Cyber Incident Response Dashboard** | $1,500 / $900 / $300 |
| HackUTD | **Beginner** | Ninja SLUSHi |
| MLH | **Best Use of Tiger Data** | Stream Deck Mini |
| MLH | **SpaceXSI (Cursor + Grok Bot)** | Raffle: Cursor keyboard per member |
| Auto | **General** | $20k pool, 3 winners |

Backups (not targeted): PNC, Toyota, Capital One, Photon.

## 3. Track requirements → what Arrow must prove

### 3.1 HackUTD general judging (6 criteria, no published weights)

| Criterion | Judge asks | How Arrow wins it |
|---|---|---|
| Innovation & Creativity | Is it original? Does it use tech in an unexpected way? | It links a **cyber incident to its physical supply-chain blast radius** in one system. Agents act on events without a prompt. It is not "map + chatbot." |
| Technical Complexity | Complex algorithms, integrations? | A SpacetimeDB real-time backend, a Nemotron tool-calling agent, Tiger time-series analytics and anomaly detection, server-side RBAC and a hash-chained audit log. Show the architecture diagram. |
| Completeness | Does it work? Any broken features? | **Every visible button works.** Hide unfinished features; never show stubs. Rehearse the demo path until it never fails. |
| Design | Intuitive, visually appealing? | A cohesive dark command-center UI built around the globe. Status uses color + icon + text. Include loading, empty and error states. Must look right on a 1280px+ laptop. |
| Impact | Real problem, real-world use? | Ground the pitch in real events: NotPetya hitting Maersk (2017) and the Change Healthcare ransomware attack disrupting pharmacies (2024). Verify any figures before quoting them. Show a measurable but clearly simulated comparison: steps and time to respond in a fragmented workflow vs Arrow. Tell the scale story across the three tiers (§6): a global brand (Amazon-scale), a national chain (CVS-style) and a local mom-and-pop shop. |
| Presentation | Problem, solution and tech choices clearly explained? | One coherent incident story (§6), a 2-min video and a repeatable 3-min live demo. Explain why each technology was chosen. |

### 3.2 Spacetime: Main Track

- **Rule:** build any app, submit a **public GitHub repo**, and the **majority of the backend must be built on Spacetime (SpacetimeDB)**. Get the access code at the Spacetime booth.
- **Implementation:**
  - **All application state and business logic live in SpacetimeDB modules**, as tables plus reducers. This covers:
    - routes, shipments, nodes, vendors and disruptions
    - route-option scoring and approvals
    - agent run/step logs and the feed
    - all incident-response data
  - The simulation tick runs as a **scheduled reducer**.
  - Clients use the SpacetimeDB client SDK **subscriptions** for live sync. Use SpacetimeDB **Identity** for users.
- **The worker (§5) stays thin.** It only makes LLM calls, writes and reads Tiger, and optionally fetches news. It never owns state. It changes state only by calling reducers.
- **No** Express, Firebase, Supabase or Mongo as the primary store.
- **Proof in the demo:** two browser windows side by side. An action in one (approve a reroute, change incident status, send a message) appears in the other instantly.
- **README:** add a "What runs on Spacetime" section that lists the tables and reducers. It must show honestly that most backend logic is there.

### 3.3 NVIDIA: Use Nemotron Beyond a Chatbot

- **Rule:** use **Nemotron**, and the project must have all four of:
  1. **Beyond a chatbot:** not just answering prompts.
  2. **Multi-step workflows:** agents plan and execute complex tasks.
  3. **Tool integration:** external APIs and services used intelligently.
  4. **Real-world applicability.**

  The challenge PDF favors visible reasoning, tool calls and execution. Its examples use LangGraph and access through build.nvidia.com or OpenRouter.
- **Implementation:**
  - **Event-driven, not prompt-driven.** The agent starts **automatically** when a `disruption` row appears (from a scenario trigger or a Tiger anomaly). It never waits for a user prompt.
  - **Loop:** Plan (an explicit JSON step list) → Execute tools → Observe → Re-plan if needed → Recommend (ranked options with rationale) → `propose_action` → **wait for human approval** → an approved action runs through a reducer and changes real state (the globe redraws).
  - **Autonomy levels:**
    - Low-risk actions (post a briefing, notify) may run automatically.
    - State-changing actions (reroute, switch vendor, expedite) **always require approval**.
  - **Deterministic numbers:** cost, ETA and risk are calculated in reducers or code, never by the LLM. Every number in agent text must trace back to a tool output.
  - **Visible agent trace:** stream each step into the UI with its kind, tool, arguments, a summary of the result and its latency. This is the main NVIDIA proof.
  - **Prove it is not hardcoded:** at least 3 scenario presets with **different optimal outcomes** (§6), plus a random scenario. The agent's choices must differ visibly between them.
  - **Robustness:**
    - At most 10 steps per run.
    - Validate tool arguments against a schema and retry once on a malformed call.
    - Time out and show a visible failure state. Never fake output.
  - **Optional:** a two-agent handoff, for example Disruption Analyst → Recovery Planner, or a Cyber Triage agent that drafts the incident.
  - **As built:** five agents per run:
    1. Disruption Analyst
    2. Recovery Planner
    3. Risk Auditor: an independent critic. If it challenges, the Planner revises or justifies once.
    4. Cyber Triage (cyber incidents only)
    5. Recovery Monitor: after approval it measures before/after and posts a verified outcome.
  - Default model: `nvidia/nemotron-3-super-120b-a12b`; compare others with `npm --prefix worker run bench:models`.
- **Model access:**
  - Endpoint: the OpenAI-compatible API on build.nvidia.com (`https://integrate.api.nvidia.com/v1`) or OpenRouter.
  - Model: choose a current Nemotron model that **supports tool/function calling**. Set it in the `NEMOTRON_MODEL` env var and confirm the ID on build.nvidia.com.

### 3.4 Winstead PC: Cyber Incident Response Dashboard ("Control Tower")

- **Brief:** build a "command center" for use during and after a cyber incident. Required components:
  1. **Highly secure.** Operates inside potentially compromised networks as an **isolated system**.
  2. **Access control.** An admin can add individuals.
  3. **Incident documentation.** Follows cyber incident documentation standards, with real-time updates and status monitoring.
  4. **Scope definitions.** Records which data was compromised and its status (ransomware-locked, exfiltrated, etc.).
  5. **Real-time communications** inside the dashboard.
- **Judged on:**
  - **Security:** assume the attacker has access to *all* internal systems, so the dashboard must be independently secure.
  - **Ease of use:** stressed responders won't remember tutorials. This is *almost as important as security*.
  - **Creativity.**
- **This is an incident-response command center, not a threat-monitoring dashboard.** A threat or vulnerability overview panel is a secondary creativity add-on only.

**Security implementation (all server-side; never rely on hiding UI):**
1. **Isolation:**
   - **Preferred:** a separate SpacetimeDB database (`arrow-ir`). It shares no credentials with `arrow-ops`. The worker and agent have **no IR access**.
   - **Fallback:** the same module, with IR tables private and gated by role.
   - The IR UI path must have **no runtime CDN or external API dependency**. Bundle all assets.
   - It must be able to run self-hosted on an isolated laptop or LAN (`spacetime start`). This is the "operates inside a compromised network" story.
   - **AI features in IR are optional and off in isolated mode.**
2. **Independent identity:**
   - No corporate SSO, email or Slack dependency.
   - Invite-only. The admin's client generates a random one-time code (Web Crypto) and sends **only its hash** plus role and expiry to `create_invite`. The code is shared out-of-band (in person or by phone).
   - `redeem_invite(code)` hashes the code, matches it and binds the caller's Identity to a member.
   - First-admin bootstrap uses a one-time bootstrap code right after publishing. After that, membership is invite-only.
   - **Access screen:** opening the Control Tower without active membership shows an access screen and loads no incident data.
     - It takes the one-time code (calls `redeem_invite`) or, on a fresh install, the bootstrap code.
     - It shows plain-language states for a wrong or expired code, a revoked member and lockdown.
     - It is UX only. Reducers and read restrictions do the enforcing.
     - Documented in the README under "Who can see what". It is a demo beat in §6 step 5.
3. **Deny-by-default RBAC in every reducer:**
   - Check `ctx.sender`'s member role and status.
   - Roles: `admin`, `incident_commander`, `responder`, `legal_comms`, `executive_viewer` (read-only).
4. **Read restriction:**
   - IR rows must be readable **only by active members**. Use SpacetimeDB row-level security or views; verify the current API.
   - If no read-restriction mechanism exists, **flag it to the team immediately**. It is the core Winstead requirement.
5. **Revocation and lockdown:**
   - An admin can revoke a member instantly; that member's reducer calls fail.
   - `lockdown` freezes membership changes.
6. **Tamper-evident audit log:**
   - Every reducer appends a row with `hash = SHA-256(prev_hash ‖ seq ‖ ts ‖ actor ‖ action ‖ payload)`.
   - A UI button verifies the chain.
7. **Hygiene:**
   - Validate inputs and limit lengths in reducers.
   - Never use `dangerouslySetInnerHTML`.
   - Keep secrets only in env, use TLS/WSS, and commit nothing sensitive.
8. **Threat model in the README:**
   - State what is protected (compromised corporate network, identity provider and comms) and what is not (a compromised responder endpoint).
   - **Never claim enterprise-grade security beyond what is implemented.**
9. *Stretch:* TOTP step-up for admin actions.

**Incident documentation (follow the NIST SP 800-61 lifecycle and CISA/US-CERT notification fields):**
- **Phases:**
  1. Preparation
  2. Detection & Analysis
  3. Containment, Eradication & Recovery
  4. Post-Incident Activity
- **Fields:**
  - Basics: ID, title, SEV1–4, current phase and status.
  - Times and people: detected/reported/contained/closed timestamps, reporter and incident commander.
  - Category: ransomware, data exfiltration, BEC/phishing, DDoS, insider, supply-chain compromise or other.
  - **Attack vector:** unknown, attrition, web, email/phishing, external/removable media, impersonation/spoofing, improper usage, loss/theft of equipment or other.
  - **Functional impact:** none, low, medium or high.
  - **Information impact:** none, privacy breach, proprietary breach or integrity loss.
  - **Recoverability:** regular, supplemented, extended or not recoverable.
  - IOCs, summary and a linked ops disruption ID.
- **The timeline is append-only.** Every change is auto-timestamped and attributed.

**Scope register (one row per affected data asset):**
- What it is: asset/dataset, system, owner, estimated record count, evidence reference.
- Data class: PII, PHI, PCI, credentials, IP/trade secret, financial or operational/OT.
- Confidence: suspected or confirmed.
- **Status:** `unknown`, `accessed`, `exfiltrated`, `encrypted_ransomware`, `destroyed_wiped`, `integrity_modified`, `contained` or `restored`.
- A "notification may be required" flag.
- Status changes update live for everyone.

**Communications:**
- Real-time incident chat over SpacetimeDB subscriptions. Every message is attributed and timestamped and belongs to the audit trail.
- **Out-of-band by design**, because corporate email and Slack are assumed compromised.

**Ease of use (the 3-second rule):** anyone opening the Control Tower sees all of the following within 3 seconds:
- severity, phase and commander
- time since detection
- affected-asset counts by status
- last update
- **one "Next step" card**

Design rules:
- One primary call to action per state, plus a phase stepper with a checklist.
- Quick-add buttons: "+ Affected data", "+ Timeline note", "Escalate SEV", "Invite responder".
- Templates for ransomware, exfiltration and BEC.
- Large hit targets, high contrast, plain-language labels and keyboard shortcuts (`N` adds a note, `/` opens the command palette).
- Confirm destructive actions. No hidden gestures.

**Creativity add-ons (pick 1–3 that fit):**
- **Cyber → physical blast radius:** the incident's affected supply-chain nodes and routes are highlighted on Silk Road. This is unique to Arrow, so lead with it.
- Hash-chain integrity verification.
- Regulatory notification clocks, labeled "informational, not legal advice". Examples: GDPR 72h to notify the supervisory authority; SEC 8-K Item 1.05 four business days after materiality is determined.
- Shift-handoff summary.
- Post-incident report export (timeline, scope, lessons learned) that works offline.
- **Ops → IR is one-way and human-gated:** the agent produces an incident *draft*, and an authenticated IR member reviews it and creates the incident. The ops side never holds IR credentials.

### 3.5 Beginner (HackUTD track)

- **Rule:** the majority of the team must be first-time hackathon participants. With a 2-person team, **both** must be first-timers, since 1 of 2 is not a majority.
- **Theme:** "show us what you learned."
- **Implementation:** add a README section "What we learned" and give it a beat in the pitch. Completeness and polish matter most here.
- **Verify with organizers:** whether Beginner uses the single HackUTD track slot. The Devpost rules listed Hardware/Design/Virality.

### 3.6 MLH: Best Use of Tiger Data

- **Rule:** use Tiger Data (managed TimescaleDB/Postgres on Tiger Cloud) to power real-time data, analytics or time-series features.
- **Role:** Tiger is the **analytics/history store only**. Never make it the primary backend; that would hurt Spacetime eligibility.
- **Implementation:**
  - **Hypertables:**
    - `route_metrics(time, route_id, delay_hours, risk_index, cost_usd, in_transit_units)`
    - `shipment_events(time, shipment_id, event, lat, lng)`
    - `security_events(time, kind, severity, source)`
  - **A continuous aggregate**, e.g. `route_risk_5m`, built with `time_bucket('5 minutes', time)`.
  - **Anomaly detection in SQL:** a z-score vs a rolling baseline. A hit makes the worker call `report_disruption`, which triggers the agent. This means Tiger actually *enables* detection.
  - **Charts powered by real queries:**
    - route risk index over time against an alert threshold, showing the spike and recovery
    - security events per minute
  - **Agent tool:** `query_route_history` uses Tiger.
  - **Seed:** backfill about 7 days of history so the charts are meaningful from the start.

### 3.7 MLH: SpaceXSI (raffle)

- **Rule:** use **Cursor** as the core AI coding agent, **integrate Grok Bot automation**, describe both in the submission and **opt into the raffle**.
- **Limits:**
  - Spend no more than 30 minutes on this. Confirm at the booth what counts as "Grok Bot automation."
  - **Describe tool usage accurately.** Claim Cursor as the core agent only if that is true, and disclose other AI tools honestly.
- **As built:** the **Grok News Scout** bot (`worker/src/grok/scout.ts`) uses xAI's Responses API with server-side `web_search` + `x_search`.
  - It runs on a schedule or on demand and records real-world signals in `news_signal` (shown as "N" markers on Silk Road).
  - A person escalates a signal into a disruption, which wakes the Nemotron agents. The bot never changes network state itself.
  - Still confirm at the booth that this counts as "Grok Bot automation".

## 4. Feature scope

| Feature | Tier | Serves | Decision |
|---|---|---|---|
| **Silk Road** (globe, routes, incidents) | Core | General, Design, Spacetime | Build first |
| **Agentic incident resolution** (Nemotron) | Core | NVIDIA, Innovation, Tech | Build second |
| **Cyber Control Tower** (IR command center) | Core | Winstead, Spacetime | Build third |
| **Analytics + anomaly detection** (Tiger) | Core | Tiger, Tech, Impact | Build fourth |
| **Live briefing feed** ("no digging" status updates) | Core-lite | NVIDIA, Impact | Agent posts what changed, why it matters and what is recommended |
| Vendor database | Stretch-min | Agent reference data | A table plus a risk score; agent tool `check_vendor_risk` |
| Escalation to executives ("bottom data to the top") | Stretch | Impact | Feed items carry an audience level; an Escalate action pushes a summary to an executive view |
| Report export (ops XLSX/CSV + charts, IR post-incident report) | **Built** | Winstead "after", Impact, NVIDIA | Ask Arrow's `build_dashboard` agent tool draws real charts with PNG + CSV export (§6.1); IR post-incident report exports offline |
| News disruption blips | Stretch | NVIDIA tools | GDELT (free) via agent tool `search_disruption_news`, shown as globe markers; otherwise a curated feed labeled "Simulated" |
| Tier switch: Bronze / Silver / Gold | Stretch | Impact / scale story | Reseeds the same data model with that tier's mock data (§6) |
| Generic AI BI chatbot | **Cut** | — | A plain chat window works *against* NVIDIA. Any "Ask Arrow" box must launch agent workflows that produce artifacts. |
| **Conquest GIS** (market expansion) | **Built (prototype, Nov 8)** | Impact, Innovation, NVIDIA | `/app/conquest`: simulated listings per tier, code-computed deal score, Nemotron deal memo (§6.1). Client-side data; not part of the demo path's critical steps. |
| Open bartering / trade exchange | **Vision only** | — | One roadmap slide. Do not build it. |

### 4.1 Silk Road spec

- **Globe:** use `react-globe.gl` (three.js).
  - Nodes: supplier, factory, port, airport, warehouse/DC, store. Draw them as `pointsData`, with icons by kind.
  - **Air** routes: `arcsData` with high altitude and an animated dash.
  - **Sea** routes: `pathsData` with real waypoints (Suez, Malacca, Panama, Cape of Good Hope) so reroutes look real.
  - **Truck/rail** routes: low arcs.
  - Incidents: `ringsData` for a pulsing alert, plus `htmlElementsData` for the clickable **"!"** marker.
- **Route status:**

  | Status | Look |
  |---|---|
  | `healthy` | green |
  | `at_risk` | amber |
  | `disrupted` | red, thicker, pulsing |
  | `rerouted` | cyan, dashed |

  Always pair the color with a text label in panels.
- **Layout:**
  - Full-bleed globe.
  - Top KPI strip: on-time %, shipments in transit, value at risk, open disruptions, open cyber incidents.
  - Right drawer for the selected route or incident: details, live agent trace, options table (cost / delay / risk / score), and **Approve / Reject**.
  - Bottom live ticker (the feed) and a legend.
  - A **scenario panel** to trigger presets.
  - "Simulated" badge and a live connection indicator.

### 4.2 App shell

- Left rail: **Silk Road · Control Tower · Analytics · Feed**.
- Top bar: org and tier, "Simulated" badge, connection status, clock (UTC + local).
- Access: any employee at any level can view Silk Road, Analytics and Feed and share results. Approvals need the manager role. The Control Tower is invite-only behind its access screen (§3.4).
- Theme: dark command center with one accent color and consistent spacing.
- Every page needs loading, empty and error states.

## 5. Architecture

```
 Browser (Next.js 16 + React 19 + TS + Tailwind v4, react-globe.gl, d3-geo, Recharts)
   │  SpacetimeDB TS client SDK (subscriptions + reducer calls)
   ├──────────────► SpacetimeDB  arrow-ops  (supply-chain state, sim tick, scoring, approvals, agent logs, feed)
   ├──────────────► SpacetimeDB  arrow-ir   (ISOLATED incident response: members, incidents, scope, chat, audit)
   │  HTTP (analytics only)
   └──────────────► worker  (Node + TS, thin)
                      ├─ Nemotron agent  ──► build.nvidia.com / OpenRouter
                      ├─ connects to arrow-ops as privileged "agent" identity (NO IR access)
                      ├─ Tiger bridge: mirrors ops telemetry → Tiger hypertables; anomaly SQL → report_disruption
                      ├─ analytics API: time_bucket / continuous-aggregate queries for charts
                      └─ (stretch) GDELT news fetch
```

**Repo layout (as built):**

| Path | Contents |
|---|---|
| `client/` | Next.js 16 app (landing `/`, command center `/app/*`); `src/module_bindings/{ops,ir}` is generated by `spacetime generate`. Dev server on port 3100 (SpacetimeDB uses 3000). |
| `spacetime/ops/` | SpacetimeDB 2.14 TypeScript module: schema, reducers, seed data (`src/seed/`), scenario playbooks, deterministic scoring (`src/scoring.ts`, unit-tested) |
| `spacetime/ir/` | Isolated IR module |
| `worker/` | Nemotron agent runner + tools, Tiger bridge/anomaly detection, analytics HTTP API, test-only mock LLM for plumbing tests |
| `scripts/` | `setup.mjs` (publish + authorise agent), `ir-bootstrap.mjs`, `tiger/schema.sql` |

**Agent-tool pattern:** a "tool" usually means call a reducer, then read the resulting rows through the subscription. For example, `evaluate_alternatives` writes `route_option` rows. This keeps the logic in Spacetime.

**`arrow-ops` tables:**

| Table | Columns |
|---|---|
| `org` | id, name, tier `bronze\|silver\|gold` |
| `node` | id, kind, name, lat, lng, region, status |
| `vendor` | id, name, category, risk_score, node_id |
| `route` | id, from_node, to_node, mode `sea\|air\|rail\|truck`, waypoints, status, eta_hours, cost_usd, risk |
| `shipment` | id, route_id, goods, units, value_usd, priority, due_at, progress 0–1, status |
| `disruption` | id, kind `weather\|port_congestion\|accident\|blockage\|cyber\|strike\|geopolitical`, severity, lat, lng, affected_route_ids, source `scenario\|anomaly\|news`, status, created_at |
| `route_option` | id, disruption_id, mode, waypoints, added_cost, delay_hours, risk, score |
| `agent_run` | id, disruption_id, status, started_at, summary |
| `agent_step` | run_id, seq, kind `plan\|tool_call\|observation\|decision`, tool, input_json, output_json, latency_ms, ts |
| `action_proposal` | id, run_id, kind `reroute\|expedite\|switch_vendor\|notify\|ir_draft`, payload_json, rationale, status `pending\|approved\|rejected\|executed`, decided_by, decided_at |
| `feed_item` | id, ts, audience, severity, text, link |
| `telemetry_event` | Recent rows only; prune old ones. Mirrored to Tiger. |

**`arrow-ops` reducers:** `seed_demo(tier)`, `tick` (scheduled), `trigger_scenario(kind)`, `report_disruption`, `evaluate_alternatives`, `start_agent_run`, `log_agent_step`, `propose_action`, `approve_action` / `reject_action` (manager role), `execute_action` (applies the reroute and updates routes/shipments), `post_feed_item`, `resolve_disruption`.

**`arrow-ir` tables:** `ir_member` (identity, name, role, status `invited|active|revoked`, added_by), `ir_invite` (code_hash, role, expires_at, used_by), `incident`, `incident_event` (timeline), `scope_item`, `ir_task`, `message`, `audit_log` (seq, ts, actor, action, target, payload, prev_hash, hash), `ir_settings` (lockdown).

**`arrow-ir` reducers:** `bootstrap_admin`, `create_invite`, `redeem_invite`, `revoke_member`, `set_role`, `set_lockdown`, `create_incident` (optionally from a draft), `update_incident`, `advance_phase`, `add_scope_item`, `update_scope_status`, `add_timeline_note`, `assign_task` / `complete_task`, `send_message`. **Every one of them checks the caller's role and appends to the audit log.**

**Agent tools (worker):** `get_disruption`, `list_affected_shipments`, `evaluate_route_alternatives`, `query_route_history` (Tiger), `check_vendor_risk`, `search_disruption_news` (stretch), `propose_action`, `draft_ir_incident` (for `cyber` disruptions only; creates an `ir_draft` proposal and does not touch IR), `post_briefing`.

**Env vars** (`.env.example` only; never commit secrets):
- **Spacetime:** `SPACETIME_HOST`, `SPACETIME_OPS_DB=arrow-ops`. The client also gets `NEXT_PUBLIC_SPACETIME_HOST`, `NEXT_PUBLIC_OPS_DB`, `NEXT_PUBLIC_IR_DB` and `ARROW_WORKER_URL` (Next.js proxies `/api/worker/*` to the worker).
- **Nemotron:** `NVIDIA_API_KEY`, `NEMOTRON_BASE_URL`, `NEMOTRON_MODEL`.
- **Tiger:** `TIGER_DATABASE_URL`.
- **The worker never gets IR configuration.**

## 6. Demo path (must never break)

**Scenario presets.** Each has a different optimal outcome, which proves the agent is not hardcoded:
1. **Ransomware at a 3PL warehouse** (flagship; a Dallas-area DC partner).
   - Effect: outbound shipments are frozen.
   - Agent: shifts volume to an alternate DC and delays low-priority orders, then produces an **IR draft**.
   - IR scope: WMS data `encrypted_ransomware`; customer PII exfiltration `suspected`.
2. **Canal blockage** (Asia→Europe sea lane via Suez).
   - Agent: sends high-priority/high-value SKUs by air and reroutes the rest via the Cape of Good Hope.
3. **Typhoon port closure** (48h).
   - Agent: low-priority cargo waits; urgent cargo is diverted to an alternate port.
4. **Random** scenario generator.

**Scale tiers (plans).** All three workspaces exist side by side (one `org` row each) and any viewer can switch between them; "Reset demo" reseeds one workspace. All data is simulated.
- **Gold · Enterprise: Amazon.** Global multimodal network (transpacific, Asia–Europe via Suez, Panama, Amazon Air hubs, fulfillment centers, a Grand Prairie 3PL partner). Runs the three flagship scenarios above. Default workspace for the demo path.
- **Silver · National: CVS Health.** National pharmacy network: imported generics, a Puerto Rico ocean lane, regional DCs, cold-chain vaccine lanes, retail pharmacies. Scenarios: ransomware at the Texas DC, hurricane closes the Florida DC, reefer failure on the vaccine lane.
- **Bronze · Essentials: Maple & Main Kitchen** (fictional). Family restaurant group in Richardson, TX, with local produce, seafood, meat, dairy and bakery deliveries. Scenarios: ransomware locks POS and ordering, ice storm closes US-75, produce truck breakdown.

**Live demo (about 3 min) and video (2 min or less):**
1. **Open Silk Road.** Moving ships, planes, trains and trucks, KPI strip, activity heatmap. *(Hook: "supply-chain decisions live in 5 different systems.")*
2. **Trigger "Ransomware at 3PL"** (or let the Tiger anomaly fire). Routes turn red, the "!" pulses and an item appears in the feed.
3. **The agent starts on its own.** The trace streams: plan → tool calls → options table → recommendation.
4. **Approve.** `execute_action` runs. The globe redraws the reroute **in both browser windows** (Spacetime).
5. **Switch to the Control Tower** (separate identity). The commander turns the IR draft into an incident, sets SEV and adds scope rows. They click "Invite responder" and read the one-time code aloud. Window 2 lands on the **access screen**, enters the code and joins. Then they chat across the two windows, advance the phase and click **Verify audit chain**.
6. **Analytics.** Tiger charts show the risk spike and recovery, plus security events.
7. **Run "Canal blockage."** The agent picks a different plan.
8. **Close.** Show the post-incident report, then switch tiers (Gold / Silver / Bronze) to show the same workflow at every scale. Show Conquest GIS on Bronze (§6.1), then end on the roadmap slide (live carrier data, BI connectors, trade exchange).

**Venue Wi-Fi fallback:** a **"Replay" mode** may play back a recorded *real* agent run. It must be clearly labeled "Replay" in the UI. Never present a replay as live.

### 6.1 Script beats for the Nov 8 features (emphasize these)

Each beat names the judging criterion and track it proves. All are live and working.

| Beat | What to show | Line for the script | Proves |
|---|---|---|---|
| **Ask Arrow builds a dashboard** | Ask Arrow: "Build me a dashboard of value at risk by lane, mode and status" (suggestion chip), then **Full view** | "Ask in plain English and Nemotron builds a real dashboard. The agent picks the charts, our code computes every number from live data, and it downloads as PNG or CSV for Excel, Google Sheets, Tableau or Power BI." | NVIDIA (tool use that produces an artifact), Technical complexity, Impact |
| **Talk to the agent team** | Current AI Agents tab: pick 2 to 5 agents in the bottom-left chat and ask a question | "You can question the agents directly. Each answers from its own role, the Auditor challenges, the Planner proposes, using live tools." | NVIDIA (multi-agent), Innovation |
| **Live camera on any hub** | Hover a port or airport on the globe | "Every hub has a live view and live lane counts." (Card says "Simulated camera feed".) | Design |
| **Activity heatmap and pillars** | Gold globe: blue countries and pillars over Europe and South America | "The busier a country and hub, the bluer and taller it gets, across four continents." | Design, Impact (scale) |
| **Vehicles and arrows** | Ships, planes, trains and trucks moving; arrowheads at each destination | "You can see what is moving, by what mode, and where it is going." | Design |
| **Feed with three responses** | Live Feed: any entry's three options with steps, time and importance | "No digging: every update comes with three ready responses, each with its steps, time and importance, one click to act." | Impact, Completeness |
| **Global team, any language** | Communications: Shenzhen message in Chinese, **Translate to English** | "Branches talk in their own language and Arrow translates in one click." | Impact, Design |
| **Conquest GIS** | Switch to Bronze, open Conquest GIS, pick a site, show deal score, then **Get Nemotron deal memo** | "The same platform helps a family restaurant pick its next location: foot traffic, competitors, costs, landlord ratings and an AI deal memo." | Impact (mom-and-pop to global), Innovation |

Close the pitch on the scale story: one data model and one agent team serve a family restaurant, a national pharmacy chain and a global retailer.

## 7. Build order (target times, Central Time)

- **P0 (by ~11 PM Sat):**
  - Build the vertical slice: the ops module (nodes/routes/shipments/disruptions plus seed), the globe subscribing, `trigger_scenario` turning a route red, and two-window sync working.
  - **Devpost registration and initial submission.**
- **P1 (by ~3 AM):** the Nemotron agent loop, the trace panel, and approve → `execute_action` → reroute visible on the globe.
- **P2 (by ~6 AM):** the IR module and Control Tower: bootstrap/invite/RBAC, incident documentation, scope register, timeline, chat, hash-chained audit log, and the ops → IR draft.
- **P3 (by ~8 AM):** Tiger schema and backfill, the bridge, charts, anomaly → disruption, and the `query_route_history` tool.
- **P4 (by ~9 AM):** the second and third scenarios, the briefing feed, report export, tier switch and polish. **Feature freeze at 9 AM.** After that, only bug fixes.
- **P5 (9–11:30 AM):**
  - README: problem, architecture diagram, per-sponsor usage with file paths, "What runs on Spacetime," threat model, "What we learned," how to run, synthetic-data disclaimer and AI tools used.
  - Record the 2-min video.
  - Finish Devpost: select all tracks, opt into SpaceXSI.
  - Push everything by 11:45 AM.

## 8. Implementation guardrails

- **Protect the demo path first.** Never merge something that breaks §6.
- **No fake AI.** Agent output comes from live Nemotron calls. On failure, show the error state, or use a clearly labeled Replay.
- **Presets are for data, not decisions.** Mock data, scenario inputs and deterministic tool outputs may be preset. The agent's plan and recommendation are never preset.
- **LLMs choose and explain; code calculates.** Every number comes from a tool output.
- **Spacetime owns state and logic.** The worker stays thin and changes state only through reducers.
- **IR isolation is sacred:**
  - no IR credentials in the worker or ops
  - server-side role checks in every IR reducer
  - IR reads restricted to members
  - no external runtime dependencies in the IR UI
- **No dead buttons.** Hide anything unfinished.
- **Status always uses color + icon + text.**
- **Synthetic data is always labeled. Seed data uses fictional orgs. No secrets in git.**
- **Keep the README sponsor sections current** as features land.

## 9. Verify before or while building

- **Spacetime:**
  - access code (booth)
  - supported module languages
  - API for scheduled reducers, Identity/auth, row-level security and views
  - maincloud vs self-hosted
- **Nemotron:** a model ID with tool calling, rate limits, and whether to use build.nvidia.com or OpenRouter.
- **Tiger:** Tiger Cloud account and connection string; continuous aggregate syntax.
- **SpaceXSI:** what qualifies as "Grok Bot automation."
- **Beginner:** both members are first-timers, and whether it counts as the one HackUTD track.

## 10. Decisions log (as built — keep current)

**What each technology does (no overlap):**

| Technology | Its one job in Arrow |
|---|---|
| **SpacetimeDB** (Maincloud) | The backend: all state, business logic, scoring, approvals, role checks, live sync. Two databases: `<name>-ops` and the isolated `<name>-ir`. |
| **NVIDIA Nemotron** | All reasoning: the 5 event-driven agents *and* the "Ask Arrow" chat. Runs in the worker. |
| **Grok** (free via Puter.js) | News research only: reads real Google News headlines (last 7 days) in the browser and flags those that threaten lanes. Never changes state; a person escalates a signal into a disruption. |
| **Tiger Data** | History + analytics only: hypertables, `route_risk_5m` continuous aggregate, z-score anomaly SQL, Analytics charts. |
| **Next.js** | The website (landing + command center) and two server routes: `/api/news` (Google News RSS) and `/api/analytics/*` (Tiger queries). |

**Deployment (no local-only pieces):**
- **SpacetimeDB Maincloud.** `spacetime login`, then `node scripts/setup.mjs --cloud <unique-name>`. That publishes both modules, writes `worker/.env` + `client/.env.local`, and authorises the agent identity. It runs on the team's Maincloud credits.
  - **Live now (Nov 7):** ops = `arrowdblol-d492m`, IR = `arrowdblol-d492m-ir`, both on Maincloud under the `amirimtiaz` account. Re-run with `node scripts/setup.mjs --cloud arrowdblol-d492m --ops-db arrowdblol-d492m --ir-db arrowdblol-d492m-ir` (`--ops-db`/`--ir-db` reuse a database created on spacetimedb.com).
- **Website on Vercel:**
  - Root directory: `client`.
  - Env: `NEXT_PUBLIC_SPACETIME_HOST=wss://maincloud.spacetimedb.com`, `NEXT_PUBLIC_OPS_DB`, `NEXT_PUBLIC_IR_DB`, `NEXT_PUBLIC_IR_HOST`, `TIGER_DATABASE_URL` (server-only).
- **Worker:** any always-on host via `worker/Dockerfile` (or the demo laptop). It needs no inbound port.
  - Env: `SPACETIME_HOST`, `SPACETIME_OPS_DB`, `AGENT_TOKEN` (contents of `worker/.agent-token-maincloud.spacetimedb.com`), `NVIDIA_API_KEY`, `NEMOTRON_MODEL`, `TIGER_DATABASE_URL`.
- **Control Tower first admin:** after every fresh IR database, the owner (CLI identity) runs `node scripts/ir-bootstrap.mjs --server maincloud --db <name>-ir`. Then use "First-time setup" on `/app/control-tower`. Invite-only by design: without this step the Control Tower shows only the access screen.

**Agents:**
- 5 per run, in this order:
  1. Disruption Analyst
  2. Recovery Planner
  3. Risk Auditor (critic; a challenge triggers one revise/justify round)
  4. Cyber Triage (cyber only)
  5. Recovery Monitor (after approval: measured before/after)
- Model `nvidia/nemotron-3.5-super-vl-120b-a12b`, with `chat_template_kwargs.enable_thinking` on (`NEMOTRON_THINKING`) so reasoning shows as "Thinking" steps.
- `npm --prefix worker run bench:models` compares models on the real first agent turn.

**Gotchas:**
- On Windows the `spacetime` shim may not resolve (PATH not reloaded, or a broken `bin/current` junction). Call `%LOCALAPPDATA%\SpacetimeDB\bin\<version>\spacetimedb-cli.exe` directly; the scripts already do.
- `spacetime login` replaces the CLI identity. Databases published by the old identity can't be updated afterwards, so republish under new names or `--reset`.
- A database created empty on the spacetimedb.com website skips the module's `init` on first publish (reducers then fail with "Arrow is not initialised"). Publish once with `--delete-data=always` so `init` runs.
- `.env.example` files are committed to the public repo. Real keys go only in `worker/.env` and `client/.env.local` (gitignored).
- Identity tokens are per server: the client keys them by host + database, and the worker keeps `.agent-token` (local) or `.agent-token-<host>`. A second demo user needs an incognito window.
- Republishing a schema change while the worker runs makes it exit on decode errors. `npm start` runs it under `src/supervise.ts`, which restarts it, so after a schema change also regenerate bindings and restart.
- Tiger's "client credentials" (public/secret key) are for Tiger's API/CLI, not the database. Use the service's connection string.
- Grok/Puter needs a one-time Puter sign-in popup on the first **Scan** click; after that it auto-scans every 30 min while Silk Road is open.
- **Run exactly one worker.** Stopping `npm start` can leave the `tsx` child processes alive, and an old worker then claims questions with outdated code. Before restarting, check for leftover `node` processes running `supervise.ts` / `src/index.ts` and stop them. On startup the worker marks any `ask` run still "running" as failed ("Please ask again").
- Regenerating ops bindings from `spacetime/ops` drops the client's `branch` / `branch_message` tables (they exist only in the client bindings). Don't run `spacetime generate` for ops without restoring them; publishing the ops module alone is safe.

**Added Nov 8 (as built):**
- **Ask Arrow dashboards:** worker tool `build_dashboard` (`worker/src/agent/tools.ts`). Nemotron picks 1 to 4 charts (metric × grouping × bar/pie/table) and optional filters (route status, mode, shipment status) from a fixed menu; the tool computes all values from SpacetimeDB rows. Rendered by `client/src/components/silk-road/DashboardArtifact.tsx` (Recharts, PNG per chart, CSV of everything).
- **Agent chat:** prompts starting `[[agents:analyst,planner,…]]` route to per-agent personas (`handleAgentChat`, read-only tools); `[[agents:deal]]` is the Conquest GIS Deal Evaluator. Ask Arrow hides these runs. UI: `client/src/components/agents/AgentChat.tsx`.
- **Silk Road:** vehicle badges by mode (3D shader points, 2D SVG), arrowheads at lane ends, activity heatmap and hub pillars (`globe-extras.ts`), hub live-camera hover card (`HubLiveCard.tsx`). Lane layers stay referentially stable between ticks (that was the stutter). Settings v2 defaults: max label and vehicle size, auto-rotate 0.35.
- **Network:** the Gold seed adds 18 Europe and South America hubs and 19 lanes (published to Maincloud, Gold reset Nov 8).
- **Feed:** `FeedRow.tsx`, three response options per entry, each wired to a real action. **Communications:** role photos (`branch-photos.ts`) and translation (`translations.ts`; sample translations bundled, otherwise the browser's on-device Translator API).
- **Data label:** at the team's request (Nov 8) the top-bar "Simulated" badge was removed. Data stays labeled through the workspace dropdown ("all data simulated"), the landing page disclaimer, the hub camera card, Conquest GIS's "Simulated listings" chip and the README.
- **Photos:** 60 Unsplash photos in `client/public/images/app/`, credited in `client/public/images/CREDITS.md`.
