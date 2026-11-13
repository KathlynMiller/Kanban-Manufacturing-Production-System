# Kanban Manufacturing System — Dashboard Requirements Document

## 1. Business Objective
Replace visual tracking currently done on a physical whiteboard Kanban
board with a Power BI dashboard that gives leadership and production
staff real-time visibility into open work orders, where they sit in
the production process, and which ones are at risk of missing their
due date. **From the Phase 1 kickoff:** the point of the project is to
make sure every order finishes by its due date — including orders that
need rework, which need extra attention to stay on time too.

## 2. Stakeholders & Roles
| Role | Interest | Status |
|---|---|---|
| Kanban Manufacturing System leadership / executives | Use the dashboard to decide what changes need to be made | Confirmed — Phase 1 kickoff |
| Production floor supervisors | Focused on making the part; day-to-day production view | Confirmed — Phase 1 kickoff |
| Operators | Track the phases; move a work order to the next stage | Confirmed — Phase 1 kickoff |
| Project owner (you) | Build, validate, and present the dashboard | Confirmed |

**Answered at Phase 1 kickoff:** all three roles need a view, each with
a different focus — this points to one dashboard with role-based views
rather than a single flat report.

**Access:** only **Leads** get access for now. This is a new shift from
handwork to digital — floor staff won't be shown the digital board yet,
until it's confirmed to line up with the physical Kanban board.

## 3. Current State (As-Is Process)
Kanban Manufacturing System currently tracks open work orders using a physical corkboard
Kanban board with sticky notes. Each note represents one work order
and carries: **Sales Order # (SO#), Part Number (PN), Quantity, and
Due/Delivery Date**, written by hand.

The board has 7 columns, representing the stages a work order passes
through in order:

**Back Log → To Do → Production → Deflash → Final Inspection → Shipping → Completed**

A note is physically moved to the next column as work progresses. There is
also a printed schedule sheet pinned to the board and a separate process-flow
diagram on the wall, referenced but not part of the sticky-note data itself.

**Answered at Phase 1 kickoff:** Operators are responsible for moving a
work order to the next stage — "Stage" is a manual, operator-driven
field, not an automatic system event.

**Answered in part:** Rework routes an order back depending on the
issue found at **Deflash** — not a simple forward skip. Bottleneck
flagged: Back Log builds up ahead of **Deflash** and **Production** —
these are the two queues to watch. Deflash was specifically called out
as the stage needing the most attention.

### 3a. Digital-Board Sequence — confirmed 2026-09-17
This came out of the kickoff as a list and has now been **confirmed**
as the sequence for the digital board and the Power BI data model:

**Back Log → Production → Deflash Queue → Deflash → To Do → Final Inspection Queue → Final Inspection → Packaging → Awaiting Ship → Shipped**

It reorders Production ahead of To Do, splits Deflash and Final
Inspection each into a queue + active stage, and adds Packaging as a
new stage versus the original physical 7-stage board (kept above, in
3, for reference and as the vocabulary check in Requirement 7).
`StageOrder.csv`, `PowerQuery.m`, `Measures.dax`, and `DataDictionary.md`
have been rebuilt around this sequence.

## 4. Goals / Success Criteria
- Every open work order visible in one place, without walking to the board
- Overdue orders are immediately obvious (not something you have to notice by eye)
- Leadership can see production status without asking the floor for an update
- Dashboard reflects the confirmed 10-stage digital sequence (3a),
  which keeps the physical board's core stage names (Back Log,
  Production, Deflash, Final Inspection) so it's still recognizable to
  anyone who already reads the whiteboard, even with the added queue
  and Packaging stages
- Real-time visibility, with finish-by dates flashed on screen for
  Shipping, Production, Deflash, and Final Inspection so weekly
  deadlines are clear

## 5. Functional Requirements
The dashboard must:

1. Show total open orders, broken down by stage, in the correct
   left-to-right order (Back Log → ... → Shipped) — not alphabetical
