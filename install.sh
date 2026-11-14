#!/bin/bash
# claude-nudge installer.
#
#   curl -fsSL https://raw.githubusercontent.com/Sak3ham/claude-nudge/main/install.sh | bash
#
# Skip the questions with flags:
#   ... | bash -s -- --events question,permission --sound chime --volume 70 --ask-first
#   ... | bash -s -- --yes        (defaults: question + permission alerts)
set -e

REPO="${CLAUDE_NUDGE_REPO:-Sak3ham/claude-nudge}"
DIR="${CLAUDE_NUDGE_HOME:-$HOME/.claude-nudge}"
CLAUDE_MD="${CLAUDE_MD:-$HOME/.claude/CLAUDE.md}"
ALL_EVENTS="question permission done"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
dim() { printf '\033[2m%s\033[0m\n' "$1"; }
fail() { printf 'claude-nudge: %s\n' "$1" >&2; exit 1; }

[ "$(uname)" = "Darwin" ] || fail "macOS only for now. Windows and Linux are on the roadmap."

# ---- flags -----------------------------------------------------------------
EVENTS="" SOUND="" VOL="" ASK_FIRST="" YES=""
while [ $# -gt 0 ]; do
  case "$1" in
    --events) EVENTS=$(echo "$2" | tr ',' ' '); shift 2 ;;
    --sound) SOUND="$2"; shift 2 ;;
    --volume) VOL="$2"; shift 2 ;;
    --ask-first) ASK_FIRST=yes; shift ;;
    --yes|-y) YES=yes; shift ;;
    *) fail "Unknown option: $1" ;;
  esac
done

# Ask questions only when a person is there to answer and gave no flags.
# Piped through curl, stdin is the script itself, so prompts read the terminal.
INTERACTIVE=""
if [ -z "$YES$EVENTS$SOUND$VOL$ASK_FIRST" ] && [ -r /dev/tty ] && [ -w /dev/tty ]; then
  INTERACTIVE=yes
fi
ask() { # ask "prompt" -> reply in $REPLY
  printf '%s' "$1" > /dev/tty
  IFS= read -r REPLY < /dev/tty || REPLY=""
}

# ---- copy files ------------------------------------------------------------
SRC=""
case "${BASH_SOURCE[0]:-}" in
  ''|bash|-) ;;
  *) here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
     [ -f "$here/nudge.sh" ] && [ -d "$here/sounds" ] && SRC="$here" ;;
esac
if [ -z "$SRC" ]; then
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  curl -fsSL "https://github.com/$REPO/archive/refs/heads/main.tar.gz" | tar -xz -C "$TMP" \
    || fail "Download failed. Check your connection and try again."
  SRC=$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)
  [ -f "$SRC/nudge.sh" ] || fail "Download looked wrong. Try again."
fi

