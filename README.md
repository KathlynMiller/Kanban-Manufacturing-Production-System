# Kanban Manufacturing System — Digital Kanban & Power BI Dashboard

A capstone project digitizing Kanban Manufacturing System's physical whiteboard
Kanban board: an interactive digital board prototype plus the Power BI
data model (CSV + Power Query + DAX) behind the reporting dashboard.

## Project layout

```
index.html              Digital Kanban board — current version
index-original.html     Preserved starting-point layout (see below)
script.js                Board logic, shared by both HTML pages
styles.css                Board styling
kickoff.txt                 Raw Phase 1 kickoff notes, organized by topic
powerbi/
  RequirementsDocument.md   Formal requirements, decisions, open questions
  DataDictionary.md         Full schema reference for the data model
  PowerQuery.m               Power Query (M) — load/shape all 3 tables
  Measures.dax                 DAX measures for the Power BI report
  Dashboard.html                 Static mock-up of the Power BI KPI dashboard
  ProcessFlowDiagram.html          Physical vs. digital stage-flow diagrams
  data/
    OpenOrders.csv                 One row per order — current stage/status
    StageOrder.csv                  Stage sort-order lookup (10 stages)
    PhaseLog.csv                      One row per phase per order, with
                                       start/stop timestamps
```

## Running the digital board

The board loads its data via `fetch()`, so it needs to be served over
HTTP — opening `index.html` directly (`file://`) will fall back to a
single sample card because browsers block local file fetches.

```
python -m http.server 8000
```
then open `http://localhost:8000/index.html`.

## New features added to this project

### Digital board (`index.html` / `script.js`)
- **10-stage digital sequence confirmed** (2026-09-17): Back Log →
  Production → Deflash Queue → Deflash → To Do → Final Inspection
  Queue → Final Inspection → Packaging → Awaiting Ship → Shipped
- **Linked to the real data model**: the board fetches
  `powerbi/data/OpenOrders.csv` and `PhaseLog.csv` directly — the same
  files the Power BI report reads — instead of a separately
  hand-maintained JSON file, so the two can't drift apart
- Card selector ("Currently working on")
- Per-phase Start/Stop timestamp buttons, live elapsed-time display
- Cycle-time tracking against the 4–5 day target (flags overdue)
- Time-in-limbo tracking (idle time between phases)
- Problem notes field per card
- Deflash Rework/Hold flag banner
- Production status colors (Waiting for Material, In Process, Rework,
  Hold, Cancelled)
- **Batch-size indicator per column** (10-order target) — a visible
  warning, not a hard block, so Start always stays usable
- **Stop now finishes a phase's timer AND advances the card to the
  next stage** in one click, instead of requiring a separate move
- **Planned Start Date / End Date** fields on each order, alongside
  Due Date
- **"Where this project stands" status panel** — confirmed-at-kickoff
  / built-and-working / still-open, for a clear read on progress
- **`index-original.html`** — a preserved snapshot of the original
  board layout (before the above updates), kept as a clean starter
  example. It shares the live `script.js`/`styles.css`, so it's still
  fully functional — only its header/banner copy is the original.

### Power BI data model (`powerbi/`)
- `StageOrder.csv` rebuilt around the confirmed 10-stage sequence
- `OpenOrders.csv` rebuilt with `CardNumber`, `Status`, and `Notes`
  columns
- **New `PhaseLog.csv` table** — one row per phase per order, with
  start/stop timestamps (long/fact table, so cycle-time and
  time-in-limbo are computable without 20 wide columns)
- `PowerQuery.m` rebuilt: three queries (StageOrder, OpenOrders,
  PhaseLog), a Deflash rework/hold flag column, and a time-in-limbo
  calculation
- `Measures.dax` rebuilt: added Cycle Time Overdue, Average Time in
  Limbo, Deflash Flagged Orders, and status-based counts (Hold,
  Rework, Cancelled, Waiting for Raw Material)
- `DataDictionary.md` updated to document the new schema and
  relationships
- `Dashboard.html` KPIs recomputed from the real sample data
- `ProcessFlowDiagram.html` updated to show both the physical and
  confirmed digital sequences

### Docs
- `RequirementsDocument.md` Section 3a marked confirmed; open-questions
  checklist updated; terminology made consistent (Shipped vs. the old
  "Completed")
- `kickoff.txt` reorganized from a flat list of fragments into labeled
  topic sections (Architecture, Roles & Access, Digital Board
  Sequence, Statuses, Timing & Cycle Rules, Bottlenecks & Volume,
  Card/UI Features, Why This Matters, Change Log)

## Still open

See `powerbi/RequirementsDocument.md` Section 11 — the open items that
need Kanban Manufacturing System's input, not something resolvable from the existing data:
how far back the Excel/CSV order history goes, where Part Family comes
from, exact Rework-vs-Hold routing rules at Deflash, and
ownership/timeline for the API + SharePoint + SQL build-out.
