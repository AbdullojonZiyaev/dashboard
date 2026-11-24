// What the "Customize view" panel can switch on and off. Saved per browser in localStorage.

export const VIEW_GROUPS = [
  {
    key: "sections",
    title: "Home screen",
    items: [
      ["tiles", "Summary tiles"],
      ["journey", "Where meals are now"],
      ["units", "Storage at a glance"],
    ],
  },
  {
    key: "columns",
    title: "Storage table columns",
    items: [
      ["status", "Status"],
      ["carrying", "Meals inside"],
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
    title: "Alert levels shown",
    items: [
      ["critical", "Act now"],
      ["warning", "Check soon"],
      ["info", "Info"],
    ],
  },
  {
    key: "kinds",
    title: "Unit types",
    items: [
      ["Cart", "Trolleys"],
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
