// === data/scenarios.js ===
/**
 * Story themes (“domain contexts”) for ArchiTrek.
 *
 * Each key under {@link SCENARIOS} is a theme id (e.g. `abstract`, `death_star`). The app uses it for
 * **display only**: element pickers, diagrams, and explanations still use canonical ArchiMate **element
 * names** and matrix validity; themes only change how those types read on screen.
 *
 * ── Label maps (keys are always canonical ArchiMate element type names) ─────────────────────
 *
 * **1. Flat `labels` (simple themes, including Abstract)**  
 * `labels: { "Business Actor": "…", "Node": "…", … }`  
 * Value per key:
 *   - `string` — shown as-is
 *   - `string[]` — one string chosen at random per session and cached (see `resolveLabel` in the UI)
 * Omitted keys fall back to the official element name.
 *
 * **2. `clusters` (micro-clusters / cohesive narratives)**  
 * `clusters: [ { labels: { … } }, … ]`  
 * Each entry is one alternate “story slice”. Optional `_description` is for authors only (not shown in
 * the app). Every `labels` object uses the same shape as flat `labels` above (strings only is typical).
 * The app keeps one active cluster index per theme (`state.activeClusterIndex`): it rolls when you
 * switch themes or use **Shuffle story** (↻) in the header; it stays stable across viewpoint, derived
 * toggle, and path operations. Scenarios with `clusters` and no top-level `labels` rely entirely on the
 * active cluster for thematic text.
 *
 * ── Other scenario fields ───────────────────────────────────────────────────────────────────
 *
 * - `label` — short name in the Theme dropdown  
 * - `name` — optional subtitle (e.g. in theme hover help)  
 * - `splashLines` — two lines for the first-visit welcome panel (story themes)  
 * - `perspectiveTitles` — titles for path perspective tabs A / B / C  
 * - `perspectiveEmpty` — copy when no path matches that perspective lens  
 *
 * ── ArchiMate semantics when writing copy (themes must not contradict the spec) ───────────
 *
 *   Device          — physical IT resource hosting software/artifacts  
 *   Node            — computational resource that hosts or interacts with others  
 *   Equipment       — physical machines that process materials (not “a PC”)  
 *   Facility        — physical structure or environment  
 *   System Software — OS / middleware / runtime — not applications  
 *   Application Component — replaceable application functionality  
 *   Business Actor  — entity that can perform behaviour  
 *   Business Role   — responsibility for behaviour, assigned to actors  
 *   Value Stream    — activity sequence delivering stakeholder value  
 *   Gap             — difference between two plateaus  
 *   Plateau         — stable architecture state over a period  
 */

/**
 * Resolve a label value used by **flat** `labels` maps: pick randomly from an array, or return a string.
 * Cluster slices usually use strings only; arrays remain supported for legacy flat maps.
 *
 * @param {string|string[]} value
 * @returns {string}
 */
function resolveLabel(value) {
  if (Array.isArray(value)) {
    return value[Math.floor(Math.random() * value.length)];
  }
  return value ?? "";
}

/**
 * Build a fully resolved label map from **flat** {@code scenario.labels} only (arrays collapsed).
 * Does not expand {@code clusters}; for runtime label resolution including clusters, see the app
 * (`getActiveScenarioLabelsMap` / `getEffectiveScenarioLabelsObject` in `ui/renderer.js` and `ui/app.js`).
 *
 * @param {string} scenarioKey
 * @returns {Object.<string, string>}
 */
function resolveScenarioLabels(scenarioKey) {
  const scenario = SCENARIOS[scenarioKey];
  if (!scenario) return {};
  const resolved = {};
  for (const [k, v] of Object.entries(scenario.labels ?? {})) {
    resolved[k] = resolveLabel(v);
  }
  return resolved;
}

