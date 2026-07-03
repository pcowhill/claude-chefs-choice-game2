import type { CreatureKind, ZoneDef } from '../config'
import type { RNG } from '../engine/math'
import type { Camera } from '../engine/camera'
import type { AudioEngine } from '../engine/audio'
import type { Input } from '../engine/input'

export interface IO {
  input: Input
  audio: AudioEngine
}

export interface Seg { ax: number; ay: number; bx: number; by: number }

export interface EchoDot {
  x: number
  y: number
  tang: number   // wall tangent angle, dots render as tiny oriented strokes
  lit: number    // run.time when last lit; -1 = never seen
  glow: number   // brightness at the moment it was lit, 0..1
}

export interface Wavefront {
  x: number
  y: number
  r: number
  speed: number
  maxR: number
  strength: number
  revealTerrain: boolean
  occlude: boolean          // big pings cast acoustic shadows
  revealContacts: boolean
  fromKind: 'player' | 'creature' | 'world'
  sourceCreature: Creature | null
}

export interface Ghost {
  x: number
  y: number
  heading: number
  kind: CreatureKind
  alert: number             // 0 calm, 1 investigating, 2 hunting
  t: number
  fade: number
  strength: number
  segs: { x: number; y: number }[] | null   // leviathan body snapshot
}

export interface Blip {
  bearing: number
  distNorm: number          // 0..1 → scope radius
  t: number
  kind: 'noise' | 'call' | 'boom' | 'ping'
  hostile: boolean
}

export type SoundKind =
  | 'engine' | 'ping' | 'torpedo' | 'explosion' | 'decoy'
  | 'call' | 'impact' | 'vent' | 'screech' | 'bump' | 'move'

export interface SoundEvt {
  x: number
  y: number
  loud: number              // radius (px) at which a 1.0-hearing ear detects it
  kind: SoundKind
  src: 'player' | 'creature' | 'world'
  creature?: Creature | null
}

export type AIState = 'lurk' | 'investigate' | 'hunt' | 'windup' | 'charge' | 'stunned' | 'flee'

export interface Creature {
  kind: CreatureKind
  x: number
  y: number
  vx: number
  vy: number
  heading: number
  hp: number
  state: AIState
  stateT: number
  targetX: number
  targetY: number
  hasTarget: boolean
  targetIsPlayer: boolean
  wanderT: number
  callT: number
  moveNoiseT: number
  screechT: number
  stun: number
  hitFlash: number
  everAlerted: boolean
  contactCd: number
  dead: boolean
  // leviathan only
  segs: { x: number; y: number }[] | null
  levPingT: number
  flinch: number
}

export interface Torpedo {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  armT: number
  noiseT: number
  trail: { x: number; y: number }[]
  dead: boolean
}

export interface Decoy {
  x: number
  y: number
  life: number
  chirpT: number
  dead: boolean
}

export interface Mine {
  x: number
  y: number
  fuse: number              // <0 dormant, >=0 counting down
  seenT: number
  dead: boolean
}

export type PickupKind = 'torp' | 'repair' | 'decoy' | 'salvage'

export interface Pickup {
  kind: PickupKind
  x: number
  y: number
  seenT: number
  bob: number
  dead: boolean
}

export interface Vent {
  x: number
  y: number
  t: number
  seenT: number
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  kind: 'spark' | 'debris' | 'bubble' | 'flash'
  drag: number
}

export interface World {
  wpx: number
  hpx: number
  gw: number
  gh: number
  solid: Uint8Array
  segs: Seg[]
  segBins: number[][]
  segCols: number
  segRows: number
  dots: EchoDot[]
  dotBins: number[][]
  dotCols: number
  dotRows: number
  spawnX: number
  spawnY: number
  hatchX: number
  hatchY: number
  hatchSeenT: number
  chambers: { x: number; y: number }[]
}

export interface PlayerState {
  x: number
  y: number
  vx: number
  vy: number
  heading: number
  throttle: number          // smoothed |input| for audio/noise
  hull: number
  flankMeter: number
  flankRegenT: number
  flanking: boolean
  pingCd: number
  ammo: number
  reload: number
  decoys: number
  iframes: number
  engineNoiseT: number
  bumpCd: number
  aimX: number
  aimY: number
  dwell: number
  hurtFlash: number
  dead: boolean
}

export interface RunStats {
  kills: number
  killsByKind: Partial<Record<CreatureKind, number>>
  silentKills: number
  torpsFired: number
  torpsHit: number
  pings: number
  decoysUsed: number
  damageTaken: number
  timesDetected: number
  timeElapsed: number
}

/** Multipliers/values derived from the owned upgrade set. */
export interface DerivedStats {
  noiseMult: number
  echoFadeMult: number
  reloadMult: number
  torpDamage: number
  blastMult: number
  pingRadiusMult: number
  pingCdMult: number
  decoyCap: number
  decoyNoiseMult: number
  hullMax: number
  flankDrainMult: number
  speedMult: number
  hydrophoneMult: number
}

export interface Ticker {
  text: string
  t: number
  color: string
}

export interface ScorePopup {
  x: number
  y: number
  t: number
  text: string
}

export interface TutorialState {
  moved: boolean
  pinged: boolean
  heardWarning: boolean
  sawContact: boolean
  fired: boolean
  killed: boolean
  warnT: number
}

export interface Run {
  rng: RNG
  seed: number
  time: number
  zoneIdx: number
  zone: ZoneDef
  world: World
  player: PlayerState
  creatures: Creature[]
  torpedoes: Torpedo[]
  decoys: Decoy[]
  mines: Mine[]
  pickups: Pickup[]
  vents: Vent[]
  particles: Particle[]
  wavefronts: Wavefront[]
  ghosts: Ghost[]
  blips: Blip[]
  quota: number
  hatchOpen: boolean
  agitation: number
  score: number
  stats: RunStats
  upgrades: Set<string>
  d: DerivedStats
  camera: Camera
  tickers: Ticker[]
  popups: ScorePopup[]
  hints: TutorialState
  detectedFlash: number
  detectedCd: number
  zoneTime: number
  beaconX: number
  beaconY: number
  beaconKnown: boolean
  beaconSeenT: number
  outcome: 'playing' | 'dead' | 'descend' | 'won'
  godMode: boolean
  resupplyCd: number
  /** Sounds emitted this frame; creatures consume them on their next update. */
  soundQueue: SoundEvt[]
}
