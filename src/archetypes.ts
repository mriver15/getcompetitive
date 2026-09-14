/**
 * Curated competitive team-building archetypes.
 *
 * Static editorial content: describes recognizable team frameworks, the roles
 * that make them work, and generation-9-typical members. Members are indicative
 * of the current metagame, not exhaustive legal lists (use `list_tiers` /
 * `get_pokemon` for authoritative legality + stats).
 */

export type ArchetypeFormat = 'singles' | 'doubles' | 'both';
export type Playstyle = 'offense' | 'defense' | 'balance' | 'weather' | 'room' | 'gimmick';

export interface ArchetypeMember {
  species: string;
  role: string;
}

export interface Archetype {
  id: string;
  name: string;
  format: ArchetypeFormat;
  playstyle: Playstyle;
  summary: string;
  description: string;
  keyRoles: string[];
  members: ArchetypeMember[];
  strengths: string[];
  weaknesses: string[];
  counters: string[];
  tips: string[];
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'hyper-offense',
    name: 'Hyper Offense',
    format: 'singles',
    playstyle: 'offense',
    summary: 'Overwhelm with relentless pressure: lead a hazard/screen setter, then snowball with setup sweepers.',
    description:
      'Hyper Offense sacrifices long-term resilience for immediate pressure. A dedicated lead sets hazards or screens and usually faints, then several setup sweepers (Dragon Dance, Swords Dance, Calm Mind, Nasty Plot) trade one-for-one until one breaks through. Screens (Reflect/Light Screen/Aurora Veil) or Sticky Web are common speed-and-bulk crutches that let frailer sweepers set up. Every team slot is an attacker; defensive pivots are minimal or absent.',
    keyRoles: [
      'Suicide lead (Stealth Rock / Spikes / Sticky Web setter)',
      'Screen setter (Grimmsnarl / Alolan Ninetales)',
      'Dragon Dance / Swords Dance physical sweeper',
      'Nasty Plot / Calm Mind special sweeper',
      'Priority revenge killer (Sucker Punch / Extreme Speed)',
      'Cleanup sweeper with an immunity to hazards or status',
    ],
    members: [
      { species: 'Glimmora', role: 'Toxic Spikes / Stealth Rock suicide lead' },
      { species: 'Grimmsnarl', role: 'Prankster screen setter' },
      { species: 'Dragonite', role: 'Dragon Dance + Multiscale sweeper' },
      { species: 'Iron Valiant', role: 'Mixed Swords Dance / booster sweeper' },
      { species: 'Roaring Moon', role: 'Dragon Dance sweeper' },
      { species: 'Kingambit', role: 'Sucker Punch cleanup / endgame wincon' },
    ],
    strengths: [
      'Very short games; punishes passive play and slow pivots',
      'Forces rapid defensive switches and chips momentum',
      'A single free turn for a sweeper can end the game',
    ],
    weaknesses: [
      'Loses to strong physical walls (Dondozo, Skarmory, Corviknight)',
      'Vulnerable to priority and Choice Scarf revenge killers',
      'Falls apart if screens/hazards are removed early',
    ],
    counters: [
      'Unaware walls (Dondozo, Clodsire, Skeledirge)',
      'Choice Scarf Dragapult / Iron Valiant',
      'Hazard removal + spinblock answers (Corviknight, Great Tusk)',
    ],
    tips: [
      'Preserve the screen setter long enough to get one full screen cycle.',
      'Stack at least two sweepers that share checks so one can wear the check down.',
      'Run a fast pivot (U-turn/Flip Turn) to bring sweepers in safely.',
    ],
  },
  {
    id: 'balance',
    name: 'Balance / Bulky Offense',
    format: 'singles',
    playstyle: 'balance',
    summary: 'A defensive backbone plus offensive pivots that chip and reposition until a breaker or win condition closes.',
    description:
      'Balance is the most consistent team style: two to three defensive Pokemon absorb hits and clear hazards, while offensive pivots force switches and rack up chip damage. A dedicated breaker or late-game sweeper (Kingambit, Dragapult) finishes. The defensive core is chosen to collectively cover the dominant attacking types in the tier (Fairy/Dark/Ghost/Steel coverage is key in Gen 9 OU).',
    keyRoles: [
      'Physical wall / mixed tank',
      'Special wall or bulky pivot (e.g. Assault Vest)',
      'Hazard remover (Defog / Rapid Spin)',
      'Wallbreaker (band/specs or setup)',
      'Revenge killer / speed control',
      'Late-game win condition',
    ],
    members: [
      { species: 'Great Tusk', role: 'Physical wall + Rapid Spin remover' },
      { species: 'Ting-Lu', role: 'Special sponge + Stealth Rock / Spikes' },
      { species: 'Gholdengo', role: 'Spinblocker + breaker (Nasty Plot / Choice Specs)' },
      { species: 'Dragapult', role: 'Fast pivot / revenge killer' },
      { species: 'Kingambit', role: 'Endgame win condition' },
      { species: 'Alomomola', role: 'Wish pass + Regenerator pivot' },
    ],
    strengths: [
      'Answers most of the meta reliably; low variance',
      'Leverages hazards and chip without committing',
      'Adaptable in preview and in-game',
    ],
    weaknesses: [
      'Can be outpaced by Hyper Offense before it stabilizes',
      'Struggles against teams with multiple setup win conditions',
      'Momentum can bleed away vs. fat stall',
    ],
    counters: [
      'Wallbreakers with near-perfect coverage (Ursaluna, Chi-Yu if legal)',
      'Bulky setup sweepers (Curse/Calm Mind users)',
      'Trapping (blocking the pivot out)',
    ],
    tips: [
      'Make sure the defensive core resists, not just checks, the tier\u2019s top threats.',
      'Every pivot should either remove hazards, set them, or force chip.',
      'Keep one answer to Kingambit and one to Dragapult in every game plan.',
    ],
  },
  {
    id: 'stall',
    name: 'Stall',
    format: 'singles',
    playstyle: 'defense',
    summary: 'Deny all progress with walls, hazards, status, and recovery until the opponent runs out of resources.',
    description:
      'Stall wins by making every opposing action unprofitable: entry hazards punish switches, status (Toxic/Will-O-Wisp) and chip moves (Salt Cure) whittle walls, and Regenerator/Unaware/Heavy-Duty Boots users endlessly recover. Win conditions are passive (hazard damage, Struggle) or a single Unaware wincon that cannot be broken. Games are long and require precise hazard control and PP management.',
    keyRoles: [
      'Unaware physical wall',
      'Unaware special wall',
      'Hazard setter (Spikes / Stealth Rock / Toxic Spikes)',
      'Spinblocker / hazard denier',
      'Status spreader (Toxic / Will-O-Wisp / Salt Cure)',
      'Wish passer / cleric (Heal Bell)',
    ],
    members: [
      { species: 'Dondozo', role: 'Unaware physical wall' },
      { species: 'Clodsire', role: 'Unaware special wall + Toxic Spikes' },
      { species: 'Garganacl', role: 'Salt Cure + Stealth Rock' },
      { species: 'Blissey', role: 'Special wall + Wish/Heal Bell' },
      { species: 'Toxapex', role: 'Regenerator wall + Toxic Spikes' },
      { species: 'Corviknight', role: 'Defog + U-turn pivot' },
    ],
    strengths: [
      'Extremely resilient to unboosted attackers',
      'Passive damage beats teams without hazard control',
      'Punishes impatience and overextension',
    ],
    weaknesses: [
      'Folds to mixed/hard-hitting breakers (e.g. Ursaluna, Iron Hands)',
      'Very weak to Taunt and setup sweepers that outspeed walls',
      'Slow games risk timer and PP issues',
    ],
    counters: [
      'Taunt users (Annihilape, Gliscor)',
      'Set-up sweepers with Substitute (e.g. Substitute + Calm Mind)',
      'Trapping + hazard stack to break the boots',
    ],
    tips: [
      'Always carry a form of hazard removal; stall dies to its own weight otherwise.',
      'Every wall should have a way to recover HP and answer at least two meta threats.',
      'Salt Cure + Toxic pressure is the classic Gen 9 engine.',
    ],
  },
  {
    id: 'rain',
    name: 'Rain',
    format: 'both',
    playstyle: 'weather',
    summary: 'Set rain (Drizzle / Rain Dance), then overwhelm with Swift Swim sweepers and boosted Water STAB.',
    description:
      'Rain accelerates the game through Drizzle from Pelipper (singles) or Politoed (historically), plus Swift Swim abusers like Barraskewda and Floatzel that outspeed nearly everything and spam Wave Crash/Liquidation. Water moves gain +50% and Fire moves are weakened, making rain teams resistant to common sun counterplay. Thunder and Hurricane become perfectly accurate. In doubles, rain enables fast spread (Muddy Water, Origin Pulse) and pairs with Electric or Grass coverage.',
    keyRoles: [
      'Drizzle setter (Pelipper)',
      'Swift Swim sweeper (Barraskewda, Floatzel, Kingdra)',
      'Electric immunity / Rock setter (Ferrothorn, Garchomp)',
      'Special breaker with 100% Thunder/Hurricane',
      'Grass answer (Rillaboom) for opposing Water/Ground walls',
    ],
    members: [
      { species: 'Pelipper', role: 'Drizzle + U-turn / Defog' },
      { species: 'Barraskewda', role: 'Swift Swim + Wave Crash / Flip Turn' },
      { species: 'Floatzel', role: 'Swift Swim + Wave Crash (Tera Water)' },
      { species: 'Zapdos', role: '100% Thunder + Hurricane breaker' },
      { species: 'Ferrothorn', role: 'Spikes + Steel + Grass resist' },
      { species: 'Rillaboom', role: 'Grassy Terrain pivot + Water/Ground answer' },
    ],
    strengths: [
      'Speed control and wall-breaking from turn one',
      'Water spam is hard to switch into without a Water immunity',
      'Weakens Fire and removes opposing sun on switch-in',
    ],
    weaknesses: [
      'Loses the weather war to permanent sun/sand setters',
      'Reliant on the setter surviving; Pelipper is frailer than it looks',
      'Weak to opposing Water/Grass walls (Rillaboom, Ogerpon-Wellspring)',
    ],
    counters: [
      'Rillaboom (Grassy Glide revenge + Grassy Terrain reset)',
      'Water-immune or 4x-Water-resistant walls (Gastrodon, Storm Drain)',
      'Sand/Sun setters to flip the weather',
    ],
    tips: [
      'Keep the weather setter healthy; losing Drizzle mid-game is fatal.',
      'Run at least one Water immunity/resist of your own for the mirror.',
      'Tera Water on a Swift Swim sweeper makes Wave Crash a nuke.',
    ],
  },
  {
    id: 'sun',
    name: 'Sun',
    format: 'both',
    playstyle: 'weather',
    summary: 'Drought powers Protosynthesis paradox mons and Solar Power/Chlorophyll sweepers for a blazing offense.',
    description:
      'Sun revolves around Torkoal (singles) or Ninetales setting Drought. Fire moves gain +50%, Water is weakened, and Generation 9\u2019s Protosynthesis lets paradox Pokemon (Great Tusk, Roaring Moon, Walking Wake, Raging Bolt) boost their best stat for free. Chlorophyll (Venusaur, Lilligant-H) and Solar Power (Charizard) give sun extra speed and wall-breaking. In doubles, sun pairs with Trick Room (Torkoal Eruption) or After You/Chlorophyll speed shenanigans.',
    keyRoles: [
      'Drought setter (Torkoal / Ninetales)',
      'Protosynthesis abuser (Great Tusk, Roaring Moon, Walking Wake, Raging Bolt)',
      'Chlorophyll sweeper (Venusaur, Lilligant-H)',
      'Solar Power special breaker (Charizard)',
      'Fire-immune / Rock answer (Great Tusk also covers this)',
    ],
    members: [
      { species: 'Torkoal', role: 'Drought + Stealth Rock / Rapid Spin / Eruption' },
      { species: 'Walking Wake', role: 'Protosynthesis special breaker' },
      { species: 'Roaring Moon', role: 'Protosynthesis Dragon Dance sweeper' },
      { species: 'Great Tusk', role: 'Protosynthesis physical breaker + spinner' },
      { species: 'Raging Bolt', role: 'Protosynthesis special attacker + Thunderclap' },
      { species: 'Charizard', role: 'Solar Power wallbreaker' },
    ],
    strengths: [
      'Insane wall-breaking from boosted Fire and Protosynthesis',
      'Great Tusk covers Rock and hazard control simultaneously',
      'Sun\u2019s boost is passive; no setup turn required',
    ],
    weaknesses: [
      'Water moves are halved but Water-type attackers still threaten',
      'Loses weather war to rain/sand setters',
      'Fire-weak sweepers get crushed by Rock/Earthquake coverage',
    ],
    counters: [
      'Rain teams (flip weather + half Fire damage)',
      'Flash Fire / Heatran-style walls',
      'Priority Aqua Jet (Azumarill) and Sucker Punch',
    ],
    tips: [
      'EV Protosynthesis users so the boosted stat (not Speed) is what activates under sun.',
      'Keep a Fire-immune or Rock resist for the mirror.',
      'Torkoal is slow: use Eruption only before it takes chip damage.',
    ],
  },
  {
    id: 'sand',
    name: 'Sand',
    format: 'singles',
    playstyle: 'weather',
    summary: 'Sandstorm chips and enables Sand Rush Excadrill / Rock-types for a sturdy offensive core.',
    description:
      'Sand teams set Sand Stream (Tyranitar, Hippowdon) for chip damage and to power Sand Rush Excadrill, one of the best speed-and-breaking engines in the game. Sandstorm also gives Rock-types +50% Special Defense, making them hard to revenge-kill specially. Sand pairs naturally with hazard setters and Steel-types that benefit from the residual chip against opposing walls.',
    keyRoles: [
      'Sand Stream setter (Tyranitar / Hippowdon)',
      'Sand Rush sweeper (Excadrill)',
      'Special attacker that punishes Sand\u2019s Rock resist answers',
      'Hazard setter (Glimmora, Garchomp)',
      'Flying/Levitate answer to Ground spam',
    ],
    members: [
      { species: 'Tyranitar', role: 'Sand Stream + Stealth Rock / pursuit-style pressure' },
      { species: 'Excadrill', role: 'Sand Rush + Earthquake / Iron Head sweeper' },
      { species: 'Garganacl', role: 'Salt Cure + Stealth Rock + Sand SpDef boost' },
      { species: 'Glimmora', role: 'Toxic Spikes + Stealth Rock' },
      { species: 'Corviknight', role: 'Defog + Flying resist + U-turn' },
      { species: 'Raging Bolt', role: 'Special breaker + priority' },
    ],
    strengths: [
      'Sand Rush gives Excadrill terrifying speed + breaking',
      'Residual chip punishes Boots-less pivots',
      'Rock SpDef boost patches the team\u2019s special weakness',
    ],
    weaknesses: [
      'Loses to rain/sun in the weather war',
      'Ground-immune walls (Corviknight, Rotom-Wash) wall the spam',
      'Tyranitar is slow and 4x weak to Fighting',
    ],
    counters: [
      'Rotom-Wash / Corviknight / Skarmory (Ground immunities)',
      'Grass cores (Rillaboom) that outspeed Excadrill outside sand',
      'Weather resets (Pelipper, Torkoal)',
    ],
    tips: [
      'Sand turns are finite: get Excadrill in while sand is up.',
      'Pair sand with Spikes to amplify the chip.',
      'Cover Excadrill\u2019s checks (Flying/Grass) with a Fire or Electric breaker.',
    ],
  },
  {
    id: 'snow',
    name: 'Snow',
    format: 'singles',
    playstyle: 'weather',
    summary: 'Snow Warning sets Aurora Veil and enables Slush Rush Cetitan for a bulk-boosted offense.',
    description:
      'Snow teams use Alolan Ninetales (Snow Warning) or Slowking-Galar (Chilly Reception) to set snow, which boosts Ice-types\u2019 Defense and enables Aurora Veil (a full dual screen behind snow) from Ninetales. Slush Rush Cetitan becomes a fast Belly Drum sweeper. The veil makes the whole team bulkier, letting slower breakers (Baxcalibur, Weavile) set up safely.',
    keyRoles: [
      'Snow setter + Aurora Veil user (Alolan Ninetales)',
      'Slush Rush sweeper (Cetitan)',
      'Chilly Reception pivot (Slowking-Galar)',
      'Ice-type breaker (Baxcalibur, Weavile)',
      'Fire/Steel/Rock answers for Ice\u2019s many weaknesses',
    ],
    members: [
      { species: 'Alolan Ninetales', role: 'Snow Warning + Aurora Veil' },
      { species: 'Cetitan', role: 'Slush Rush + Belly Drum sweeper' },
      { species: 'Slowking-Galar', role: 'Chilly Reception + Future Sight pivot' },
      { species: 'Baxcalibur', role: 'Glaive Rush / Scale Shot breaker' },
      { species: 'Weavile', role: 'Fast physical attacker + Knock Off' },
      { species: 'Great Tusk', role: 'Rock/Fire/Steel answer + hazard control' },
    ],
    strengths: [
      'Aurora Veil grants bulk without using item slots',
      'Snow-boosted Defense patches Ice\u2019s physical weakness',
      'Cetitan after Belly Drum under veil is a win condition',
    ],
    weaknesses: [
      'Ice\u2019s typing has many weaknesses to cover',
      'Relies on Ninetales living to set veil',
      'Slowking\u2019s Chilly Reception forces a switch (momentum cost)',
    ],
    counters: [
      'Steel-types that resist Ice and break veil (Kingambit, Scizor)',
      'Priority (Bullet Punch, Sucker Punch) to dodge setup',
      'Weather reset (Torkoal, Pelipper) to disable veil setup',
    ],
    tips: [
      'Set veil before committing the Belly Drum.',
      'Use Chilly Reception to reset snow without wasting a moveslot on Ninetales.',
      'Keep a Fire resist; Ice cores invite Fire coverage.',
    ],
  },
  {
    id: 'trick-room',
    name: 'Trick Room',
    format: 'both',
    playstyle: 'room',
    summary: 'Invert speed so slow heavy hitters move first; set Trick Room and swing with bulky attackers.',
    description:
      'Trick Room flips the turn order for five turns, letting slow, powerful Pokemon (Ursaluna, Iron Hands, Torkoal, Glastrier) move first. A bulky setter with reliable Trick Room (Hatterene with Magic Bounce, Cresselia, Farigiraf with Armor Tail) opens, then slow nukes spam. In doubles, Trick Room is a dominant archetype because spread damage and redirection (Rage Powder, Follow Me) protect the setter. Singles Trick Room uses the same setter and slow breakers.',
    keyRoles: [
      'Trick Room setter (Hatterene, Cresselia, Farigiraf)',
      'Redirection support (Rage Powder / Follow Me) in doubles',
      'Slow physical nuke (Ursaluna, Iron Hands, Glastrier)',
      'Slow special nuke (Torkoal Eruption, Reuniclus)',
      'A fast mode to operate outside Trick Room',
    ],
    members: [
      { species: 'Hatterene', role: 'Magic Bounce Trick Room setter' },
      { species: 'Ursaluna', role: 'Guts / Earthquake slow nuke' },
      { species: 'Iron Hands', role: 'Quark Drive physical tank + Fake Out' },
      { species: 'Torkoal', role: 'Slow Eruption under Trick Room' },
      { species: 'Farigiraf', role: 'Armor Tail setter + Expanding Force' },
      { species: 'Indeedee-F', role: 'Psychic Surge + Follow Me support' },
    ],
    strengths: [
      'Neutralizes opposing speed control and fast sweepers',
      'Slow nukes hit absurdly hard without speed investment',
      'Hatterene\u2019s Magic Bounce blocks Taunt and hazards',
    ],
    weaknesses: [
      'Trick Room turns are limited; a stalled setup wastes them',
      'Taunt on the setter ends the game plan',
      'Fast priority (Sucker Punch, Thunderclap) ignores the speed inversion',
    ],
    counters: [
      'Taunt users (faster than the setter outside Trick Room)',
      'Priority spam (Kingambit, Raging Bolt)',
      'Stalling out Trick Room with Protect (doubles) or recovery',
    ],
    tips: [
      'Run a fast secondary mode so you are not dead if Trick Room fails.',
      'EV for minimum Speed (0 IV Speed, negative nature) on abusers.',
      'Keep the setter alive; two setters is insurance.',
    ],
  },
  {
    id: 'sticky-web',
    name: 'Sticky Web',
    format: 'singles',
    playstyle: 'offense',
    summary: 'Lay Sticky Web to slow the opponent, then clean up with mid-speed breakers that now outspeed.',
    description:
      'Sticky Web lowers grounded opponents\u2019 Speed on entry, turning ordinarily mid-speed wallbreakers into pseudo-fast threats. The web setter (Ribombee, Araquanid) leads, and the team is built from breakers that are devastating if they move first. Gholdengo is the defining partner: its Good as Gold ability blocks Defog and Rapid Spin, protecting the web. Flying/Levitate Pokemon ignore web, so the team needs answers to them.',
    keyRoles: [
      'Sticky Web setter (Ribombee, Araquanid)',
      'Spinblocker / Defog blocker (Gholdengo)',
      'Wallbreaker that benefits from the Speed drop',
      'Flying-type / Levitate answer',
      'Hazard answer to your own web being mirrored',
    ],
    members: [
      { species: 'Ribombee', role: 'Sticky Web + Moonblast/Stun Spore setter' },
      { species: 'Gholdengo', role: 'Good as Gold spinblocker + breaker' },
      { species: 'Great Tusk', role: 'Breaker + Rapid Spin + hazard control' },
      { species: 'Kingambit', role: 'Sucker Punch + late-game wincon' },
      { species: 'Dragapult', role: 'Fast pivot + U-turn' },
      { species: 'Iron Valiant', role: 'Setup sweeper that punishes Flying answers' },
    ],
    strengths: [
      'Web neutralizes opposing Speed control in one move',
      'Gholdengo guarantees the web stays up vs. common removal',
      'Turns mid-speed breakers into sweepers',
    ],
    weaknesses: [
      'Does nothing to Flying/Levitate/Heavy-Duty Boots users',
      'Web is one-and-done; a predicted Defog before Gholdengo is in hurts',
      'The setter is passive and often faints for free momentum',
    ],
    counters: [
      'Heavy-Duty Boots teams (ignore web entirely)',
      'Flying spam (Corviknight, Zapdos, Enamorus)',
      'Defog + a way to KO or force out Gholdengo',
    ],
    tips: [
      'Sack the web setter deliberately, then bring Gholdengo in on the Defog.',
      'Pack Electric/Fire coverage for the Flying-types that ignore web.',
      'Boots on your own team lets you ignore the mirror match.',
    ],
  },
  {
    id: 'hazard-stack',
    name: 'Hazard Stack',
    format: 'singles',
    playstyle: 'defense',
    summary: 'Layer Stealth Rock + Spikes + Toxic Spikes and force switches with phazing and chip.',
    description:
      'Hazard Stack teams invest multiple moves in entry hazards (Stealth Rock, Spikes, Toxic Spikes) and use phazing (Roar/Whirlwind/Circle Throw), spinblocking (Gholdengo), and Knock Off (removes Heavy-Duty Boots) to guarantee the opponent takes chip on every switch. Salt Cure and Rough Skin/Rocky Helmet add more passive damage. The win condition is the opponent\u2019s team being worn into range of a single cleaner.',
    keyRoles: [
      'Stealth Rock setter',
      'Spikes / Toxic Spikes setter (Glimmora, Ferrothorn, Clodsire)',
      'Spinblocker (Gholdengo)',
      'Phazer (Roar/Whirlwind/Circle Throw)',
      'Knock Off spammer (removes Boots)',
      'Cleaner that sweeps the worn team',
    ],
    members: [
      { species: 'Glimmora', role: 'Toxic Spikes + Stealth Rock + Mortal Spin' },
      { species: 'Ferrothorn', role: 'Spikes + Leech Seed + Knock Off' },
      { species: 'Gholdengo', role: 'Spinblocker + Nasty Plot breaker' },
      { species: 'Ting-Lu', role: 'Stealth Rock + Spikes + Whirlwind' },
      { species: 'Garganacl', role: 'Salt Cure + Stealth Rock' },
      { species: 'Great Tusk', role: 'Rapid Spin (your own removal) + Knock Off' },
    ],
    strengths: [
      'Passive damage adds up fast against pivot-heavy teams',
      'Knock Off + hazards punish Boots-dependent builds',
      'Gholdengo\u2019s ability secures the hazard investment',
    ],
    weaknesses: [
      'Struggles vs. teams with reliable hazard removal + a Gholdengo answer',
      'Slow; gives setup sweepers free turns',
      'Heavy-Duty Boots teams ignore the core game plan',
    ],
    counters: [
      'Fast Defog users (Corviknight) with a way to remove Gholdengo',
      'Boots + Magic Bounce (Hatterene)',
      'Set-up sweepers that outpace the passive core',
    ],
    tips: [
      'Knock Off is the linchpin: it turns Boots off and doubles the hazard value.',
      'Keep Gholdengo alive; without it, one Defog undoes everything.',
      'Bring your own Rapid Spin for the mirror.',
    ],
  },
  {
    id: 'pivot-spam',
    name: 'VoltTurn / Pivot Spam',
    format: 'singles',
    playstyle: 'balance',
    summary: 'Keep momentum with U-turn/Volt Switch/Flip Turn to force favorable matchups and farm chip.',
    description:
      'Pivot spam runs multiple momentum moves (U-turn, Volt Switch, Flip Turn) so the team always dictates matchups. Every switch pressures the opponent and lets the team bring in its breakers or win conditions for free. Regenerator pivots (Alomomola, Slowking-Galar) and bulky pivots (Corviknight, Rotom-Wash) form the spine, while fast pivots (Dragapult, Meowscarada, Landorus-T) punish passive play.',
    keyRoles: [
      'Fast pivot (U-turn Dragapult/Meowscarada)',
      'Volt Switch pivot (Rotom-Wash, Zapdos)',
      'Regenerator slow pivot (Alomomola, Slowking-Galar)',
      'Hazard control (Great Tusk Rapid Spin / Corviknight Defog)',
      'Wallbreaker that benefits from free switch-ins',
      'Win condition that cleans up',
    ],
    members: [
      { species: 'Dragapult', role: 'Fast U-turn pivot' },
      { species: 'Meowscarada', role: 'U-turn + Protean pivot' },
      { species: 'Rotom-Wash', role: 'Volt Switch + Will-O-Wisp pivot' },
      { species: 'Alomomola', role: 'Regenerator Wish pass + Flip Turn' },
      { species: 'Corviknight', role: 'U-turn + Defog bulky pivot' },
      { species: 'Kingambit', role: 'Endgame cleaner' },
    ],
    strengths: [
      'Wins the positioning war against slower teams',
      'Hard to wall: every switch creates a new angle',
      'Regenerator pivots stay healthy through long games',
    ],
    weaknesses: [
      'Momentum collapses vs. Rocky Helmet / Rough Skin / Iron Barbs chip',
      'Hazards punish the constant switching',
      'Few dedicated walls; can be out-tanked',
    ],
    counters: [
      'Rocky Helmet + Rough Skin (Garchomp, Skarmory) punish pivot moves',
      'Hazard Stack (chip on every switch)',
      'Trapping (Magma Storm, Shadow Tag) to stop the cycling',
    ],
    tips: [
      'Wear Boots or accept a spinner to keep the pivot engine alive.',
      'Mix physical and special pivots so one wall cannot sit on both.',
      'Have a plan for Rocky Helmet chip before spamming U-turn.',
    ],
  },
  {
    id: 'screens-ho',
    name: 'Screens Hyper Offense',
    format: 'both',
    playstyle: 'offense',
    summary: 'Prankster/Aurora screens + setup sweepers that become unkillable behind dual screens.',
    description:
      'A dedicated screen setter (Grimmsnarl\u2019s Prankster Light Screen/Reflect, or Alolan Ninetales\u2019 Aurora Veil) makes the entire team effectively bulkier, letting setup sweepers (Dragon Dance, Swords Dance, Calm Mind) find free turns to boost. Light Clay extends screens to 8 turns. In doubles, screens plus redirection (Follow Me/Rage Powder) protect sweepers from spread damage.',
    keyRoles: [
      'Prankster screen setter (Grimmsnarl) or Aurora Veil user (Alolan Ninetales)',
      'Dragon Dance physical sweeper',
      'Calm Mind / Nasty Plot special sweeper',
      'Bulky setup sweeper that abuses screens',
      'Priority cleaner (Sucker Punch / Extreme Speed)',
    ],
    members: [
      { species: 'Grimmsnarl', role: 'Prankster Reflect + Light Screen + Parting Shot' },
      { species: 'Alolan Ninetales', role: 'Snow Warning + Aurora Veil' },
      { species: 'Dragonite', role: 'Dragon Dance + Multiscale sweeper' },
      { species: 'Roaring Moon', role: 'Dragon Dance sweeper' },
      { species: 'Iron Valiant', role: 'Booster Energy mixed sweeper' },
      { species: 'Kingambit', role: 'Sucker Punch cleanup' },
    ],
    strengths: [
      'Screens turn frail sweepers into tanks for the setup turn',
      'Light Clay gives an 8-turn window to snowball',
      'Hard to stop a boosted sweeper once set up',
    ],
    weaknesses: [
      'Defog/Brick Break/Court Change removes screens',
      'The screen setter itself is passive and vulnerable',
      'Struggles vs. Unaware walls that ignore boosts',
    ],
    counters: [
      'Defog / Court Change (Cinderace, Corviknight)',
      'Unaware (Dondozo, Clodsire, Skeledirge)',
      'Brick Break / Psychic Fangs to shatter screens',
    ],
    tips: [
      'Light Clay is mandatory on the setter.',
      'Bring two sweepers that share checks so one softens the other\u2019s counters.',
      'In doubles, pair screens with redirection to fully shield setup.',
    ],
  },
  {
    id: 'tailwind',
    name: 'Tailwind',
    format: 'doubles',
    playstyle: 'offense',
    summary: 'Prankster Tailwind doubles your Speed for 4 turns and lets fast nukes steamroll in VGC.',
    description:
      'Tailwind is the backbone of VGC offense: a Prankster user (Tornadus, Whimsicott) sets Tailwind with priority, doubling the team\u2019s Speed for four turns. Fast, hard-hitting attackers (Urshifu, Flutter Mane, Iron Bundle, Landorus-T) then sweep. Tornadus also provides weather/hazard utility and Bleakwind Storm. The archetype races to win inside the four turns of speed advantage.',
    keyRoles: [
      'Prankster Tailwind setter (Tornadus, Whimsicott)',
      'Fast physical sweeper (Urshifu, Landorus-T)',
      'Fast special sweeper (Flutter Mane, Iron Bundle, Chi-Yu)',
      'Redirection / Fake Out support',
      'A slow-mode / weather answer for the mirror',
    ],
    members: [
      { species: 'Tornadus', role: 'Prankster Tailwind + Bleakwind Storm' },
      { species: 'Whimsicott', role: 'Prankster Tailwind + Encore/Taunt' },
      { species: 'Urshifu-Rapid Strike', role: 'Surging Strikes wallbreaker' },
      { species: 'Flutter Mane', role: 'Booster Energy fast special sweeper' },
      { species: 'Iron Bundle', role: 'Booster Energy fast special sweeper' },
      { species: 'Landorus-Therian', role: 'Intimidate + Earthquake/Rock Slide' },
    ],
    strengths: [
      'Priority Tailwind is near-impossible to prevent',
      'Wins the speed war and ends games in 4 turns',
      'Prankster users add Taunt/Encore disruption for free',
    ],
    weaknesses: [
      'Only 4 turns; a stalled Tailwind is wasted',
      'Psychic Terrain / Indeedee\u2019s Follow Me can blunt the sweep',
      'Trick Room reverses the speed advantage entirely',
    ],
    counters: [
      'Trick Room teams (invert the speed)',
      'Psychic Terrain (blocks Prankster priority)',
      'Wide Guard / Protect to stall Tailwind turns',
    ],
    tips: [
      'Re-set Tailwind proactively before it expires.',
      'Pack Taunt/Encore to stop opposing Trick Room.',
      'Protect on turn 4 is often the difference between winning and losing.',
    ],
  },
  {
    id: 'perish-trap',
    name: 'Perish Trap',
    format: 'doubles',
    playstyle: 'gimmick',
    summary: 'Shadow Tag Gothitelle locks the field while Perish Song forces a countdown to a forced win.',
    description:
      'Perish Trap uses Gothitelle\u2019s Shadow Tag to prevent switching, then Perish Song gives every Pokemon a 3-turn countdown. The trapper Protects and re-traps as needed while the opponent is forced to faint. Scream Tail, Politoed, and Lapras are common Perish Song users. It is a high-skill gimmick that punishes teams lacking a way to KO or pivot the trapper.',
    keyRoles: [
      'Shadow Tag trapper (Gothitelle)',
      'Perish Song user (Scream Tail, Politoed, Azumarill)',
      'Protect/redirection to stall the countdown',
      'A backup win condition (perish trap is fragile)',
    ],
    members: [
      { species: 'Gothitelle', role: 'Shadow Tag trapper + Protect' },
      { species: 'Scream Tail', role: 'Perish Song + bulky support' },
      { species: 'Politoed', role: 'Perish Song + weather control' },
      { species: 'Azumarill', role: 'Perish Song + Aqua Jet pressure' },
      { species: 'Indeedee-F', role: 'Psychic Surge + Follow Me redirection' },
    ],
    strengths: [
      'Ignores typing/stat matchups entirely once locked',
      'Shadow Tag is impossible to escape by switching',
      'Wins against bulky stall-ish teams that cannot break the trapper',
    ],
    weaknesses: [
      'Weak to fast offense that KOs Gothitelle before it sets up',
      'U-turn/Volt Switch escape Shadow Tag',
      'One mistake in the countdown throws the game',
    ],
    counters: [
      'Pivot moves (U-turn, Volt Switch, Flip Turn) to escape',
      'Fast attackers that KO Gothitelle on turn 1',
      'Ghost-types that ignore Shadow Tag',
    ],
    tips: [
      'Protect on the correct turn to keep the trapper alive through the countdown.',
      'Bring a pivot move of your own to escape your own trap in the mirror.',
      'This is a tournament niche pick, not a ladder mainstay.',
    ],
  },
  {
    id: 'psychic-terrain',
    name: 'Psychic Terrain (PsySpam)',
    format: 'doubles',
    playstyle: 'offense',
    summary: 'Psychic Surge + Expanding Force nukes under terrain while blocking priority.',
    description:
      'Indeedee-F\u2019s Psychic Surge sets Psychic Terrain, boosting Psychic moves and making Expanding Force a spread 120+ BP nuke. Terrain also blocks priority moves (protecting the team from Sucker Punch/Fake Out). Hatterene, Armarouge, Iron Crown, and Farigiraf spam Expanding Force while Follow Me redirects. The archetype is a VGC staple because terrain both fuels offense and shuts down opposing priority.',
    keyRoles: [
      'Psychic Surge setter (Indeedee-F)',
      'Expanding Force spammer (Armarouge, Hatterene, Iron Crown, Farigiraf)',
      'Follow Me redirection (Indeedee-F, Clefable)',
      'A non-Psychic breaker for Dark-types that resist the spam',
      'Trick Room mode (PsySpam pairs naturally with room)',
    ],
    members: [
      { species: 'Indeedee-F', role: 'Psychic Surge + Follow Me' },
      { species: 'Armarouge', role: 'Expanding Force + Armor Cannon' },
      { species: 'Hatterene', role: 'Expanding Force + Trick Room + Magic Bounce' },
      { species: 'Iron Crown', role: 'Expanding Force + Tachyon Cutter' },
      { species: 'Farigiraf', role: 'Armor Tail + Expanding Force' },
      { species: 'Torkoal', role: 'Trick Room slow nuke for Dark answers' },
    ],
    strengths: [
      'Terrain blocks priority, denying the opponent\u2019s Sucker Punch/Fake Out',
      'Expanding Force is a brutal spread nuke',
      'Pairs seamlessly with Trick Room (most abusers are slow)',
    ],
    weaknesses: [
      'Dark-types resist Psychic and threaten the whole core',
      'Terrain is contested (Rillaboom Grassy Terrain, Pincurchin Electric Terrain)',
      'Relies on Indeedee surviving to keep terrain up',
    ],
    counters: [
      'Dark-types (Urshifu, Kingambit, Chi-Yu)',
      'Terrain override (Rillaboom, Pincurchin)',
      'Wide Guard against Expanding Force',
    ],
    tips: [
      'Lead Indeedee + Expanding Force user for instant terrain pressure.',
      'Run a Fire or Fighting answer for the Dark-types.',
      'Indeedee\u2019s Follow Me keeps the nuke alive while terrain is up.',
    ],
  },
  {
    id: 'commander',
    name: 'Dondozo + Tatsugiri (Commander)',
    format: 'doubles',
    playstyle: 'gimmick',
    summary: 'Tatsugiri jumps into Dondozo\u2019s mouth, granting omniboosts and turning Dondozo into a raid boss.',
    description:
      'Tatsugiri\u2019s Commander ability lets it hide inside an allied Dondozo, granting +2 to all stats and making Dondozo near-unstoppable. Tatsugiri cannot be hit while inside (outside of edge cases), so the pairing is a two-slot engine that bulldozes teams without a hard answer. It is the defining VGC Gen 9 gimmick and forces every team to carry a dedicated check.',
    keyRoles: [
      'Dondozo (the boosted attacker)',
      'Tatsugiri (Commander trigger)',
      'Support that keeps Dondozo alive (Follow Me, Heal Pulse, redirection)',
      'A back-up mode if Dondozo is answered',
    ],
    members: [
      { species: 'Dondozo', role: 'Commander recipient + Order Up / Wave Crash' },
      { species: 'Tatsugiri', role: 'Commander trigger (Curly/Droopy/Stretchy forms)' },
      { species: 'Indeedee-F', role: 'Follow Me + Psychic Surge support' },
      { species: 'Amoonguss', role: 'Rage Powder + Spore redirection' },
      { species: 'Flutter Mane', role: 'Back-up special sweeper' },
    ],
    strengths: [
      '+2 to all stats turns Dondozo into a one-mon win condition',
      'Tatsugiri is untargetable while inside, so no easy KO',
      'Order Up boosts Dondozo\u2019s stats further on each hit',
    ],
    weaknesses: [
      'Two team slots committed to one plan; fragile if Dondozo faints',
      'Countered by Haze, Unaware, and strong Grass/Electric attackers',
      'Tatsugiri form/dragon flavor telegraphs the strategy in preview',
    ],
    counters: [
      'Haze (clears the boosts)',
      'Unaware walls',
      'Strong Grass/Electric attackers (Rillaboom, Raging Bolt, Iron Hands)',
    ],
    tips: [
      'Position Tatsugiri safely; its survival decides the game.',
      'Bring Heal Pulse / redirection to keep Dondozo healthy through the sweep.',
      'Respect the mirror: a faster Dondozo + Haze flips it.',
    ],
  },
];

const byId = new Map<string, Archetype>(ARCHETYPES.map((a) => [a.id, a]));
const byName = new Map<string, Archetype>(ARCHETYPES.map((a) => [a.name.toLowerCase(), a]));

export function getArchetype(query: string): Archetype | undefined {
  return byId.get(query.toLowerCase()) ?? byName.get(query.toLowerCase());
}

/** Compact view of an archetype: members reduced to species names. */
export interface ArchetypeSummary extends Omit<Archetype, 'members'> {
  members: string[];
}

export function listArchetypes(format?: ArchetypeFormat): ArchetypeSummary[] {
  const out = format ? ARCHETYPES.filter((a) => a.format === format || a.format === 'both') : ARCHETYPES;
  return out.map(({ members, ...meta }) => ({
    ...meta,
    members: members.map((m) => m.species),
  }));
}
