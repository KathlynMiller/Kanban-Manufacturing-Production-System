# Data Dictionary — Kanban Manufacturing System Dashboard

**Updated after the Phase 1 kickoff:** the 10-stage digital-board
sequence is now confirmed and the schema below reflects it — Status,
per-phase timestamps (via a new `PhaseLog` table), card numbers, notes,
and the Deflash rework/hold flag are all wired in. See
`RequirementsDocument.md` Section 3a/6/11 for the decision history.

## Table: OpenOrders
Source file: `data/OpenOrders.csv` (sample — replace with the real
Kanban Manufacturing System Excel/Open Order export per Phase 2 of the project guide)

One row = one work order line, currently sitting in one stage of the
Kanban process. This is the "current state" table — history of how it
got there lives in `PhaseLog`.

| Column | Data Type | Description | Example | Valid Values / Notes |
|---|---|---|---|---|
| CardNumber | Whole number | Card/order ID so a person can select and track it individually | `104` | New — confirmed at kickoff |
| SO_Number | Text | Sales Order number identifying the order this line belongs to | `SO-7801` | Not unique per row — one SO can have multiple part lines |
| PartNumber | Text | Manufactured part identifier | `100125060` | Free text on the physical board; format varies by part type |
| PartFamily | Text | Grouping/category of the part | `Housing` | Sample values used here: Housing, Bracket, Passive Component, Fastener Kit, Boot — **confirm real categories with Kanban Manufacturing System**, not observed directly on the board |
| Quantity | Whole number | Units ordered on this line | `5000` | Always positive; no partial/negative quantities expected |
| DueDate | Date | Date the order is due/should ship | `2026-09-22` | Format: YYYY-MM-DD. On the physical board this is sometimes labeled "Due Date," sometimes "Delivery Date" — **confirm with Kanban Manufacturing System whether these mean the same thing** |
| Stage | Text | Current position in the Kanban process | `Deflash` | Must be one of the 10 values in the Stage table below. Operator-driven, manual — not a system event (confirmed at kickoff) |
| Status | Text | Exception status layered on top of Stage | `Rework` | One of: `In Process`, `Waiting for Raw Material`, `Hold`, `Rework`, `Cancelled` — confirmed at kickoff |
| Notes | Text | Free-text problem notes logged against the order | `Excess flash on batch 2 — sent back for a second pass.` | New — confirmed at kickoff; can be blank |

## Table: StageOrder
Source file: `data/StageOrder.csv`

A small reference table used only to sort `Stage` correctly in charts
(left to right, matching the digital board) instead of alphabetically.

| Column | Data Type | Description | Example |
|---|---|---|---|
| Stage | Text | Must exactly match `OpenOrders.Stage` and `PhaseLog.Stage` — used to join tables | `Deflash` |
| SortOrder | Whole number | Position of the stage in the process, 1 = earliest | `4` |

### Valid Stage values (in process order — confirmed at kickoff)
| SortOrder | Stage | Meaning |
|---|---|---|
| 1 | Back Log | Order received, not yet started |
| 2 | Production | Actively being manufactured |
| 3 | Deflash Queue | Waiting for a Deflash slot |
| 4 | Deflash | Post-production finishing step — the stage needing the most attention |
| 5 | To Do | Queued after Deflash, ahead of Final Inspection |
| 6 | Final Inspection Queue | Waiting for an inspection slot |
| 7 | Final Inspection | Quality check before shipping |
| 8 | Packaging | New stage not on the original physical board |
| 9 | Awaiting Ship | Packed and staged, waiting to leave the building |
| 10 | Shipped | Shipment confirmed, order closed out |

This replaces the original 7-stage physical-board sequence
(Back Log → To Do → Production → Deflash → Final Inspection → Shipping
→ Completed), which is kept for reference in `ProcessFlowDiagram.html`.

## Table: PhaseLog
Source file: `data/PhaseLog.csv`

One row per phase a card has passed through, with its start/stop
timestamp — this is what makes per-phase cycle time and "time in
limbo" possible. New table, confirmed at kickoff (start/stop buttons
per phase, standardized timestamp format, called out specifically for
Deflash).

| Column | Data Type | Description | Example |
|---|---|---|---|
| CardNumber | Whole number | Joins to `OpenOrders.CardNumber` | `104` |
| SO_Number | Text | Carried along for readability/filtering | `SO-7818` |
| Stage | Text | Which of the 10 stages this row logs | `Deflash` |
| PhaseStart | Date/time | When the order entered this phase (Start button) | `2026-09-14T15:05:00` |
| PhaseStop | Date/time | When the order left this phase (Stop button); blank if still in progress | `2026-09-16T10:00:00` |

## Derived columns (added in Power Query — see `PowerQuery.m`)

### On OpenOrders
| Column | Data Type | Description | Logic |
|---|---|---|---|
| StageSortOrder | Whole number | Brought in from StageOrder via join | Lookup on `Stage` |
| OrderStatus | Text | Overdue / On Track / Shipped / Cancelled | `Shipped` if Stage = Shipped; `Cancelled` if Status = Cancelled; else `Overdue` if DueDate is in the past; else `On Track` |
| DaysUntilDue | Whole number | Days between today and the due date | Negative = overdue, positive = days remaining |
| IsDeflashFlag | True/False | The Deflash rework/hold visual flag confirmed at kickoff | True if Stage is Deflash Queue or Deflash AND Status is Rework or Hold |

### On PhaseLog
| Column | Data Type | Description | Logic |
|---|---|---|---|
| PhaseDurationHours | Number | Hours actually spent in that phase | `PhaseStop - PhaseStart`; blank while still in progress |
| LimboHours | Number | Idle time between the previous phase's stop and this phase's start | Blank for a card's first logged phase (nothing before it) |

## Relationships
- `OpenOrders[Stage]` → `StageOrder[Stage]` (many-to-one, used for sorting)
- `OpenOrders[CardNumber]` → `PhaseLog[CardNumber]` (one-to-many, used
  for cycle-time and time-in-limbo measures)

## Still open (see `RequirementsDocument.md` Section 11)
- How far back does the real Excel/CSV history go?
- Does Part Family already exist in an existing company system, or does it need
  to be defined from scratch?
- Exact rules for which issues route a Deflash order to Rework vs. Hold
- Ownership/timeline for the API + SharePoint + SQL architecture
