# terminal-alert

**A sound you cannot miss when Claude Code is waiting on you.**

You give Claude a big task and switch to something else. Twenty minutes later you come back and nothing has moved, because Claude asked a question in the first minute and has been waiting ever since.

terminal-alert plays a sound the moment Claude needs you. It works even when your Mac is muted: it unmutes, raises the volume, plays the sound, then puts your volume back exactly as it was.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/Sak3ham/terminal-alert/main/install.sh | bash
```

The installer asks three things: when to alert you, which sound, and how loud. Then restart Claude Code.

macOS only for now. Nothing else to install: no Node, no Python, no Homebrew.

## What it alerts you about

Pick any combination, each with its own sound:

| Alert | Fires when |
|---|---|
| `question` | Claude asks you a question |
| `permission` | Claude needs your approval to run something |
| `done` | Claude finishes its turn |

## 16 sounds included

| Gentle | Playful | Hard to ignore |
|---|---|---|
| chime, doorbell, marimba, glass, bubble, sonar | coin, powerup, laser, robot, knock, fanfare | alarm, siren, airhorn, bell |

Use your own: drop any `.wav`, `.mp3`, `.aiff` or `.m4a` into `~/.terminal-alert/sounds/` and select it by file name.

## Change things later

```bash
terminal-alert status                 # what is on, which sounds, what volume
terminal-alert sounds                 # list sounds
terminal-alert preview airhorn        # hear one
terminal-alert set question airhorn   # change a sound
terminal-alert volume 80              # volume alerts are forced to
terminal-alert enable done            # turn an alert on
terminal-alert disable permission     # turn an alert off
terminal-alert test question          # fire an alert the way Claude would
terminal-alert uninstall              # remove everything
```

If `terminal-alert` is not found, `~/.local/bin` is not on your PATH. Use `~/.terminal-alert/alert.sh` instead.

## The other half: make Claude ask first

An alert only helps if Claude actually stops to ask. By default it often guesses, builds the wrong thing, and you pay for the tokens twice.

Paste this into your Claude preferences (claude.ai → Settings → Profile → "What personal preferences should Claude consider in responses?") or into `~/.claude/CLAUDE.md`. The installer can add it to `CLAUDE.md` for you.

```text
Before starting any task that is complex, ambiguous, or expensive to redo, stop and ask me questions first.

- Judge the request. If any answer of mine could change what you build, ask before doing any work.
- Ask every such question in one round, as multiple choice or multi-select, with your recommended option first. Maximum four questions per round. In Claude Code, use the AskUserQuestion tool.
- Ask only what you cannot find out yourself. Read the code, files and context first, and never ask me something they already answer.
- Skip the questions when the request is already clear or the task is small. Do not ask for permission to do what I plainly asked for.
- Start work only after I answer. If my answers open a new decision that changes the output, ask one more round, then build.
```

Claude asks, the sound pulls you back, you answer in ten seconds, and the work goes the right way the first time.

## Install without the questions

```bash
curl -fsSL https://raw.githubusercontent.com/Sak3ham/terminal-alert/main/install.sh | bash -s -- --events question,permission --sound chime --volume 70 --ask-first
```

| Flag | Meaning |
|---|---|
| `--events` | Comma-separated: `question`, `permission`, `done` |
| `--sound` | One sound for all chosen alerts |
| `--volume` | 0 to 100 |
| `--ask-first` | Add the ask-first rule to `~/.claude/CLAUDE.md` |
| `--yes` | Accept defaults (question + permission) |

## How it works

terminal-alert adds [hooks](https://code.claude.com/docs/en/hooks) to `~/.claude/settings.json`:

- `question` is a `PreToolUse` hook on the `AskUserQuestion` tool
- `permission` is a `PermissionRequest` hook
- `done` is a `Stop` hook

Each hook runs `~/.terminal-alert/alert.sh` in the background, so Claude is never slowed down. The script reads your current volume and mute state, raises the volume only if it is below your chosen level, plays the sound with `afplay`, and restores what it found.

Your other settings and hooks are left untouched, and a copy of the previous file is saved as `settings.json.terminal-alert-backup` before any change. Uninstalling removes only what terminal-alert added.

## Good to know

- The sound plays through your current output device. With headphones connected, it plays in the headphones.
- Focus and Do Not Disturb do not silence it.
- If two alerts fire at the same moment, one plays.
- Outputs with no software volume control (some HDMI displays) play at the level set on the device.

## Sounds and licence

Every bundled sound is synthesised by [`sounds/generate.py`](sounds/generate.py), so the pack is original and free to reuse. MIT licence.
