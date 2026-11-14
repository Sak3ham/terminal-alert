#!/bin/bash
# claude-nudge: a sound you cannot miss when Claude Code is waiting on you.
# https://github.com/Sak3ham/claude-nudge

DIR="${CLAUDE_NUDGE_HOME:-$HOME/.claude-nudge}"
CONF="$DIR/config"
SETTINGS="${CLAUDE_SETTINGS:-$HOME/.claude/settings.json}"
EVENTS="question permission done"

# Defaults, overridden by the config file.
VOLUME=70
SOUND_question=chime
SOUND_permission=knock
SOUND_done=marimba
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"

sound_file() {
  # Accepts a bundled name ("chime") or a path to any file afplay can read.
  if [ -f "$1" ]; then echo "$1"; return; fi
  for ext in wav aiff aif mp3 m4a caf; do
    if [ -f "$DIR/sounds/$1.$ext" ]; then echo "$DIR/sounds/$1.$ext"; return; fi
  done
  return 1
}

sound_for() {
  case "$1" in
    question) echo "$SOUND_question" ;;
    permission) echo "$SOUND_permission" ;;
    done) echo "$SOUND_done" ;;
    *) return 1 ;;
  esac
}

is_event() {
  case " $EVENTS " in *" $1 "*) return 0 ;; esac
  return 1
}

save_config() {
  cat > "$CONF" <<EOF
VOLUME=$VOLUME
SOUND_question="$SOUND_question"
SOUND_permission="$SOUND_permission"
SOUND_done="$SOUND_done"
EOF
}

# Play a file at the configured volume even if the Mac is muted or quiet,
# then put the volume and mute state back exactly as they were.
play_loud() {
  # Globals on purpose: restore() runs from the EXIT trap, after this
  # function's locals would have gone out of scope.
  file="$1" lock="$DIR/.lock" prev_vol="" prev_muted=""

  # One alert at a time. Without this, two overlapping alerts would each
  # record the other's forced volume as "the original" and never restore it.
  if ! mkdir "$lock" 2>/dev/null; then
    # Clear a lock left behind by a killed run, otherwise skip this alert.
    if [ -n "$(find "$lock" -maxdepth 0 -mmin +1 2>/dev/null)" ]; then
      rmdir "$lock" 2>/dev/null
      mkdir "$lock" 2>/dev/null || return 0
    else
      return 0
    fi
  fi

  prev_vol=$(osascript -e 'output volume of (get volume settings)' 2>/dev/null)
  prev_muted=$(osascript -e 'output muted of (get volume settings)' 2>/dev/null)

  restore() {
    case "$prev_vol" in
      ''|*[!0-9]*) ;;
      *)
        osascript -e "set volume output volume $prev_vol" 2>/dev/null
        [ "$prev_muted" = "true" ] && osascript -e 'set volume with output muted' 2>/dev/null
        ;;
    esac
    rmdir "$lock" 2>/dev/null
  }
  trap restore EXIT
  trap 'exit 130' INT TERM

  # Some outputs (HDMI, certain displays) expose no software volume, in which
  # case prev_vol is "missing value" and the sound plays at the device level.
  case "$prev_vol" in
    ''|*[!0-9]*) ;;
    *)
      # Only ever raise the volume. If it is already louder, leave it alone.
      if [ "$prev_muted" = "true" ] || [ "$prev_vol" -lt "$VOLUME" ]; then
        osascript -e "set volume output volume $VOLUME without output muted" 2>/dev/null
      fi
      ;;
  esac

  afplay "$file" 2>/dev/null
}

cmd_play() {
  local name file
  name=$(sound_for "$1") || { echo "Unknown event: $1 (use: $EVENTS)" >&2; exit 1; }
  file=$(sound_file "$name") || { echo "Sound not found: $name" >&2; exit 1; }
  play_loud "$file"
}

cmd_preview() {
  local file
  file=$(sound_file "$1") || { echo "Sound not found: $1" >&2; exit 1; }
  afplay "$file"
}

cmd_sounds() {
  ls "$DIR/sounds" | grep -Ev '\.(py|md)$' | sed 's/\.[^.]*$//' | sort
}

