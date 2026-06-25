const state = {
  data: null,
  activeView: "airframe",
  selectedHotspot: null,
  selectedSystem: "airframe",
  selectedFailure: null,
  oralIndex: 0,
  memorySequence: []
};

const checklistGroups = [
  {
    title: "Exterior Walkaround",
    items: ["Airframe condition", "Fuel caps and vents", "Wing leading edges", "Flaps and ailerons", "Tail surfaces", "Landing gear and tires"]
  },
  {
    title: "Cockpit Setup",
    items: ["Documents and equipment", "Circuit breakers", "Fuel selector", "G1000 power-up", "Engine and FADEC indications", "Flight controls"]
  },
  {
    title: "Technical Brief",
    items: ["Fuel quantity and type", "Electrical sources", "FADEC test concept", "Flap limits", "Abnormal priorities", "Current approved checklist"]
  }
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function init() {
  const response = await fetch("data/c172-data.json");
  state.data = await response.json();

  applyStoredTheme();
  bindNavigation();
  bindTheme();
  renderNotice();
  renderHomeFacts();
  renderHotspots();
  renderSystems();
  renderFailures();
  renderChecklists();
  renderOral();
  renderMemory();

  selectHotspot(state.data.hotspots[0].id);
  selectSystem("airframe");
  selectFailure(state.data.failures[0].id);
}

function applyStoredTheme() {
  const stored = localStorage.getItem("c172TrainerTheme");
  document.body.classList.toggle("light", stored === "light");
}

function bindTheme() {
  $("#themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("light");
    localStorage.setItem("c172TrainerTheme", document.body.classList.contains("light") ? "light" : "dark");
  });
}

