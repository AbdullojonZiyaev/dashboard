# Cold-Chain Dashboard (prototype)

A read-only React + Recharts dashboard for the Airline Ready-Meal Track & Trace project. It shows live
temperature, humidity and door data from the ESP32-S3 sensor nodes, the alerts they raise, and each node's
health (power, microSD storage, network, system). In the DFDs this is process 6.0 (mainly 6.1 Monitoring
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
the sensor nodes use. It replays the last 3 hours, then keeps running at 12× speed (one 60 s reading every
5 s). The **Speed** buttons in the header switch between Pause, 1× (real time), 12×, 60× and 300×. It simulates six units (three carts, two trucks, one cold room) and includes these scenarios so every feature has something to show:

| Unit | Scenario |
|---|---|
| Truck T-07 | Door left open for 15 min about 80 min ago (a resolved excursion) |
| Truck T-07 | Cooling fault on the rear sensor (ch 1) for the last 12 min (a live excursion) |
| Cart C-104 | Network outage 40–25 min ago: messages buffered on the SD card and sent late |
| Cart C-104 | Two messages lost about 100 min ago, and the last restart was a watchdog reset |
| Cold Room 2 | No door sensor fitted (the door is optional) |
| Cart C-118 | Runs on battery and drops below 20 % (low-battery alert); last restart was a brownout |

## Features

| Feature | Where |
|---|---|
| Status badges: Normal (green), Warning (amber), Critical (red), Offline (grey), each with an icon and a legend | Units table, unit details |
| Signal shown as bars and words (Excellent → Very weak); hover the **?** for what dBm means | Units table, Network card |
| Power shown as "Plugged in" or "On battery" with a battery gauge | Units table, Power card |
| Alerts tinted by level, with counts and filters per level and what each level means | Alerts panel |
| Search by unit, flight, device ID or sensor ID | Units table |
| Unit and sensor dropdowns, period (1 h / 3 h / 12 h), category tabs | Unit details |
| Statistics per sensor: min / avg / max, time in range, time out of range, excursions, humidity | Unit details → Statistics |
| **View** sidebar: choose sections, table columns, detail categories, alert levels and unit types (saved in the browser) | ☰ View |
| **Export Excel**: Summary, Units, Alerts, Readings, Door events and Device health sheets | Header |
| **Download report (PDF)**: summary, unit table, alerts, a temperature chart per unit, door events, device health | Header |
| **Assistant** chatbot that answers questions from the live data | 💬 button |

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
| Temperature excursion | critical | Latest reading outside the limits; "since" is when the readings first went out of range |
| No data received | critical | Nothing for 3 × `interval_s` |
| Door open too long | warning | Open longer than `alarm_threshold_s` (default 120 s), or `door.alarm` is true |
| Sensor error / corrupted reading | warning | `status` not `ok`, or `crc_ok` false |
| Unexpected restart | warning | `reset_reason` is `brownout`, `watchdog` or `panic` |
| Low battery, SD missing, SD write errors | warning | On battery below 20 %, `sd_present` false, `write_errors` > 0 |
| Messages missing / buffered, weak signal, RTC time, heater ran | info | Gaps in `seq`, `buffered_msgs` > 0, RSSI below −80 dBm, `ts_source` is `rtc`, heater ran in the last 5 min |

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
    registry.js          which cart / truck / room each device belongs to (from the backend later)
    store.test.js        unit tests
  lib/
    alerts.js            alert rules
    format.js            time and number formatting
    describe.js          status, signal (dBm) and power in plain words
    stats.js             min / avg / max, time in range, excursions
    view.js              View sidebar options
    export.js            Excel export (ExcelJS, loaded on demand)
    report.js            PDF report (jsPDF, loaded on demand)
    assistant.js         data summary for the chatbot + offline answers
    lib.test.js          unit tests
  components/            KpiStrip, DeviceTable, AlertsPanel, DeviceDetail, Sidebar, ChatPanel, Badges
server/
  chatPlugin.js          POST /api/chat → Claude (dev and preview servers)
```

## Not in this prototype

Login and roles, escalation to the food safety manager, traceability views (lot → batch → cart → flight),
scheduled reports and the other front ends (data-logger app, supplier portal, admin console, meal page).
