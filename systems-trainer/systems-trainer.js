const AUTH_KEY = "atpl_authenticated_v1";

const state = {
  data: null,
  activeSystemId: "fuel",
  mode: "diagram",
  selectedComponentId: "",
  scenarioId: "normal",
  flowRunning: false,
  activeFaults: new Set(),
  memorySequence: [],
  oralIndex: 0
};

const els = {
  studyNotice: document.getElementById("studyNotice"),
  systemGrid: document.getElementById("systemGrid"),
  workbench: document.getElementById("workbench"),
  activeSystemTitle: document.getElementById("activeSystemTitle"),
  activeSystemStatus: document.getElementById("activeSystemStatus"),
  modeTabs: document.getElementById("modeTabs"),
  themeToggle: document.getElementById("themeToggle"),
  detailTitle: document.getElementById("detailTitle"),
  detailBody: document.getElementById("detailBody"),
  scenarioSelect: document.getElementById("scenarioSelect"),
  scenarioTitle: document.getElementById("scenarioTitle"),
  scenarioBody: document.getElementById("scenarioBody"),
  flowToggle: document.getElementById("flowToggle"),
  faultGrid: document.getElementById("faultGrid"),
  faultNotes: document.getElementById("faultNotes"),
  resetFaults: document.getElementById("resetFaults"),
  memoryInstructions: document.getElementById("memoryInstructions"),
  memoryWorkspace: document.getElementById("memoryWorkspace"),
  tileBank: document.getElementById("tileBank"),
  memoryScore: document.getElementById("memoryScore"),
  memoryUndo: document.getElementById("memoryUndo"),
  memoryReset: document.getElementById("memoryReset"),
  memoryCheck: document.getElementById("memoryCheck"),
  oralPrompt: document.getElementById("oralPrompt"),
  oralAnswer: document.getElementById("oralAnswer"),
  showModelAnswer: document.getElementById("showModelAnswer"),
  modelAnswer: document.getElementById("modelAnswer"),
  nextOral: document.getElementById("nextOral"),
  clearOral: document.getElementById("clearOral")
};

const diagramTargets = {
  diagram: {
    board: document.getElementById("diagramBoard"),
    layer: document.getElementById("connectionLayer"),
    nodes: document.getElementById("nodeLayer")
  },
  flow: {
    board: document.getElementById("flowDiagramBoard"),
    layer: document.getElementById("flowConnectionLayer"),
    nodes: document.getElementById("flowNodeLayer")
  },
  faults: {
    board: document.getElementById("faultDiagramBoard"),
    layer: document.getElementById("faultConnectionLayer"),
    nodes: document.getElementById("faultNodeLayer")
  }
};

init();

async function init() {
  applyTheme();
  bindEvents();

  try {
    const response = await fetch("systems-data.json");
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    state.data = await response.json();
  } catch (error) {
    renderDataError(error);
    return;
  }

  els.studyNotice.textContent = state.data.metadata.studyNotice;
  renderSystemsMenu();
  selectSystem("fuel");
}

function bindEvents() {
  els.themeToggle.addEventListener("click", () => {
    localStorage.setItem("light", localStorage.getItem("light") === "1" ? "0" : "1");
    applyTheme();
  });

  els.modeTabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-mode]");
    if (!tab) return;
    setMode(tab.dataset.mode);
  });

  els.scenarioSelect.addEventListener("change", () => {
    state.scenarioId = els.scenarioSelect.value;
    renderFlowMode();
  });

  els.flowToggle.addEventListener("click", () => {
    state.flowRunning = !state.flowRunning;
    renderFlowMode();
  });

  els.resetFaults.addEventListener("click", () => {
    state.activeFaults.clear();
    renderFaultMode();
  });

  els.memoryUndo.addEventListener("click", () => {
    state.memorySequence.pop();
    renderMemoryWorkspace();
  });

  els.memoryReset.addEventListener("click", () => {
    state.memorySequence = [];
    els.memoryScore.hidden = true;
    renderMemoryWorkspace();
  });

  els.memoryCheck.addEventListener("click", scoreMemoryMode);

  els.showModelAnswer.addEventListener("click", () => {
    const question = getActiveSystem().oralQuestions[state.oralIndex];
    els.modelAnswer.hidden = false;
    els.modelAnswer.textContent = question.modelAnswer;
  });

  els.nextOral.addEventListener("click", () => {
    const questions = getActiveSystem().oralQuestions;
    state.oralIndex = (state.oralIndex + 1) % questions.length;
    renderOralMode();
  });

  els.clearOral.addEventListener("click", () => {
    els.oralAnswer.value = "";
    els.modelAnswer.hidden = true;
  });
}

