// Kanban Manufacturing System — digital Kanban board prototype.
// Stage sequence and fields below come straight from the Phase 1 kickoff
// notes (see kickoff.txt / RequirementsDocument.md). The 10-stage sequence
// was confirmed against the physical 7-stage board on 2026-09-17 and
// matches the rebuilt Power BI data model (StageOrder.csv / PowerQuery.m).
//
// The board loads its data straight from the same CSVs the Power BI
// model reads (powerbi/data/OpenOrders.csv + PhaseLog.csv) instead of a
// separately hand-maintained JSON file, so this prototype and the Power
// BI report can't drift apart. Edits made on the board (drag a card,
// start/stop a phase, add an order) only live in the browser tab's
// memory — there's no write-back to the CSVs from here.

const STAGES = [
  { key: "backlog", label: "Back Log" },
  { key: "production", label: "Production" },
  { key: "deflash-queue", label: "Deflash Queue" },
  { key: "deflash", label: "Deflash" },
  { key: "todo", label: "To Do" },
  { key: "final-queue", label: "Final Inspection Queue" },
  { key: "final", label: "Final Inspection" },
  { key: "packaging", label: "Packaging" },
  { key: "awaiting-ship", label: "Awaiting Ship" },
  { key: "shipped", label: "Shipped" },
];

const STATUSES = {
  "in-process": { label: "In Process", color: "#2f7a52" },
  "waiting-material": { label: "Waiting for Raw Material", color: "#c9a13b" },
  "rework": { label: "Rework", color: "#8a5a9a" },
  "hold": { label: "Hold", color: "#5a6c8a" },
  "cancelled": { label: "Cancelled", color: "#8a5044" },
};

const CYCLE_TARGET_DAYS = 4.5; // 4–5 day target confirmed at kickoff
const FINAL_STAGE = "shipped";
const BATCH_SIZE = 10; // batch threshold per column — Start stays clickable below this, just flagged

const OPEN_ORDERS_CSV = "powerbi/data/OpenOrders.csv";
const PHASE_LOG_CSV = "powerbi/data/PhaseLog.csv";

// Used only if the CSVs can't be loaded (e.g. opening index.html directly
// by double-click, where browsers block fetching local files).
const FALLBACK_TASKS = [
  { id: 1, so: "SO-0001", partNumber: "SAMPLE-1", partFamily: "Sample", quantity: 100, dueDate: "2026-09-25", stage: "backlog", status: "in-process", notes: "", phaseLog: {} },
];

let tasks = [];
let activeCardId = null;

// Minimal CSV parser — handles quoted fields, embedded commas, and
// doubled-quote escaping ("" inside a quoted field), which is all
// OpenOrders.csv/PhaseLog.csv need (see the Notes column).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows
    .filter((r) => r.length === headers.length && r.some((v) => v !== ""))
    .map((r) => Object.fromEntries(headers.map((h, idx) => [h, r[idx]])));
}

async function loadTasks() {
  try {
    const [ordersText, phaseText] = await Promise.all([
      fetch(OPEN_ORDERS_CSV).then((r) => r.text()),
      fetch(PHASE_LOG_CSV).then((r) => r.text()),
    ]);

    const labelToStageKey = Object.fromEntries(STAGES.map((s) => [s.label, s.key]));
    const labelToStatusKey = Object.fromEntries(
      Object.entries(STATUSES).map(([key, meta]) => [meta.label, key])
    );

    const phaseLogByCard = {};
    parseCsv(phaseText).forEach((row) => {
      const stageKey = labelToStageKey[row.Stage];
      if (!stageKey) return;
      const id = row.CardNumber;
      if (!phaseLogByCard[id]) phaseLogByCard[id] = {};
      phaseLogByCard[id][stageKey] = {
        start: row.PhaseStart || null,
        stop: row.PhaseStop || null,
      };
    });

    const orderRows = parseCsv(ordersText);
    if (!orderRows.length) throw new Error("OpenOrders.csv had no rows");

    tasks = orderRows.map((row) => ({
      id: Number(row.CardNumber),
      so: row.SO_Number,
      partNumber: row.PartNumber,
      partFamily: row.PartFamily,
      quantity: Number(row.Quantity) || 0,
      dueDate: row.DueDate,
      stage: labelToStageKey[row.Stage] || STAGES[0].key,
      status: labelToStatusKey[row.Status] || "in-process",
      notes: row.Notes || "",
      phaseLog: phaseLogByCard[row.CardNumber] || {},
    }));
  } catch (err) {
    tasks = FALLBACK_TASKS;
  }
  render();
  setInterval(updateLiveTimers, 30000);
}

