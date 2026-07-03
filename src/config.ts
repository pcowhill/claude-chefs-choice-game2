// ============================================================================
// EARSHOT - central tuning tables. Every balance number lives here.
// ============================================================================

export const VIEW_W = 1920
export const VIEW_H = 1080

export const COLORS = {
  bg: '#020705',
  phosDim: '#1d5c44',
  phos: '#3dd68c',
  phosBright: '#b4ffd9',
  white: '#eafff4',
  amber: '#ffb454',
  amberDim: '#8f6023',
  red: '#ff5040',
  redDim: '#7c2a20',
  hud: '#2c8f68',
  hudDim: '#14402f',
  ink: '#020705'
}

export const PLAYER = {
  radius: 13,
  accel: 620,            // px/s^2 at full throttle
  reverseFactor: 0.45,
  drag: 2.6,             // exponential velocity decay per second
  maxSpeed: 178,
  turnRate: 3.3,         // rad/s
  flankMult: 1.9,        // speed & accel multiplier while flanking
  flankDrain: 0.62,      // meter/s while flanking (meter is 0..1)
  flankRegen: 0.34,      // meter/s after delay
  flankRegenDelay: 0.9,
  hullMax: 100,
  contactIFrames: 1.15,
  // Noise: loudness = radius (px) at which an average ear hears you.
  noiseIdle: 42,
  noiseCruise: 300,      // at max cruise speed
  noiseFlank: 640,
  noiseWallBump: 330,
  noisePing: 900,
  engineNoiseInterval: 0.22, // how often the engine emits a sound event
  pingCooldown: 3.2,
  pingRadius: 880,
  pingSpeed: 760,        // wavefront px/s
  torpAmmoStart: 8,
  torpAmmoCap: 14,
  torpReload: 1.55,
  torpSpeed: 560,
  torpLife: 2.3,
  torpDamage: 1,
  torpNoise: 210,        // travel whir loudness
  torpProxFuse: 26,
  explosionNoise: 760,
  explosionReveal: 460,
  decoyStart: 2,
  decoyCap: 4,
  decoyRange: 300,
  decoyLife: 6.5,
  decoyNoise: 700,
  decoyChirpInterval: 0.75,
  hullLightRadius: 96    // faint always-on self illumination
}

export type CreatureKind = 'drifter' | 'stalker' | 'screecher' | 'mauler' | 'leviathan'

export interface CreatureDef {
  radius: number
  hp: number
  cruise: number         // wander/investigate speed
  hunt: number           // pursuit speed
  accel: number
  turnRate: number
  hearingMult: number    // multiplies sound loudness for detection
  contactDamage: number
  moveNoise: number      // loudness of movement sounds at full speed
  moveNoiseInterval: number
  callInterval: [number, number]  // idle call every [min,max] seconds
  callNoise: number      // loudness (also reveals it to the player)
  score: number
  investigateTime: number // seconds it lingers hunting a stale contact
}

export const CREATURES: Record<CreatureKind, CreatureDef> = {
  drifter: {
    radius: 16, hp: 1, cruise: 46, hunt: 210, accel: 300, turnRate: 2.4,
    hearingMult: 0.55, contactDamage: 8, moveNoise: 150, moveNoiseInterval: 1.1,
    callInterval: [5, 9], callNoise: 320, score: 100, investigateTime: 3
  },
  stalker: {
    radius: 15, hp: 2, cruise: 74, hunt: 252, accel: 520, turnRate: 3.4,
    hearingMult: 1.45, contactDamage: 20, moveNoise: 190, moveNoiseInterval: 0.8,
    callInterval: [7, 12], callNoise: 380, score: 300, investigateTime: 9
  },
  screecher: {
    radius: 17, hp: 2, cruise: 92, hunt: 196, accel: 380, turnRate: 2.8,
    hearingMult: 1.0, contactDamage: 12, moveNoise: 170, moveNoiseInterval: 0.9,
    callInterval: [90, 90], callNoise: 0, score: 250, investigateTime: 6
    // screechers don't idle-call: they PING (see screechPingInterval below)
  },
  mauler: {
    radius: 30, hp: 4, cruise: 52, hunt: 388, accel: 900, turnRate: 1.9,
    hearingMult: 0.9, contactDamage: 32, moveNoise: 260, moveNoiseInterval: 0.7,
    callInterval: [9, 15], callNoise: 520, score: 500, investigateTime: 7
  },
  leviathan: {
    radius: 34, hp: 9999, cruise: 150, hunt: 268, accel: 480, turnRate: 1.6,
    hearingMult: 2.3, contactDamage: 50, moveNoise: 420, moveNoiseInterval: 0.55,
    callInterval: [20, 26], callNoise: 900, score: 0, investigateTime: 14
  }
}