function applyTheme() {
  const light = localStorage.getItem("light") === "1";
  document.body.classList.toggle("light", light);
  els.themeToggle.textContent = light ? "Light" : "Dark";
  els.themeToggle.title = light ? "Switch to dark mode" : "Switch to light mode";
}

function renderDataError(error) {
  els.systemGrid.innerHTML = `
    <article class="card notice">
      <strong>Could not load trainer data.</strong>
      <span>Open this addon through a local server or GitHub Pages so systems-data.json can be fetched. Error: ${escapeHtml(error.message)}</span>
    </article>
  `;
}

function renderSystemsMenu() {
  els.systemGrid.innerHTML = "";
  state.data.systems.forEach((system) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `system-card ${system.status === "ready" ? "" : "coming-soon"}`;
    card.style.setProperty("--accent", system.accent || "#22c55e");
    card.innerHTML = `
      <span class="small">${system.status === "ready" ? "Ready" : "Coming soon"}</span>
      <h3>${escapeHtml(system.name)}</h3>
      <p>${escapeHtml(system.summary || "Structured placeholder for future system data.")}</p>
      <span class="badge">${system.status === "ready" ? "Open trainer" : "Data scaffolded"}</span>
    `;
    card.addEventListener("click", () => {
      if (system.status === "ready") {
        selectSystem(system.id);
      }
    });
    els.systemGrid.appendChild(card);
  });
}

function selectSystem(systemId) {
  state.activeSystemId = systemId;
  state.mode = "diagram";
  state.selectedComponentId = "";
  state.scenarioId = getActiveSystem().scenarios[0]?.id || "normal";
  state.flowRunning = false;
  state.activeFaults.clear();
  state.memorySequence = [];
  state.oralIndex = 0;

  const system = getActiveSystem();
  els.activeSystemTitle.textContent = system.name;
  els.activeSystemStatus.textContent = "Ready - placeholder study data";
  els.workbench.hidden = false;

  document.querySelectorAll(".system-card").forEach((card, index) => {
    card.classList.toggle("active", state.data.systems[index].id === systemId);
  });

  renderScenarioSelect();
  setMode("diagram");
  els.workbench.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === mode);
  });

  if (mode === "diagram") renderInteractiveMode();
  if (mode === "flow") renderFlowMode();
  if (mode === "faults") renderFaultMode();
  if (mode === "memory") renderMemoryMode();
  if (mode === "oral") renderOralMode();
}

function renderScenarioSelect() {
  const system = getActiveSystem();
  els.scenarioSelect.innerHTML = system.scenarios.map((scenario) => {
    return `<option value="${escapeHtml(scenario.id)}">${escapeHtml(scenario.name)}</option>`;
  }).join("");
  els.scenarioSelect.value = state.scenarioId;
}

function renderInteractiveMode() {
  const system = getActiveSystem();
  const scenario = getScenario("normal");
  const diagramState = buildDiagramState(system, scenario, []);
  renderDiagram(system, diagramState, diagramTargets.diagram, {
    onComponentClick: (componentId) => {
      state.selectedComponentId = componentId;
      renderInteractiveMode();
    }
  });
  renderComponentDetail(system, diagramState);
}

function renderFlowMode() {
  const system = getActiveSystem();
  const scenario = getScenario(state.scenarioId);
  const diagramState = buildDiagramState(system, scenario, []);
  renderDiagram(system, diagramState, diagramTargets.flow, {
    flowing: state.flowRunning
  });
  els.flowToggle.textContent = state.flowRunning ? "Stop Flow" : "Start Flow";
  els.scenarioTitle.textContent = scenario.name;
  els.scenarioBody.innerHTML = `
    <dl>
      <div><dt>Scenario</dt><dd>${escapeHtml(scenario.description)}</dd></div>
      <div><dt>Consequence</dt><dd>${escapeHtml(scenario.consequence)}</dd></div>
    </dl>
  `;
}

function renderFaultMode() {
  const system = getActiveSystem();
  const activeFaultObjects = system.faults.filter((fault) => state.activeFaults.has(fault.id));
  const diagramState = buildDiagramState(system, getScenario("normal"), activeFaultObjects);
  renderFaultButtons(system);
  renderDiagram(system, diagramState, diagramTargets.faults, {});
  renderFaultNotes(activeFaultObjects);
}

