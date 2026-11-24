# Meal Track & Trace dashboard (prototype)

A React + Recharts dashboard for the Airline Ready-Meal Track & Trace project, built to the interface
guide in DESIGN.md (the team's design notes). It shows where every meal batch is, its temperature on the
way, which flights are ready, the alerts with what to do next, and the health of each ESP32-S3 sensor node. In the DFDs this is process 6.0 (mainly 6.1 Monitoring
and 6.4 Alerts) for the dashboard operator and the food safety manager.

## Run it

Requires Node.js 20 or newer.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for message handling and alerts
npm run build    # production build in dist/
```

Without a backend the dashboard uses a **built-in simulator** that sends messages in the exact JSON format
the sensor nodes use. It replays the last 12 hours, then keeps running at 12× speed (one 60 s reading every
5 s). The **Simulation** menu in the top bar switches between Paused, 1× (real time), 12×, 60× and 300×. It simulates six units (three trolleys, two trucks, one cold room) and includes these scenarios so every feature has something to show:

| Unit | Scenario |
|---|---|
| Truck T-07 | Door left open for 15 min about 80 min ago (a resolved excursion) |
| Truck T-07 | Cooling fault on the rear sensor (ch 1) for the last 12 min (a live excursion) |
| Trolley C-104 | Network outage 40–25 min ago: messages buffered on the SD card and sent late |
| Trolley C-104 | Two messages lost about 100 min ago, and the last restart was a watchdog reset |
| Cold Room 2 | No door sensor fitted (the door is optional) |
| Flight FL 203 | Its meals are on Truck T-07 when the rear sensor warms up: two batches turn "Act now" |
| Flight FL 117 | One batch is packed 70 min late, so the flight shows "Check soon" until it is packed |
| Batch …-0377 | Missed its flight and expired in Cold Room 2 twenty minutes before the dashboard opened |

Meal batches and flights are simulated in `src/data/meals.js`: a flight departs every 75 minutes and each
batch moves Kitchen → Cold Room 2 → trolley (3 h before departure) → truck → aircraft. Each batch's
temperature comes from the sensor of the unit it is in.
| Trolley C-118 | Runs on battery and drops below 20 % (low-battery alert); last restart was a brownout |

## Screens

| Screen | What it answers |
|---|---|
| **Home** | "Is everything OK?" Attention banner with a button per problem (one green line when all is fine), 4 summary tiles, where meals are now (Kitchen → Cold storage → Truck → Aircraft), storage at a glance |
| **Alerts** | One list: Act now → Check soon → Info, then Handled and Resolved (folded). Similar alerts are grouped. Each opens a side panel: what happened, last-hour chart, affected meals, what to do, **Mark as fixed** (with Undo). New alerts wait behind a "N new alerts · Show" pill |
| **Find a meal** | Scan or type a batch code. Header card (status, location, temperature, expiry countdown, flight), journey timeline with problems where they happened, temperature chart with the safe range shaded |
| **Batches** | Shared list pattern: search, Status / Where / Flight filters as removable chips, saved views, sortable columns, row side panel, select rows → Export |
| **Storage** | Trolleys, trucks and cold rooms: summary stats, unit table (columns chosen in **Customize view**), side panel with unit / sensor / period pickers and category tabs |
| **Flights** | Departures with Ready / Not ready / Preparing and a checklist per flight |
| **Devices** | Sensor box health: signal (bars + words, **?** explains dBm), power ("Plugged in" / "On battery"), memory card, firmware, missing messages |
| **Reports** | **Download report (PDF)** and **Export Excel** (summary, units, alerts, batches, flights, readings, door events, device health) |
| **Settings** | Theme (light default, dark, match device), comfortable / compact rows, large text for tablets, what the dashboard shows, tour, wall screen |

Design rules applied everywhere (DESIGN.md): one status = same icon + word + color (OK ✓ green, Check soon ⚠
amber, Act now ! red, No signal ◌ grey) and status colors are used for nothing else; brand blue for actions;
Inter with JetBrains Mono for codes; tabular numbers; 44 px targets (56 px in large/tablet mode); one primary
button per view; plain sentences with the next step; relative times with the exact time on hover.

Also: top-bar search that accepts barcode scans from anywhere (green flash + beep, or a red message);
keyboard shortcuts `/` search, `A` alerts, `J`/`K` rows, `Esc` close, `?` help; "Show as table" under every
chart; skeleton loading; a 3-step optional tour; a wall screen (dark, Home and Alerts every 20 s, full-width red
bar for Act-now problems). Screen sizes: ≥1440 px full side nav, 1024–1439 icons only, 768–1023 bottom tab
bar with large text, under 768 Alerts and Find only.

## Assistant (chatbot)

The assistant sends your question and a summary of the current dashboard data to Claude (`claude-opus-5-5`)
through a small endpoint, `POST /api/chat`, that runs inside the Vite server (`server/chatPlugin.js`). The API key
stays on the server and is never sent to the browser.

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or sign in once with `ant auth login`
npm run dev
```

Without a key the assistant still works with **offline answers**: built-in replies for summaries, alerts,
temperatures, doors, batteries, signal and any unit by name. The panel header shows which mode is active.
The endpoint only exists in `npm run dev` and `npm run preview`; a static build on another web server uses the
offline answers until the FastAPI backend provides `/api/chat`.

## Connect it to the backend

Copy `.env.example` to `.env` and set the FastAPI WebSocket endpoint:

```
VITE_WS_URL=ws://localhost:8000/ws/telemetry
```

Each WebSocket frame must be one message, or an array of messages, **in the same JSON format the sensor nodes
send**. The backend can forward what it receives after validating and storing it.

## How messages are handled (`src/data/store.js`)

| Situation | What the dashboard does |
|---|---|
| Missing `msg_type`, `device_id`, `ts` or `seq` | Rejects the message and counts it |
| `seq` already seen | Drops it as a duplicate |
| Jump in `seq` | Marks the skipped numbers as missing; a late copy (`from_buffer: true`) clears them |
| `from_buffer: true` | Adds the data to the history in time order, but never overwrites the latest state |
| `crc_ok: false`, or `status` not `ok` | Shows the sensor problem, does not plot the value |
| `msg_type: "event"` | Records a door change at its exact `ts` |
| `system` / `power` / `storage` / `network` present | Updates the health cards (the full message every 10–30 min) |
| `msg_type: "boot"` | Restarts sequence tracking and stores the sensor map |

### Assumptions to confirm with the firmware team

- **Boot message sensor map:** the spec says the boot message carries the "sensor serial-to-channel map" but
  not its format. The dashboard expects `"sensors": [{ "sensor_id", "model", "mux", "ch" }]`.
- **Sequence after reboot:** the dashboard assumes `seq` restarts after a boot message.
- **Door events:** expected to carry `door.state` (and `gps`), as in the sending schedule.
- **Cellular `network` fields:** when `type` is `cellular`, `ssid` and `channel` may be missing; the dashboard
  handles that.

## Alerts (`src/lib/alerts.js`)

| Alert | Severity | Rule |
|---|---|---|
| Too warm / too cold | Act now | Latest reading outside the limits; "since" is when the readings first went out of range |
| No data received | Act now | Nothing for 3 × `interval_s` |
| Door open too long | Check soon | Open longer than `alarm_threshold_s` (default 120 s), or `door.alarm` is true |
| Sensor error / corrupted reading | Check soon | `status` not `ok`, or `crc_ok` false |
| Unexpected restart | Check soon | `reset_reason` is `brownout`, `watchdog` or `panic` |
| Low battery, SD missing, SD write errors | Check soon | On battery below 20 %, `sd_present` false, `write_errors` > 0 |
| Messages missing / buffered, weak signal, RTC time, heater ran | info | Gaps in `seq`, `buffered_msgs` > 0, RSSI below −80 dBm, `ts_source` is `rtc`, heater ran in the last 5 min |
| Batch expired | Act now | A batch on the ground is past its expiry time (`src/data/meals.js`) |
| Meals expiring soon | Check soon | Batches that expire in under 6 hours, grouped into one alert |
| Flight not ready | Check soon | Under 3 hours to departure and a batch is not on a trolley yet |

Every alert has a plain sentence ("Truck T-07 is too warm (6.8 °C) for 12 min") and next steps.

**The temperature limits (0–5 °C) are placeholders.** The real limits come from the approved HACCP plan and
should be loaded from the backend (D4 Users & Safety Limits). Change them in `src/config.js` until then.

## Project structure

```
src/
  config.js              limits and thresholds (placeholders)
  data/
    feed.js              chooses the simulator or the backend WebSocket
    simulator.js         generates sample messages in the sensor JSON format
    store.js             turns messages into dashboard state (duplicates, gaps, buffering)
    registry.js          which trolley / truck / room each device belongs to (from the backend later)
    meals.js             simulated batches and flights, batch status, journey timeline
    store.test.js        unit tests
  lib/
    alerts.js            alert rules
    format.js            time and number formatting
    describe.js          status, signal (dBm) and power in plain words
    stats.js             min / avg / max, time in range, excursions
    view.js              Customize view options
    router.js            hash routes (#/page/arg?filters) so Back keeps filters
    prefs.js             theme, density, handled alerts, recent meals (browser storage)
    export.js            Excel export (ExcelJS, loaded on demand)
    report.js            PDF report (jsPDF, loaded on demand)
    assistant.js         data summary for the chatbot + offline answers
    lib.test.js          unit tests
  components/            Shell (top bar, nav, search), DataTable, TempChart, BatchView, UnitDetail,
                         UI (side panel, menu, tiles, toasts), Badges, CustomizeView, ChatPanel
  pages/                 Home, Alerts, Find, Batches, Storage (also Devices), Flights, Reports, Settings
server/
  chatPlugin.js          POST /api/chat → Claude (dev and preview servers)
```

## Not in this prototype

Login, users and roles (the user menu, "I'm on it" ownership, operator vs supervisor buttons and the
per-station operator screen wait for that plan), the site switcher, actions that change data (Move, Hold,
New batch, Release: they need the backend), Arabic / right-to-left, escalation to the food safety manager,
scheduled reports and the other front ends (data-logger app, admin console). "Mark as fixed" is saved in the
browser only.
