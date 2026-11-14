#!/usr/bin/env python3
"""Synthesises the bundled alert sounds. Pure standard library.

Every sound here is generated from maths, so the pack is original and
free to redistribute. Run `python3 sounds/generate.py` to rebuild.
"""
import math
import os
import random
import struct
import wave

RATE = 44100
OUT = os.path.dirname(os.path.abspath(__file__))
TAU = 2 * math.pi


def silence(seconds):
    return [0.0] * int(RATE * seconds)


def osc(shape, phase):
    """One sample of a waveform at the given phase (in cycles)."""
    p = phase % 1.0
    if shape == "sine":
        return math.sin(TAU * p)
    if shape == "square":
        return 1.0 if p < 0.5 else -1.0
    if shape == "saw":
        return 2.0 * p - 1.0
    if shape == "tri":
        return 4.0 * abs(p - 0.5) - 1.0
    raise ValueError(shape)


def tone(freq, seconds, shape="sine", attack=0.005, decay=None, end_freq=None,
         harmonics=None, vibrato=0.0, gain=1.0):
    """A note. `decay` is an exponential time constant; None means a flat
    body with a short release. `end_freq` glides the pitch. `harmonics` is a
    list of (multiple, level) partials layered on the fundamental."""
    n = int(RATE * seconds)
    partials = harmonics or [(1.0, 1.0)]
    phases = [0.0] * len(partials)
    out = []
    release = min(0.02, seconds / 4)
    for i in range(n):
        t = i / RATE
        f = freq if end_freq is None else freq * (end_freq / freq) ** (i / n)
        if vibrato:
            f *= 1 + vibrato * math.sin(TAU * 6 * t)
        sample = 0.0
        for k, (mult, level) in enumerate(partials):
            phases[k] += f * mult / RATE
            sample += level * osc(shape, phases[k])
        env = min(1.0, t / attack) if attack else 1.0
        if decay:
            env *= math.exp(-t / decay)
        env *= min(1.0, (seconds - t) / release)
        out.append(sample * env * gain)
    return out


def noise(seconds, decay=0.03, gain=1.0, seed=7):
    rng = random.Random(seed)
    n = int(RATE * seconds)
    out, last = [], 0.0
    for i in range(n):
        last = 0.6 * last + 0.4 * rng.uniform(-1, 1)  # gentle low-pass
        out.append(last * math.exp(-(i / RATE) / decay) * gain)
    return out


def mix(*tracks):
    n = max(len(t) for t in tracks)
    out = [0.0] * n
    for track in tracks:
        for i, s in enumerate(track):
            out[i] += s
    return out


def at(offset, track):
    return silence(offset) + track


def seq(*tracks):
    out = []
    for track in tracks:
        out += track
    return out


def write(name, samples, peak=0.89):
    top = max(abs(s) for s in samples) or 1.0
    scale = peak / top
    frames = b"".join(
        struct.pack("<h", int(max(-1.0, min(1.0, s * scale)) * 32767))
        for s in samples
    )
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(frames)
    print(f"{name}.wav  {len(samples) / RATE:.2f}s")


BELL = [(1, 1.0), (2.0, 0.5), (3.0, 0.25), (4.2, 0.12)]
WOOD = [(1, 1.0), (4.0, 0.3), (10.0, 0.08)]
CHURCH = [(0.5, 0.5), (1, 1.0), (1.19, 0.6), (1.5, 0.4), (2.0, 0.45), (2.74, 0.25), (3.76, 0.15)]

