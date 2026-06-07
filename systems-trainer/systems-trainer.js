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
  oralIndex: 0,
  electrical: {
    switches: {},
    breakers: {},
    engineRunning: false,
    batteryPercent: 100,
    lastUpdated: Date.now(),
    message: ""
  }
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
  clearOral: document.getElementById("clearOral"),
  electricalReset: document.getElementById("electricalReset"),
  electricalDiagramImage: document.getElementById("electricalDiagramImage"),
  cockpitPlacardImage: document.getElementById("cockpitPlacardImage"),
  electricalHotspots: document.getElementById("electricalHotspots"),
  masterGrid: document.getElementById("masterGrid"),
  switchGrid: document.getElementById("switchGrid"),
  breakerGrid: document.getElementById("breakerGrid"),
  simVolts: document.getElementById("simVolts"),
  simAmps: document.getElementById("simAmps"),
  simBattery: document.getElementById("simBattery"),
  simFadecSource: document.getElementById("simFadecSource"),
  simEngine: document.getElementById("simEngine"),
  simEpu: document.getElementById("simEpu"),
  simAnnunciators: document.getElementById("simAnnunciators"),
  simExplanation: document.getElementById("simExplanation")
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

  els.electricalReset.addEventListener("click", () => {
    resetElectricalState(getActiveSystem());
    renderElectricalMode();
  });

  document.querySelectorAll("[data-electrical-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.electricalTab;
      document.querySelectorAll("[data-electrical-tab]").forEach((item) => item.classList.toggle("active", item.dataset.electricalTab === name));
      document.querySelectorAll("[data-electrical-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.electricalPanel === name));
    });
  });

  setInterval(() => {
    if (state.mode !== "electrical" || !getActiveSystem()?.simulation) return;
    updateElectricalBattery();
    renderElectricalMode();
  }, 2000);
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
  const system = getActiveSystem();
  state.mode = system.simulation ? "electrical" : "diagram";
  state.selectedComponentId = "";
  state.scenarioId = system.scenarios[0]?.id || "normal";
  state.flowRunning = false;
  state.activeFaults.clear();
  state.memorySequence = [];
  state.oralIndex = 0;

  els.activeSystemTitle.textContent = system.name;
  els.activeSystemStatus.textContent = system.simulation ? "Ready - source-based study simulation" : "Ready - placeholder study data";
  els.workbench.hidden = false;

  document.querySelectorAll(".system-card").forEach((card, index) => {
    card.classList.toggle("active", state.data.systems[index].id === systemId);
  });

  renderScenarioSelect();
  updateModeAvailability(system);
  if (system.simulation) resetElectricalState(system);
  setMode(state.mode);
  els.workbench.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateModeAvailability(system) {
  document.querySelectorAll(".system-sim-tab").forEach((tab) => {
    tab.hidden = !system.simulation;
  });
  document.querySelectorAll("[data-mode='diagram'], [data-mode='flow'], [data-mode='faults'], [data-mode='memory'], [data-mode='oral']").forEach((tab) => {
    tab.hidden = Boolean(system.simulation);
  });
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
  if (mode === "electrical") renderElectricalMode();
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

function resetElectricalState(system) {
  if (!system?.simulation) return;
  state.electrical.switches = { ...(system.simulation.defaultState.switches || {}) };
  state.electrical.breakers = {};
  system.simulation.breakers.forEach((breaker) => {
    state.electrical.breakers[breaker.id] = true;
  });
  state.electrical.engineRunning = true;
  state.electrical.batteryPercent = 100;
  state.electrical.lastUpdated = Date.now();
  state.electrical.message = "Normal cruise baseline: engine running, battery and alternator on, avionics on.";
}

function renderElectricalMode() {
  const system = getActiveSystem();
  if (!system?.simulation) return;
  const sim = system.simulation;
  const result = calculateElectricalState(system);

  els.electricalDiagramImage.src = sim.diagramImage;
  els.cockpitPlacardImage.src = sim.cockpitPlacardImage;

  renderElectricalControls(system);
  renderElectricalBreakers(system);
  renderElectricalHotspots(system, result);

  els.simVolts.textContent = `${result.volts.toFixed(1)} V`;
  els.simAmps.textContent = `${result.batteryAmps > 0 ? "+" : ""}${result.batteryAmps.toFixed(0)} A`;
  els.simBattery.textContent = `${Math.round(state.electrical.batteryPercent)}%`;
  els.simFadecSource.textContent = result.fadecSource;
  els.simEngine.textContent = result.engineRunning ? "Running" : "Stopped";
  els.simEpu.textContent = state.electrical.switches.externalPower ? "Connected" : "Disconnected";

  els.simAnnunciators.innerHTML = result.annunciators.map((item) => {
    return `<div class="annunciator ${item.level}">${escapeHtml(item.text)}</div>`;
  }).join("");

  els.simExplanation.innerHTML = `
    <p>${escapeHtml(state.electrical.message || result.summary)}</p>
    <p>${escapeHtml(result.summary)}</p>
    <p><strong>Study note:</strong> Numeric voltage and current values are first-pass simulation estimates and should be tuned against real aircraft/G1000 observations.</p>
  `;
}

function renderElectricalControls(system) {
  const switches = system.simulation.switches;
  const masterIds = new Set(["battery", "alternator", "engineMaster", "starter", "externalPower", "forceB"]);
  els.masterGrid.innerHTML = "";
  els.switchGrid.innerHTML = "";
  switches.forEach((control) => {
    const isMomentary = control.type === "momentary";
    const isOn = Boolean(state.electrical.switches[control.id]);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `sim-control ${isOn ? "on" : "off"} ${control.guarded ? "guarded" : ""}`;
    button.innerHTML = `<strong>${escapeHtml(control.label)}</strong><span>${escapeHtml(isMomentary ? "Press" : isOn ? "ON" : "OFF")} - ${escapeHtml(control.role)}</span>`;
    button.addEventListener("click", () => {
      if (isMomentary) {
        handleElectricalMomentary(control.id);
      } else {
        state.electrical.switches[control.id] = !isOn;
        if (control.id === "engineMaster" && isOn) {
          state.electrical.engineRunning = false;
          state.electrical.message = "Engine Master switched off: FADEC power is interrupted and the engine shuts down in this study model.";
        } else {
          state.electrical.message = `${control.label} switched ${isOn ? "OFF" : "ON"}.`;
        }
      }
      state.electrical.lastUpdated = Date.now();
      renderElectricalMode();
    });
    if (masterIds.has(control.id)) {
      els.masterGrid.appendChild(button);
    } else {
      els.switchGrid.appendChild(button);
    }
  });
}

function renderElectricalBreakers(system) {
  els.breakerGrid.innerHTML = "";
  system.simulation.breakers.forEach((breaker) => {
    const closed = state.electrical.breakers[breaker.id] !== false;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `sim-breaker ${closed ? "closed" : "open"} ${breaker.essential ? "essential" : ""}`;
    button.innerHTML = `<strong>${escapeHtml(breaker.label)} ${escapeHtml(breaker.rating)}A</strong><span>${closed ? "IN / closed" : "OUT / open"}</span>`;
    button.addEventListener("click", () => {
      state.electrical.breakers[breaker.id] = !closed;
      state.electrical.message = `${breaker.label} circuit breaker ${closed ? "opened" : "closed"}.`;
      if (breaker.id === "fadecA" || breaker.id === "fadecB") {
        state.electrical.message += " FADEC redundancy is affected in this study model.";
      }
      renderElectricalMode();
    });
    els.breakerGrid.appendChild(button);
  });
}

function renderElectricalHotspots(system, result) {
  els.electricalHotspots.innerHTML = "";
  system.simulation.hotspots.forEach((spot) => {
    const div = document.createElement("div");
    const status = result.hotspotStatus[spot.id] || "off";
    div.className = `electrical-hotspot ${status}`;
    div.style.left = `${spot.x}%`;
    div.style.top = `${spot.y}%`;
    div.style.width = `${spot.w}%`;
    div.style.height = `${spot.h}%`;
    div.title = `${spot.label}: ${status}`;
    els.electricalHotspots.appendChild(div);
  });
}

function handleElectricalMomentary(id) {
  if (id !== "starter") return;
  const result = calculateElectricalState(getActiveSystem());
  if (!breakerClosed("starter")) {
    state.electrical.message = "Starter pushed, but the STARTER circuit breaker is open.";
    return;
  }
  if (!state.electrical.switches.battery && !state.electrical.switches.externalPower) {
    state.electrical.message = "Starter pushed, but no main battery or external power source is available.";
    return;
  }
  if (!state.electrical.switches.engineMaster || !result.fadecPowered) {
    state.electrical.message = "Starter pushed, but Engine Master/FADEC power is not available.";
    return;
  }
  state.electrical.engineRunning = true;
  state.electrical.message = "Starter pushed: engine running in this study simulation.";
}

function updateElectricalBattery() {
  const system = getActiveSystem();
  if (!system?.simulation) return;
  const now = Date.now();
  const elapsedHours = Math.max(0, now - state.electrical.lastUpdated) / 3600000;
  state.electrical.lastUpdated = now;
  const result = calculateElectricalState(system, false);
  const capacity = system.simulation.nominal.batteryCapacityAh || 12;
  if (result.batteryAmps < 0) {
    state.electrical.batteryPercent = Math.max(0, state.electrical.batteryPercent + (result.batteryAmps * elapsedHours / capacity) * 100);
  } else if (result.batteryAmps > 0) {
    state.electrical.batteryPercent = Math.min(100, state.electrical.batteryPercent + (result.batteryAmps * elapsedHours / capacity) * 100);
  }
}

function calculateElectricalState(system) {
  const sim = system.simulation;
  const sw = state.electrical.switches;
  const nominal = sim.nominal;
  if (!sw.engineMaster) {
    state.electrical.engineRunning = false;
  }
  const alternatorOnline = Boolean(state.electrical.engineRunning && sw.alternator && breakerClosed("alt"));
  const batteryAvailable = Boolean(sw.battery && state.electrical.batteryPercent > 1);
  const externalPower = Boolean(sw.externalPower);
  const mainPower = alternatorOnline || batteryAvailable || externalPower;
  const feederBus = mainPower;
  const crossfeedBus = feederBus && breakerClosed("xfeedBus");
  const electricalBus1 = feederBus && breakerClosed("elecBus1");
  const electricalBus2 = feederBus && breakerClosed("elecBus2");
  const avionicsBus1 = electricalBus1 && sw.avionicsBus1 && breakerClosed("avionics1");
  const avionicsBus2 = electricalBus2 && sw.avionicsBus2 && breakerClosed("avionics2");
  const backupOnly = sw.engineMaster && !mainPower && breakerClosed("fadecA");
  const fadecA = sw.engineMaster && (mainPower || backupOnly) && breakerClosed("fadecA");
  const fadecB = sw.engineMaster && mainPower && breakerClosed("fadecB");
  const fadecPowered = fadecA || fadecB || backupOnly;

  if (!sw.engineMaster || !fadecPowered || (backupOnly && sw.forceB)) {
    state.electrical.engineRunning = false;
  }

  const loadAmps = calculateLoadAmps(system, { electricalBus1, electricalBus2, avionicsBus1, avionicsBus2, fadecPowered });
  let volts = 0;
  let batteryAmps = 0;
  if (alternatorOnline) {
    volts = nominal.alternatorVoltage;
    batteryAmps = state.electrical.batteryPercent < 98 ? nominal.chargeAmps : 1;
  } else if (externalPower) {
    volts = nominal.externalPowerVoltage;
    batteryAmps = batteryAvailable && state.electrical.batteryPercent < 98 ? 4 : 0;
  } else if (batteryAvailable) {
    volts = Math.max(20, nominal.batteryVoltage - Math.max(0, loadAmps - 8) * 0.08);
    batteryAmps = -loadAmps;
  }

  let fadecSource = "None";
  if (backupOnly) fadecSource = "Backup A only";
  else if (fadecA && fadecB) fadecSource = sw.forceB ? "B-FADEC selected" : "A/B powered";
  else if (fadecA) fadecSource = "A-FADEC only";
  else if (fadecB) fadecSource = "B-FADEC only";

  const annunciators = [];
  if (!alternatorOnline) annunciators.push({ level: "caution", text: "ALT WARNING" });
  if (mainPower && volts < 24) annunciators.push({ level: "caution", text: "LOW VOLTS" });
  if (backupOnly) annunciators.push({ level: "warning", text: "FADEC BACKUP BATTERY ONLY - A FADEC" });
  if (backupOnly && sw.forceB) annunciators.push({ level: "warning", text: "FORCE B ON BACKUP - ENGINE SHUTDOWN" });
  if (!sw.engineMaster) annunciators.push({ level: "warning", text: "ENGINE MASTER OFF - FADEC POWER INTERRUPTED" });
  if (!breakerClosed("alt")) annunciators.push({ level: "caution", text: "ALTERNATOR CB OPEN" });
  if (state.electrical.engineRunning && !sw.fuelPump) annunciators.push({ level: "caution", text: "FUEL PUMP OFF - verify phase/procedure" });
  if (!annunciators.length) annunciators.push({ level: "normal", text: "NO ELECTRICAL WARNINGS IN THIS STUDY MODEL" });

  const hotspotStatus = {
    battery: batteryAvailable ? "on" : "off",
    externalPower: externalPower ? "on" : "off",
    backupBattery: backupOnly ? "caution" : "on",
    excitationBattery: sw.engineMaster ? "on" : "off",
    fadec: fadecPowered ? (backupOnly ? "caution" : "on") : "failed",
    alternator: alternatorOnline ? "on" : "caution",
    starter: mainPower && breakerClosed("starter") ? "on" : "off",
    feederBus: feederBus ? "on" : "off",
    crossfeedBus: crossfeedBus ? "on" : "off",
    electricalBus1: electricalBus1 ? "on" : "off",
    electricalBus2: electricalBus2 ? "on" : "off",
    avionicsBus1: avionicsBus1 ? "on" : "off",
    avionicsBus2: avionicsBus2 ? "on" : "off",
    fuelPump: electricalBus1 && sw.fuelPump && breakerClosed("fuelPump") ? "on" : "off",
    lights1: electricalBus1 ? "on" : "off",
    lights2: electricalBus2 ? "on" : "off",
    pitotHeat: electricalBus2 && sw.pitotHeat && breakerClosed("pitotHeat") ? "on" : "off",
    ammeter: mainPower ? "on" : "off"
  };

  return {
    volts,
    batteryAmps,
    loadAmps,
    alternatorOnline,
    mainPower,
    fadecPowered,
    fadecSource,
    backupOnly,
    engineRunning: state.electrical.engineRunning,
    annunciators,
    hotspotStatus,
    summary: `Estimated load ${loadAmps.toFixed(1)} A. ${alternatorOnline ? "Alternator online, battery charging or floating." : batteryAvailable ? "Battery is carrying the electrical load." : externalPower ? "External power is supplying the buses." : "No main electrical source is available."}`
  };
}

function calculateLoadAmps(system, power) {
  const sw = state.electrical.switches;
  let load = power.fadecPowered ? system.simulation.nominal.baseEssentialLoadAmps : 0;
  system.simulation.switches.forEach((control) => {
    if (!sw[control.id] || control.type === "momentary") return;
    if (control.id === "fuelPump" && (!power.electricalBus1 || !breakerClosed("fuelPump"))) return;
    if (control.id === "landingLight" && (!power.electricalBus1 || !breakerClosed("landLt"))) return;
    if (control.id === "beaconLight" && (!power.electricalBus1 || !breakerClosed("bcnLt"))) return;
    if (control.id === "pitotHeat" && (!power.electricalBus2 || !breakerClosed("pitotHeat"))) return;
    if (control.id === "navLight" && (!power.electricalBus2 || !breakerClosed("navLts"))) return;
    if (control.id === "strobeLight" && (!power.electricalBus2 || !breakerClosed("strobeLts"))) return;
    if (control.id === "taxiLight" && (!power.electricalBus2 || !breakerClosed("taxiLt"))) return;
    if (control.id === "avionicsBus1" && !power.avionicsBus1) return;
    if (control.id === "avionicsBus2" && !power.avionicsBus2) return;
    load += Number(control.loadAmps || 0);
  });
  return load;
}

function breakerClosed(id) {
  return state.electrical.breakers[id] !== false;
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
  const usesSourceDiagram = Boolean(system.diagramAsset);
  target.board.classList.toggle("flowing", Boolean(options.flowing));
  target.board.classList.toggle("source-board", usesSourceDiagram);
  target.board.style.setProperty("--source-diagram", usesSourceDiagram ? `url("${system.diagramAsset}")` : "none");
  const showConnectionOverlay = !usesSourceDiagram || options.flowing;
  target.layer.innerHTML = showConnectionOverlay
    ? system.connections.map((connection) => {
      const from = system.components.find((component) => component.id === connection.from);
      const to = system.components.find((component) => component.id === connection.to);
      const status = diagramState.connectionStatus[connection.id] || "inactive";
      const path = connection.flowPath || `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
      return `<path class="connection-line ${status}" d="${path}" aria-label="${escapeHtml(connection.label)}"></path>`;
    }).join("")
    : "";

  target.nodes.innerHTML = "";
  system.components.forEach((component) => {
    const status = diagramState.componentStatus[component.id] || "inactive";
    const node = document.createElement("button");
    node.type = "button";
    node.className = `component-node ${status} ${state.selectedComponentId === component.id ? "selected" : ""}`;
    node.style.left = `${component.x}%`;
    node.style.top = `${component.y}%`;
    if (component.w) node.style.width = `${component.w}%`;
    if (component.h) node.style.minHeight = `${component.h}%`;
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
