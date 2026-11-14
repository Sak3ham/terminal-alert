(() => {
  const RAW_INSTALL = "https://raw.githubusercontent.com/Sak3ham/terminal-alert/main/install.sh";
  // Served from the site itself when deployed, so the command stays short.
  const INSTALL_URL = location.protocol === "https:" ? location.origin + "/install" : RAW_INSTALL;

  const SOUNDS = [
    ["chime", "gentle"], ["doorbell", "gentle"], ["marimba", "gentle"], ["glass", "gentle"],
    ["bubble", "gentle"], ["sonar", "gentle"], ["coin", "playful"], ["powerup", "playful"],
    ["laser", "playful"], ["robot", "playful"], ["knock", "playful"], ["fanfare", "playful"],
    ["alarm", "hard"], ["siren", "hard"], ["airhorn", "hard"], ["bell", "hard"],
  ];
  const TAGS = { question: "ask", permission: "allow", done: "done" };

  const state = {
    armed: "question",
    volume: 70,
    askFirst: false,
    slots: {
      question: { on: true, sound: "chime" },
      permission: { on: true, sound: "knock" },
      done: { on: false, sound: "marimba" },
    },
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const padsEl = $("#pads");
  const commandEl = $("#command");
  const noteEl = $("#out-note");
  const copyCommand = $("#copy-command");
  const macEl = $(".mac");
  const macState = $("#mac-state");
  const macBar = $("#mac-bar");
  const volumeEl = $("#volume");
  const volumeOut = $("#volume-out");

  // ---- pads ---------------------------------------------------------------
  const audio = {};
  SOUNDS.forEach(([name, family]) => {
    const pad = document.createElement("button");
    pad.type = "button";
    pad.className = "pad " + family;
    pad.dataset.sound = name;
    pad.innerHTML = `<span class="pad-name">${name}</span><span class="pad-tags"></span>`;
    pad.addEventListener("click", () => {
      state.slots[state.armed].sound = name;
      // Picking a sound for an alert that is off is a clear ask to turn it on.
      state.slots[state.armed].on = true;
      play(name, pad);
      render();
    });
    padsEl.appendChild(pad);
  });

  let playing = null;
  let macTimer = null;

  function play(name, pad) {
    if (playing) {
      playing.audio.pause();
      playing.pad.classList.remove("is-playing");
    }
    const clip = audio[name] || (audio[name] = new Audio(`sounds/${name}.wav`));
    clip.currentTime = 0;
    clip.volume = state.volume / 100;
    playing = { audio: clip, pad };
    pad.classList.add("is-playing");
    showForced();
    const finish = () => {
      if (playing && playing.audio === clip) {
        pad.classList.remove("is-playing");
        playing = null;
        showRestored();
      }
    };
    clip.onended = finish;
    clip.play().catch(finish);
  }

  // The meter acts out what the real script does to a muted Mac.
  function showForced() {
    clearTimeout(macTimer);
    macEl.dataset.state = "forced";
    macState.textContent = `Unmuted, forced to ${state.volume}%`;
    macBar.style.width = state.volume + "%";
  }
  function showRestored() {
    macEl.dataset.state = "restored";
    macState.textContent = "Put back on mute";
    macBar.style.width = "0%";
    macTimer = setTimeout(() => {
      macEl.dataset.state = "muted";
      macState.textContent = "Your Mac: muted";
    }, 1600);
  }

  // ---- slots --------------------------------------------------------------
  const slotEls = $$(".slot");
  slotEls.forEach((el) => {
    const key = el.dataset.slot;
    const arm = $(".slot-arm", el);
    arm.addEventListener("click", () => {
      state.armed = key;
      render();
    });
    arm.addEventListener("keydown", (e) => {
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const keys = slotEls.map((s) => s.dataset.slot);
      const next = keys[(keys.indexOf(key) + step + keys.length) % keys.length];
      state.armed = next;
      render();
      $(`.slot[data-slot="${next}"] .slot-arm`).focus();
    });
    $("[data-toggle]", el).addEventListener("change", (e) => {
      state.slots[key].on = e.target.checked;
      render();
    });
  });

  volumeEl.addEventListener("input", () => {
    state.volume = Number(volumeEl.value);
    render();
  });
  $("#ask-first-flag").addEventListener("change", (e) => {
    state.askFirst = e.target.checked;
    render();
  });

  // ---- command ------------------------------------------------------------
  function buildCommand() {
    const on = Object.keys(state.slots).filter((k) => state.slots[k].on);
    if (!on.length) return null;
    const flags = on.map((k) => `--${k} ${state.slots[k].sound}`);
    flags.push(`--volume ${state.volume}`);
    if (state.askFirst) flags.push("--ask-first");
    return { head: `curl -fsSL ${INSTALL_URL} | bash -s --`, flags };
  }
  const commandText = (c) => `${c.head} ${c.flags.join(" ")}`;

  function render() {
    slotEls.forEach((el) => {
      const key = el.dataset.slot;
      const slot = state.slots[key];
      const armed = key === state.armed;
      el.classList.toggle("is-armed", armed);
      el.classList.toggle("is-off", !slot.on);
      const arm = $(".slot-arm", el);
      arm.setAttribute("aria-checked", String(armed));
      arm.tabIndex = armed ? 0 : -1;
      $("[data-sound-name]", el).textContent = slot.sound;
      $("[data-toggle]", el).checked = slot.on;
    });

    $$(".pad").forEach((pad) => {
      const name = pad.dataset.sound;
      const users = Object.keys(state.slots).filter((k) => state.slots[k].on && state.slots[k].sound === name);
      pad.setAttribute("aria-pressed", String(state.slots[state.armed].sound === name));
      $(".pad-tags", pad).innerHTML = users.map((k) => `<span class="tag">${TAGS[k]}</span>`).join("");
      const uses = users.length ? `, used for ${users.map((k) => TAGS[k]).join(" and ")}` : "";
      pad.setAttribute("aria-label", `${name}${uses}`);
    });

    volumeOut.textContent = state.volume + "%";
    volumeEl.style.setProperty("--fill", ((state.volume - 10) / 90) * 100 + "%");

    const command = buildCommand();
    if (command) {
      // Each flag stays on one line so a wrap never splits "--done fanfare".
      commandEl.replaceChildren(command.head + " ");
      command.flags.forEach((flag, i) => {
        const span = document.createElement("span");
        span.className = "flag";
        span.textContent = flag;
        commandEl.append(span, i < command.flags.length - 1 ? " " : "");
      });
      noteEl.textContent = "Paste into Terminal on macOS, then restart Claude Code.";
      copyCommand.disabled = false;
    } else {
      commandEl.textContent = "Turn on at least one alert to get a command.";
      noteEl.textContent = "All three alerts are switched off.";
      copyCommand.disabled = true;
    }
  }

  // ---- copy ---------------------------------------------------------------
  async function copy(button, text, label) {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select and copy";
    }
    button.classList.add("is-done");
    setTimeout(() => {
      button.textContent = label;
      button.classList.remove("is-done");
    }, 1800);
  }
  copyCommand.addEventListener("click", () => copy(copyCommand, commandText(buildCommand()), "Copy"));
  $("#copy-prompt").addEventListener("click", (e) => copy(e.currentTarget, $("#prompt-text").textContent, "Copy prompt"));

  render();
})();