2. Flag orders that are **overdue** (due date has passed and the order
   isn't Shipped)
3. Show orders **due within the next 7 days** as an early warning
4. Show **work-in-process (WIP)** — orders actively being worked, excluding
   Back Log (not started) and Shipped (finished)
5. Allow filtering/drilling by Part Number or Part Family
6. Show total quantity in production, not just order count (a 15,000-unit
   order and a 200-unit order are not equally significant)
7. Be understandable at a glance by someone who has only ever used the
   physical whiteboard — same stage names, same vocabulary
8. Track statuses beyond the 7 stages: **Hold**, **Rework**,
   **Cancelled**, and **Waiting for Raw Materials**
9. Timestamp the start and stop of every phase, in a standardized
   format — called out specifically for Deflash — to measure cycle time
10. Flag an order **overdue against cycle time**, separate from due-date
    overdue: target cycle time for a full production run is **4–5 days**;
    longer than that counts as overdue
11. Track **time in limbo** — how long an order sits idle *between*
    phases, not just time spent actively in a phase
12. Track raw-material stock and which material is currently running,
    plus a lead count of orders waiting on material at Back Log
13. Support the volume Kanban Manufacturing System actually runs — roughly **10 orders/week**
    — and keep the workload view concise rather than dense

### 5a. Digital Card & Board Design (from the kickoff)
Per-order "card" behavior the digital board needs to support:
- **Card-number ID:** each work order carries a card number so it can be tracked and selected individually
- **Card selector:** a person can pick which card/work order they're currently working on
- **Start / stop buttons:** timestamp when a phase begins and ends, for every phase
- **Problem notes:** a free-text notes field on the card for logging issues with that order
- **Deflash flag:** the Deflash card needs a clear Rework / Hold indicator

**Production status colors:** Waiting for Raw Material, In Process, Rework, Cancelled, Delay — each gets a distinct color on the dashboard.

## 6. Data Requirements
| Field | Description | Source (current) |
|---|---|---|
| CardNumber | Card/order ID, selectable per person working it | New — confirmed at kickoff |
| SO_Number | Sales Order number, unique per order line | Sticky note |
| PartNumber | Manufactured part identifier | Sticky note |
| PartFamily | Part grouping/category | Not currently on notes — still open whether the current company system has this |
| Quantity | Units ordered | Sticky note |
| DueDate | Date the order is due/should ship | Sticky note |
| Stage | Current Kanban column (one of the 10 confirmed in 3a) | Sticky note (physical position) |
| Status | Hold / Rework / Cancelled / Waiting for Raw Materials | New — confirmed at kickoff |
| Notes | Free-text problem notes on the card | New — confirmed at kickoff |
| PhaseStart / PhaseStop | Timestamp per phase (standardized format), one row per phase per card | New — confirmed at kickoff |

**Data dictionary, Power Query, and sample data are built around the
confirmed schema:** see `data/OpenOrders.csv`, `data/StageOrder.csv`,
`data/PhaseLog.csv`, and `PowerQuery.m` in this folder, and
`DataDictionary.md` for full column definitions. `OpenOrders` holds
current state (CardNumber, Status, Notes included); `PhaseLog` is a
new long-format table holding per-phase start/stop timestamps, which
is what makes cycle-time and time-in-limbo measures possible.

**Answered at Phase 1 kickoff:**
- Real data lives in Excel spreadsheets, kept/exported as CSV files.
  SQL is confirmed separately as the source behind maintenance data.
- Timestamp data for phase start/stop is confirmed as crucial and is
  planned per material, per phase.

**Still open:**
- How far back does the Excel/CSV history go?
- Does Part Family already exist in a system, or does it need to be
  defined from scratch?
- Exact rules for which issues route a Deflash order to Rework vs. Hold

## 7. Non-Functional Requirements
- **Refresh cadence:** real-time is the goal, confirmed at kickoff
- **Access:** Leads only for now (see Section 2) — confirm broader
  floor access once the digital board is validated against the
  physical one
- **Usability:** must be readable by non-technical floor staff, not
  just analysts — keep the workload view concise, not dense

## 8. Assumptions
- The 7 Kanban stages observed in the board photos reflect the
  physical process and remain the vocabulary floor staff know; the
  digital board's 10-stage sequence (3a, confirmed) is a superset —
  Production, Deflash, and Final Inspection all still appear, so
  Requirement 7 ("same vocabulary as the whiteboard") still holds for
  the stages people already recognize
- "Due Date" on a note means the same thing across all stages (it
  isn't a mix of due dates and delivery dates that mean different things)
- One sticky note = one order line, with no notes representing
  partial/split shipments

## 9. Constraints
- Class/capstone project timeline (confirm deadline with instructor/guide)
- **Architecture direction from kickoff:** an **API** feed for the
  Kanban board, **Power BI** reporting on top of **SharePoint**, and
  **SQL** behind the maintenance data. This points to an interactive,
  connected build rather than a flat CSV-only starting point — revises
  the earlier assumption of "no direct system integration."

## 10. Out of Scope (for now)
- Automating the physical board itself (e.g., barcode scanning) —
  this project is about visualizing existing data, not changing how
  the floor operates
- Predictive/forecasting features (e.g., predicting future delays) —
  can be a "lessons learned / future work" note in the final presentation
- Floor-staff access to the digital board — Leads only until it's
  validated against the physical board

## 11. Open Questions Checklist for Phase 1 Meeting
- [x] Who is the dashboard's primary audience? — **All three:** operators, supervisors, executives, each with a role-based view
- [x] What triggers a work order to move between stages? — **Operators**, manually
- [x] Are there statuses beyond the 7 observed (on hold, rework, cancelled)? — **Yes:** Hold, Rework, Cancelled, Waiting for Raw Materials
- [x] Where does the real data live today (system vs. spreadsheet vs. whiteboard only)? — **Excel/CSV exports**; SQL behind maintenance data
- [x] How often should the dashboard refresh? — **Real-time** is the goal
- [x] Who needs access, and does that require any security/permission setup? — **Leads only**, for now

**New open questions from the kickoff:**
- [x] Confirm the proposed 10-column digital sequence (Section 3a) against the physical board before it's locked into the data model — **confirmed 2026-09-17**, data model rebuilt around it
- [ ] Where does Part Family come from — does it need to be defined from scratch?
- [ ] How far back does the Excel/CSV history go?
- [ ] Exact rules for what routes a Deflash order to Rework vs. Hold
- [ ] Who owns building/maintaining each piece of the API + SharePoint + SQL architecture, and on what timeline?