function bindNavigation() {
  $$(".nav-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeView = button.dataset.view;
      $$(".nav-button").forEach((item) => item.classList.toggle("active", item === button));
      $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${state.activeView}`));
    });
  });

  const systemFilter = $("#systemFilter");
  if (systemFilter) {
    systemFilter.addEventListener("change", (event) => {
      const value = event.target.value;
      $$(".hotspot").forEach((button) => {
        button.classList.toggle("hidden", value !== "all" && button.dataset.system !== value);
      });
    });
  }
}

function renderNotice() {
  $("#studyNotice").textContent = state.data.meta.notice;
}

function renderHomeFacts() {
  const dimensions = [
    { label: "Wingspan", value: "36 ft 1 in" },
    { label: "Length", value: "27 ft 2 in" },
    { label: "Height", value: "8 ft 11 in" }
  ];

  $("#homeFacts").innerHTML = [...dimensions, ...state.data.quickFacts].map((fact) => `
    <div class="fact"><strong>${escapeHtml(fact.label)}</strong><span>${escapeHtml(fact.value)}</span></div>
  `).join("");
}

function renderHotspots() {
  const layer = $("#hotspotLayer");
  layer.innerHTML = state.data.hotspots.map((spot) => `
    <button
      class="hotspot"
      type="button"
      data-id="${spot.id}"
      data-system="${spot.system}"
      style="left:${spot.x}%; top:${spot.y}%"
      aria-label="${escapeHtml(spot.label)}"
      title="${escapeHtml(spot.label)}"
    ></button>
  `).join("");

  $$(".hotspot").forEach((button) => {
    button.addEventListener("click", () => selectHotspot(button.dataset.id));
  });
}

function selectHotspot(id) {
  const spot = state.data.hotspots.find((item) => item.id === id);
  if (!spot) return;
  state.selectedHotspot = id;
  $$(".hotspot").forEach((button) => button.classList.toggle("active", button.dataset.id === id));

  $("#hotspotPanel").innerHTML = `
    <p class="eyebrow">${escapeHtml(spot.system)}</p>
    <h2>${escapeHtml(spot.label)}</h2>
    <p>${escapeHtml(spot.summary)}</p>
    <ul>${spot.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}</ul>
    <div class="score-box"><strong>Study link</strong><br>${escapeHtml(spot.check)}</div>
  `;
}

function renderSystems() {
  const grid = $("#systemsGrid");
  grid.innerHTML = state.data.systems.map((system) => `
    <button class="system-card" type="button" data-id="${system.id}">
      <h3><span class="system-dot ${system.tone}"></span>${escapeHtml(system.name)}</h3>
      <p>${escapeHtml(system.headline)}</p>
    </button>
  `).join("");

  $$(".system-card").forEach((card) => {
    card.addEventListener("click", () => selectSystem(card.dataset.id));
  });
}

function selectSystem(id) {
  const system = state.data.systems.find((item) => item.id === id);
  if (!system) return;
  state.selectedSystem = id;
  $$(".system-card").forEach((card) => card.classList.toggle("active", card.dataset.id === id));

  $("#systemDetail").innerHTML = `
    <p class="eyebrow">${escapeHtml(system.status)}</p>
    <h2>${escapeHtml(system.name)}</h2>
    <p>${escapeHtml(system.headline)}</p>
    <div class="tag-row">${system.components.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>
    <h3>What to know</h3>
    <ul>${system.learn.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h3>Oral prompts</h3>
    <ul>${system.oral.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  `;
}

function renderFailures() {
  $("#failureList").innerHTML = state.data.failures.map((failure) => `
    <button class="failure-card" type="button" data-id="${failure.id}">
      <h3>${escapeHtml(failure.title)}</h3>
      <p>${escapeHtml(failure.indication)}</p>
    </button>
  `).join("");

  $$(".failure-card").forEach((card) => {
    card.addEventListener("click", () => selectFailure(card.dataset.id));
  });
}

function selectFailure(id) {
  const failure = state.data.failures.find((item) => item.id === id);
  if (!failure) return;
  state.selectedFailure = id;
  $$(".failure-card").forEach((card) => card.classList.toggle("active", card.dataset.id === id));

  $("#failurePanel").innerHTML = `
    <p class="eyebrow">${escapeHtml(failure.system)}</p>
    <h2>${escapeHtml(failure.title)}</h2>
    <p><strong>Expected indication</strong><br>${escapeHtml(failure.indication)}</p>
    <p><strong>Risk</strong><br>${escapeHtml(failure.risk)}</p>
    <div class="score-box"><strong>Response placeholder</strong><br>${escapeHtml(failure.studyResponse)}</div>
  `;
}

function renderChecklists() {
  $("#checklistGrid").innerHTML = checklistGroups.map((group) => `
    <article class="checklist-card">
      <p class="eyebrow">Study checklist</p>
      <h2>${escapeHtml(group.title)}</h2>
      <ul>${group.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>
  `).join("");
}

function renderOral() {
  $("#showModel").addEventListener("click", () => {
    const question = state.data.oralQuestions[state.oralIndex];
    $("#modelAnswer").innerHTML = `
      <p class="eyebrow">Model answer</p>
      <h2>Compare your structure</h2>
      <p>${escapeHtml(question.model)}</p>
    `;
  });

  $("#nextQuestion").addEventListener("click", () => {
    state.oralIndex = (state.oralIndex + 1) % state.data.oralQuestions.length;
    $("#oralAnswer").value = "";
    updateOralPrompt();
  });

  updateOralPrompt();
}

function updateOralPrompt() {
  const question = state.data.oralQuestions[state.oralIndex];
  $("#oralPrompt").textContent = question.prompt;
  $("#modelAnswer").innerHTML = `
    <p class="eyebrow">Hidden</p>
    <h2>Answer first</h2>
    <p>Write what you would say to an instructor, then reveal the model answer.</p>
  `;
}

function renderMemory() {
  const drill = state.data.memoryDrill;
  $("#memoryTitle").textContent = drill.title;
  $("#memoryPrompt").textContent = drill.prompt;
  $("#tileBank").innerHTML = drill.options.map((option) => `
    <button class="tile" type="button" data-value="${escapeHtml(option)}">${escapeHtml(option)}</button>
  `).join("");

  $$(".tile").forEach((tile) => {
    tile.addEventListener("click", () => {
      state.memorySequence.push(tile.dataset.value);
      tile.classList.add("used");
      updateMemorySequence();
    });
  });

  $("#resetMemory").addEventListener("click", () => {
    state.memorySequence = [];
    $$(".tile").forEach((tile) => tile.classList.remove("used"));
    updateMemorySequence();
    $("#memoryScore").textContent = "";
  });

  $("#checkMemory").addEventListener("click", checkMemory);
  updateMemorySequence();
}

function updateMemorySequence() {
  $("#memorySequence").innerHTML = state.memorySequence.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function checkMemory() {
  const answer = state.data.memoryDrill.answer;
  const selected = state.memorySequence;
  const correctComponents = selected.filter((item) => answer.includes(item)).length;
  const correctOrder = selected.filter((item, index) => item === answer[index]).length;
  const missing = answer.filter((item) => !selected.includes(item));
  const extra = selected.filter((item) => !answer.includes(item));

  $("#memoryScore").innerHTML = `
    <strong>${correctOrder}/${answer.length}</strong> in the correct position<br>
    ${correctComponents}/${answer.length} correct components selected<br>
    Missing: ${missing.length ? escapeHtml(missing.join(", ")) : "none"}<br>
    Extra: ${extra.length ? escapeHtml(extra.join(", ")) : "none"}
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init().catch((error) => {
  console.error(error);
  document.body.innerHTML = "<main class='app-shell'><div class='notice'>The trainer could not load its data file.</div></main>";
});
