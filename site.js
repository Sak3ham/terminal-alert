(() => {
  const RAW_INSTALL = "https://raw.githubusercontent.com/Sak3ham/terminal-alert/main/install.sh";
  // Served from the site itself when deployed, so the command stays short.
  const INSTALL_URL = location.protocol === "https:" ? location.origin + "/install" : RAW_INSTALL;

  // [id, label, file extension, seconds]
  const SOUNDS = [
    ["uthjaa", "Uth jaa", "wav", 0.7], ["aayein", "Aayein", "wav", 0.6], ["khatam", "Khatam", "wav", 0.7],
    ["baapre", "Are baap re", "mp3", 1.8], ["chaloo", "Chaloo", "mp3", 1.3], ["baigan", "Baigan", "mp3", 0.7],
    ["chacha", "Chacha", "mp3", 1.2], ["lekinyesala", "Lekin ye sala", "mp3", 2.7], ["aag", "Aag", "mp3", 2.2],
    ["boxbox", "Box box", "mp3", 1.3], ["quack", "Mac quack", "mp3", 1.2], ["fart", "Fart", "mp3", 0.4],
    ["rizz", "Rizz", "mp3", 1.9], ["shocked", "Shocked", "mp3", 1.5], ["ack", "ACK", "mp3", 5.0],
    ["cricket", "Awkward cricket", "mp3", 4.5], ["kuchupuchu", "Kuchu puchu", "mp3", 9.8], ["merijung", "Meri Jung", "mp3", 9.6],
    ["bhojyam", "Bhojyam", "mp3", 10.6], ["dexter", "Dexter", "mp3", 10.7],
  ];
  const LABEL = Object.fromEntries(SOUNDS.map(([id, label]) => [id, label]));
  const TAGS = { question: "question", permission: "permission", done: "finished" };

  // A slot's sound is either a bundled id or { url } for a pasted link.
  const state = {
    armed: "question",
    volume: 70,
    askFirst: false,
    slots: {
      question: { on: true, sound: "uthjaa" },
      permission: { on: true, sound: "aayein" },
      done: { on: true, sound: "khatam" },
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
  const customForm = $("#custom-form");
  const customUrl = $("#custom-url");
  const customUse = $("#custom-use");
  const customNote = $("#custom-note");
  const CUSTOM_HINT = customNote.textContent;

  // ---- pads ---------------------------------------------------------------
  const audio = {};
  SOUNDS.forEach(([id, label, ext, secs]) => {
    const pad = document.createElement("button");
    pad.type = "button";
    pad.className = "pad";
    pad.dataset.sound = id;
    pad.innerHTML =
      `<span class="pad-name">${label}</span>` +
      `<span class="pad-meta"><span class="pad-secs">${secs.toFixed(1)}s</span><span class="pad-tags"></span></span>`;
    pad.addEventListener("click", () => {
      state.slots[state.armed].sound = id;
      // Picking a sound for an alert that is off is a clear ask to turn it on.
      state.slots[state.armed].on = true;
      play(audio[id] || (audio[id] = new Audio(`sounds/${id}.${ext}`)), pad).catch(() => {});
      render();
    });
    padsEl.appendChild(pad);
  });

  let playing = null;
  let macTimer = null;

  function play(clip, pad) {
    stop();
    clip.currentTime = 0;
    clip.volume = state.volume / 100;
    playing = { audio: clip, pad };
    if (pad) pad.classList.add("is-playing");
    showForced();
    const finish = () => {
      if (playing && playing.audio === clip) {
        if (pad) pad.classList.remove("is-playing");
        playing = null;
        showRestored();
      }
    };
    clip.onended = finish;
    return clip.play().catch((err) => {
      finish();
      throw err;
    });
  }
  function stop() {
    if (!playing) return;
    playing.audio.pause();
    if (playing.pad) playing.pad.classList.remove("is-playing");
    playing = null;
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

  // ---- custom link --------------------------------------------------------
  function parseLink(text) {
    let url;
    try {
      url = new URL(text.trim());
    } catch {
      return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // href is percent-encoded, so it carries no spaces. Encode the one
    // character that could end the shell quoting the command wraps it in.
    return url.href.replace(/'/g, "%27");
  }

  function setCustomNote(text, isError) {
    customNote.textContent = text;
    customNote.classList.toggle("is-error", Boolean(isError));
    customUrl.setAttribute("aria-invalid", String(Boolean(isError)));
  }

  customForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const href = parseLink(customUrl.value);
    if (!href) {
      setCustomNote("That is not a link. Paste a full address starting with https://", true);
      customUrl.focus();
      return;
    }
    const alert = TAGS[state.armed];
    state.slots[state.armed].sound = { url: href };
    state.slots[state.armed].on = true;
    render();
    // Preview where the browser can. Page links (myinstants) only resolve at install.
    play(new Audio(href), null).then(
      () => setCustomNote(`Playing your link. It is set for the ${alert} alert.`),
      () => setCustomNote(`Set for the ${alert} alert. The browser cannot preview this link, but the installer will fetch it.`)
    );
  });
  customUrl.addEventListener("input", () => setCustomNote(CUSTOM_HINT, false));

  // ---- command ------------------------------------------------------------
  const isCustom = (sound) => typeof sound === "object";
  const soundLabel = (sound) => (isCustom(sound) ? "Your link" : LABEL[sound]);

  function buildCommand() {
    const on = Object.keys(state.slots).filter((k) => state.slots[k].on);
    if (!on.length) return null;
    const flags = on.map((k) => {
      const sound = state.slots[k].sound;
      return `--${k} ${isCustom(sound) ? `'${sound.url}'` : sound}`;
    });
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
      $("[data-sound-name]", el).textContent = soundLabel(slot.sound);
      $("[data-toggle]", el).checked = slot.on;
    });

    $$(".pad").forEach((pad) => {
      const id = pad.dataset.sound;
      const users = Object.keys(state.slots).filter((k) => state.slots[k].on && state.slots[k].sound === id);
      pad.setAttribute("aria-pressed", String(state.slots[state.armed].sound === id));
      $(".pad-tags", pad).innerHTML = users.map((k) => `<span class="tag">${TAGS[k]}</span>`).join("");
      const uses = users.length ? `, used for ${users.map((k) => TAGS[k]).join(" and ")}` : "";
      pad.setAttribute("aria-label", `${LABEL[id]}${uses}`);
    });

    customUse.textContent = `Use for ${TAGS[state.armed]}`;

    volumeOut.textContent = state.volume + "%";
    volumeEl.style.setProperty("--fill", ((state.volume - 10) / 90) * 100 + "%");

    const command = buildCommand();
    if (command) {
      // Each flag stays on one line where it can, so a wrap never splits "--done khatam".
      commandEl.replaceChildren(command.head + " ");
      command.flags.forEach((flag, i) => {
        const span = document.createElement("span");
        span.className = flag.includes("'") ? "flag is-long" : "flag";
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