export const SCREECHER_PING = {
  interval: [6.5, 9.5] as [number, number],
  radius: 680,
  speed: 700,
  alertRadius: 950       // creatures within this of the screecher learn player pos
}

export const MAULER = {
  windup: 0.72,
  chargeSpeed: 400,
  chargeTime: 1.5,
  wallStun: 1.7,
  chargeNoise: 480
}

export const LEVIATHAN = {
  segments: 11,
  segSpacing: 26,
  pingInterval: 7.5,
  pingRadius: 1500,
  pingSpeed: 900,
  flinchTime: 1.35,      // torpedo hit reaction
  loseInterestDist: 1500,
  beaconDwell: 1.4       // seconds standing on the ascent station to win
}

export const MINE = {
  radius: 11,
  proxPlayer: 34,
  proxCreature: 40,
  fuse: 0.4,
  blastRadius: 105,
  damagePlayer: 42,
  damageCreature: 2,     // hp
  chainRadius: 130,
  noise: 820
}

export const VENT = {
  interval: [2.2, 4.0] as [number, number],
  noise: 240,
  maskRadius: 140,       // player quieter within this range
  maskFactor: 0.42
}

// Echo/phosphor rendering
export const ECHO = {
  dotSpacing: 6.5,
  dotFade: 7.5,          // seconds for terrain echo to fully fade
  ghostFade: 3.4,        // creature ghost fade
  markerFade: 26,        // pickups/mines/hatch marker persistence after reveal
  blipFade: 3.2,         // bearing scope blips
  occlusionMinR: 230     // wavefronts smaller than this skip occlusion raycasts
}

export const AGITATION = {
  ramp: 100 / 150,       // per second: full agitation after 150s in a zone
  killSpike: 8,
  maxHearingBonus: 0.5,  // +50% hearing at full agitation
  maxCallRateBonus: 0.45
}

export interface ZoneDef {
  name: string
  depth: number          // meters, display
  gw: number             // grid width (cells)
  gh: number
  fillChance: number     // initial CA solid probability
  quota: number
  spawns: Partial<Record<CreatureKind, number>>
  mines: number
  vents: number
  caches: number         // torpedo caches
  repairs: number
  decoys: number
  log: string
}

export const ZONES: ZoneDef[] = [
  {
    name: 'SURVEY SHELF', depth: 140, gw: 96, gh: 72, fillChance: 0.44,
    quota: 3, spawns: { drifter: 4, stalker: 1 }, mines: 0, vents: 2,
    caches: 2, repairs: 1, decoys: 1,
    log: 'The survey team stopped answering six weeks ago. Company says the salvage rights are ours if we can prove the seam is still open. Simple job: sweep the shelf, thin out whatever moved in, drop deeper.'
  },
  {
    name: 'DRIFT CAVES', depth: 390, gw: 112, gh: 84, fillChance: 0.45,
    quota: 4, spawns: { drifter: 3, stalker: 2, screecher: 1 }, mines: 0, vents: 3,
    caches: 2, repairs: 1, decoys: 1,
    log: 'Last probe we winched out of here came back stripped to the frame. Teeth marks around the hydrophone. Whatever lives down here, it went for the part that listens.'
  },
  {
    name: 'THE NURSERY', depth: 700, gw: 122, gh: 90, fillChance: 0.46,
    quota: 5, spawns: { drifter: 3, stalker: 2, screecher: 2 }, mines: 9, vents: 3,
    caches: 3, repairs: 1, decoys: 1,
    log: 'The survey team seeded this cavern with contact mines on their way down. They were not trying to kill anything. They were trying to hear it coming. Mind the drift - the mines do not care whose hull it is.'
  },
  {
    name: 'BLACKSMOKER FIELD', depth: 1150, gw: 130, gh: 96, fillChance: 0.46,
    quota: 6, spawns: { drifter: 2, stalker: 3, screecher: 2, mauler: 1 }, mines: 10, vents: 6,
    caches: 3, repairs: 2, decoys: 2,
    log: 'Geothermal vents roar all through this field. The big ones hunt by ear alone - park yourself in the vent-wash and you are a rumor. Step out and you are a dinner bell.'
  },
  {
    name: 'THE THROAT', depth: 1600, gw: 136, gh: 100, fillChance: 0.47,
    quota: 7, spawns: { drifter: 2, stalker: 3, screecher: 3, mauler: 2 }, mines: 12, vents: 4,
    caches: 4, repairs: 2, decoys: 2,
    log: 'Final log entry from the survey master, recovered from a buoy: "It is not that the dark has teeth. It is that the dark has ears. God help anyone who comes down here loud."'
  },
  {
    name: 'ABYSSAL GATE', depth: 2100, gw: 140, gh: 104, fillChance: 0.45,
    quota: 0, spawns: { leviathan: 1 }, mines: 14, vents: 7,
    caches: 3, repairs: 2, decoys: 2,
    log: 'There it is. The thing that ate a survey fleet. You cannot kill it and you cannot outrun it in open water. The emergency ascent station is somewhere in this cavern. Get there. Get out. Do not. Make. A. Sound.'
  }
]

