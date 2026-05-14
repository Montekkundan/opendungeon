export type SynthWave = "sine" | "square" | "triangle" | "noise"

export type SynthStep = {
  frequency: number
  durationMs: number
  volume?: number
  slideTo?: number
}

export type SynthProfile = {
  wave: SynthWave
  steps: SynthStep[]
  attackMs?: number
  releaseMs?: number
}

const sampleRate = 44_100

export function synthesizeSfx(profile: SynthProfile) {
  const samples: number[] = []
  let noiseSeed = 0x6d2b79f5
  const totalMs = profile.steps.reduce((total, step) => total + step.durationMs, 0)
  const attackMs = Math.max(1, profile.attackMs ?? 6)
  const releaseMs = Math.max(1, profile.releaseMs ?? 26)
  let elapsedMs = 0

  for (const step of profile.steps) {
    const sampleCount = Math.max(1, Math.round((sampleRate * step.durationMs) / 1000))
    for (let index = 0; index < sampleCount; index++) {
      const localT = index / sampleCount
      const globalMs = elapsedMs + localT * step.durationMs
      const frequency = lerp(step.frequency, step.slideTo ?? step.frequency, localT)
      const phase = (2 * Math.PI * frequency * index) / sampleRate
      const envelope = Math.min(1, globalMs / attackMs, (totalMs - globalMs) / releaseMs)
      const volume = Math.max(0, Math.min(1, step.volume ?? 0.5)) * Math.max(0, envelope)
      samples.push(waveSample(profile.wave, phase, () => nextNoise()) * volume)
    }
    elapsedMs += step.durationMs
  }

  function nextNoise() {
    noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0
    return (noiseSeed / 0xffffffff) * 2 - 1
  }

  return encodeMonoWav(samples)
}

function waveSample(wave: SynthWave, phase: number, noise: () => number) {
  if (wave === "square") return Math.sin(phase) >= 0 ? 1 : -1
  if (wave === "triangle") return (2 / Math.PI) * Math.asin(Math.sin(phase))
  if (wave === "noise") return noise()
  return Math.sin(phase)
}

function encodeMonoWav(samples: number[]) {
  const dataSize = samples.length * 2
  const bytes = new Uint8Array(44 + dataSize)
  const view = new DataView(bytes.buffer)
  writeAscii(bytes, 0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(bytes, 8, "WAVE")
  writeAscii(bytes, 12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(bytes, 36, "data")
  view.setUint32(40, dataSize, true)

  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
    view.setInt16(44 + index * 2, Math.round(sample * 32767), true)
  }

  return bytes
}

function writeAscii(bytes: Uint8Array, offset: number, text: string) {
  for (let index = 0; index < text.length; index++) bytes[offset + index] = text.charCodeAt(index)
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t
}
