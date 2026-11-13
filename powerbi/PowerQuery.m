// ============================================================
// Power Query (M) — Kanban Manufacturing System data model
// ============================================================
// Confirmed at the Phase 1 kickoff: 10-stage digital-board sequence,
// Status field (Hold / Rework / Cancelled / Waiting for Raw Materials),
// per-phase start/stop timestamps, and a card number per order.
//
// Three queries below, each its own table:
//   1. StageOrder  — lookup table, sorts Stage left-to-right on charts
//   2. OpenOrders  — one row per order, its current stage/status
//   3. PhaseLog    — one row per phase an order has been through,
//                    with start/stop timestamps (long/fact table —
//                    this is what makes per-phase timing and
//                    time-in-limbo possible without 20 wide columns)
//
// How to use in Power BI Desktop:
//   1. Home > Get Data > Text/CSV > select powerbi/data/StageOrder.csv
//   2. In the Power Query Editor, right-click the new query > Advanced
//      Editor > replace everything with the "StageOrder" query below
//      (update the file path to match where the CSV lives on your machine)
//   3. Repeat for OpenOrders.csv and PhaseLog.csv with their queries
//   4. In Model view, relate OpenOrders[CardNumber] -> PhaseLog[CardNumber]
//      (one-to-many) and OpenOrders[Stage] -> StageOrder[Stage]
//   5. Close & Apply
// ============================================================

// ============================================================
// Query: StageOrder (lookup table)
// ============================================================
let
    Source = Csv.Document(
        File.Contents("C:\Users\kfm24319\Downloads\KanBan\powerbi\data\StageOrder.csv"),
        [Delimiter=",", Columns=2, Encoding=65001, QuoteStyle=QuoteStyle.None]
    ),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    TypedColumns = Table.TransformColumnTypes(PromotedHeaders, {
        {"Stage", type text},
        {"SortOrder", Int64.Type}
    })
in
    TypedColumns


// ============================================================
// Query: OpenOrders
// ============================================================
let
    // 1. Load the raw CSV export (swap this path for the real Kanban Manufacturing System
    //    Excel/Open Order export once you have it — column names must match)
    Source = Csv.Document(
        File.Contents("C:\Users\kfm24319\Downloads\KanBan\powerbi\data\OpenOrders.csv"),
        [Delimiter=",", Columns=9, Encoding=65001, QuoteStyle=QuoteStyle.Csv]
    ),

    // 2. First row of the CSV holds the column names
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),

    // 3. Set proper data types so dates/numbers behave correctly in DAX
    TypedColumns = Table.TransformColumnTypes(PromotedHeaders, {
        {"CardNumber", Int64.Type},
        {"SO_Number", type text},
        {"PartNumber", type text},
        {"PartFamily", type text},
        {"Quantity", Int64.Type},
        {"DueDate", type date},
        {"Stage", type text},
        {"Status", type text},
        {"Notes", type text}
    }),

    // 4. Bring in the stage sort order (so Back Log -> Shipped sorts left
    //    to right on charts instead of sorting alphabetically)
    MergedStageOrder = Table.NestedJoin(
        TypedColumns, {"Stage"}, StageOrder, {"Stage"}, "StageOrderTable", JoinKind.LeftOuter
    ),
    ExpandedStageOrder = Table.ExpandTableColumn(
        MergedStageOrder, "StageOrderTable", {"SortOrder"}, {"StageSortOrder"}
    ),

    // 5. Add a calculated column flagging overdue orders.
    //    Shipped orders are never "overdue" — the work is done.
    AddedOrderStatus = Table.AddColumn(ExpandedStageOrder, "OrderStatus", each
        if [Stage] = "Shipped" then "Shipped"
        else if [Status] = "Cancelled" then "Cancelled"
        else if [DueDate] < DateTime.Date(DateTime.LocalNow()) then "Overdue"
        else "On Track"
    , type text),

    // 6. Add a "days until due" column — negative numbers mean it's overdue
    AddedDaysUntilDue = Table.AddColumn(AddedOrderStatus, "DaysUntilDue", each
        Duration.Days([DueDate] - DateTime.Date(DateTime.LocalNow()))
    , Int64.Type),

    // 7. Deflash rework/hold flag — confirmed at kickoff: the Deflash card
    //    needs a clear visual flag when it's in Rework or on Hold
    AddedDeflashFlag = Table.AddColumn(AddedDaysUntilDue, "IsDeflashFlag", each
        ([Stage] = "Deflash Queue" or [Stage] = "Deflash")
        and ([Status] = "Rework" or [Status] = "Hold")
    , type logical)

in
    AddedDeflashFlag


// ============================================================
// Query: PhaseLog
// ============================================================
// One row per phase an order has passed through, with its start/stop
// timestamp. PhaseStop is blank while the order is still in that phase.
let
    Source = Csv.Document(
        File.Contents("C:\Users\kfm24319\Downloads\KanBan\powerbi\data\PhaseLog.csv"),
        [Delimiter=",", Columns=5, Encoding=65001, QuoteStyle=QuoteStyle.Csv]
    ),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    TypedColumns = Table.TransformColumnTypes(PromotedHeaders, {
        {"CardNumber", Int64.Type},
        {"SO_Number", type text},
        {"Stage", type text},
        {"PhaseStart", type datetime},
        {"PhaseStop", type datetime}
    }),

    // Duration actually spent in the phase (blank while still in progress)
    AddedPhaseDuration = Table.AddColumn(TypedColumns, "PhaseDurationHours", each
        if [PhaseStop] = null then null else Duration.TotalHours([PhaseStop] - [PhaseStart])
    , type nullable number),

    // Time in limbo: the gap between the PREVIOUS phase's stop and this
    // phase's start, per order. Sort each order's phases chronologically,
    // then look at the row before it. Fine at this data volume — for a
    // much larger PhaseLog table, do this in SQL/DAX instead.
    GroupedByOrder = Table.Group(AddedPhaseDuration, {"CardNumber"}, {
        {"Phases", each Table.Sort(_, {{"PhaseStart", Order.Ascending}})}
    }),
    AddedLimbo = Table.AddColumn(GroupedByOrder, "PhasesWithLimbo", each
        let
            Sorted = Table.AddIndexColumn([Phases], "Idx", 0, 1),
            WithLimbo = Table.AddColumn(Sorted, "LimboHours", each
                if [Idx] = 0 then null
                else
                    let PreviousStop = Sorted{[Idx] - 1}[PhaseStop]
                    in if PreviousStop = null then null else Duration.TotalHours([PhaseStart] - PreviousStop)
            )
        in
            Table.RemoveColumns(WithLimbo, {"Idx"})
    ),
    ExpandedLimbo = Table.ExpandTableColumn(AddedLimbo, "PhasesWithLimbo",
        {"SO_Number", "Stage", "PhaseStart", "PhaseStop", "PhaseDurationHours", "LimboHours"}
    )
in
    ExpandedLimbo