cmd_set() {
  is_event "$1" || { echo "Usage: claude-nudge set <question|permission|done> <sound>" >&2; exit 1; }
  sound_file "$2" >/dev/null || { echo "Sound not found: $2. Run: claude-nudge sounds" >&2; exit 1; }
  case "$1" in
    question) SOUND_question="$2" ;;
    permission) SOUND_permission="$2" ;;
    done) SOUND_done="$2" ;;
  esac
  save_config
  echo "$1 now plays $2"
  cmd_play "$1"
}

cmd_volume() {
  case "$1" in
    ''|*[!0-9]*) echo "Usage: claude-nudge volume <0-100>" >&2; exit 1 ;;
  esac
  [ "$1" -le 100 ] || { echo "Volume must be 0 to 100" >&2; exit 1; }
  VOLUME="$1"
  save_config
  echo "Alerts now play at $VOLUME% volume"
}

cmd_enable() {
  [ $# -gt 0 ] || { echo "Usage: claude-nudge enable <question|permission|done>..." >&2; exit 1; }
  for e in "$@"; do
    is_event "$e" || { echo "Unknown event: $e (use: $EVENTS)" >&2; exit 1; }
  done
  osascript -l JavaScript "$DIR/settings.js" add "$SETTINGS" "$DIR/nudge.sh" "$@"
}

cmd_disable() {
  [ $# -gt 0 ] || { echo "Usage: claude-nudge disable <question|permission|done>..." >&2; exit 1; }
  osascript -l JavaScript "$DIR/settings.js" remove "$SETTINGS" "$DIR/nudge.sh" "$@"
}

cmd_status() {
  echo "Volume: $VOLUME%"
  for e in $EVENTS; do
    printf '%-11s %s\n' "$e" "$(sound_for "$e")"
  done
  echo
  osascript -l JavaScript "$DIR/settings.js" status "$SETTINGS" "$DIR/nudge.sh"
}

cmd_uninstall() {
  osascript -l JavaScript "$DIR/settings.js" remove "$SETTINGS" "$DIR/nudge.sh" $EVENTS
  # Take the ask-first rule back out of CLAUDE.md if the installer added it.
  local md="${CLAUDE_MD:-$HOME/.claude/CLAUDE.md}"
  if grep -q 'claude-nudge:ask-first' "$md" 2>/dev/null; then
    sed -i '' '/<!-- claude-nudge:ask-first -->/,/<!-- \/claude-nudge:ask-first -->/d' "$md"
  fi
  rm -f "$HOME/.local/bin/claude-nudge"
  rm -rf "$DIR"
  echo "claude-nudge removed."
}

usage() {
  cat <<EOF
claude-nudge: a sound you cannot miss when Claude Code is waiting on you.

  claude-nudge status                    Show sounds, volume and active alerts
  claude-nudge sounds                    List available sounds
  claude-nudge preview <sound>           Hear a sound at the current volume
  claude-nudge test [event]              Fire an alert the way Claude would
  claude-nudge set <event> <sound>       Pick the sound for an alert
  claude-nudge volume <0-100>            Volume alerts are forced to
  claude-nudge enable <event>...         Turn alerts on
  claude-nudge disable <event>...        Turn alerts off
  claude-nudge uninstall                 Remove everything

Events: question (Claude asks you something), permission (Claude needs
approval), done (Claude finished its turn).

Custom sound: drop a .wav, .mp3, .aiff or .m4a into
$DIR/sounds/ and use its name, or pass a full path.
EOF
}

case "${1:-}" in
  play) cmd_play "${2:-question}" ;;
  test) cmd_play "${2:-question}" ;;
  preview) cmd_preview "${2:-}" ;;
  sounds) cmd_sounds ;;
  set) cmd_set "${2:-}" "${3:-}" ;;
  volume) cmd_volume "${2:-}" ;;
  enable) shift; cmd_enable "$@" ;;
  disable) shift; cmd_disable "$@" ;;
  status) cmd_status ;;
  uninstall) cmd_uninstall ;;
  *) usage ;;
esac
