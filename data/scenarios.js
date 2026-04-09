// === data/scenarios.js ===
/**
 * Domain contexts for thematic storytelling.
 *
 * `SCENARIOS[domain].labels[elementName]` maps canonical ArchiMate element names
 * to domain-specific display labels. Values may be:
 *   - A string  → always used as-is
 *   - An array  → one entry picked at random each session via resolveLabel()
 *
 * Missing keys fall back to the canonical ArchiMate element name.
 *
 * ArchiMate correctness rules applied throughout:
 *   Device          = physical IT resource hosting system software/artifacts
 *   Node            = computational/physical resource hosting or interacting with others
 *   Equipment       = physical machines that create/use/store/move/transform materials (NOT IT)
 *   Facility        = physical structure or environment
 *   System Software = execution environment: OS, middleware, runtime — NOT applications
 *   Application Component = encapsulated application functionality, modular and replaceable
 *   Business Actor  = entity capable of performing behavior
 *   Business Role   = responsibility for behavior, assigned to an actor
 *   Value Stream    = sequence of activities creating an overall result for a stakeholder
 *   Gap             = statement of difference between two plateaus
 *   Plateau         = relatively stable architectural state during a limited period
 */

/**
 * Resolve a label value: pick randomly from array, or return string directly.
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
 * Build a fully resolved label map for a scenario (all arrays collapsed to strings).
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
      B: { intro: "No route currently stays only in Application, Technology, Physical, or Implementation.", cta: "Add element to explore the infrastructure lens", suggestionsLead: "Try: Application Component, Node, Device" },
      C: { intro: "No route currently bridges upper layers and infrastructure in one chain.", cta: "Add element to explore the cross-layer lens", suggestionsLead: "Try: Business Service, Application Service, Technology Service" },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // DEATH STAR — Galactic Empire strategic weapons platform
  // ══════════════════════════════════════════════════════════════════════════

  death_star: {
    label: "Death Star",
    name: "Galactic Empire Operations",
    labels: {
      "Stakeholder": ["Emperor Palpatine", "Grand Moff Tarkin"],
      "Driver":      ["Galactic Insurgency", "Rebel Alliance Expansion"],
      "Assessment":   "Rebel Alliance Threat Analysis",
      "Goal":        ["Total Galactic Order", "Crush All Resistance"],
      "Outcome":      "Fully Operational Battlestation",
      "Principle":    "Tarkin Doctrine (Rule Through Fear)",
      "Requirement":  "Planetary Destruction Capability",
      "Constraint":   "Limited Kyber Crystal Supply",
      "Meaning":      "Disturbance in the Force",
      "Value":        "Unquestioned Absolute Power",

      "Resource":          "Imperial Kyber Crystal Reserves",
      "Capability":        "Strategic Orbital Bombardment",
      "Value Stream":      "Order-to-Planetary-Compliance Stream",
      "Course of Action":  "Single-Reactor Firing Sequence",

      "Business Actor":         ["Stormtrooper Legion", "Imperial Navy Crew"],
      "Business Role":          ["Grand Moff (Regional Commander)", "Imperial Admiral"],
      "Business Collaboration":  "Superlaser Operating Crew",
      "Business Interface":      "Imperial Command Bridge",
      "Business Process":       ["Execute Superlaser Fire Sequence", "Conduct Planetary Subjugation"],
      "Business Function":       "Imperial Sector Governance",
      "Business Interaction":    "Multi-Crew Ignition Coordination",
      "Business Event":         ["Rebel Transmission Intercepted", "Unauthorized Vessel Detected"],
      "Business Service":        "Imperial Justice Delivery",
      "Business Object":         "Sector Pacification Records",
      "Contract":                "Imperial Charter of Authority",
      "Representation":          "Imperial Propaganda Hologram",
      "Product":                 "Peace Through Absolute Power",

      "Application Component":     "Superlaser Targeting Computer",
      "Application Collaboration": "Multi-Turbolaser Combat Data Link",
      "Application Interface":     "Tactical HUD Interface",
      "Application Function":      "Ballistic Trajectory Calculation",
      "Application Interaction":   "Synchronized Firing Sequence",
      "Application Process":       "Target Acquisition and Lock Routine",
      "Application Event":         "Target Lock Confirmed",
      "Application Service":       "Hyperspace Navigation Support",
      "Data Object":               "Thermal Exhaust Port Schematics",

      // Node = computational resource ✓ — NOT the station itself
      "Node":                     "Central Imperial Battle Computer",
      // Device = physical IT resource hosting system software ✓ — NOT the TIE fighter
      "Device":                  ["Onboard Targeting Sensor Array", "Imperial Surveillance Terminal"],
      "System Software":          "Imperial Command & Control OS",
      "Technology Collaboration": "Turbolaser Battery Control Mesh",
      "Technology Interface":     "Docking Clamp Control Port",
      "Path":                     "Hyperlane Transit Corridor",
      "Communication Network":    "Sub-Space Transceiver Array",
      "Technology Function":      "Kyber Reactor Stabilization",
      "Technology Process":       "Emergency Power Rerouting",
      "Technology Interaction":   "Deflector Shield Modulation",
      "Technology Event":        ["Reactor Power Surge", "Hull Breach Detected"],
      "Technology Service":       "Station-Wide Energy Distribution",
      "Technology Object":        "Imperial Encryption Key",
      "Artifact":                 "Imperial Deployment Manifest",

      // Equipment = physical machines ✓ — NOT IT devices
      "Equipment":           ["Tractor Beam Generator Assembly", "Ion Cannon Battery"],
      "Facility":            ["Death Star Docking Bay 327", "Imperial Detention Block AA-23"],
      "Distribution Network": "Station Power Conduit Network",
      "Material":             "Quadanium Steel Hull Plating",

      "Work Package":          "Project Stardust Construction Phase",
      "Deliverable":           "Approved Battle Station Blueprint",
      "Implementation Event":  "Station Commissioning Ceremony",
      "Plateau":               "Phase I: Orbital Test Readiness",
      "Gap":                   "Unshielded Thermal Exhaust Port (Critical Vulnerability)",

      "Location": ["Outer Rim Territories", "Scarif Imperial Installation"],
      "Grouping":  "Imperial Sector Command",
    },
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
    labels: {
      "Stakeholder": ["Mon Mothma (Supreme Commander)", "Princess Leia Organa"],
      "Driver":      ["Galactic Imperial Oppression", "Loss of Alderaan"],
      "Assessment":   "Imperial Force Strength Analysis",
      "Goal":        ["Restore the Galactic Republic", "Destroy the Death Star"],
      "Outcome":      "Death Star Destroyed",
      "Principle":    "Self-Sacrifice for the Greater Good",
      "Requirement":  "Precise Weakness Targeting Data",
      "Constraint":   "Guerrilla Warfare Resource Limitations",
      "Meaning":      "Symbol of Hope",
      "Value":        "Liberty, Justice, and Self-Determination",

      "Resource":          "Alliance Intelligence Network",
      "Capability":        "Deep Space Infiltration and Sabotage",
      "Value Stream":      "Surveillance-to-Strike Stream",
      "Course of Action":  "Assault on Thermal Exhaust Port",

      "Business Actor":         ["Alliance Freedom Fighter", "Bothan Spy"],
      "Business Role":          ["Pathfinder Scout Commander", "Gold Leader"],
      "Business Collaboration":  "Red Squadron Strike Group",
      "Business Interface":      "Secret Rebel Rendezvous Point",
      "Business Process":       ["Sabotage Imperial Shield Generator", "Execute Trench Run Attack"],
      "Business Function":       "Resistance Cell Coordination",
      "Business Interaction":    "Multi-Squadron Tactical Briefing",
      "Business Event":         ["Imperial Patrol Detected", "Scrambled Alliance Distress Signal"],
      "Business Service":        "Planetary Liberation Service",
      "Business Object":         "Stolen Imperial Intelligence Dossier",
      "Contract":                "Alliance Mutual Defense Charter",
      "Representation":          "Rebel Starbird Insignia",
      "Product":                 "Liberation Strategy Package",

      "Application Component":     "R2-Series Astromech Navigation System",
      "Application Collaboration": "Fighter-Droid Combat Data Link",
      "Application Interface":     "Cockpit Holoprojector Display",
      "Application Function":      "Cryptographic Decryption Engine",
      "Application Interaction":   "Navicomputer Hyperspace Sync",
      "Application Process":       "Hyperspace Jump Calculation Routine",
      "Application Event":         "Astrogation Lock Confirmed",
      "Application Service":       "Long-Range Targeting Assistance",
      "Data Object":               "Death Star Technical Schematics",

      // Node = computational resource ✓ — the ship's command server, not the ship itself
      "Node":                     "Mon Calamari Fleet Command Server",
      // Device = physical IT resource ✓ — the onboard computer, not the X-Wing airframe
      "Device":                   "X-Wing Onboard Flight Computer",
      "System Software":          "Rebel Alliance Command OS",
      "Technology Collaboration": "Encrypted Inter-Squadron Comms Channel",
      "Technology Interface":     "S-Foil Actuator Control Port",
      "Path":                     "Secret Smuggler's Hyperroute",
      "Communication Network":    "Hidden Rebel Transmitter Network",
      "Technology Function":      "Imperial Signal Jamming",
      "Technology Process":       "Emergency Power Shunt to Shields",
      "Technology Interaction":   "Transponder Spoofing Sequence",
      "Technology Event":        ["System Overload Warning", "TIE Fighter Lock-On Detected"],
      "Technology Service":       "Encrypted Tactical Comms Relay",
      "Technology Object":        "Rebel Authorization Code",
      "Artifact":                 "Stolen Imperial Clearance Documents",

      // Equipment = the physical ship airframe ✓ — NOT a Device
      "Equipment":           ["X-Wing Starfighter", "Y-Wing Bomber"],
      "Facility":            ["Hidden Rebel Base (Yavin 4)", "Hoth Echo Base"],
      "Distribution Network": "Alliance Supply and Resupply Lines",
      "Material":             "Salvaged Starship Components",

      "Work Package":          "Operation: Retrieve Death Star Plans",
      "Deliverable":           "Confirmed Vulnerability Analysis Report",
      "Implementation Event":  "Rebel Fleet Jump to Yavin System",
      "Plateau":               "Phase I: Intelligence Gathering",
      "Gap":                   "Critical Shortage of Heavy Bombers",

      "Location": ["Yavin System (Hidden Base)", "Dagobah System"],
      "Grouping":  "Rebel Cell Network",
    },
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
    labels: {
      "Stakeholder": ["Patient", "NHS / Health Authority"],
      "Driver":      ["Population Health Outcome Targets", "Aging Demographic Pressure"],
      "Assessment":   "Annual Clinical Quality Audit",
      "Goal":        ["Zero Hospital-Acquired Infections", "Reduce Average Length of Stay"],
      "Outcome":      "Full Patient Recovery and Discharge",
      "Principle":    "Patient-Centered Evidence-Based Care",
      "Requirement":  "24/7 Continuous Monitoring Capability",
      "Constraint":   "HIPAA / GDPR Compliance Regulations",
      "Meaning":      "Patient Understanding of Diagnosis",
      "Value":        "Improved Long-Term Quality of Life",

      "Resource":          "Specialist Clinical Staff Expertise",
      "Capability":        "Remote Telehealth Consultation",
      "Value Stream":      "Triage-to-Discharge Care Stream",
      "Course of Action":  "Surgical Intervention Plan",

      "Business Actor":         ["Attending Physician", "Specialist Consultant"],
      "Business Role":          ["Head of Surgery", "Ward Charge Nurse"],
      "Business Collaboration":  "Multidisciplinary Care Team",
      "Business Interface":      "Hospital Reception Desk",
      "Business Process":       ["Admit and Triage Patient", "Perform Surgical Procedure"],
      "Business Function":       "Diagnostic and Imaging Services",
      "Business Interaction":    "Multidisciplinary Case Review",
      "Business Event":         ["Emergency Patient Arrival", "Deteriorating Patient Alert"],
      "Business Service":        "Emergency Care Service",
      "Business Object":         "Patient Medical Chart",
      "Contract":                "Health Insurance Agreement",
      "Representation":          "Printed Radiology Report",
      "Product":                 "Integrated Health Plan",

      "Application Component":    ["Electronic Health Record (EHR) System", "Clinical Decision Support System"],
      "Application Collaboration": "Lab-EHR Results Integration",
      "Application Interface":     "Clinician Tablet Portal",
      "Application Function":      "Prescription Management Engine",
      "Application Interaction":   "Automated Drug Interaction Check",
      "Application Process":       "Insurance Billing Workflow",
      "Application Event":         "Lab Order Placed",
      "Application Service":       "Patient Data Retrieval Service",
      "Data Object":               "Structured Patient Medical History",

      "Node":                     "Clinical Data Centre Server Cluster",
      // Device = physical IT resource ✓ — the scanner's embedded controller, not the scanner chassis
      "Device":                  ["MRI Scanner (with embedded controller)", "Bedside Patient Monitor Terminal"],
      // System Software = middleware/runtime ✓ — NOT the DICOM viewer application
      "System Software":          "HL7 / FHIR Integration Middleware",
      "Technology Collaboration": "Medical IoT Device Network",
      "Technology Interface":     "DICOM / HL7 Protocol Gateway",
      "Path":                     "Hospital Intranet Backbone",
      "Communication Network":    "Medical-Grade Encrypted Wi-Fi",
      "Technology Function":      "DICOM Image Processing",
      "Technology Process":       "Data Encryption and Anonymisation",
      "Technology Interaction":   "Patient Monitor Sensor Sync",
      "Technology Event":        ["Critical Hardware Failure Alert", "Network Connectivity Loss"],
      "Technology Service":       "Secure Clinical Data Storage Service",
      "Technology Object":        "Two-Factor Authentication Token",
      "Artifact":                 "Deployed Software License Certificate",

      // Equipment = physical medical machines ✓ — NOT IT devices
      "Equipment":           ["Mechanical Ventilator", "Surgical Robot Arm"],
      "Facility":            ["Operating Theatre 4", "Intensive Care Unit (ICU)"],
      "Distribution Network": "Medical Oxygen Pipeline System",
      "Material":            ["Sterile Surgical Instrument Kit", "IV Infusion Consumables"],

      "Work Package":          "Oncology Wing Construction and Fit-Out",
      "Deliverable":           "Patient Discharge Summary Document",
      "Implementation Event":  "Wing Grand Opening and Certification",
      "Plateau":               "Initial JCI Accreditation State",
      "Gap":                   "Specialist Nursing Staff Shortage",

      "Location": ["North Clinical Wing", "Emergency Department"],
      "Grouping":  "Clinical Department",
    },
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
  //   F1 Race Car (Chassis + Power Unit) → Equipment (Physical layer)
  //     The car is a physical machine that uses/transforms material (tyres, fuel)
  //   Car ECU (Electronic Control Unit) → Device (Technology layer)
  //     The ECU is the physical IT resource inside the car that hosts the RTOS
  //   RTOS on ECU → System Software (Technology layer)
  //     The real-time OS is the execution environment, NOT an application
  //   Telemetry Analysis Platform → Application Component (Application layer)
  //     The analytical software that processes and visualises the data
  // ══════════════════════════════════════════════════════════════════════════

  f1_team: {
    label: "Formula 1 Team",
    name: "Grand Prix Race Operations",
    labels: {
      "Stakeholder": ["FIA (Governing Body)", "Team Principal", "Title Sponsor"],
      "Driver":      ["Constructor Championship Deficit", "Rival Team Performance Breakthrough"],
      "Assessment":   "Mid-Season Competitor Performance Analysis",
      "Goal":        ["Win the Constructors' Championship", "Achieve Pole Position and Fastest Lap"],
      "Outcome":     ["Race Victory", "Podium Finish"],
      "Principle":    "Data-Driven Decision Making at All Levels",
      "Requirement":  "Sub-2.5 Second Pit Stop Execution",
      "Constraint":   "FIA Technical Regulation (Parc Fermé Rules)",
      "Meaning":      "Championship Points Significance",
      "Value":        "Competitive Edge Through Marginal Gains",

      "Resource":          "Wind Tunnel and CFD Simulation Capacity",
      "Capability":        "Real-Time Race Strategy Adaptation",
      "Value Stream":      "Design-to-Podium Engineering Stream",
      "Course of Action":  "Undercut Pit Stop Strategy",

      "Business Actor":         ["Race Driver", "Pit Crew Mechanic"],
      "Business Role":          ["Race Engineer", "Chief Strategist"],
      "Business Collaboration":  "Pit Wall Strategy Team",
      "Business Interface":      "Team Radio Channel",
      "Business Process":       ["Execute Pit Stop", "Manage Tyre Degradation Strategy"],
      "Business Function":       "Aerodynamic Development",
      "Business Interaction":    "Driver-Engineer Lap Data Debrief",
      "Business Event":         ["Safety Car Deployed", "Virtual Safety Car Period"],
      "Business Service":        "Race Strategy Advisory Service",
      "Business Object":         "Lap Time and Sector Data",
      "Contract":                "Driver Contract and Sponsorship Agreement",
      "Representation":          "Printed Timing Tower Sheet",
      "Product":                 "Championship Sponsorship Package",

      "Application Component":    ["Telemetry Analysis Platform", "Race Strategy Simulation Model"],
      "Application Collaboration": "Pit Wall — Factory Data Bridge",
      "Application Interface":     "Race Engineer Strategy Dashboard",
      "Application Function":      "Tyre Degradation Prediction Model",
      "Application Interaction":   "Live Timing Feed Aggregation",
      "Application Process":       "Post-Session Setup Optimisation Workflow",
      "Application Event":         "DRS Zone Activation Detected",
      "Application Service":       "Live Lap Delta Calculation Service",
      "Data Object":               "Car Sensor Telemetry Stream (1,200 channels)",

      // Node = computational resource ✓ — factory cluster, NOT the car
      "Node":                     "Factory High-Performance Computing Cluster",
      // Device = physical IT resource ✓ — the ECU inside the car, NOT the car itself
      "Device":                  ["Car ECU (Electronic Control Unit)", "Trackside Data Uplink Terminal"],
      // System Software = RTOS execution environment ✓ — NOT the telemetry app
      "System Software":          "RTOS (Real-Time Operating System on ECU)",
      "Technology Collaboration": "Trackside-to-Factory Data Uplink Cluster",
      "Technology Interface":     "OBD / CAN Bus Interface Port",
      "Path":                     "Encrypted Telemetry Radio Link",
      "Communication Network":    "FOM (Formula One Management) Data Network",
      "Technology Function":      "CFD Aerodynamic Simulation Processing",
      "Technology Process":       "Sensor Data Sampling and Compression",
      "Technology Interaction":   "Timing Beacon — Car Transponder Sync",
      "Technology Event":        ["Sensor Anomaly or Data Loss Warning", "Hydraulic Pressure Drop Alert"],
      "Technology Service":       "Trackside Telemetry Relay Service",
      "Technology Object":        "Encrypted Setup Configuration File",
      "Artifact":                 "Deployed Firmware Image (ECU)",

      // Equipment = the physical car ✓ — the machine that uses tyres and fuel
      // This is the key teaching distinction: the car is Equipment, the ECU inside it is a Device
      "Equipment":           ["F1 Race Car (Chassis and Power Unit)", "Wheel Gun and Pneumatic Rig"],
      "Facility":            ["Race Team Garage (Pit Lane)", "Wind Tunnel Test Facility"],
      "Distribution Network": "Pneumatic Wheel Gun Supply Lines",
      "Material":            ["Tyre Compound Set (Soft / Medium / Hard)", "Carbon Fibre Body Panel"],

      "Work Package":          "Upgrade Package Design and Wind Tunnel Validation",
      "Deliverable":           "Homologated Upgrade Part (Floor or Front Wing)",
      "Implementation Event":  "Upgrade Introduction at Race Weekend",
      "Plateau":               "Current-Spec Car (Pre-Upgrade Freeze)",
      "Gap":                   "Downforce Deficit vs Leading Constructor",

      "Location": ["Circuit de Monaco (Race Venue)", "Silverstone Circuit", "Team Factory (Brackley / Maranello)"],
      "Grouping":  "Race Weekend Operations",
    },
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
    labels: {
      "Stakeholder": ["The Audience", "Local Venue Authority"],
      "Driver":       "Demand for Live Family Entertainment",
      "Assessment":   "Ticket Sales and Audience Satisfaction Trends",
      "Goal":        ["Deliver Awe and Wonder", "Achieve Full-Season Tour Sell-Out"],
      "Outcome":      "Standing Ovation — Sold-Out Run",
      "Principle":    "The Show Must Go On",
      "Requirement":  "High-Wire and Aerial Safety Standards",
      "Constraint":   "Local Noise and Zoning Ordinances",
      "Meaning":      "Cultural Nostalgia and Escapism",
      "Value":        "Magical Shared Family Memories",

      "Resource":          "World-Class Performing Artists",
      "Capability":        "Aerial Acrobatics and High-Wire Mastery",
      "Value Stream":      "Promotion-to-Performance Stream",
      "Course of Action":  "Rehearsal and Routine Refinement Plan",

      "Business Actor":         ["Trapeze Artist", "Fire Juggler", "Clown"],
      "Business Role":          ["Ringmaster", "Stage Director"],
      "Business Collaboration":  "Acrobatic Performance Duo",
      "Business Interface":      "Box Office and Front-of-House",
      "Business Process":       ["Execute Aerial Acrobatic Routine", "Manage Interval and Audience Flow"],
      "Business Function":       "Artistic Direction and Choreography",
      "Business Interaction":    "Pre-Show Safety and Cue Briefing",
      "Business Event":         ["Curtain Rise", "Unplanned Performer Injury"],
      "Business Service":        "Grand Spectacle Performance",
      "Business Object":         "Audience Ticket and Seat Data",
      "Contract":                "Performer Engagement Agreement",
      "Representation":          "Printed Programme Booklet",
      "Product":                 "Family Season Pass",

      "Application Component":     "Online Ticket Booking Engine",
      "Application Collaboration": "Seat Selector and Pricing Tool",
      "Application Interface":     "Mobile Booking App UI",
      "Application Function":      "Payment and Checkout Processing",
      "Application Interaction":   "Real-Time Seat Availability Check",
      "Application Process":       "Automated Promotional Email Blast",
      "Application Event":         "Ticket Purchase Confirmed",
      "Application Service":       "Interactive Seat Map Service",
      "Data Object":               "Performance Cue Script",

      // Node = computational resource running the show control software ✓
      "Node":                     "Show Control Server (DMX/AV Master)",
      // Device = physical IT resource hosting the DMX runtime ✓
      "Device":                  ["DMX Lighting Controller Unit", "Sound Mixing Console"],
      "System Software":          "DMX 512 / ArtNet Control Runtime",
      "Technology Collaboration": "Lighting-Sound Synchronisation Link",
      "Technology Interface":     "MIDI and DMX Protocol Port",
      "Path":                     "Backstage Stage-Management Comms Line",
      "Communication Network":    "VHF Crew Radio Network",
      "Technology Function":      "Live Sound Mixing and Amplification",
      "Technology Process":       "Pyrotechnic and Special Effect Triggering",
      "Technology Interaction":   "Multi-System Cue Timing Coordination",
      "Technology Event":        ["Effect Misfire or Hardware Fault", "Power Supply Failure"],
      "Technology Service":       "Front-of-House Audio Relay Service",
      "Technology Object":        "Lighting Preset Configuration File",
      "Artifact":                 "Deployed Safety Certification Record",

      // Equipment = physical rigging — NOT IT ✓
      "Equipment":           ["Safety Net and High-Wire Rigging Assembly", "Aerial Trapeze Rig"],
      "Facility":            ["The Big Top (Main Performance Tent)", "Backstage Dressing and Warm-Up Area"],
      "Distribution Network": "Stage Power Distribution and Cabling",
      "Material":            ["Concession Stock (Popcorn, Refreshments)", "Costume and Props Inventory"],

      "Work Package":          "Annual Seasonal Tour Planning and Logistics",
      "Deliverable":           "Completed Sold-Out Performance Run",
      "Implementation Event":  "Opening Night (First Performance)",
      "Plateau":               "Winter Training and Rehearsal Camp",
      "Gap":                   "Ageing Rigging Equipment (Safety Risk)",

      "Location": ["Fairgrounds and Touring Venue Sites", "City Centre Arena (Winter Residency)"],
      "Grouping":  "Traveling Performance Troupe",
    },
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
    labels: {
      "Stakeholder": ["Student", "Research Funding Council", "Accreditation Body"],
      "Driver":      ["National Research Excellence Ranking Pressure", "Declining Domestic Enrollment"],
      "Assessment":  ["Annual Teaching Quality Assessment", "Research Impact Factor Review"],
      "Goal":        ["Achieve Top-10 Research University Status", "100% Graduate Employment Rate"],
      "Outcome":     ["Degree Certificate Awarded", "Published Research Paper"],
      "Principle":    "Academic Freedom and Integrity",
      "Requirement":  "ADA / Disability Access Compliance",
      "Constraint":   "Accreditation Standards (QAA / AACSB)",
      "Meaning":      "Student Understanding of Learning Objectives",
      "Value":        "Lifelong Employability and Critical Thinking",

      "Resource":          "Academic Faculty and Research Expertise",
      "Capability":        "Online and Hybrid Course Delivery",
      "Value Stream":      "Enrollment-to-Graduation Learning Stream",
      "Course of Action":  "Curriculum Redesign for Industry Alignment",

      "Business Actor":         ["Lecturer", "PhD Supervisor", "External Examiner"],
      "Business Role":          ["Head of Department", "Programme Director"],
      "Business Collaboration":  "Examination Board",
      "Business Interface":      "Student Services Help Desk",
      "Business Process":       ["Enroll and Register Student", "Conduct Final Examination", "Award and Ratify Degree"],
      "Business Function":       "Research Grant Management",
      "Business Interaction":    "Module Assessment and Feedback Panel",
      "Business Event":         ["Exam Results Published", "Research Grant Awarded", "Accreditation Inspection Visit"],
      "Business Service":        "Academic Advising Service",
      "Business Object":         "Student Academic Record (Transcript)",
      "Contract":                "Student Enrollment and Tuition Agreement",
      "Representation":          "Degree Certificate",
      "Product":                 "Undergraduate Degree Programme",

      "Application Component":    ["Learning Management System (LMS)", "Student Information System (SIS)", "Research Repository Platform"],
      "Application Collaboration": "LMS-SIS Grade Synchronisation",
      "Application Interface":     "Student Self-Service Portal",
      "Application Function":      "Automated Plagiarism Detection",
      "Application Interaction":   "Timetable Scheduling and Conflict Check",
      "Application Process":       "Online Exam Submission Workflow",
      "Application Event":         "Assignment Submission Deadline Reached",
      "Application Service":       "Course Content Delivery Service",
      "Data Object":               "Structured Assessment Submission",

      // Node = data centre / cloud hosting LMS and SIS ✓ — NOT a classroom terminal
      "Node":                    ["University Data Centre Server Farm", "Cloud Hosting Cluster (AWS / Azure)"],
      // Device = physical IT terminal in labs or lecture theatres ✓
      "Device":                  ["Lecture Theatre AV Control Terminal", "Computer Lab Workstation"],
      // System Software = virtualisation platform ✓ — NOT the LMS application
      "System Software":          "Virtualisation Platform (VMware / Hyper-V)",
      "Technology Collaboration": "Campus-Wide Identity and Access Management",
      "Technology Interface":     "SAML / OAuth2 Authentication Gateway",
      "Path":                     "Campus Fibre Optic Backbone",
      "Communication Network":    "Eduroam Campus Wi-Fi Network",
      "Technology Function":      "Video Lecture Encoding and Streaming",
      "Technology Process":       "Nightly Student Data Backup and Replication",
      "Technology Interaction":   "Multi-System Single Sign-On (SSO) Sync",
      "Technology Event":        ["LMS Outage During Peak Submission", "Ransomware Incident Alert"],
      "Technology Service":       "Managed Cloud Storage Service",
      "Technology Object":        "SSL / TLS Certificate",
      "Artifact":                 "Deployed LMS Plugin Package",

      // Equipment = physical research and lab machines ✓ — NOT IT devices
      "Equipment":           ["High-Performance Research Spectrometer", "3D Printing and Fabrication Lab Equipment"],
      "Facility":            ["Main Lecture Theatre", "Research Laboratory Block", "Library and Study Centre"],
      "Distribution Network": "Campus Heating and Utilities Network",
      "Material":            ["Laboratory Reagents and Consumables", "Printed Examination Papers"],

      "Work Package":          "New Campus Digital Learning Hub Build-Out",
      "Deliverable":           "Validated and Published Module Handbook",
      "Implementation Event":  "Academic Year Commencement",
      "Plateau":               "Current Validated Curriculum (Pre-Review)",
      "Gap":                   "Digital Skills Gap in Graduate Cohort",

      "Location": ["Main Campus", "Satellite Campus (City Centre)", "Online / Distance Learning"],
      "Grouping":  "Academic Faculty or School",
    },
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

};