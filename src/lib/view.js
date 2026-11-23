// What the "View" sidebar can switch on and off. Saved per browser in localStorage.

export const VIEW_GROUPS = [
  {
    key: "sections",
    title: "Sections",
    items: [
      ["kpis", "Summary tiles"],
      ["units", "Units table"],
      ["alerts", "Alerts"],
      ["detail", "Unit details"],
    ],
  },
  {
    key: "columns",
    title: "Table columns",
    items: [
      ["status", "Status"],
      ["temperature", "Temperature"],
      ["humidity", "Humidity"],
      ["door", "Door"],
      ["lastMessage", "Last message"],
      ["signal", "Signal"],
      ["power", "Power & battery"],
      ["location", "Location"],
    ],
  },
  {
    key: "categories",
    title: "Unit detail categories",
    items: [
      ["conditions", "Temperature & humidity charts"],
      ["stats", "Statistics"],
      ["sensors", "Sensors"],
      ["door", "Door"],
      ["location", "Location"],
      ["power", "Power"],
      ["connectivity", "Network & storage"],
      ["system", "Device system"],
      ["quality", "Data quality"],
    ],
  },
  {
    key: "severities",
    title: "Alert levels",
    items: [
      ["critical", "Critical"],
      ["warning", "Warning"],
      ["info", "Info"],
    ],
  },
  {
    key: "kinds",
    title: "Unit types",
    items: [
      ["Cart", "Carts"],
      ["Truck", "Trucks"],
      ["Room", "Cold rooms"],
    ],
  },
];

export const DEFAULT_VIEW = Object.fromEntries(
  VIEW_GROUPS.map((g) => [g.key, Object.fromEntries(g.items.map(([k]) => [k, !(g.key === "columns" && k === "location")]))]),
);

const STORAGE_KEY = "cold-chain-dashboard:view";

export function loadView() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!saved) return DEFAULT_VIEW;
    // Merge so new options added later default to on
    return Object.fromEntries(Object.entries(DEFAULT_VIEW).map(([g, items]) => [g, { ...items, ...saved[g] }]));
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveView(view) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
  } catch {
    // storage unavailable (private window): settings last for this visit only
  }
}