const SCENARIOS = {

  // ══════════════════════════════════════════════════════════════════════════
  // ABSTRACT (DEFAULT)
  // ══════════════════════════════════════════════════════════════════════════

  abstract: {
    label: "Abstract (Default)",
    labels: {},
    perspectiveTitles: {
      A: "Business Operations",
      B: "System Infrastructure",
      C: "Strategic Realization",
    },
    perspectiveEmpty: {
      A: { intro: "No route currently stays only in Motivation, Strategy, or Business.", cta: "Add element to explore the business lens", suggestionsLead: "Try: Business Actor, Business Process, Business Service" },
      B: { intro: "No route currently stays only in Application, Technology, or Implementation.", cta: "Add element to explore the infrastructure lens", suggestionsLead: "Try: Application Component, Node, Device" },
      C: { intro: "No route currently bridges upper layers and infrastructure in one chain.", cta: "Add element to explore the cross-layer lens", suggestionsLead: "Try: Business Service, Application Service, Technology Service" },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // DEATH STAR — Galactic Empire strategic weapons platform
  // ══════════════════════════════════════════════════════════════════════════


  death_star: {
    label: "Death Star",
    name: "Galactic Empire Operations",
    splashLines: [
      "Empire operations on the Death Star: command, strategy, station IT, and physical systems from reactor to docking bays.",
      "ArchiMate element types are renamed into this setting so paths read like Imperial operations—inspiration only; validity still follows the spec.",
    ],

    // Micro-clusters: see file header (`clusters` + `state.activeClusterIndex`).
    clusters: [
      {
        _description: "Superlaser Firing Sequence",
        labels: {
          "Stakeholder": "Grand Moff Tarkin",
          "Driver": "Galactic Insurgency",
          "Assessment": "Rebel Alliance Threat Analysis",
          "Goal": "Total Galactic Order",
          "Outcome": "Fully Operational Battlestation",
          "Principle": "Tarkin Doctrine (Rule Through Fear)",
          "Requirement": "Planetary Destruction Capability",
          "Constraint": "Limited Kyber Crystal Supply",
          "Meaning": "Disturbance in the Force",
          "Value": "Unquestioned Absolute Power",
          
          "Resource": "Imperial Kyber Crystal Reserves",
          "Capability": "Strategic Orbital Bombardment",
          "Value Stream": "Order-to-Planetary-Compliance Stream",
          "Course of Action": "Single-Reactor Firing Sequence",
          
          "Business Actor": "Superlaser Operating Crew",
          "Business Role": "Gunnery Chief",
          "Business Collaboration": "Ignition Coordination Team",
          "Business Interface": "Firing Control Console",
          "Business Process": "Execute Superlaser Fire Sequence",
          "Business Function": "Weapon Systems Management",
          "Business Interaction": "Multi-Crew Ignition Synchronization",
          "Business Event": "Target Planet in Range",
          "Business Service": "Planetary Annihilation Service",
          "Business Object": "Firing Authorization Code",
          "Contract": "Targeting Directive",
          "Representation": "Tactical HUD Hologram",
          "Product": "Peace Through Absolute Power",
          
          "Application Component": "Superlaser Targeting Computer",
          "Application Collaboration": "Multi-Turbolaser Combat Data Link",
          "Application Interface": "Tactical HUD Interface",
          "Application Function": "Ballistic Trajectory Calculation",
          "Application Interaction": "Synchronized Firing Sequence",
          "Application Process": "Target Acquisition and Lock Routine",
          "Application Event": "Target Lock Confirmed",
          "Application Service": "Weapon Calibration Support",
          "Data Object": "Planet Trajectory Matrix",
          
          "Node": "Central Imperial Battle Computer",
          "Device": "Onboard Targeting Sensor Array",
          "System Software": "Fire Control OS",
          "Technology Collaboration": "Turbolaser Battery Control Mesh",
          "Technology Interface": "Targeting Uplink Port",
          "Path": "High-Bandwidth Targeting Network",
          "Communication Network": "Primary Weapon Data Bus",
          "Technology Function": "Kyber Chamber Alignment",
          "Technology Process": "Energy Amplification",
          "Technology Interaction": "Beam Convergence",
          "Technology Event": "Primary Ignition Initiated",
          "Technology Service": "Energy Focusing Service",
          "Technology Object": "Ignition Sequence Logs",
          "Artifact": "Firing Execution Manifest",
          
          "Equipment": "Kyber Crystal Focusing Array",
          "Facility": "Primary Weapon Shaft",
          "Distribution Network": "Superlaser Power Conduit",
          "Material": "Synthetic Kyber Crystals",
          
          "Work Package": "Targeting Calibration Phase",
          "Deliverable": "System Readiness Report",
          "Implementation Event": "Weapon Primed",
          "Plateau": "Full Firing Capability",
          "Gap": "Excessive Recoil Heat Generation",
          "Location": "Alderaan Sector"
        }
      },
      {
        _description: "Detention Block Security",
        labels: {
          "Stakeholder": "Imperial Security Bureau (ISB)",
          "Driver": "Information Extraction",
          "Assessment": "Hidden Rebel Base Location Unknown",
          "Goal": "Crush All Resistance",
          "Outcome": "Rebel Intel Secured",
          "Principle": "No Prisoners Without Interrogation",
          "Requirement": "Inescapable Confinement",
          "Constraint": "Diplomatic Immunity Technicalities",
          "Meaning": "Traitor to the Empire",
          "Value": "Actionable Intelligence",
          
          "Resource": "Mind-Probe Technology",
          "Capability": "Hostile Interrogation",
          "Value Stream": "Capture-to-Confession Stream",
          "Course of Action": "Deploy Interrogation Droid",
          
          "Business Actor": "Stormtrooper Guard",
          "Business Role": "Detention Block Supervisor",
          "Business Collaboration": "Cell Block Security Detail",
          "Business Interface": "Detention Block Control Desk",
          "Business Process": "Interrogate Rebel Prisoners",
          "Business Function": "Station Internal Security",
          "Business Interaction": "Prisoner Transfer Protocol",
          "Business Event": "Unauthorized Intruder Detected",
          "Business Service": "Inmate Confinement Service",
          "Business Object": "Prisoner Transfer Log",
          "Contract": "Imperial Detainment Warrant",
          "Representation": "Security Camera Feed",
          "Product": "Secure Confinement Facility",
          
          "Application Component": "Cell Block Security Mainframe",
          "Application Collaboration": "Surveillance Tracking Network",
          "Application Interface": "Guard Station Terminal",
          "Application Function": "Biometric Identification",
          "Application Interaction": "Cell Door Lockdown Sequence",
          "Application Process": "Inmate Roster Verification",
          "Application Event": "Cell Door Malfunction",
          "Application Service": "Automated Lockdown Support",
          "Data Object": "Prisoner Medical Records",
          
          "Node": "Detention Sector Control Node",
          "Device": "Surveillance Camera Array",
          "System Software": "Inmate Tracking OS",
          "Technology Collaboration": "Automated Defense Grid",
          "Technology Interface": "Cell Door Electronic Lock",
          "Path": "Encrypted Security Channel",
          "Communication Network": "Internal Comm-Link Network",
          "Technology Function": "Force Field Generation",
          "Technology Process": "Security Feed Archiving",
          "Technology Interaction": "Automated Blaster Turret Tracking",
          "Technology Event": "Blast Doors Sealed",
          "Technology Service": "Surveillance Monitoring Service",
          "Technology Object": "Encrypted Security Footage",
          "Artifact": "Shift Patrol Roster",
          
          "Equipment": "IT-O Interrogation Droid",
          "Facility": "Imperial Detention Block AA-23",
          "Distribution Network": "Cell Block Ventilation System",
          "Material": "Reinforced Durasteel Cell Doors",
          
          "Work Package": "Security Upgrade Implementation",
          "Deliverable": "Active Security Grid",
          "Implementation Event": "Detention Block Online",
          "Plateau": "Maximum Security Readiness",
          "Gap": "Vulnerable Garbage Compactor Access",
          "Location": "Level 5, Detention Sector"
        }
      },
      {
        _description: "Core Reactor Engineering",
        labels: {
          "Stakeholder": "Chief Station Engineer",
          "Driver": "Station Energy Demands",
          "Assessment": "Power Output Efficiency Metrics",
          "Goal": "Uninterrupted Station Power",
          "Outcome": "Stable Core Output",
          "Principle": "Redundancy in Critical Systems",
          "Requirement": "Constant Cooling Circulation",
          "Constraint": "Maximum Core Temperature Limits",
          "Meaning": "Critical Infrastructure Health",
          "Value": "Operational Stability",
          
          "Resource": "Hypermatter Fuel Reserves",
          "Capability": "Deep Space Power Generation",
          "Value Stream": "Fuel-to-Energy Stream",
          "Course of Action": "Emergency Power Rerouting",
          
          "Business Actor": "Imperial Engineering Crew",
          "Business Role": "Reactor Technician",
          "Business Collaboration": "Core Maintenance Team",
          "Business Interface": "Engineering Bay Access Panel",
          "Business Process": "Regulate Core Temperature",
          "Business Function": "Station Infrastructure Maintenance",
          "Business Interaction": "Shift Handoff Briefing",
          "Business Event": "Reactor Power Surge",
          "Business Service": "Energy Distribution Management",
          "Business Object": "Reactor Maintenance Schedule",
          "Contract": "Safety Protocol Mandate",
          "Representation": "Core Schematic Hologram",
          "Product": "Station-Wide Energy Grid",
          
          "Application Component": "Reactor Diagnostic System",
          "Application Collaboration": "Coolant Flow Control Link",
          "Application Interface": "Engineering Diagnostic Terminal",
          "Application Function": "Thermal Output Monitoring",
          "Application Interaction": "Automated Coolant Flush",
          "Application Process": "Emergency Venting Protocol",
          "Application Event": "Critical Temperature Threshold Reached",
          "Application Service": "Automated Heat Dissipation",
          "Data Object": "Thermal Gradient Telemetry",
          
          "Node": "Engineering Sub-Station Server",
          "Device": "Diagnostic Handheld Terminal",
          "System Software": "Core Temperature Monitor OS",
          "Technology Collaboration": "Coolant Pump Mesh Network",
          "Technology Interface": "Magnetic Containment Valve",
          "Path": "Diagnostic Telemetry Link",
          "Communication Network": "Engineering Sub-Space Frequency",
          "Technology Function": "Magnetic Field Containment",
          "Technology Process": "Hypermatter Annihilation",
          "Technology Interaction": "Plasma Venting",
          "Technology Event": "Containment Field Fluctuation",
          "Technology Service": "Magnetic Stabilization Service",
          "Technology Object": "Core Diagnostic Logs",
          "Artifact": "Engineering Duty Roster",
          
          "Equipment": "Tractor Beam Generator Assembly",
          "Facility": "Main Reactor Core",
          "Distribution Network": "Station Power Conduit Network",
          "Material": "Quadanium Steel Hull Plating",
          
          "Work Package": "Routine Core Maintenance",
          "Deliverable": "Stabilized Magnetic Field",
          "Implementation Event": "Core Diagnostics Complete",
          "Plateau": "Nominal Power Generation",
          "Gap": "Unshielded Thermal Exhaust Port",
          "Location": "Equatorial Trench Engineering Bay"
        }
      }
    ],

    perspectiveTitles: {
      A: "Imperial Command and Strategic Intent",
      B: "Reactor Engineering and Station Security",
      C: "Galactic Domination — Cross-Layer Alignment",
    },
    perspectiveEmpty: {
      A: { intro: "No route currently isolates Imperial command and strategic intent.", cta: "Add element for the command lens", suggestionsLead: "Try: Stormtrooper Legion, Imperial Command Bridge, Imperial Justice Delivery" },
      B: { intro: "No route currently isolates reactor engineering and station security.", cta: "Add element for the engineering lens", suggestionsLead: "Try: Onboard Targeting Sensor Array, Imperial Command & Control OS, Station Power Conduit Network" },
      C: { intro: "No route currently bridges galactic strategy to physical infrastructure.", cta: "Add element for the cross-layer lens", suggestionsLead: "Try: Strategic Orbital Bombardment, Execute Superlaser Fire Sequence, Kyber Reactor Stabilization" },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // REBEL ALLIANCE — asymmetric warfare and intelligence operations
  // ══════════════════════════════════════════════════════════════════════════

  rebel_alliance: {
    label: "Rebel Alliance",
    name: "Rebel Alliance Resistance Operations",
    splashLines: [
      "Rebel cells and fleet ops: intelligence, strike planning, starfighters, and shipboard tech from leadership to the trench run.",
      "Standard types appear as Alliance actors, missions, and gear so cross-layer routes tell a resistance story—rules stay ArchiMate-correct.",
    ],
    
    // Micro-clusters: see file header.
    clusters: [
      {
        _description: "Trench Run Assault",
        labels: {
          "Stakeholder": "Princess Leia Organa",
          "Driver": "Galactic Imperial Oppression",
          "Assessment": "Death Star Imminent Firing Threat",
          "Goal": "Destroy the Death Star",
          "Outcome": "Station Reactor Detonation",
          "Principle": "Self-Sacrifice for the Greater Good",
          "Requirement": "Precise Proton Torpedo Delivery",
          "Constraint": "Heavy Turbolaser Fire",
          "Meaning": "Spark of Rebellion",
          "Value": "Survival of the Alliance",

          "Resource": "Red Squadron Pilots",
          "Capability": "Precision Starfighter Strike",
          "Value Stream": "Scramble-to-Target Stream",
          "Course of Action": "Assault on Thermal Exhaust Port",

          "Business Actor": "Red Squadron Pilot",
          "Business Role": "Gold Leader",
          "Business Collaboration": "Trench Run Strike Wing",
          "Business Interface": "Squadron Comms Frequency",
          "Business Process": "Execute Trench Run Attack",
          "Business Function": "Starfighter Combat Operations",
          "Business Interaction": "Covering Fire Coordination",
          "Business Event": "Approaching the Target Shaft",
          "Business Service": "Orbital Strike Defense",
          "Business Object": "Targeting Telemetry",
          "Contract": "Mission Briefing Parameters",
          "Representation": "Targeting Computer Display",
          "Product": "Neutralized Superweapon",

          "Application Component": "R2-Series Astromech Navigation System",
          "Application Collaboration": "Fighter-Droid Combat Data Link",
          "Application Interface": "Cockpit Targeting HUD",
          "Application Function": "Proton Torpedo Trajectory Calculation",
          "Application Interaction": "Astromech Damage Control Bypass",
          "Application Process": "Target Lock Acquisition",
          "Application Event": "Target Lock Confirmed",
          "Application Service": "In-Flight Diagnostics Support",
          "Data Object": "Exhaust Port Coordinates",

          "Node": "X-Wing Avionics Mainframe",
          "Device": "X-Wing Onboard Flight Computer",
          "System Software": "Incom T-65 Targeting OS",
          "Technology Collaboration": "Squadron Tactical Data Mesh",
          "Technology Interface": "S-Foil Actuator Control Port",
          "Path": "Encrypted Short-Range Telemetry Link",
          "Communication Network": "Fighter-to-Base Comm Network",
          "Technology Function": "Deflector Shield Angling",
          "Technology Process": "Emergency Power Shunt to Engines",
          "Technology Interaction": "Engine Thrust Synchronization",
          "Technology Event": "TIE Fighter Lock-On Detected",
          "Technology Service": "Evasive Maneuvers Calculation Service",
          "Technology Object": "Flight Recorder Logs",
          "Artifact": "Post-Flight Combat Analysis",

          "Equipment": "X-Wing Starfighter",
          "Facility": "Massassi Temple Hangar Bay",
          "Distribution Network": "Fighter Refueling Lines",
          "Material": "Proton Torpedo Munitions",

          "Work Package": "Operation: Trench Run",
          "Deliverable": "Direct Hit on Reactor Shaft",
          "Implementation Event": "Squadron Deployment",
          "Plateau": "Fighters in Attack Formation",
          "Gap": "Vulnerability to Trailing TIE Fighters",
          "Location": "Yavin Prime Orbit"
        }
      },
      {
        _description: "Intelligence & Espionage",
        labels: {
          "Stakeholder": "Mon Mothma (Supreme Commander)",
          "Driver": "Rumors of an Imperial Superweapon",
          "Assessment": "Severe Lack of Tactical Intel",
          "Goal": "Acquire Imperial Schematics",
          "Outcome": "Death Star Plans Secured",
          "Principle": "Information is the Best Weapon",
          "Requirement": "Undetected System Infiltration",
          "Constraint": "Guerrilla Warfare Resource Limitations",
          "Meaning": "A Chance for Victory",
          "Value": "Strategic Superiority",

          "Resource": "Alliance Intelligence Network",
          "Capability": "Deep Cover Infiltration",
          "Value Stream": "Infiltration-to-Extraction Stream",
          "Course of Action": "Heist the Citadel Data Vault",

          "Business Actor": "Bothan Spy",
          "Business Role": "Rebel Intelligence Agent",
          "Business Collaboration": "Covert Extraction Team",
          "Business Interface": "Secret Rebel Rendezvous Point",
          "Business Process": "Steal Imperial Data Tapes",
          "Business Function": "Covert Espionage Operations",
          "Business Interaction": "Clandestine Data Handoff",
          "Business Event": "Imperial Patrol Bypassed",
          "Business Service": "Secure Intelligence Courier Service",
          "Business Object": "Stolen Imperial Intelligence Dossier",
          "Contract": "Alliance Non-Disclosure Agreement",
          "Representation": "Encrypted Holo-Message",
          "Product": "Actionable Target Intelligence",

          "Application Component": "Cryptographic Decryption Engine",
          "Application Collaboration": "Slicer-Droid Interface Link",
          "Application Interface": "Data Spike Terminal",
          "Application Function": "Imperial Code Cylinder Emulation",
          "Application Interaction": "Vault Firewall Bypass Sequence",
          "Application Process": "Data Extraction Protocol",
          "Application Event": "Encryption Cipher Cracked",
          "Application Service": "Secure Data Decryption Service",
          "Data Object": "Death Star Technical Schematics",

          "Node": "Covert Listening Post Server",
          "Device": "Portable Slicer Datapad",
          "System Software": "Custom Intrusion Firmware",
          "Technology Collaboration": "Encrypted Rebel Darknet",
          "Technology Interface": "Imperial Data Port Tap",
          "Path": "Untraceable Sub-Space Routing",
          "Communication Network": "Hidden Rebel Transmitter Network",
          "Technology Function": "Imperial Signal Jamming",
          "Technology Process": "Data Pack Compression",
          "Technology Interaction": "Biometric Spoofing Sequence",
          "Technology Event": "Unauthorized Access Alarm Triggered",
          "Technology Service": "Signal Obfuscation Service",
          "Technology Object": "Stolen Access Tokens",
          "Artifact": "Forged Imperial Clearance Documents",

          "Equipment": "Slicer Gear Kit",
          "Facility": "Imperial Citadel Tower",
          "Distribution Network": "Smuggler Supply Routes",
          "Material": "Physical Data Tapes",

          "Work Package": "Operation: Stardust Retrieval",
          "Deliverable": "Transmitted Structural Plans",
          "Implementation Event": "Data Transmission Initiated",
          "Plateau": "Intel Secure on Blockade Runner",
          "Gap": "Vader's Flagship in Intercept Trajectory",
          "Location": "Scarif System Citadel"
        }
      },
      {
        _description: "Fleet Command & Evacuation",
        labels: {
          "Stakeholder": "Admiral Ackbar",
          "Driver": "Discovery of the Hidden Base",
          "Assessment": "Imperial Fleet Overwhelming Numbers",
          "Goal": "Ensure Fleet Survival",
          "Outcome": "Successful Hyperspace Escape",
          "Principle": "Live to Fight Another Day",
          "Requirement": "Covering Fire for Transports",
          "Constraint": "Planetary Ion Cannon Recharge Time",
          "Meaning": "Tactical Retreat",
          "Value": "Preservation of the Rebellion",

          "Resource": "Mon Calamari Cruisers",
          "Capability": "Capital Ship Coordination",
          "Value Stream": "Defense-to-Evacuation Stream",
          "Course of Action": "Scramble Escort Fighters",

          "Business Actor": "Alliance Fleet Commander",
          "Business Role": "Base Evacuation Coordinator",
          "Business Collaboration": "Transport Escort Convoy",
          "Business Interface": "Command Center Holo-Table",
          "Business Process": "Coordinate Fleet Hyperspace Jump",
          "Business Function": "Base Logistics and Evacuation",
          "Business Interaction": "Fleet Jump Synchronization",
          "Business Event": "Imperial Star Destroyers Entering Sector",
          "Business Service": "Safe Passage Escort Service",
          "Business Object": "Evacuation Roster",
          "Contract": "Fleet Rendezvous Protocol",
          "Representation": "Tactical Fleet Hologrid",
          "Product": "Secured Rebel Personnel",

          "Application Component": "Fleet Command Tactical System",
          "Application Collaboration": "Cruiser-to-Transport Nav Link",
          "Application Interface": "Bridge Command Console",
          "Application Function": "Hyperspace Vector Calculation",
          "Application Interaction": "Fleet-Wide Jump Sync",
          "Application Process": "Evacuation Countdown Routine",
          "Application Event": "Navicomputer Coordinates Locked",
          "Application Service": "Mass-Transit Jump Coordination",
          "Data Object": "Secret Rendezvous Coordinates",

          "Node": "Mon Calamari Fleet Command Server",
          "Device": "Capital Ship Navicomputer",
          "System Software": "Alliance Fleet Command OS",
          "Technology Collaboration": "Inter-Ship Telemetry Mesh",
          "Technology Interface": "Hyperdrive Motivator Relay",
          "Path": "Secret Smuggler's Hyperroute",
          "Communication Network": "Fleet Broadcast Channel",
          "Technology Function": "Planetary Shield Modulation",
          "Technology Process": "Ion Cannon Firing Sequence",
          "Technology Interaction": "Shield Door Synchronization",
          "Technology Event": "Energy Shield Holding",
          "Technology Service": "Long-Range Sensor Sweeps",
          "Technology Object": "Jump Trajectory Logs",
          "Artifact": "Fleet Deployment Manifest",

          "Equipment": "GR-75 Medium Transport",
          "Facility": "Echo Base Command Center",
          "Distribution Network": "Hangar Evacuation Tunnels",
          "Material": "Salvaged Starship Components",

          "Work Package": "Emergency Base Evacuation",
          "Deliverable": "Clear Flight Corridor",
          "Implementation Event": "First Transport Away",
          "Plateau": "Fleet Jumped to Lightsped",
          "Gap": "Blockading Star Destroyers",
          "Location": "Hoth System"
        }
      }
    ],

    perspectiveTitles: {
      A: "Rebel Command, Intelligence and Field Operations",
      B: "Fleet Technology and Fighter Systems",
      C: "Alliance Liberation Strategy — Cross-Layer Alignment",
    },
    perspectiveEmpty: {
      A: { intro: "No route currently isolates Rebel command, intelligence, and field operations.", cta: "Add element for the command lens", suggestionsLead: "Try: Alliance Freedom Fighter, Red Squadron Strike Group, Planetary Liberation Service" },
      B: { intro: "No route currently isolates fleet technology and fighter systems.", cta: "Add element for the technology lens", suggestionsLead: "Try: X-Wing Onboard Flight Computer, Mon Calamari Fleet Command Server, Encrypted Tactical Comms Relay" },
      C: { intro: "No route currently demonstrates alliance liberation through one cross-layer chain.", cta: "Add element for the cross-layer lens", suggestionsLead: "Try: Deep Space Infiltration, Execute Trench Run Attack, X-Wing Starfighter" },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HOSPITAL — clinical care operations
  // ══════════════════════════════════════════════════════════════════════════

  hospital: {
    label: "Hospital",
    name: "Clinical Care Operations",
    splashLines: [
      "A hospital delivering care: clinicians, patients, clinical software, devices, wards, and the pressures of safe, compliant service.",
      "Healthcare-flavored labels sit on the same element types so diagrams feel like patient journeys—not a different metamodel.",
    ],
    
    // Micro-clusters: see file header.
    clusters: [
      {
        _description: "Emergency Triage & Intake",
        labels: {
          "Stakeholder": "Arriving Emergency Patient",
          "Driver": "Acute Medical Emergency",
          "Assessment": "A&E Wait Time Audit",
          "Goal": "Rapid Patient Stabilization",
          "Outcome": "Patient Admitted to Ward",
          "Principle": "Treat Most Critical Patients First",
          "Requirement": "Immediate Triage Assessment",
          "Constraint": "ED Bed Availability",
          "Meaning": "Critical Medical Need",
          "Value": "Immediate Life Preservation",

          "Resource": "Emergency Triage Staff",
          "Capability": "Rapid Diagnostic Screening",
          "Value Stream": "Arrival-to-Stabilization Stream",
          "Course of Action": "Initiate Fast-Track Trauma Protocol",

          "Business Actor": "Triage Nurse",
          "Business Role": "ED Attending Physician",
          "Business Collaboration": "Trauma Response Team",
          "Business Interface": "Emergency Reception Desk",
          "Business Process": "Admit and Triage Patient",
          "Business Function": "Emergency Intake Services",
          "Business Interaction": "Paramedic Handover Briefing",
          "Business Event": "Ambulance Arrival",
          "Business Service": "Emergency Care Service",
          "Business Object": "Initial Patient Intake Form",
          "Contract": "Emergency Care Mandate",
          "Representation": "Patient ID Wristband",
          "Product": "Acute Stabilization Care",

          "Application Component": "ED Registration System",
          "Application Collaboration": "Ambulance-to-ED Data Sync",
          "Application Interface": "Triage Kiosk Display",
          "Application Function": "Acuity Scoring Algorithm",
          "Application Interaction": "Bed Assignment Query",
          "Application Process": "Patient Registration Workflow",
          "Application Event": "Patient File Created",
          "Application Service": "Patient Lookup Service",
          "Data Object": "Triage Vital Signs Record",

          "Node": "Admissions Database Server",
          "Device": "Vital Signs Mobile Terminal",
          "System Software": "Admissions Middleware Queue",
          "Technology Collaboration": "Hospital Wi-Fi Mesh",
          "Technology Interface": "Barcode Scanner Port",
          "Path": "Encrypted Wireless Intake Network",
          "Communication Network": "ED Local Area Network",
          "Technology Function": "Real-Time Location Tracking",
          "Technology Process": "Patient Record Auto-Save",
          "Technology Interaction": "Wristband Printing Sequence",
          "Technology Event": "Network Connection Timeout",
          "Technology Service": "Identity Verification Service",
          "Technology Object": "Encrypted Patient ID Token",
          "Artifact": "Triage Protocol Documentation",

          "Equipment": "Mobile Defibrillator Cart",
          "Facility": "Emergency Department Bay 1",
          "Distribution Network": "Pneumatic Tube Transport System",
          "Material": "Trauma Bandage Kit",

          "Work Package": "ED Process Optimization Project",
          "Deliverable": "Revised Triage Guidelines",
          "Implementation Event": "New Triage Software Rollout",
          "Plateau": "Peak Efficiency Trauma Response",
          "Gap": "Overcrowded Waiting Area",
          "Location": "Ground Floor Emergency Wing"
        }
      },
      {
        _description: "Surgical Intervention",
        labels: {
          "Stakeholder": "Surgical Patient",
          "Driver": "Surgical Waitlist Backlog",
          "Assessment": "Pre-Op Risk Evaluation",
          "Goal": "Zero Surgical Site Infections",
          "Outcome": "Successful Procedure Execution",
          "Principle": "Strict Aseptic Technique",
          "Requirement": "Pre-Surgical Patient Fasting",
          "Constraint": "Operating Theatre Availability",
          "Meaning": "Curative Intervention",
          "Value": "Improved Quality of Life",

          "Resource": "Specialist Surgical Team",
          "Capability": "Advanced Minimally Invasive Surgery",
          "Value Stream": "PreOp-to-Recovery Stream",
          "Course of Action": "Schedule Robot-Assisted Procedure",

          "Business Actor": "Lead Surgeon",
          "Business Role": "Scrub Nurse",
          "Business Collaboration": "Surgical Theatre Staff",
          "Business Interface": "Pre-Op Holding Area",
          "Business Process": "Perform Surgical Procedure",
          "Business Function": "Surgical Services",
          "Business Interaction": "Pre-Incision Safety Timeout",
          "Business Event": "Patient Anesthetized",
          "Business Service": "Operative Care Service",
          "Business Object": "Surgical Consent Form",
          "Contract": "Informed Consent Agreement",
          "Representation": "Printed Radiology Scan",
          "Product": "Surgical Intervention Plan",

          "Application Component": "Clinical Decision Support System",
          "Application Collaboration": "Imaging-to-Theatre Data Link",
          "Application Interface": "Surgeon Heads-Up Display",
          "Application Function": "3D Anatomical Rendering",
          "Application Interaction": "Robotic Calibration Sequence",
          "Application Process": "Surgical Checklist Workflow",
          "Application Event": "Incision Logged",
          "Application Service": "Real-Time Imaging Overlay",
          "Data Object": "Pre-Op MRI Scan File",

          "Node": "Imaging Data Processing Cluster",
          "Device": "Anesthesia Controller Terminal",
          "System Software": "Surgical Robotics OS",
          "Technology Collaboration": "Theatre Medical Device Network",
          "Technology Interface": "DICOM Image Gateway",
          "Path": "High-Bandwidth Fiber Backbone",
          "Communication Network": "Isolated Theatre Network",
          "Technology Function": "Low-Latency Video Streaming",
          "Technology Process": "Continuous Data Logging",
          "Technology Interaction": "Instrument Tracking Sync",
          "Technology Event": "Endoscope Feed Interrupted",
          "Technology Service": "Sterile Field Communication Service",
          "Technology Object": "Surgical Video Recording",
          "Artifact": "Instrument Sterilization Log",

          "Equipment": "Surgical Robot Arm",
          "Facility": "Operating Theatre 4",
          "Distribution Network": "Medical Gas Scavenging System",
          "Material": "Sterile Surgical Instrument Kit",

          "Work Package": "Robotic Surgery Training Program",
          "Deliverable": "Certified Surgical Team",
          "Implementation Event": "First Successful Robotic Surgery",
          "Plateau": "Routine Robotic Surgery Capability",
          "Gap": "High Cost of Robotic Consumables",
          "Location": "Level 3 Surgical Suite"
        }
      },
      {
        _description: "Intensive Care & Continuous Monitoring",
        labels: {
          "Stakeholder": "Critical Care Patient",
          "Driver": "Deteriorating Patient Condition",
          "Assessment": "Hourly Clinical Audit",
          "Goal": "Prevent Patient Mortality",
          "Outcome": "Patient Step-Down to General Ward",
          "Principle": "Continuous Evidence-Based Monitoring",
          "Requirement": "1:1 Nurse-to-Patient Ratio",
          "Constraint": "Critical Care Bed Capacity",
          "Meaning": "Life-Sustaining Support",
          "Value": "Physiological Stabilization",

          "Resource": "Intensivist Physician",
          "Capability": "Continuous Life Support",
          "Value Stream": "Critical-to-Stable Stream",
          "Course of Action": "Initiate Mechanical Ventilation",

          "Business Actor": "ICU Charge Nurse",
          "Business Role": "Respiratory Therapist",
          "Business Collaboration": "Critical Care Multidisciplinary Team",
          "Business Interface": "Patient Bedside",
          "Business Process": "Monitor Vital Signs Continuously",
          "Business Function": "Intensive Care Services",
          "Business Interaction": "Morning Consultant Ward Round",
          "Business Event": "Cardiac Arrhythmia Detected",
          "Business Service": "Life Support Service",
          "Business Object": "Patient Medical Chart",
          "Contract": "Do Not Resuscitate (DNR) Order",
          "Representation": "Continuous ECG Tracing",
          "Product": "Intensive Care Pathway",

          "Application Component": "Electronic Health Record (EHR) System",
          "Application Collaboration": "Monitor-EHR Results Integration",
          "Application Interface": "Clinician Tablet Portal",
          "Application Function": "Automated Drug Interaction Check",
          "Application Interaction": "IV Pump Dose Calculation",
          "Application Process": "Continuous Telemetry Logging",
          "Application Event": "Critical Vital Alarm Triggered",
          "Application Service": "Remote Telemetry Monitoring",
          "Data Object": "Structured Patient Medical History",

          "Node": "Clinical Data Centre Server",
          "Device": "Bedside Patient Monitor Terminal",
          "System Software": "HL7 / FHIR Integration Middleware",
          "Technology Collaboration": "Medical IoT Device Network",
          "Technology Interface": "Telemetry Sensor Port",
          "Path": "Hospital Intranet Backbone",
          "Communication Network": "Medical-Grade Encrypted Wi-Fi",
          "Technology Function": "Real-Time Waveform Processing",
          "Technology Process": "Data Encryption and Anonymisation",
          "Technology Interaction": "Patient Monitor Sensor Sync",
          "Technology Event": "Ventilator Pressure Drop Alert",
          "Technology Service": "Secure Clinical Data Storage Service",
          "Technology Object": "Two-Factor Authentication Token",
          "Artifact": "Deployed Software License Certificate",

          "Equipment": "Mechanical Ventilator",
          "Facility": "Intensive Care Unit (ICU)",
          "Distribution Network": "Medical Oxygen Pipeline System",
          "Material": "IV Infusion Consumables",

          "Work Package": "ICU Telemetry Upgrade",
          "Deliverable": "Integrated Bedside Monitors",
          "Implementation Event": "ICU Systems Go-Live",
          "Plateau": "Fully Digitized Intensive Care",
          "Gap": "Specialist Nursing Staff Shortage",
          "Location": "Level 4 Critical Care Wing"
        }
      }
    ],

    perspectiveTitles: {
      A: "Clinical Care, Patient Experience and Staffing",
      B: "Medical Systems, Devices and Facilities",
      C: "Integrated Patient Care Realization — Cross-Layer",
    },
    perspectiveEmpty: {
      A: { intro: "No route currently isolates clinical care, patient experience, and staffing.", cta: "Add element for the care lens", suggestionsLead: "Try: Attending Physician, Admit and Triage Patient, Emergency Care Service" },
      B: { intro: "No route currently isolates medical systems, devices, and facilities.", cta: "Add element for the systems lens", suggestionsLead: "Try: MRI Scanner, HL7/FHIR Middleware, Medical Oxygen Pipeline System" },
      C: { intro: "No route currently demonstrates integrated patient care realization across layers.", cta: "Add element for the cross-layer lens", suggestionsLead: "Try: Remote Telehealth Consultation, Clinical Decision Support System, Medical IoT Device Network" },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // FORMULA 1 TEAM — grand prix race operations
  //
  // KEY TEACHING MOMENT — the car vs ECU distinction:
  //   F1 Race Car (Chassis + Power Unit) → Equipment (Technology layer in this app)
  //     The car is a physical machine that uses/transforms material (tyres, fuel)
  //   Car ECU (Electronic Control Unit) → Device (Technology layer)
  //     The ECU is the physical IT resource inside the car that hosts the RTOS
  //   RTOS on ECU → System Software (Technology layer)
  //     The real-time OS is the execution environment, NOT an application
  //   Telemetry Analysis Platform → Application Component (Application layer)
  //     The analytical software that processes and visualises the data
  // ══════════════════════════════════════════════════════════════════════════

  f1_team: {
    label: "Formula One",
    name: "Grand Prix Race Operations",
    splashLines: [
      "Race weekend with an F1 team: pit-wall strategy, factory simulation, car hardware, ECU, telemetry, and trackside infrastructure.",
      "Renames highlight everyday ArchiMate distinctions (e.g. car vs ECU vs application software); pathfinding still uses the official tables.",
    ],
    
    // Micro-clusters: see file header.
    clusters: [
      {
        _description: "Trackside Race Operations & Pit Stop",
        labels: {
          "Stakeholder": "Team Principal",
          "Driver": "Rival Team Performance Breakthrough",
          "Assessment": "Mid-Race Tyre Degradation Analysis",
          "Goal": "Achieve Race Victory",
          "Outcome": "Podium Finish",
          "Principle": "Data-Driven Decision Making at All Levels",
          "Requirement": "Sub-2.5 Second Pit Stop Execution",
          "Constraint": "FIA Technical Regulation (Parc Fermé Rules)",
          "Meaning": "Championship Points Significance",
          "Value": "Competitive Edge Through Marginal Gains",
          
          "Resource": "Trackside Engineering Team",
          "Capability": "Real-Time Race Strategy Adaptation",
          "Value Stream": "Grid-to-Checkered-Flag Stream",
          "Course of Action": "Undercut Pit Stop Strategy",
          
          "Business Actor": "Pit Crew Mechanic",
          "Business Role": "Chief Strategist",
          "Business Collaboration": "Pit Wall Strategy Team",
          "Business Interface": "Team Radio Channel",
          "Business Process": "Execute Pit Stop",
          "Business Function": "Trackside Operations",
          "Business Interaction": "Driver-Engineer Lap Data Debrief",
          "Business Event": "Safety Car Deployed",
          "Business Service": "Race Strategy Advisory Service",
          "Business Object": "Lap Time and Sector Data",
          "Contract": "Driver Contract Agreement",
          "Representation": "Printed Timing Tower Sheet",
          "Product": "Race Strategy Execution",
          
          "Application Component": "Race Strategy Simulation Model",
          "Application Collaboration": "Pit Wall Strategy Data Sync",
          "Application Interface": "Race Engineer Strategy Dashboard",
          "Application Function": "Tyre Degradation Prediction",
          "Application Interaction": "Live Timing Feed Aggregation",
          "Application Process": "Pit Window Calculation Routine",
          "Application Event": "Optimal Pit Window Open",
          "Application Service": "Live Lap Delta Calculation Service",
          "Data Object": "Live Sector Timing Deltas",
          
          "Node": "Trackside Server Rack",
          "Device": "Pit Wall Timing Monitor",
          "System Software": "Strategy Analysis Engine OS",
          "Technology Collaboration": "Pit Wall Local Area Network",
          "Technology Interface": "Timing Feed API Gateway",
          "Path": "Encrypted Pit Wall LAN",
          "Communication Network": "FOM (Formula One Management) Timing Network",
          "Technology Function": "Timing Feed Ingestion",
          "Technology Process": "Delta Calculation Algorithms",
          "Technology Interaction": "Timing Beacon Sync",
          "Technology Event": "Sector Purple Time Registered",
          "Technology Service": "Live Timing Relay Service",
          "Technology Object": "Encrypted Strategy Model",
          "Artifact": "Race Strategy Run Plan",
          
          "Equipment": "Wheel Gun and Pneumatic Rig",
          "Facility": "Race Team Garage (Pit Lane)",
          "Distribution Network": "Pneumatic Wheel Gun Supply Lines",
          "Material": "Tyre Compound Set (Soft / Medium / Hard)",
          
          "Work Package": "Race Weekend Execution Plan",
          "Deliverable": "Final Race Classification",
          "Implementation Event": "Race Start (Lights Out)",
          "Plateau": "Optimal Race Setup",
          "Gap": "Sub-Optimal Tyre Temperature",
          "Location": "Circuit de Monaco (Race Venue)"
        }
      },
      {
        _description: "Factory Aerodynamics & Upgrades",
        labels: {
          "Stakeholder": "Title Sponsor",
          "Driver": "Constructor Championship Deficit",
          "Assessment": "Wind Tunnel Correlation Analysis",
          "Goal": "Win the Constructors' Championship",
          "Outcome": "Homologated Floor Upgrade",
          "Principle": "Continuous Iterative Development",
          "Requirement": "5% Downforce Increase",
          "Constraint": "FIA Cost Cap Regulations",
          "Meaning": "Development Race Advantage",
          "Value": "Long-Term Performance Consistency",
          
          "Resource": "Wind Tunnel and CFD Simulation Capacity",
          "Capability": "Aerodynamic Package Development",
          "Value Stream": "Design-to-Manufacture Stream",
          "Course of Action": "Accelerate Floor Upgrade Production",
          
          "Business Actor": "Aerodynamicist",
          "Business Role": "Technical Director",
          "Business Collaboration": "Aero Design Department",
          "Business Interface": "Design Review Board",
          "Business Process": "Validate CFD Simulations",
          "Business Function": "Aerodynamic Development",
          "Business Interaction": "Cross-Department Upgrade Sync",
          "Business Event": "CFD Correlation Target Hit",
          "Business Service": "Parts Manufacturing Service",
          "Business Object": "Aero Correlation Report",
          "Contract": "Supplier Manufacturing Agreement",
          "Representation": "3D CAD Render",
          "Product": "Aerodynamic Upgrade Package",
          
          "Application Component": "CFD Simulation Platform",
          "Application Collaboration": "HPC CAD Data Sync",
          "Application Interface": "Aerodynamicist Workstation GUI",
          "Application Function": "Fluid Dynamics Mesh Calculation",
          "Application Interaction": "Batch Simulation Job Queuing",
          "Application Process": "Wind Tunnel Data Processing",
          "Application Event": "Simulation Batch Complete",
          "Application Service": "Cloud Rendering Service",
          "Data Object": "Flow Field Data Points",
          
          "Node": "Factory High-Performance Computing Cluster",
          "Device": "Engineer CAD Workstation",
          "System Software": "HPC Cluster Management OS",
          "Technology Collaboration": "Factory Simulation Grid",
          "Technology Interface": "High-Speed Storage SAN Port",
          "Path": "Factory Fiber Backbone",
          "Communication Network": "Internal R&D Network",
          "Technology Function": "Parallel Compute Processing",
          "Technology Process": "Mesh Generation Workflow",
          "Technology Interaction": "Node Workload Distribution",
          "Technology Event": "Compute Node Failure",
          "Technology Service": "HPC Batch Processing Service",
          "Technology Object": "Simulation Output Logs",
          "Artifact": "Validated 3D Mesh File",
          
          "Equipment": "60% Scale Wind Tunnel Model",
          "Facility": "Wind Tunnel Test Facility",
          "Distribution Network": "Factory HVAC Cooling System",
          "Material": "Carbon Fibre Pre-Preg Rolls",
          
          "Work Package": "Floor Upgrade R&D Phase",
          "Deliverable": "Homologated Upgrade Part (Floor or Front Wing)",
          "Implementation Event": "Upgrade Introduction at Race Weekend",
          "Plateau": "Current-Spec Car (Pre-Upgrade Freeze)",
          "Gap": "Downforce Deficit vs Leading Constructor",
          "Location": "Team Factory (Brackley / Maranello)"
        }
      },
      {
        _description: "Car Telemetry & ECU Systems",
        labels: {
          "Stakeholder": "FIA (Governing Body)",
          "Driver": "Engine Reliability Concerns",
          "Assessment": "Power Unit Health Diagnostics",
          "Goal": "Zero Mechanical DNF (Did Not Finish)",
          "Outcome": "Completed Race Distance",
          "Principle": "Real-Time Component Monitoring",
          "Requirement": "Continuous Sensor Data Uplink",
          "Constraint": "Standardized FIA ECU Hardware",
          "Meaning": "Engine Lifespan Preservation",
          "Value": "Operational Reliability",
          
          "Resource": "Car Sensor Network",
          "Capability": "High-Frequency Telemetry Ingestion",
          "Value Stream": "Car-to-Garage Data Stream",
          "Course of Action": "Adjust Engine Mapping via Steering Wheel",
          
          "Business Actor": "Race Driver",
          "Business Role": "Race Engineer",
          "Business Collaboration": "Garage Telemetry Team",
          "Business Interface": "Steering Wheel Dash Display",
          "Business Process": "Monitor Power Unit Health",
          "Business Function": "Systems Engineering",
          "Business Interaction": "Driver Setting Change Confirmation",
          "Business Event": "Hydraulic Pressure Drop Alert",
          "Business Service": "Systems Diagnostics Service",
          "Business Object": "Car Setup Configuration Sheet",
          "Contract": "Engine Supplier Customer Agreement",
          "Representation": "Steering Wheel Alarm LED",
          "Product": "Reliable Power Unit Operation",
          
          "Application Component": "Telemetry Analysis Platform",
          "Application Collaboration": "Pit Wall — Factory Data Bridge",
          "Application Interface": "Systems Engineer Telemetry GUI",
          "Application Function": "Sensor Data Aggregation",
          "Application Interaction": "Real-Time Anomaly Detection",
          "Application Process": "Power Unit Mapping Adjustment",
          "Application Event": "Sensor Threshold Exceeded",
          "Application Service": "Real-Time Telemetry Streaming",
          "Data Object": "Car Sensor Telemetry Stream (1,200 channels)",
          
          "Node": "FIA Standard ECU Controller Unit",
          "Device": "Car ECU (Electronic Control Unit)",
          "System Software": "RTOS (Real-Time Operating System on ECU)",
          "Technology Collaboration": "Trackside-to-Factory Data Uplink Cluster",
          "Technology Interface": "OBD / CAN Bus Interface Port",
          "Path": "Encrypted Telemetry Radio Link",
          "Communication Network": "Trackside Telemetry Network",
          "Technology Function": "Sensor Data Sampling and Compression",
          "Technology Process": "Telemetry Packet Encryption",
          "Technology Interaction": "Timing Beacon — Car Transponder Sync",
          "Technology Event": "Trackside Data Uplink Dropped",
          "Technology Service": "Trackside Telemetry Relay Service",
          "Technology Object": "Encrypted Setup Configuration File",
          "Artifact": "Deployed Firmware Image (ECU)",
          
          "Equipment": "F1 Race Car (Chassis and Power Unit)",
          "Facility": "Parc Fermé Scrutineering Bay",
          "Distribution Network": "In-Car Hydraulic Lines",
          "Material": "Racing Fuel (E10)",
          
          "Work Package": "Pre-Race Systems Check",
          "Deliverable": "Clean Power Unit Diagnostic Log",
          "Implementation Event": "Engine Fire-Up Sequence",
          "Plateau": "Race-Ready Configuration",
          "Gap": "Sub-Optimal Engine Cooling",
          "Location": "Silverstone Circuit"
        }
      }
    ],

    perspectiveTitles: {
      A: "Race Operations, Driver and Engineering Team",
      B: "Car Systems, ECU and Track Technology",
      C: "Championship Strategy — Cross-Layer Alignment",
    },
    perspectiveEmpty: {
      A: { intro: "No route currently isolates race operations, driver, and engineering team.", cta: "Add element for the race-ops lens", suggestionsLead: "Try: Race Driver, Execute Pit Stop, Race Strategy Advisory Service" },
      B: { intro: "No route currently isolates car systems, ECU, and track technology.", cta: "Add element for the technology lens", suggestionsLead: "Try: Car ECU (Electronic Control Unit), RTOS on ECU, Trackside Telemetry Relay Service" },
      C: { intro: "No route currently demonstrates the full chain from championship goal to physical car.", cta: "Add element for the cross-layer lens", suggestionsLead: "Try: Real-Time Race Strategy Adaptation, Tyre Degradation Prediction Model, F1 Race Car" },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CIRCUS — grand spectacle touring production
  // ══════════════════════════════════════════════════════════════════════════

  circus: {
    label: "Circus",
    name: "Grand Spectacle Operations",
    splashLines: [
      "A touring circus: performers, audiences, ticketing, lighting and sound, rigging, trucks, venues, and show-night operations.",
      "Entertainment labels replace generic names on the same types so routes read like backstage and front-of-house work.",
    ],
    
    // Micro-clusters: see file header.
    clusters: [
      {
        _description: "Acrobatic Performance & Rigging",
        labels: {
          "Stakeholder": "The Ringmaster",
          "Driver": "Demand for Live Family Entertainment",
          "Assessment": "Aerial Safety and Risk Audit",
          "Goal": "Deliver Awe and Wonder",
          "Outcome": "Flawless Aerial Routine",
          "Principle": "The Show Must Go On",
          "Requirement": "High-Wire and Aerial Safety Standards",
          "Constraint": "Venue Ceiling Height Limitations",
          "Meaning": "Breathtaking Spectacle",
          "Value": "Audience Thrills and Escapism",
          
          "Resource": "World-Class Performing Artists",
          "Capability": "Aerial Acrobatics and High-Wire Mastery",
          "Value Stream": "Rehearsal-to-Performance Stream",
          "Course of Action": "Rehearsal and Routine Refinement Plan",
          
          "Business Actor": "Trapeze Artist",
          "Business Role": "Lead Acrobat",
          "Business Collaboration": "Acrobatic Performance Duo",
          "Business Interface": "Aerial Platform and Catch Bar",
          "Business Process": "Execute Aerial Acrobatic Routine",
          "Business Function": "Artistic Direction and Choreography",
          "Business Interaction": "Mid-Air Catch Synchronization",
          "Business Event": "Ringmaster Announces Grand Finale",
          "Business Service": "High-Wire Thrill Act",
          "Business Object": "Aerial Choreography Cue Sheet",
          "Contract": "Performer Engagement Agreement",
          "Representation": "Performer Hand Signals",
          "Product": "Live Circus Spectacle",
          
          "Application Component": "Artist Scheduling App",
          "Application Collaboration": "Cast Roster Sync System",
          "Application Interface": "Backstage Callboard Display",
          "Application Function": "Rehearsal Time Allocation",
          "Application Interaction": "Performer Check-In Tracker",
          "Application Process": "Roster Management Workflow",
          "Application Event": "Act Standby Alert",
          "Application Service": "Backstage Call Service",
          "Data Object": "Performer Roster and Medical Clearances",
          
          "Node": "Stage Management Terminal",
          "Device": "Backstage Monitor Screen",
          "System Software": "Roster Management OS",
          "Technology Collaboration": "Backstage Comms Mesh",
          "Technology Interface": "Intercom Headset Port",
          "Path": "Catwalk Access Route",
          "Communication Network": "VHF Crew Radio Network",
          "Technology Function": "Act Timing Relay",
          "Technology Process": "Stage Manager Cue Relay",
          "Technology Interaction": "Crew-to-Performer Comms",
          "Technology Event": "Go Signal Transmitted",
          "Technology Service": "Backstage Coordination Service",
          "Technology Object": "Digital Safety Checklist",
          "Artifact": "Deployed Safety Certification Record",
          
          "Equipment": "Safety Net and High-Wire Rigging Assembly",
          "Facility": "The Big Top (Main Performance Tent)",
          "Distribution Network": "Aerial Rigging Tension Cables",
          "Material": "Acrobatic Grip Chalk",
          
          "Work Package": "Rigging Setup and Tension Calibration",
          "Deliverable": "Certified Aerial Rig",
          "Implementation Event": "Rig Stress Test Passed",
          "Plateau": "Performance-Ready Trapeze Rig",
          "Gap": "Ageing Rigging Equipment (Safety Risk)",
          "Location": "Center Ring, Above Stage"
        }
      },
      {
        _description: "Box Office & Audience Experience",
        labels: {
          "Stakeholder": "The Audience",
          "Driver": "Seasonal Holiday Spending Trends",
          "Assessment": "Ticket Sales and Audience Satisfaction Trends",
          "Goal": "Achieve Full-Season Tour Sell-Out",
          "Outcome": "Standing Ovation — Sold-Out Run",
          "Principle": "Maximize Venue Capacity and Safety",
          "Requirement": "Mobile Ticketing and Fast Entry",
          "Constraint": "Local Fire Code Capacity Limits",
          "Meaning": "Cultural Nostalgia",
          "Value": "Magical Shared Family Memories",
          
          "Resource": "Box Office and Ushers",
          "Capability": "Omni-channel Ticket Sales",
          "Value Stream": "Promotion-to-Admission Stream",
          "Course of Action": "Launch Early Bird Family Discount",
          
          "Business Actor": "Box Office Clerk",
          "Business Role": "Front-of-House Manager",
          "Business Collaboration": "Usher and Concessions Team",
          "Business Interface": "Box Office Ticket Window",
          "Business Process": "Manage Interval and Audience Flow",
          "Business Function": "Audience Services and Ticketing",
          "Business Interaction": "Ticket Scanning and Seat Seating",
          "Business Event": "Doors Open for Admission",
          "Business Service": "Audience Admission Service",
          "Business Object": "Audience Ticket and Seat Data",
          "Contract": "Terms of Admission Policy",
          "Representation": "Printed Programme Booklet",
          "Product": "Family Season Pass",
          
          "Application Component": "Online Ticket Booking Engine",
          "Application Collaboration": "Seat Selector and Pricing Tool",
          "Application Interface": "Mobile Booking App UI",
          "Application Function": "Payment and Checkout Processing",
          "Application Interaction": "Real-Time Seat Availability Check",
          "Application Process": "Automated Promotional Email Blast",
          "Application Event": "Ticket Purchase Confirmed",
          "Application Service": "Interactive Seat Map Service",
          "Data Object": "Customer Booking Record",
          
          "Node": "Box Office Server Virtual Machine",
          "Device": "Mobile Ticket Scanner PDA",
          "System Software": "Ticketing Platform Backend",
          "Technology Collaboration": "Scanner to Server API Sync",
          "Technology Interface": "Payment Gateway Webhook",
          "Path": "Venue Wi-Fi Link",
          "Communication Network": "Secure Point-of-Sale Network",
          "Technology Function": "Barcode Decryption and Validation",
          "Technology Process": "Payment Authorization",
          "Technology Interaction": "Database Read/Write Locking",
          "Technology Event": "Payment Gateway Timeout",
          "Technology Service": "Secure Transaction Service",
          "Technology Object": "Encrypted Credit Card Payload",
          "Artifact": "PCI Compliance Certificate",
          
          "Equipment": "Entry Turnstile Gate",
          "Facility": "Venue Foyer and Concession Area",
          "Distribution Network": "Crowd Control Barrier Maze",
          "Material": "Concession Stock (Popcorn, Refreshments)",
          
          "Work Package": "Summer Marketing Campaign",
          "Deliverable": "Advertising ROI Report",
          "Implementation Event": "Tickets Go Live on Website",
          "Plateau": "100% Pre-Sales Target Hit",
          "Gap": "Low Matinee Attendance Rates",
          "Location": "Fairgrounds Entrance"
        }
      },
      {
        _description: "Technical Production & Show Control",
        labels: {
          "Stakeholder": "Technical Director",
          "Driver": "Expectation for High Production Value",
          "Assessment": "Acoustic and Lighting Venue Audit",
          "Goal": "Flawless Technical Execution",
          "Outcome": "Perfectly Timed Pyrotechnic Finale",
          "Principle": "Precision Timing and Synchronization",
          "Requirement": "Sub-millisecond Lighting Cues",
          "Constraint": "Local Noise and Zoning Ordinances",
          "Meaning": "Theatrical Immersion",
          "Value": "Sensory Spectacle",
          
          "Resource": "Show Control Tech Stack",
          "Capability": "Theatrical A/V Production",
          "Value Stream": "Bump-In to Strike Stream",
          "Course of Action": "Automate Main Show Lighting Cues",
          
          "Business Actor": "Sound Engineer",
          "Business Role": "Stage Director",
          "Business Collaboration": "Tech Booth Crew",
          "Business Interface": "A/V Mixing Desk",
          "Business Process": "Execute Show Control Sequence",
          "Business Function": "Technical Show Production",
          "Business Interaction": "Ringmaster to Booth Audio Sync",
          "Business Event": "Curtain Rise Cue",
          "Business Service": "Theatrical Illumination and Audio Service",
          "Business Object": "Master Show Cue List",
          "Contract": "Venue Power Supply Agreement",
          "Representation": "Lighting Plot Diagram",
          "Product": "Immersive Entertainment Atmosphere",
          
          "Application Component": "DMX Lighting Control Software",
          "Application Collaboration": "Audio-Lighting MIDI Sync Engine",
          "Application Interface": "Digital Mixing Console UI",
          "Application Function": "Scene Transition Crossfade",
          "Application Interaction": "Audio Channel Equalization",
          "Application Process": "Master Timeline Playback",
          "Application Event": "Grand Finale Cue Reached",
          "Application Service": "Automated Show Control Service",
          "Data Object": "Digital Sound Effects Library",
          
          "Node": "Show Control Server (DMX/AV Master)",
          "Device": "DMX Lighting Controller Unit",
          "System Software": "DMX 512 / ArtNet Control Runtime",
          "Technology Collaboration": "Lighting-Sound Synchronisation Link",
          "Technology Interface": "MIDI and DMX Protocol Port",
          "Path": "Fiber Optic A/V Snake",
          "Communication Network": "Backstage Ethernet Ring",
          "Technology Function": "Live Sound Mixing and Amplification",
          "Technology Process": "Pyrotechnic and Special Effect Triggering",
          "Technology Interaction": "Multi-System Cue Timing Coordination",
          "Technology Event": "Effect Misfire or Hardware Fault",
          "Technology Service": "Front-of-House Audio Relay Service",
          "Technology Object": "Lighting Preset Configuration File",
          "Artifact": "Venue Acoustics Profile",
          
          "Equipment": "Moving Head LED Spotlight",
          "Facility": "Front of House Tech Booth",
          "Distribution Network": "Stage Power Distribution and Cabling",
          "Material": "Pyrotechnic Smoke Fluid",
          
          "Work Package": "Venue Bump-In and Cable Routing",
          "Deliverable": "Calibrated PA System",
          "Implementation Event": "Pre-Show Sound Check Complete",
          "Plateau": "Show-Ready Tech Status",
          "Gap": "Overloaded Generator Circuit",
          "Location": "City Centre Arena (Winter Residency)"
        }
      }
    ],

    perspectiveTitles: {
      A: "Ringmaster Planning, Performers and Show Flow",
      B: "Stage Rigging, Control Systems and Mechanics",
      C: "Grand Spectacle Coordination — Cross-Layer",
    },
    perspectiveEmpty: {
      A: { intro: "No route currently isolates ringmaster planning, performers, and show flow.", cta: "Add element for the show-flow lens", suggestionsLead: "Try: Ringmaster, Execute Aerial Acrobatic Routine, Grand Spectacle Performance" },
      B: { intro: "No route currently isolates stage rigging, control systems, and mechanics.", cta: "Add element for the rigging lens", suggestionsLead: "Try: DMX Lighting Controller Unit, Show Control Server, Safety Net and High-Wire Rigging Assembly" },
      C: { intro: "No route currently demonstrates grand spectacle coordination across layers.", cta: "Add element for the cross-layer lens", suggestionsLead: "Try: Aerial Acrobatics and High-Wire Mastery, Online Ticket Booking Engine, Stage Power Distribution" },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // UNIVERSITY — academic institution operations
  //
  // Deliberately self-referential for classroom use. Students can map their
  // own institution and recognize every element immediately.
  // ══════════════════════════════════════════════════════════════════════════

  university: {
    label: "University",
    name: "Academic Institution Operations",
    splashLines: [
      "Campus life as architecture: teaching, research, students, LMS and SIS, data centres, labs, accreditation, and distance learning.",
      "Familiar academic wording makes the stack easy to recognise in class; allowed relationships are still exactly those in ArchiMate.",
    ],
    
    // Micro-clusters: see file header.
    clusters: [
      {
        _description: "Teaching & Student Lifecycle",
        labels: {
          "Stakeholder": "Undergraduate Student",
          "Driver": "Declining Domestic Enrollment",
          "Assessment": "Annual Teaching Quality Assessment",
          "Goal": "100% Graduate Employment Rate",
          "Outcome": "Degree Certificate Awarded",
          "Principle": "Student-Centered Active Learning",
          "Requirement": "ADA / Disability Access Compliance",
          "Constraint": "Accreditation Standards (QAA / AACSB)",
          "Meaning": "Mastery of Core Subject Matter",
          "Value": "Lifelong Employability and Critical Thinking",

          "Resource": "Academic Teaching Faculty",
          "Capability": "Hybrid Course Delivery",
          "Value Stream": "Enrollment-to-Graduation Stream",
          "Course of Action": "Curriculum Redesign for Industry Alignment",

          "Business Actor": "Lecturer",
          "Business Role": "Programme Director",
          "Business Collaboration": "Examination Board",
          "Business Interface": "Virtual Classroom Portal",
          "Business Process": "Conduct Final Examination",
          "Business Function": "Academic Teaching and Assessment",
          "Business Interaction": "Module Assessment and Feedback Session",
          "Business Event": "Exam Results Published",
          "Business Service": "Academic Advising Service",
          "Business Object": "Student Academic Record (Transcript)",
          "Contract": "Student Enrollment Agreement",
          "Representation": "Printed Degree Certificate",
          "Product": "Undergraduate Degree Programme",

          "Application Component": "Learning Management System (LMS)",
          "Application Collaboration": "LMS-Plagiarism Tool Integration",
          "Application Interface": "Student Learning Dashboard",
          "Application Function": "Automated Plagiarism Detection",
          "Application Interaction": "Online Assignment Grading Sync",
          "Application Process": "Online Exam Submission Workflow",
          "Application Event": "Assignment Submission Deadline Reached",
          "Application Service": "Course Content Delivery Service",
          "Data Object": "Structured Assessment Submission",

          "Node": "Cloud LMS Hosting Cluster",
          "Device": "Lecture Theatre AV Control Terminal",
          "System Software": "Virtual Learning Environment OS",
          "Technology Collaboration": "Lecture Capture A/V Network",
          "Technology Interface": "Smartboard Video Uplink",
          "Path": "Campus Media Streaming Backbone",
          "Communication Network": "Lecture Hall Wi-Fi Subnet",
          "Technology Function": "Video Lecture Encoding and Streaming",
          "Technology Process": "Lecture Recording Archival",
          "Technology Interaction": "Live-Stream Audio Sync",
          "Technology Event": "LMS Outage During Peak Submission",
          "Technology Service": "On-Demand Video Streaming Service",
          "Technology Object": "Compressed Lecture Video File",
          "Artifact": "Deployed LMS Plugin Package",

          "Equipment": "Smart Lectern and Projection Rig",
          "Facility": "Main Lecture Theatre",
          "Distribution Network": "Lecture Theatre HVAC System",
          "Material": "Printed Examination Papers",

          "Work Package": "Hybrid Learning Module Development",
          "Deliverable": "Validated Module Handbook",
          "Implementation Event": "Academic Year Commencement",
          "Plateau": "Current Validated Curriculum",
          "Gap": "Digital Skills Gap in Graduate Cohort",
          "Location": "Main Campus"
        }
      },
      {
        _description: "High-Profile Research",
        labels: {
          "Stakeholder": "Research Funding Council",
          "Driver": "National Research Excellence Ranking Pressure",
          "Assessment": "Research Impact Factor Review",
          "Goal": "Achieve Top-10 Research University Status",
          "Outcome": "Published Research Paper",
          "Principle": "Academic Freedom and Integrity",
          "Requirement": "Open Access Data Publishing Mandate",
          "Constraint": "Strict Grant Budget Allocation Rules",
          "Meaning": "Contribution to Global Knowledge",
          "Value": "Institutional Prestige and Patent Revenue",

          "Resource": "Postdoctoral Research Expertise",
          "Capability": "Advanced Empirical Data Analysis",
          "Value Stream": "Grant-Proposal-to-Publication Stream",
          "Course of Action": "Establish Cross-Disciplinary Research Hub",

          "Business Actor": "PhD Supervisor",
          "Business Role": "Principal Investigator (PI)",
          "Business Collaboration": "International Research Consortium",
          "Business Interface": "Research Office Portal",
          "Business Process": "Manage Research Grant Allocation",
          "Business Function": "Research and Innovation Management",
          "Business Interaction": "Peer Review Panel Defence",
          "Business Event": "Research Grant Awarded",
          "Business Service": "Research Commercialisation Service",
          "Business Object": "Peer-Reviewed Manuscript",
          "Contract": "Grant Funding Agreement",
          "Representation": "Academic Conference Poster",
          "Product": "Patented Commercial Innovation",

          "Application Component": "Research Repository Platform",
          "Application Collaboration": "Global Open-Access Data Federation",
          "Application Interface": "Researcher Data Upload GUI",
          "Application Function": "Dataset Citation Indexing",
          "Application Interaction": "Automated DOI Minting Sequence",
          "Application Process": "Pre-Print Manuscript Workflow",
          "Application Event": "Dataset Embargo Lifted",
          "Application Service": "Open Access Archiving Service",
          "Data Object": "Raw Empirical Dataset",

          "Node": "High-Performance Computing (HPC) Node",
          "Device": "Lab Workstation Terminal",
          "System Software": "HPC Batch Processing OS",
          "Technology Collaboration": "Research Compute Grid",
          "Technology Interface": "High-Speed Data SAN Port",
          "Path": "Dedicated Research Fiber Link",
          "Communication Network": "Isolated Lab Network Segment",
          "Technology Function": "Parallel Statistical Computation",
          "Technology Process": "Nightly Dataset Replication",
          "Technology Interaction": "Compute Node Load Balancing",
          "Technology Event": "Storage Quota Exceeded Alert",
          "Technology Service": "Big Data Computation Service",
          "Technology Object": "Encrypted Patient Trial Data",
          "Artifact": "Custom Statistical Analysis Script",

          "Equipment": "High-Performance Research Spectrometer",
          "Facility": "Research Laboratory Block",
          "Distribution Network": "Lab Gas and Fume Extraction Network",
          "Material": "Laboratory Reagents and Consumables",

          "Work Package": "Spectrometer Procurement and Setup",
          "Deliverable": "Commissioned Research Facility",
          "Implementation Event": "First Successful Data Run",
          "Plateau": "Operational Data Collection Phase",
          "Gap": "Outdated Legacy Lab Equipment",
          "Location": "Science and Innovation Park"
        }
      },
      {
        _description: "Campus IT & Infrastructure",
        labels: {
          "Stakeholder": "Chief Information Officer (CIO)",
          "Driver": "Rising Cyber Security Threats",
          "Assessment": "Annual IT Security Audit",
          "Goal": "Ensure 99.9% Campus Network Uptime",
          "Outcome": "Seamless Student Digital Experience",
          "Principle": "Cloud-First Infrastructure Strategy",
          "Requirement": "Two-Factor Authentication Mandate",
          "Constraint": "Fixed Annual IT Budget",
          "Meaning": "Reliable Digital Access",
          "Value": "Operational Efficiency",

          "Resource": "University IT Services Team",
          "Capability": "Campus-Wide Digital Provisioning",
          "Value Stream": "Onboarding-to-Alumni Digital Stream",
          "Course of Action": "Migrate Core Services to Cloud",

          "Business Actor": "IT Support Administrator",
          "Business Role": "Student Services Officer",
          "Business Collaboration": "IT Escalation Task Force",
          "Business Interface": "Student Services Help Desk",
          "Business Process": "Provision Student Digital Accounts",
          "Business Function": "IT and Facilities Operations",
          "Business Interaction": "Helpdesk Ticket Resolution",
          "Business Event": "New Student Intake Week",
          "Business Service": "Campus Connectivity Service",
          "Business Object": "Student ID Profile",
          "Contract": "Software Vendor Licensing Agreement",
          "Representation": "Campus ID Smart Card",
          "Product": "Student Digital Account Profile",

          "Application Component": "Student Information System (SIS)",
          "Application Collaboration": "SIS-to-LMS Roster Sync",
          "Application Interface": "Student Self-Service Portal",
          "Application Function": "Tuition Fee Billing Engine",
          "Application Interaction": "Timetable Conflict Resolution",
          "Application Process": "Automated Enrollment Workflow",
          "Application Event": "Registration Hold Cleared",
          "Application Service": "Identity Provisioning Service",
          "Data Object": "Master Student Record Database",

          "Node": "University Data Centre Server Farm",
          "Device": "Library Thin-Client Kiosk",
          "System Software": "Virtualisation Platform (VMware / Hyper-V)",
          "Technology Collaboration": "Campus-Wide Identity Management (IAM)",
          "Technology Interface": "SAML / OAuth2 Authentication Gateway",
          "Path": "Campus Fibre Optic Backbone",
          "Communication Network": "Eduroam Campus Wi-Fi Network",
          "Technology Function": "Network Traffic Load Balancing",
          "Technology Process": "Automated Off-Site Backup",
          "Technology Interaction": "Multi-System Single Sign-On (SSO) Sync",
          "Technology Event": "Ransomware Incident Alert",
          "Technology Service": "Managed Cloud Storage Service",
          "Technology Object": "SSL / TLS Certificate",
          "Artifact": "Firewall Configuration Ruleset",

          "Equipment": "Uninterruptible Power Supply (UPS) Unit",
          "Facility": "Data Centre Server Room",
          "Distribution Network": "Campus Power Grid",
          "Material": "Cat6 Ethernet Cabling",

          "Work Package": "Campus Wi-Fi 6 Upgrade Project",
          "Deliverable": "Upgraded Wireless Access Points",
          "Implementation Event": "Network Cutover Weekend",
          "Plateau": "Modernized Network Infrastructure",
          "Gap": "Wi-Fi Dead Zones in Historic Buildings",
          "Location": "University IT Headquarters"
        }
      }
    ],

    perspectiveTitles: {
      A: "Academic Operations, Faculty and Student Experience",
      B: "Campus Systems, Devices and Infrastructure",
      C: "Learning Realization — Cross-Layer Alignment",
    },
    perspectiveEmpty: {
      A: { intro: "No route currently isolates academic operations, faculty, and student experience.", cta: "Add element for the academic lens", suggestionsLead: "Try: Lecturer, Enroll and Register Student, Academic Advising Service" },
      B: { intro: "No route currently isolates campus systems, devices, and infrastructure.", cta: "Add element for the infrastructure lens", suggestionsLead: "Try: Learning Management System, Lecture Theatre AV Control Terminal, Campus Fibre Optic Backbone" },
      C: { intro: "No route currently demonstrates the full chain from learning goal to physical infrastructure.", cta: "Add element for the cross-layer lens", suggestionsLead: "Try: Online and Hybrid Course Delivery, Course Content Delivery Service, University Data Centre Server Farm" },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // BORED — deliberately flat, mundane workplace (contrast with “story” themes)
  // ══════════════════════════════════════════════════════════════════════════

  bored: {
    label: "Bored",
    name: "Routine Office Operations",
    splashLines: [
      "A deliberately flat office: tickets, meetings, legacy tools, flaky VPN, printers, and spreadsheets—process theater included.",
      "Dry, mundane humor re-labels the same elements epic themes use; the path engine underneath is unchanged.",
    ],
    
    // Micro-clusters: see file header.
    clusters: [
      {
        _description: "The Bureaucratic Process",
        labels: {
          "Stakeholder": "The Budget Owner",
          "Driver": "Someone Said We Should",
          "Assessment": "Annual “How Are We Doing?” Survey",
          "Goal": "Look Busy Until Friday",
          "Outcome": "Ticket Closed — Reason: Wontfix",
          "Principle": "Must Use the Official Template",
          "Requirement": "Mandatory Three-Level Approval",
          "Constraint": "No Budget and No Time",
          "Meaning": "Whatever the Slide Deck Says",
          "Value": "Checking the Box",

          "Resource": "The One Person Who Remembers",
          "Capability": "Sending Yet Another Follow-Up Email",
          "Value Stream": "Request-to-Spreadsheet Stream",
          "Course of Action": "Schedule a Meeting About the Meeting",

          "Business Actor": "Karen from Accounting",
          "Business Role": "Meeting Facilitator",
          "Business Collaboration": "Cross-Functional Alignment Workshop",
          "Business Interface": "Shared Inbox Nobody Reads",
          "Business Process": "File the TPS Report",
          "Business Function": "Spreadsheet Maintenance",
          "Business Interaction": "Reply-All Thread",
          "Business Event": "Budget Freeze Announced",
          "Business Service": "Internal “Self-Service” Portal",
          "Business Object": "Version 12_final_FINAL.xlsx",
          "Contract": "MSA Nobody Has Opened",
          "Representation": "PowerPoint With Too Many Bullets",
          "Product": "Mandatory Compliance Training",

          "Application Component": "Ticketing System From 2007",
          "Application Collaboration": "Slack Channel #general-please-use-threads",
          "Application Interface": "Clunky Web Form (Session Expired)",
          "Application Function": "Automated “Did This Help?” Popup",
          "Application Interaction": "Email-to-Ticket Generation Loop",
          "Application Process": "Manual CSV Export and Re-Import",
          "Application Event": "Mandatory System Reboot Prompt",
          "Application Service": "Helpdesk Ticket Routing",
          "Data Object": "Duplicate Customer Record #47",

          "Node": "Corporate Desktop (Locked Down)",
          "Device": "Docking Station With One Broken Port",
          "System Software": "Corporate Antivirus That Slows Everything",
          "Technology Collaboration": "Shared Network Drive (Z:)",
          "Technology Interface": "Missing Serial-to-USB Adapter",
          "Path": "Office LAN (Mostly Works)",
          "Communication Network": "Guest Wi-Fi (Captive Portal)",
          "Technology Function": "Nightly Log Rotation Nobody Checks",
          "Technology Process": "Forced Windows Update Reboot",
          "Technology Interaction": "Printer Driver Sync Failure",
          "Technology Event": "Disk Full on C:",
          "Technology Service": "Managed “Best Effort” Print Service",
          "Technology Object": "Unsigned Macro Script",
          "Artifact": "Meeting Minutes (Unread)",

          "Equipment": "Coffee Machine (Out of Order)",
          "Facility": "Conference Room B (Always Booked)",
          "Distribution Network": "HVAC That’s Always Too Cold",
          "Material": "Sticky Notes",

          "Work Package": "Q4 Initiative (TBD)",
          "Deliverable": "Slide Deck for Steering Committee",
          "Implementation Event": "Mandatory All-Hands Meeting",
          "Plateau": "Current State (Don’t Ask)",
          "Gap": "We Were Supposed to Migrate Last Year",
          "Location": "Head Office (Floor 3)"
        }
      },
      {
        _description: "The Legacy IT Nightmare",
        labels: {
          "Stakeholder": "Whoever Asked for This",
          "Driver": "Compliance Said So",
          "Assessment": "Pending Audit Findings",
          "Goal": "Keep the Server from Catching Fire",
          "Outcome": "Temporary Workaround Deployed",
          "Principle": "Good Enough Is Good Enough",
          "Requirement": "Must Run on Internet Explorer 11",
          "Constraint": "Vendor Went Out of Business in 2014",
          "Meaning": "Technical Debt",
          "Value": "Slightly Less Manual Work",

          "Resource": "Expired Support Contract",
          "Capability": "Rebooting It to See If That Fixes It",
          "Value Stream": "Break-to-Fix Stream",
          "Course of Action": "Apply Duct Tape and Ignore",

          "Business Actor": "Contractor Who Already Left",
          "Business Role": "Process Owner (in Name Only)",
          "Business Collaboration": "Emergency Bridge Call (Muted)",
          "Business Interface": "Undocumented Admin Console",
          "Business Process": "Escalate to Someone Else",
          "Business Function": "Legacy Systems Support",
          "Business Interaction": "Ping Over Teams (No Response)",
          "Business Event": "Production Outage P1",
          "Business Service": "“As Is” Technical Support",
          "Business Object": "Hardcoded IP Address List",
          "Contract": "End User License Agreement",
          "Representation": "Visio Diagram from 2012",
          "Product": "Legacy Enterprise Application",

          "Application Component": "Legacy Thing We Can’t Turn Off",
          "Application Collaboration": "Batch Job Sync at 2 AM",
          "Application Interface": "Green Screen Terminal Emulator",
          "Application Function": "Null Pointer Exception Generator",
          "Application Interaction": "Two Systems That Don’t Talk",
          "Application Process": "Zombie Process Cleanup Script",
          "Application Event": "Password Expires in 24 Hours",
          "Application Service": "REST API (Undocumented)",
          "Data Object": "Corrupt Database Table",

          "Node": "On-Prem Server in a Closet",
          "Device": "Old Laptop",
          "System Software": "Windows Server 2008 R2",
          "Technology Collaboration": "VPN That Drops Every Hour",
          "Technology Interface": "VGA Port",
          "Path": "Tangled Ethernet Cable Mess",
          "Communication Network": "Slow MPLS Connection",
          "Technology Function": "Memory Leak Generation",
          "Technology Process": "Patch Tuesday (Deferred Again)",
          "Technology Interaction": "Database Deadlock",
          "Technology Event": "VPN Certificate Expired",
          "Technology Service": "Unreliable Offsite Backup",
          "Technology Object": "config.json (Checked Into Git)",
          "Artifact": "deploy.zip (Untested)",

          "Equipment": "Loud Server Rack Fan",
          "Facility": "Basement Server Room (No A/C)",
          "Distribution Network": "Overloaded Power Strip",
          "Material": "Cable Ties",

          "Work Package": "Emergency Patch Deployment",
          "Deliverable": "Post-Incident Root Cause Analysis",
          "Implementation Event": "Outage Window (2AM Sunday)",
          "Plateau": "Barely Functioning Baseline",
          "Gap": "No Disaster Recovery Plan",
          "Location": "Home Office (Camera Off)"
        }
      },
      {
        _description: "The Failed Digital Transformation",
        labels: {
          "Stakeholder": "Outside Consultant",
          "Driver": "Synergy and Digital Disruption",
          "Assessment": "Agile Maturity Matrix",
          "Goal": "Achieve “Digital Excellence”",
          "Outcome": "Re-org Announced via Email",
          "Principle": "Move Fast and Break Things (Mostly Just Break Things)",
          "Requirement": "Must Be Put on the Blockchain",
          "Constraint": "Scope Creep",
          "Meaning": "Empty Buzzwords",
          "Value": "Faux-Agile Velocity",

          "Resource": "The “Innovation” Budget",
          "Capability": "Pivoting to Video",
          "Value Stream": "Idea-to-Backlog Stream",
          "Course of Action": "Hire More Scrum Masters",

          "Business Actor": "“Agile” Coach",
          "Business Role": "Product Owner (Who Doesn't Own the Product)",
          "Business Collaboration": "Daily Standup That Takes 45 Minutes",
          "Business Interface": "Virtual Whiteboard Nobody Knows How to Use",
          "Business Process": "Move Jira Ticket to “In Progress”",
          "Business Function": "Change Management Center of Excellence",
          "Business Interaction": "“Let’s Take This Offline”",
          "Business Event": "Tool Rolled Out Without Training",
          "Business Service": "Gamified Employee Engagement",
          "Business Object": "User Story with No Acceptance Criteria",
          "Contract": "Consultant Statement of Work",
          "Representation": "Kanban Board With 50 Items in “Doing”",
          "Product": "Enterprise Subscription You Don’t Use",

          "Application Component": "Bloated SaaS Platform",
          "Application Collaboration": "Webhooks That Fail Silently",
          "Application Interface": "Overly Complex Dashboard",
          "Application Function": "AI Chatbot That Only Says “I Don't Understand”",
          "Application Interaction": "Single Sign-On Loop",
          "Application Process": "Automated Agile Metric Calculation",
          "Application Event": "Free Trial Expired",
          "Application Service": "Cloud Optimization Service (Costs Extra)",
          "Data Object": "Orphaned AWS S3 Bucket",

          "Node": "Over-provisioned Cloud Instance",
          "Device": "Overpriced Tablet Device",
          "System Software": "Microservices Orchestration Overhead",
          "Technology Collaboration": "Shadow IT Network",
          "Technology Interface": "Deprecated GraphQL Endpoint",
          "Path": "Zero-Trust Network Bottleneck",
          "Communication Network": "Siloed Cloud VPC",
          "Technology Function": "Excessive Telemetry Logging",
          "Technology Process": "Failing CI/CD Pipeline",
          "Technology Interaction": "Third-Party Outage Dependency",
          "Technology Event": "Cloud Billing Alert Ignored",
          "Technology Service": "Containerized Spaghetti Code",
          "Technology Object": "Stale Docker Image",
          "Artifact": "Unread Confluence Page",

          "Equipment": "Office Chair (Squeaks)",
          "Facility": "Open Plan With No Headphones",
          "Distribution Network": "Cold Brew Tap (Empty)",
          "Material": "Lanyards from Conferences",

          "Work Package": "Phase 1 MVP Rollout",
          "Deliverable": "Lessons Learned Document",
          "Implementation Event": "Go-Live Weekend (Volunteers Only)",
          "Plateau": "“Transformation Complete” (Nothing Changed)",
          "Gap": "Total Lack of User Adoption",
          "Location": "WeWork Hot Desk"
        }
      }
    ],

    perspectiveTitles: {
      A: "Meetings, Spreadsheets and Process Theater",
      B: "Legacy Tools, VPNs and Printers",
      C: "Alignment — Cross-Layer (Still Pending Sign-Off)",
    },
    perspectiveEmpty: {
      A: { intro: "No route currently isolates meetings, spreadsheets, and process theater.", cta: "Add element for the mundane lens", suggestionsLead: "Try: Karen from Accounting, File the TPS Report, Internal “Self-Service” Portal" },
      B: { intro: "No route currently isolates legacy tools, VPNs, and printers.", cta: "Add element for the IT lens", suggestionsLead: "Try: Legacy Thing We Can’t Turn Off, VPN That Drops Every Hour, Office LAN" },
      C: { intro: "No route currently demonstrates end-to-end “alignment” across layers.", cta: "Add element for the cross-layer lens", suggestionsLead: "Try: Sending Yet Another Follow-Up Email, Ticketing System From 2007, On-Prem Server in a Closet" },
    },
  }

};