mkdir -p "$DIR/sounds"
cp "$SRC/nudge.sh" "$SRC/settings.js" "$SRC/prompt.md" "$DIR/"
cp "$SRC"/sounds/*.wav "$DIR/sounds/"   # custom sounds already there are kept
chmod +x "$DIR/nudge.sh"
NUDGE="$DIR/nudge.sh"

# ---- current choices, so re-running the installer keeps them ---------------
VOLUME=70 SOUND_question=chime SOUND_permission=knock SOUND_done=marimba
# shellcheck disable=SC1090
[ -f "$DIR/config" ] && . "$DIR/config"

SOUNDS=$("$NUDGE" sounds)
has_sound() { echo "$SOUNDS" | grep -qx "$1"; }
get_sound() { eval "echo \"\$SOUND_$1\""; }
set_sound() { eval "SOUND_$1=\"\$2\""; }

pick_sound() { # pick_sound <event> <what it means>
  local event="$1" current choice
  current=$(get_sound "$event")
  echo > /dev/tty
  bold "Sound for when $2" > /dev/tty
  echo "$SOUNDS" | awk '{printf "  %2d  %s\n", NR, $0}' | paste - - - - > /dev/tty
  while :; do
    ask "Number to hear it, Enter to keep [$current]: "
    [ -z "$REPLY" ] && break
    choice=$(echo "$SOUNDS" | sed -n "${REPLY}p" 2>/dev/null)
    if [ -z "$choice" ] && has_sound "$REPLY"; then choice="$REPLY"; fi
    if [ -z "$choice" ]; then echo "  Not a sound. Try a number from the list." > /dev/tty; continue; fi
    current="$choice"
    "$NUDGE" preview "$current" &
  done
  set_sound "$event" "$current"
}

if [ -n "$INTERACTIVE" ]; then
  echo > /dev/tty
  bold "claude-nudge" > /dev/tty
  dim "A sound you cannot miss when Claude Code is waiting on you." > /dev/tty
  echo > /dev/tty
  bold "When should it alert you?" > /dev/tty
  echo "  1  Claude asks you a question" > /dev/tty
  echo "  2  Claude needs your permission to run something" > /dev/tty
  echo "  3  Claude finished its turn" > /dev/tty
  ask "Numbers, space separated [1 2]: "
  [ -z "$REPLY" ] && REPLY="1 2"
  for n in $REPLY; do
    case "$n" in
      1) EVENTS="$EVENTS question" ;;
      2) EVENTS="$EVENTS permission" ;;
      3) EVENTS="$EVENTS done" ;;
    esac
  done
  [ -n "$EVENTS" ] || EVENTS="question permission"

  for e in $EVENTS; do
    case "$e" in
      question) pick_sound question "Claude asks a question" ;;
      permission) pick_sound permission "Claude needs permission" ;;
      done) pick_sound done "Claude finishes" ;;
    esac
  done

  echo > /dev/tty
  bold "How loud?" > /dev/tty
  dim "Alerts unmute your Mac and raise it to this volume, then put it back." > /dev/tty
  ask "Volume 0-100 [$VOLUME]: "
  [ -n "$REPLY" ] && VOL="$REPLY"

  echo > /dev/tty
  bold "Make Claude ask before it builds?" > /dev/tty
  dim "Adds a short rule to $CLAUDE_MD so Claude asks you" > /dev/tty
  dim "multiple-choice questions before complex tasks instead of guessing." > /dev/tty
  ask "Add it? [y/N]: "
  case "$REPLY" in y|Y|yes|Yes) ASK_FIRST=yes ;; esac
else
  [ -n "$EVENTS" ] || EVENTS="question permission"
  if [ -n "$SOUND" ]; then
    has_sound "$SOUND" || fail "Unknown sound: $SOUND. Choose from: $(echo $SOUNDS)"
    for e in $EVENTS; do set_sound "$e" "$SOUND"; done
  fi
fi

for e in $EVENTS; do
  case " $ALL_EVENTS " in *" $e "*) ;; *) fail "Unknown event: $e (use: $ALL_EVENTS)" ;; esac
done
if [ -n "$VOL" ]; then
  case "$VOL" in ''|*[!0-9]*) fail "Volume must be a number from 0 to 100" ;; esac
  [ "$VOL" -le 100 ] || fail "Volume must be a number from 0 to 100"
  VOLUME="$VOL"
fi

# ---- write config, hooks, command -----------------------------------------
cat > "$DIR/config" <<EOF
VOLUME=$VOLUME
SOUND_question="$SOUND_question"
SOUND_permission="$SOUND_permission"
SOUND_done="$SOUND_done"
EOF

# shellcheck disable=SC2086
"$NUDGE" enable $EVENTS > /dev/null

mkdir -p "$HOME/.local/bin"
ln -sf "$NUDGE" "$HOME/.local/bin/claude-nudge"

if [ -n "$ASK_FIRST" ] && ! grep -q 'claude-nudge:ask-first' "$CLAUDE_MD" 2>/dev/null; then
  mkdir -p "$(dirname "$CLAUDE_MD")"
  {
    [ -s "$CLAUDE_MD" ] && echo
    echo '<!-- claude-nudge:ask-first -->'
    cat "$DIR/prompt.md"
    echo '<!-- /claude-nudge:ask-first -->'
  } >> "$CLAUDE_MD"
fi

# ---- done ------------------------------------------------------------------
first=$(echo $EVENTS | cut -d' ' -f1)
"$NUDGE" test "$first" &

echo
bold "claude-nudge is on."
for e in $EVENTS; do printf '  %-11s %s\n' "$e" "$(get_sound "$e")"; done
echo "  volume      $VOLUME%"
[ -n "$ASK_FIRST" ] && echo "  ask-first   added to $CLAUDE_MD"
echo
echo "Restart Claude Code, or open /hooks once, for it to take effect."
case ":$PATH:" in
  *":$HOME/.local/bin:"*) echo "Change anything later with: claude-nudge" ;;
  *) echo "Change anything later with: $NUDGE" ;;
esac
wait