function stageIndex(stageKey) {
  return STAGES.findIndex((s) => s.key === stageKey);
}

function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) return `${hrs}h ${remMins}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

function dueStatus(task) {
  if (task.status === "cancelled") return { label: "Cancelled", className: "due-cancelled" };
  if (task.stage === FINAL_STAGE) return { label: "Shipped", className: "due-done" };
  const due = new Date(task.dueDate + "T00:00:00");
  const daysUntil = (due - new Date()) / 86400000;
  if (daysUntil < 0) return { label: "Overdue", className: "due-overdue" };
  if (daysUntil <= 7) return { label: "Due soon", className: "due-soon" };
  return { label: "On track", className: "due-ontrack" };
}

function cycleTimeStatus(task) {
  const firstLog = Object.values(task.phaseLog || {})[0];
  if (!firstLog || !firstLog.start || task.stage === FINAL_STAGE || task.status === "cancelled") return null;
  const elapsedDays = (Date.now() - new Date(firstLog.start)) / 86400000;
  return elapsedDays > CYCLE_TARGET_DAYS
    ? { label: `${elapsedDays.toFixed(1)}d in production — over the ${CYCLE_TARGET_DAYS}d target`, over: true }
    : { label: `${elapsedDays.toFixed(1)}d in production`, over: false };
}

function limboInfo(task) {
  const idx = stageIndex(task.stage);
  const currentLog = task.phaseLog[task.stage];
  if (currentLog && currentLog.start) return null; // already started this phase, not in limbo
  if (idx === 0) return null; // Back Log has nothing before it
  const prevKey = STAGES[idx - 1].key;
  const prevLog = task.phaseLog[prevKey];
  if (!prevLog || !prevLog.stop) return null;
  return new Date(prevLog.stop).getTime();
}

function render() {
  const boardEl = document.getElementById("board");
  boardEl.innerHTML = "";
  STAGES.forEach((stage) => {
    const col = document.createElement("section");
    col.className = "column";
    col.dataset.stage = stage.key;
    const stageTasks = tasks.filter((t) => t.stage === stage.key);
    const batchReady = stageTasks.length >= BATCH_SIZE;
    col.innerHTML = `<h2>${stage.label} <span class="count ${batchReady ? "batch-ready" : "batch-low"}" title="Batch threshold is ${BATCH_SIZE} orders">${stageTasks.length}/${BATCH_SIZE}</span></h2><div class="task-list"></div>`;
    const list = col.querySelector(".task-list");
    stageTasks.forEach((task) => list.appendChild(createCard(task)));
    boardEl.appendChild(col);
  });
  renderCardSelector();
  updateLiveTimers();
}

function renderCardSelector() {
  const select = document.getElementById("card-selector");
  const currentValue = activeCardId;
  select.innerHTML = '<option value="">— none —</option>';
  tasks.forEach((task) => {
    const opt = document.createElement("option");
    opt.value = task.id;
    opt.textContent = `#${task.id} · ${task.so}`;
    select.appendChild(opt);
  });
  select.value = currentValue || "";
}