SOUNDS = {
    # Gentle
    "chime": mix(
        tone(659.25, 1.2, harmonics=BELL, decay=0.35),
        at(0.16, tone(880.0, 1.2, harmonics=BELL, decay=0.4)),
    ),
    "doorbell": mix(
        tone(783.99, 1.1, harmonics=BELL, decay=0.4),
        at(0.42, tone(622.25, 1.4, harmonics=BELL, decay=0.5)),
    ),
    "marimba": mix(
        tone(523.25, 0.6, harmonics=WOOD, decay=0.12),
        at(0.13, tone(659.25, 0.6, harmonics=WOOD, decay=0.12)),
        at(0.26, tone(783.99, 0.6, harmonics=WOOD, decay=0.12)),
        at(0.39, tone(1046.5, 0.9, harmonics=WOOD, decay=0.2)),
    ),
    "glass": mix(
        tone(2093.0, 0.5, harmonics=[(1, 1.0), (2.76, 0.4), (5.4, 0.15)], decay=0.09),
        at(0.14, tone(2637.0, 0.7, harmonics=[(1, 1.0), (2.76, 0.4), (5.4, 0.15)], decay=0.13)),
    ),
    "bubble": seq(
        tone(400, 0.09, end_freq=900, decay=0.08),
        silence(0.03),
        tone(520, 0.09, end_freq=1150, decay=0.08),
        silence(0.03),
        tone(680, 0.14, end_freq=1600, decay=0.1),
    ),
    "sonar": mix(
        tone(1175.0, 1.6, decay=0.3),
        at(0.45, tone(1175.0, 1.2, decay=0.3, gain=0.35)),
        at(0.9, tone(1175.0, 0.8, decay=0.3, gain=0.12)),
    ),
    # Playful
    "coin": seq(
        tone(987.77, 0.08, shape="square", gain=0.6),
        tone(1318.5, 0.5, shape="square", decay=0.16, gain=0.6),
    ),
    "powerup": seq(*[
        tone(f, 0.075, shape="square", gain=0.6)
        for f in (392.0, 523.25, 659.25, 783.99, 1046.5, 1318.5)
    ] + [tone(1568.0, 0.35, shape="square", decay=0.14, gain=0.6)]),
    "laser": seq(
        tone(2400, 0.16, shape="saw", end_freq=300, gain=0.7),
        silence(0.05),
        tone(2400, 0.22, shape="saw", end_freq=200, gain=0.7),
    ),
    "robot": seq(*[
        tone(f, 0.07, shape="square", vibrato=0.04, gain=0.6)
        for f in (880, 1320, 660, 1760, 990, 1480, 740)
    ] + [tone(1175, 0.2, shape="tri", decay=0.1)]),
    "knock": mix(*[
        at(offset, mix(
            tone(140, 0.14, end_freq=70, decay=0.035),
            noise(0.05, decay=0.012, gain=0.5, seed=i),
        ))
        for i, offset in enumerate((0.0, 0.17, 0.34))
    ]),
    "fanfare": mix(*[
        seq(
            tone(base, 0.13, shape="saw", gain=0.5),
            silence(0.02),
            tone(base, 0.13, shape="saw", gain=0.5),
            silence(0.02),
            tone(base * 1.3348, 0.75, shape="saw", decay=0.45, gain=0.5),
        )
        for base in (392.0, 493.88, 587.33)
    ]),
    # Hard to ignore
    "alarm": seq(*[
        seq(tone(1040, 0.13, shape="square", gain=0.7),
            tone(780, 0.13, shape="square", gain=0.7))
        for _ in range(4)
    ]),
    "siren": seq(
        tone(600, 0.45, shape="tri", end_freq=1300),
        tone(1300, 0.45, shape="tri", end_freq=600),
        tone(600, 0.45, shape="tri", end_freq=1300),
        tone(1300, 0.45, shape="tri", end_freq=600),
    ),
    "airhorn": mix(*[
        tone(f, 1.1, shape="saw", attack=0.02, gain=0.4)
        for f in (349.2, 352.0, 440.0, 443.5, 523.25, 527.0)
    ]),
    "bell": tone(261.63, 2.6, harmonics=CHURCH, decay=0.8, attack=0.002),
}

if __name__ == "__main__":
    for name, samples in SOUNDS.items():
        write(name, samples)