function renderFaultButtons(system) {
  els.faultGrid.innerHTML = "";
  system.faults.forEach((fault) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `fault-toggle ${state.activeFaults.has(fault.id) ? "active" : ""}`;
    button.textContent = fault.name;
    button.addEventListener("click", () => toggleFault(fault));
    els.faultGrid.appendChild(button);
  });
}

function toggleFault(fault) {
  if (state.activeFaults.has(fault.id)) {
    state.activeFaults.delete(fault.id);
  } else {
    if (fault.exclusiveGroup) {
      getActiveSystem().faults
        .filter((candidate) => candidate.exclusiveGroup === fault.exclusiveGroup)
        .forEach((candidate) => state.activeFaults.delete(candidate.id));
    }
    state.activeFaults.add(fault.id);
  }
  renderFaultMode();
}

function renderFaultNotes(activeFaults) {
  if (!activeFaults.length) {
    els.faultNotes.innerHTML = "<p>No faults selected. Toggle a fault to show affected components, expected indication, risk, and a generic study response.</p>";
    return;
  }

  els.faultNotes.innerHTML = activeFaults.map((fault) => `
    <section class="fault-note">
      <h4>${escapeHtml(fault.name)}</h4>
      <p><strong>Affected:</strong> ${escapeHtml(namesForIds(fault.affectedComponents).join(", "))}</p>
      <p><strong>Expected pilot indication:</strong> ${escapeHtml(fault.pilotIndication)}</p>
      <p><strong>Risk:</strong> ${escapeHtml(fault.risk)}</p>
      <p><strong>High-level response:</strong> ${escapeHtml(fault.response)}</p>
    </section>
  `).join("");
}

function renderMemoryMode() {
  const system = getActiveSystem();
  els.memoryInstructions.textContent = system.memoryMode.instructions;
  els.tileBank.innerHTML = "";
  const tileComponentIds = system.memoryMode.tileComponentIds
    || system.components
      .filter((component) => component.id !== "return-line" && component.id !== "fuel-cooler")
      .map((component) => component.id);

  system.components
    .filter((component) => tileComponentIds.includes(component.id))
    .forEach((component) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "memory-tile";
      tile.textContent = component.name;
      tile.addEventListener("click", () => {
        state.memorySequence.push(component.id);
        renderMemoryWorkspace();
      });
      els.tileBank.appendChild(tile);
    });
  renderMemoryWorkspace();
}

function renderMemoryWorkspace() {
  const system = getActiveSystem();
  if (!state.memorySequence.length) {
    els.memoryWorkspace.innerHTML = '<span class="empty-hint">Click tiles below to place components here.</span>';
    return;
  }
  els.memoryWorkspace.innerHTML = state.memorySequence.map((componentId, index) => {
    const component = system.components.find((item) => item.id === componentId);
    return `<span class="placed-tile" data-index="${index + 1}.">${escapeHtml(component?.name || componentId)}</span>`;
  }).join("");
}

function scoreMemoryMode() {
  const system = getActiveSystem();
  const correct = system.memoryMode.correctSequence;
  const selected = state.memorySequence.map((id) => normalizeMemoryId(id));
  const selectedSet = new Set(selected);
  const correctSet = new Set(correct);
  const correctComponents = selected.filter((id, index) => correctSet.has(id) && selected.indexOf(id) === index).length;
  const correctOrder = selected.reduce((count, id, index) => count + (correct[index] === id ? 1 : 0), 0);
  const missing = correct.filter((id) => !selectedSet.has(id));
  const extra = selected.filter((id, index) => !correctSet.has(id) || selected.indexOf(id) !== index);

  els.memoryScore.hidden = false;
  els.memoryScore.innerHTML = `
    <div class="score-grid">
      <div class="score-box"><span class="small">Correct components</span><strong>${correctComponents}/${correct.length}</strong></div>
      <div class="score-box"><span class="small">Correct order</span><strong>${correctOrder}/${correct.length}</strong></div>
      <div class="score-box"><span class="small">Missing</span><strong>${missing.length}</strong></div>
      <div class="score-box"><span class="small">Extra</span><strong>${extra.length}</strong></div>
    </div>
    <p><strong>Missing components:</strong> ${missing.length ? escapeHtml(memoryNames(missing).join(", ")) : "None"}</p>
    <p><strong>Extra components:</strong> ${extra.length ? escapeHtml(memoryNames(extra).join(", ")) : "None"}</p>
  `;
}

function normalizeMemoryId(id) {
  const memoryMode = getActiveSystem().memoryMode;
  return memoryMode.aliases[id] || id;
}