function createCard(task) {
  const card = document.createElement("div");
  card.className = "task-card";
  card.dataset.id = task.id;
  if (String(task.id) === String(activeCardId)) card.classList.add("active-card");

  const idx = stageIndex(task.stage);
  const status = STATUSES[task.status];
  const due = dueStatus(task);
  const cycle = cycleTimeStatus(task);
  const currentLog = task.phaseLog[task.stage] || {};
  const limboSince = limboInfo(task);
  const isDeflashFlag = (task.stage === "deflash-queue" || task.stage === "deflash") && (task.status === "rework" || task.status === "hold");
  const stageCount = tasks.filter((t) => t.stage === task.stage).length;
  const batchReady = stageCount >= BATCH_SIZE;
  const nextStage = STAGES[idx + 1];

  card.style.borderLeftColor = status.color;

  card.innerHTML = `
    ${isDeflashFlag ? `<div class="deflash-flag ${task.status}">&#9873; ${status.label.toUpperCase()} — needs attention before continuing</div>` : ""}
    <div class="card-top">
      <span class="card-id">#${task.id}</span>
      <span class="due-badge ${due.className}">${due.label}</span>
    </div>
    <h3>${task.so}</h3>
    <p class="meta">${task.partNumber} &middot; ${task.partFamily} &middot; ${task.quantity.toLocaleString()} units</p>
    <p class="meta">Due ${task.dueDate}${task.startDate ? ` &middot; Start ${task.startDate}` : ""}${task.endDate ? ` &middot; End ${task.endDate}` : ""}</p>

    <label class="status-row">
      <span class="dot" style="background:${status.color}"></span>
      <select class="status-select">
        ${Object.entries(STATUSES).map(([key, meta]) => `<option value="${key}" ${key === task.status ? "selected" : ""}>${meta.label}</option>`).join("")}
      </select>
    </label>

    ${cycle ? `<p class="cycle-note ${cycle.over ? "over" : ""}">${cycle.label}</p>` : ""}

    <div class="phase-block">
      <div class="phase-timer">
        ${currentLog.start
          ? currentLog.stop
            ? `<span>Phase done in <b>${formatDuration(new Date(currentLog.stop) - new Date(currentLog.start))}</b></span>`
            : `<span>In phase <b class="elapsed" data-since="${new Date(currentLog.start).getTime()}"></b></span>`
          : limboSince
            ? `<span class="limbo">Waiting to start — <b class="elapsed" data-since="${limboSince}"></b> in limbo</span>`
            : `<span class="limbo">Not started</span>`}
      </div>
      ${!batchReady ? `<p class="batch-warning">&#9888; ${stageCount}/${BATCH_SIZE} queued in ${STAGES[idx].label} &mdash; below full batch size, starting early</p>` : ""}
      <div class="phase-actions">
        <button class="start-btn" ${currentLog.start ? "disabled" : ""} title="${batchReady ? "Batch ready" : `Only ${stageCount} of ${BATCH_SIZE} queued in this column — still startable`}">Start</button>
        <button class="stop-btn" ${!currentLog.start || currentLog.stop ? "disabled" : ""} title="${nextStage ? `Finishes this phase and moves the card to ${nextStage.label}` : "Finishes this phase"}">Stop</button>
      </div>
    </div>

    <details class="notes-toggle">
      <summary>Problem notes ${task.notes ? "&#9998;" : ""}</summary>
      <textarea class="notes-field" placeholder="Log an issue with this order...">${task.notes || ""}</textarea>
    </details>

    <div class="card-actions">
      <button class="move-left" ${idx === 0 ? "disabled" : ""}>&larr;</button>
      <button class="select-btn">${String(task.id) === String(activeCardId) ? "Working on this" : "Select"}</button>
      <button class="delete-btn">Delete</button>
      <button class="move-right" ${idx === STAGES.length - 1 ? "disabled" : ""}>&rarr;</button>
    </div>
  `;

  card.querySelector(".move-left").addEventListener("click", () => moveTask(task.id, -1));
  card.querySelector(".move-right").addEventListener("click", () => moveTask(task.id, 1));
  card.querySelector(".delete-btn").addEventListener("click", () => deleteTask(task.id));
  card.querySelector(".status-select").addEventListener("change", (e) => setStatus(task.id, e.target.value));
  card.querySelector(".start-btn").addEventListener("click", () => startPhase(task.id));
  card.querySelector(".stop-btn").addEventListener("click", () => stopPhase(task.id));
  card.querySelector(".select-btn").addEventListener("click", () => setActiveCard(task.id));
  card.querySelector(".notes-field").addEventListener("change", (e) => setNotes(task.id, e.target.value));

  return card;
}

function updateLiveTimers() {
  document.querySelectorAll(".elapsed[data-since]").forEach((el) => {
    const since = Number(el.dataset.since);
    el.textContent = formatDuration(Date.now() - since);
  });
}

function moveTask(id, direction) {
  const task = tasks.find((t) => t.id === id);
  const newIndex = stageIndex(task.stage) + direction;
  if (newIndex < 0 || newIndex >= STAGES.length) return;

  const currentLog = task.phaseLog[task.stage];
  if (currentLog && currentLog.start && !currentLog.stop) {
    currentLog.stop = new Date().toISOString();
  }

  task.stage = STAGES[newIndex].key;
  if (!task.phaseLog[task.stage]) task.phaseLog[task.stage] = { start: null, stop: null };
  render();
}

function startPhase(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task.phaseLog[task.stage]) task.phaseLog[task.stage] = {};
  task.phaseLog[task.stage].start = new Date().toISOString();
  task.phaseLog[task.stage].stop = null;
  render();
}

function stopPhase(id) {
  const task = tasks.find((t) => t.id === id);
  const log = task.phaseLog[task.stage];
  if (!log || !log.start || log.stop) return;
  log.stop = new Date().toISOString();

  // Stop finishes the phase and advances the card to the next cycle —
  // the new phase doesn't auto-start, so Start still gates it manually.
  const idx = stageIndex(task.stage);
  if (idx < STAGES.length - 1) {
    task.stage = STAGES[idx + 1].key;
    if (!task.phaseLog[task.stage]) task.phaseLog[task.stage] = { start: null, stop: null };
  }
  render();
}

function setStatus(id, status) {
  const task = tasks.find((t) => t.id === id);
  task.status = status;
  render();
}

function setNotes(id, notes) {
  const task = tasks.find((t) => t.id === id);
  task.notes = notes;
}

function setActiveCard(id) {
  activeCardId = String(activeCardId) === String(id) ? null : id;
  render();
}

function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  if (String(activeCardId) === String(id)) activeCardId = null;
  render();
}

function addTask(so, partNumber, partFamily, quantity, dueDate, startDate, endDate) {
  const newId = tasks.length ? Math.max(...tasks.map((t) => t.id)) + 1 : 101;
  tasks.push({
    id: newId,
    so,
    partNumber,
    partFamily,
    quantity,
    dueDate,
    startDate: startDate || "",
    endDate: endDate || "",
    stage: "backlog",
    status: "in-process",
    notes: "",
    phaseLog: { backlog: { start: new Date().toISOString(), stop: null } },
  });
  render();
}

document.getElementById("add-task-form").addEventListener("submit", (event) => {
  event.preventDefault();
  // Start/end date fields are optional and don't exist on every page that
  // shares this form (e.g. index-original.html) — read them defensively.
  const field = (id) => document.getElementById(id)?.value || "";
  const so = field("new-so").trim();
  const partNumber = field("new-part-number").trim();
  const partFamily = field("new-part-family").trim();
  const quantity = Number(field("new-quantity"));
  const dueDate = field("new-due-date");
  const startDate = field("new-start-date");
  const endDate = field("new-end-date");
  if (!so || !dueDate) return;
  addTask(so, partNumber, partFamily, quantity || 0, dueDate, startDate, endDate);
  event.target.reset();
});

document.getElementById("card-selector").addEventListener("change", (e) => {
  activeCardId = e.target.value || null;
  render();
});

loadTasks();
