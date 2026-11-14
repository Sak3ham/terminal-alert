// Adds or removes terminal-alert hooks in Claude Code's settings.json.
// Runs on the JavaScript engine built into macOS, so there is nothing to
// install:  osascript -l JavaScript settings.js <add|remove|status> <settings.json> <alert.sh> [events...]
//
// Only hooks whose command points at alert.sh are ever touched. Every other
// setting and hook in the file is written back unchanged.

ObjC.import("Foundation");

// Which Claude Code hook fires each alert.
var EVENTS = {
  question: { hook: "PreToolUse", matcher: "AskUserQuestion" },
  permission: { hook: "PermissionRequest" },
  done: { hook: "Stop" },
};

function readFile(path) {
  var fm = $.NSFileManager.defaultManager;
  if (!fm.fileExistsAtPath(path)) return null;
  var text = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  return ObjC.unwrap(text);
}

function writeFile(path, text) {
  var dir = $(path).stringByDeletingLastPathComponent;
  $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(dir, true, $(), null);
  var ok = $(text).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
  if (!ok) throw new Error("Could not write " + path);
}

function shellQuote(s) {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function isOurs(hook, script, name) {
  if (!hook || typeof hook.command !== "string") return false;
  if (hook.command.indexOf(script) === -1) return false;
  return name ? hook.command.indexOf(" play " + name) !== -1 : true;
}

// Remove our hook for one event, dropping any group or list left empty.
function strip(settings, script, name) {
  var hookName = EVENTS[name].hook;
  var groups = settings.hooks && settings.hooks[hookName];
  if (!Array.isArray(groups)) return;
  var kept = [];
  groups.forEach(function (group) {
    if (!group || !Array.isArray(group.hooks)) return kept.push(group);
    var before = group.hooks.length;
    group.hooks = group.hooks.filter(function (h) { return !isOurs(h, script, name); });
    if (group.hooks.length > 0 || before === 0) kept.push(group);
  });
  if (kept.length) settings.hooks[hookName] = kept;
  else delete settings.hooks[hookName];
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
}

function add(settings, script, name) {
  strip(settings, script, name);
  var event = EVENTS[name];
  settings.hooks = settings.hooks || {};
  settings.hooks[event.hook] = settings.hooks[event.hook] || [];
  var group = {
    hooks: [{
      type: "command",
      command: shellQuote(script) + " play " + name,
      async: true,
    }],
  };
  if (event.matcher) group = { matcher: event.matcher, hooks: group.hooks };
  settings.hooks[event.hook].push(group);
}

function isOn(settings, script, name) {
  var groups = (settings.hooks && settings.hooks[EVENTS[name].hook]) || [];
  return groups.some(function (g) {
    return g && Array.isArray(g.hooks) && g.hooks.some(function (h) { return isOurs(h, script, name); });
  });
}

function run(argv) {
  var action = argv[0], path = argv[1], script = argv[2], names = argv.slice(3);
  var raw = readFile(path);
  var settings = {};
  if (raw !== null && raw.trim() !== "") {
    try {
      settings = JSON.parse(raw);
    } catch (e) {
      throw new Error(path + " is not valid JSON, so it was left untouched. Fix it and run this again.");
    }
  }
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error(path + " does not contain a JSON object, so it was left untouched.");
  }

  if (action === "status") {
    return Object.keys(EVENTS).map(function (name) {
      return (isOn(settings, script, name) ? "on   " : "off  ") + name;
    }).join("\n");
  }

  names.forEach(function (name) {
    if (!EVENTS[name]) throw new Error("Unknown event: " + name);
  });
  if (action !== "add" && action !== "remove") throw new Error("Unknown action: " + action);
  if (raw === null && action === "remove") return "Nothing to remove.";

  names.forEach(function (name) {
    if (action === "add") add(settings, script, name);
    else strip(settings, script, name);
  });

  var out = JSON.stringify(settings, null, 2) + "\n";
  if (raw !== null && out !== raw) writeFile(path + ".terminal-alert-backup", raw);
  writeFile(path, out);
  return (action === "add" ? "Alerts on: " : "Alerts off: ") + names.join(", ");
}