function memoryNames(ids) {
  const system = getActiveSystem();
  return ids.map((id) => {
    if (id === "selected-tank") return "Selected Tank";
    return system.components.find((component) => component.id === id)?.name || id;
  });
}

function renderOralMode() {
  const questions = getActiveSystem().oralQuestions;
  const question = questions[state.oralIndex];
  els.oralPrompt.textContent = question.prompt;
  els.oralAnswer.value = "";
  els.modelAnswer.hidden = true;
  els.modelAnswer.textContent = "";
}

function buildDiagramState(system, scenario, faults) {
  const componentStatus = {};
  const connectionStatus = {};

  system.components.forEach((component) => {
    componentStatus[component.id] = "inactive";
  });
  system.connections.forEach((connection) => {
    connectionStatus[connection.id] = "inactive";
  });

  applyGroupedStatuses(componentStatus, scenario.statuses);
  applyGroupedStatuses(connectionStatus, scenario.connections);

  faults.forEach((fault) => {
    Object.entries(fault.componentStatus || {}).forEach(([id, status]) => {
      componentStatus[id] = status;
    });
    Object.entries(fault.connectionStatus || {}).forEach(([id, status]) => {
      connectionStatus[id] = status;
    });
  });

  return { componentStatus, connectionStatus };
}

function applyGroupedStatuses(target, groups = {}) {
  ["active", "caution", "restricted", "failed", "inactive"].forEach((status) => {
    (groups[status] || []).forEach((id) => {
      target[id] = status;
    });
  });
}

function renderDiagram(system, diagramState, target, options = {}) {
  target.board.classList.toggle("flowing", Boolean(options.flowing));
  target.layer.innerHTML = system.connections.map((connection) => {
    const from = system.components.find((component) => component.id === connection.from);
    const to = system.components.find((component) => component.id === connection.to);
    const status = diagramState.connectionStatus[connection.id] || "inactive";
    const path = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    return `<path class="connection-line ${status}" d="${path}" aria-label="${escapeHtml(connection.label)}"></path>`;
  }).join("");

  target.nodes.innerHTML = "";
  system.components.forEach((component) => {
    const status = diagramState.componentStatus[component.id] || "inactive";
    const node = document.createElement("button");
    node.type = "button";
    node.className = `component-node ${status} ${state.selectedComponentId === component.id ? "selected" : ""}`;
    node.style.left = `${component.x}%`;
    node.style.top = `${component.y}%`;
    node.innerHTML = `<strong>${escapeHtml(component.name)}</strong><span>${escapeHtml(component.role)}</span>`;
    node.addEventListener("click", () => {
      if (options.onComponentClick) {
        options.onComponentClick(component.id);
      }
    });
    target.nodes.appendChild(node);
  });
}

function renderComponentDetail(system, diagramState) {
  const component = system.components.find((item) => item.id === state.selectedComponentId);
  if (!component) {
    els.detailTitle.textContent = "Select a component";
    els.detailBody.innerHTML = `
      <p>Click any node in the fuel diagram to see what it does, what a failure means, and which indications are expected in this study model.</p>
    `;
    return;
  }

  els.detailTitle.textContent = component.name;
  els.detailBody.innerHTML = `
    <dl>
      <div><dt>What it does</dt><dd>${escapeHtml(component.what)}</dd></div>
      <div><dt>If it fails</dt><dd>${escapeHtml(component.failure)}</dd></div>
      <div><dt>Normal condition</dt><dd>${escapeHtml(component.normal)}</dd></div>
      <div><dt>Abnormal indications</dt><dd>${escapeHtml(component.abnormal)}</dd></div>
      <div><dt>Current diagram state</dt><dd>${escapeHtml(labelStatus(diagramState.componentStatus[component.id]))}</dd></div>
    </dl>
  `;
}

function labelStatus(status = "inactive") {
  return status.charAt(0).toUpperCase() + status.slice(1).replace("-", " ");
}

function getActiveSystem() {
  return state.data.systems.find((system) => system.id === state.activeSystemId);
}

function getScenario(id) {
  const system = getActiveSystem();
  return system.scenarios.find((scenario) => scenario.id === id) || system.scenarios[0];
}

function namesForIds(ids) {
  const system = getActiveSystem();
  return (ids || []).map((id) => system.components.find((component) => component.id === id)?.name || id);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}

// Data accuracy note:
// Replace systems-data.json with verified POH/AFM-derived wording, component names,
// coordinates, scenario logic, and fault consequences as you collect exact C172 JT-A data.
// The JS intentionally reads relationships from JSON so later aircraft-specific updates
// do not require rewriting this trainer module.
