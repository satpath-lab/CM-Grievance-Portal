/**
 * Training corpus for the auto-categorization classifier.
 * Each entry: [text, category, basePriority]
 *
 * Categories map to real Delhi departments per the research findings
 * (PWD Sewa, Delhi Jal Board, BSES/TPDDL, Delhi Police, MCD, etc.)
 */

export type Category =
  | "Water & Sanitation"
  | "Roads & Infrastructure"
  | "Power & Electricity"
  | "Public Safety"
  | "Education"
  | "Health Services"
  | "Sanitation & Waste"
  | "Transport"
  | "Stray Animals"
  | "Encroachment & Illegal Construction"
  | "Other";

export type BasePriority = "Critical" | "High" | "Normal";

export const TRAINING_DATA: Array<[string, Category, BasePriority]> = [
  // Water & Sanitation
  ["water supply not coming for three days colony residents suffering", "Water & Sanitation", "High"],
  ["sewage overflow main road health hazard entire block flooded", "Water & Sanitation", "Critical"],
  ["drinking water contamination brown colour foul smell sector twelve", "Water & Sanitation", "Critical"],
  ["pipeline burst leaking water road since yesterday morning", "Water & Sanitation", "High"],
  ["no water supply forty eight hours block residents buying tankers", "Water & Sanitation", "High"],
  ["borewell water dirty smells bad unfit for drinking", "Water & Sanitation", "High"],
  ["drainage completely blocked sewage entering houses ground floor", "Water & Sanitation", "Critical"],
  ["water tanker not coming five days area jal board not responding", "Water & Sanitation", "High"],
  ["overhead tank leaking water wasted daily no repair done", "Water & Sanitation", "Normal"],
  ["sewage pipe broken under road raw sewage on street", "Water & Sanitation", "Critical"],
  ["hand pump not working only water source for poor residents", "Water & Sanitation", "High"],
  ["water meter damaged billing incorrectly since months", "Water & Sanitation", "Normal"],
  ["sewer overflowing main road children getting sick puddles everywhere", "Water & Sanitation", "Critical"],
  ["sewer line choked sewage coming out footpath residents suffering", "Water & Sanitation", "Critical"],
  ["open sewer near park children playing health risk diseases", "Water & Sanitation", "High"],
  ["nala blocked flooding residential lane stagnant sewage water", "Water & Sanitation", "Critical"],
  ["manhole cover missing sewer open risk pedestrians falling", "Water & Sanitation", "High"],
  ["jal board water connection not given despite application months", "Water & Sanitation", "Normal"],
  ["water supply pressure very low upper floors no water", "Water & Sanitation", "High"],
  ["tap broken water wasting since week no plumber sent", "Water & Sanitation", "Normal"],

  // Roads & Infrastructure
  ["large pothole main road near market causing accidents daily riders falling", "Roads & Infrastructure", "High"],
  ["road completely destroyed after rain no repair done months", "Roads & Infrastructure", "High"],
  ["flyover construction blocking traffic diversion confusing commuters months", "Roads & Infrastructure", "Normal"],
  ["streetlights broken entire stretch main road unsafe for pedestrians night", "Roads & Infrastructure", "Normal"],
  ["footpath encroached by shops pedestrians forced onto road unsafe", "Roads & Infrastructure", "Normal"],
  ["road sinkhole appeared near bus stand danger collapse risk", "Roads & Infrastructure", "Critical"],
  ["bridge railing broken missing accident risk near river", "Roads & Infrastructure", "Critical"],
  ["speed breaker removed school road children crossing risk", "Roads & Infrastructure", "High"],
  ["road divider damaged missing vehicles crossing wrong side", "Roads & Infrastructure", "High"],
  ["road work left incomplete trench open no barricade night danger", "Roads & Infrastructure", "Critical"],
  ["footpath tiles broken uneven elderly people falling injured", "Roads & Infrastructure", "Normal"],
  ["road signage missing wrong way accidents happening regularly", "Roads & Infrastructure", "High"],
  ["waterlogging road completely submerged vehicles stuck cannot pass", "Roads & Infrastructure", "Critical"],
  ["road caved in after heavy rain large crater forming", "Roads & Infrastructure", "Critical"],

  // Power & Electricity
  ["power cut twenty four hours no electricity entire colony transformer failed", "Power & Electricity", "Critical"],
  ["voltage fluctuation damaging home appliances refrigerator burned", "Power & Electricity", "High"],
  ["electric pole leaning dangerously may fall on road anytime", "Power & Electricity", "Critical"],
  ["transformer exploded fire smoke entire colony in dark", "Power & Electricity", "Critical"],
  ["illegal electricity connection tapped main line overloading risk", "Power & Electricity", "Normal"],
  ["meter reading wrong billing three times actual usage", "Power & Electricity", "Normal"],
  ["live electric wires exposed hanging street children playing nearby", "Power & Electricity", "Critical"],
  ["no power supply peak summer temperature forty degrees residents suffering", "Power & Electricity", "High"],
  ["electric meter box broken open rain entering short circuit risk", "Power & Electricity", "High"],
  ["streetlight new connection not given despite repeated applications", "Power & Electricity", "Normal"],
  ["power supply only six hours day affecting businesses livelihoods", "Power & Electricity", "High"],
  ["electric wire fell on road after storm sparking danger", "Power & Electricity", "Critical"],

  // Public Safety
  ["chain snatching incident near metro station broad daylight police absent", "Public Safety", "Critical"],
  ["eve teasing harassment women daily market area police not acting", "Public Safety", "High"],
  ["drunk driving racing road night accidents near residential area", "Public Safety", "High"],
  ["illegal gambling den running residential colony openly complaints ignored", "Public Safety", "Normal"],
  ["theft house break in neighbour police refusing register fir", "Public Safety", "High"],
  ["suspicious persons loitering near school unknown threat children", "Public Safety", "Critical"],
  ["police not registering fir domestic violence victim asking help", "Public Safety", "High"],
  ["drug selling openly park youth affected police aware not acting", "Public Safety", "High"],
  ["stalking harassment woman returning home evening police unresponsive", "Public Safety", "Critical"],
  ["fire in building no fire brigade came people evacuated themselves", "Public Safety", "Critical"],
  ["atm theft robbery area cctvs not working police patrol absent", "Public Safety", "High"],
  ["man threatening neighbours with weapon police informed no action", "Public Safety", "Critical"],

  // Education
  ["school teacher beating students corporal punishment parents complained ignored", "Education", "High"],
  ["private school charging fees above government limit parents threatened", "Education", "High"],
  ["government school no toilets students especially girls suffering", "Education", "Normal"],
  ["midday meal not provided children going hungry school", "Education", "High"],
  ["teacher absent regularly no substitute classes not happening", "Education", "Normal"],
  ["school building roof cracked dangerous condition wall falling", "Education", "Critical"],
  ["school principal demanding bribe admission transfer certificate", "Education", "High"],
  ["no drinking water school students buying outside", "Education", "Normal"],
  ["textbooks not distributed months into academic year", "Education", "Normal"],
  ["school ground occupied illegal construction students no playground", "Education", "Normal"],

  // Health Services
  ["hospital doctor absent ward patients suffering no treatment given", "Health Services", "Critical"],
  ["medicines unavailable government dispensary patients buying expensive outside", "Health Services", "High"],
  ["ambulance not reaching despite calling multiple times patient critical", "Health Services", "Critical"],
  ["mohalla clinic closed two weeks no notice no alternative given", "Health Services", "High"],
  ["dengue fever spreading area no fogging fumigation done", "Health Services", "High"],
  ["dead animals decomposing road disease spreading residents sick", "Health Services", "High"],
  ["hospital staff rude demanding money icu patients relatives harassed", "Health Services", "High"],
  ["blood bank shortage hospital patients families arranging themselves", "Health Services", "Critical"],
  ["vaccination camp cancelled without notice children unvaccinated", "Health Services", "Normal"],
  ["sewage near hospital creating contamination infection risk patients", "Health Services", "Critical"],

  // Sanitation & Waste
  ["garbage not collected ten days colony stench flies disease risk", "Sanitation & Waste", "High"],
  ["open defecation happening near park residential area morning evening", "Sanitation & Waste", "High"],
  ["garbage dumping ground created near school children health risk", "Sanitation & Waste", "Critical"],
  ["construction debris dumped road narrowing traffic blocked months", "Sanitation & Waste", "Normal"],
  ["industrial waste dumped nala water black contaminated residents sick", "Sanitation & Waste", "Critical"],
  ["dust bins overflowing not emptied week garbage spilling road", "Sanitation & Waste", "High"],
  ["sanitation workers not coming colony entire week strike or absent", "Sanitation & Waste", "High"],
  ["garbage burning openly toxic smoke residents breathing problems", "Sanitation & Waste", "Critical"],
  ["dust pollution construction site no covering nearby residents coughing", "Sanitation & Waste", "Normal"],

  // Transport
  ["dtc bus route cancelled without notice regular commuters stranded daily", "Transport", "Normal"],
  ["bus stop shelter destroyed no shade rain heat commuters suffering", "Transport", "Normal"],
  ["auto rickshaw overcharging refusing meter police not checking", "Transport", "Normal"],
  ["bus overcrowded beyond capacity passengers hanging door daily risk", "Transport", "High"],
  ["bus driver rash driving passenger fell injured no action", "Transport", "High"],
  ["bus route diverted permanently no information given to commuters", "Transport", "Normal"],

  // Stray Animals
  ["stray dogs attacking people street children elderly bitten", "Stray Animals", "High"],
  ["stray dog bit child near park rabies risk no action taken", "Stray Animals", "Critical"],
  ["pack of stray dogs chasing pedestrians evening dangerous", "Stray Animals", "High"],
  ["cow blocking main road traffic jam every day no removal", "Stray Animals", "Normal"],
  ["monkeys entering homes snatching food attacking residents balconies", "Stray Animals", "Normal"],
  ["bull aggressive charging pedestrians market area injuries reported", "Stray Animals", "High"],

  // Encroachment & Illegal Construction
  ["illegal construction blocking drainage channel in residential area", "Encroachment & Illegal Construction", "Normal"],
  ["unauthorized shop encroaching footpath pedestrians forced onto road", "Encroachment & Illegal Construction", "Normal"],
  ["builder constructing without permit structure looks unsafe", "Encroachment & Illegal Construction", "High"],
  ["vendors occupying entire footpath market area no enforcement", "Encroachment & Illegal Construction", "Normal"],
  ["illegal floor added building violating sanctioned plan collapse risk", "Encroachment & Illegal Construction", "High"],
  ["park land encroached private party fencing public space illegally", "Encroachment & Illegal Construction", "Normal"],

  // Other
  ["tree fell road blocking traffic electricity line damaged", "Other", "High"],
  ["factory noise pollution night shift residents cannot sleep", "Other", "Normal"],
  ["loudspeaker noise religious event exceeding permitted hours", "Other", "Normal"],
  ["illegal hoarding dangerous building falling risk passers", "Other", "High"],
  ["air pollution severe smog visibility low health advisory needed", "Other", "High"],
  ["water logging after rain area drains blocked hours", "Other", "High"],
];