export interface UpgradeDef {
  id: string
  name: string
  desc: string
  flavor: string
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'laminar', name: 'LAMINAR SKIN', desc: 'Engine noise -35%. Run closer before they turn.', flavor: 'The hull stops arguing with the water.' },
  { id: 'phosphor', name: 'LONG PHOSPHOR', desc: 'Echoes linger +70% longer on your scope.', flavor: 'The dark forgets slower.' },
  { id: 'autoloader', name: 'QUICK-FEED AUTOLOADER', desc: 'Torpedo reload -40%.', flavor: 'The tube is hungry too.' },
  { id: 'warheads', name: 'HIGH-YIELD WARHEADS', desc: 'Torpedoes deal double damage, bigger blast.', flavor: 'Overkill is a kind of mercy.' },
  { id: 'broadband', name: 'BROADBAND ARRAY', desc: 'Ping radius +40%, ping cooldown -25%.', flavor: 'Shout, and the whole cave answers.' },
  { id: 'decoys', name: 'DECOY RACK', desc: '+2 decoys now, capacity +2. Decoys ring louder.', flavor: 'Teach them to trust noise. Then lie.' },
  { id: 'plating', name: 'PRESSURE PLATING', desc: 'Max hull +30. Repairs +30 now.', flavor: 'More metal between you and the teeth.' },
  { id: 'flank', name: 'FLANK GOVERNOR OVERRIDE', desc: 'Flank reserve lasts twice as long. +8% top speed.', flavor: 'Loud, fast, and briefly unkillable.' },
  { id: 'towed', name: 'TOWED HYDROPHONE ARRAY', desc: 'Their sounds paint brighter, longer reveals.', flavor: 'You learn to see with their voices.' }
]

export const SCORE = {
  silentKillMult: 1.5,
  zoneClearBase: 400,
  zoneClearPerDepth: 0.35,  // × depth in meters
  accuracyBonusMax: 1200,
  hullBonusPerPoint: 6,
  winBonus: 3000,
  ranks: [
    { min: 14000, rank: 'S', line: 'The deep learned to fear a quiet propeller.' },
    { min: 10500, rank: 'A', line: 'Textbook. The kind of dive they teach from.' },
    { min: 7000, rank: 'B', line: 'Loud in places. Alive in all of them.' },
    { min: 4000, rank: 'C', line: 'You brought a lot of noise down there.' },
    { min: 0, rank: 'D', line: 'The ocean heard you coming from the dock.' }
  ]
}

export const PICKUP = {
  torpAmount: 4,
  repairAmount: 35,
  decoyAmount: 2,
  salvageTorps: 2,
  salvageChance: 0.6,   // rises to 1 when player is dry
  radius: 22
}

export const DESCEND_HEAL = 20
export const CELL = 34            // world grid cell size in px
export const SEG_HASH_CELL = 128
export const DOT_HASH_CELL = 96

export const TICKER_TIME = 4.2

export const VERSION = 'v1.0'
