// Generates sensor-node messages in the agreed JSON format, following the sending schedule:
//   telemetry every 60 s (envelope, gps, core reading fields, door.state)
//   door events immediately (envelope, door.state, gps)
//   full message every 15 min (adds system, power, storage, network and the statistics fields)
//   boot message on start-up (system info and the sensor serial-to-channel map)
//
// On start it replays the last 3 hours, then keeps producing data at SPEED× real time.
// Built-in scenarios, relative to the moment the dashboard opens (T):
//   Truck T-07: door left open from T-80 to T-65 min (a resolved excursion)
//   Truck T-07: cooling fault on the rear sensor (ch 1) from T-12 min (a live excursion)
//   Cart C-104: network outage from T-40 to T-25 min (messages buffered on SD, sent late)
//   Cart C-104: two messages lost at T-100 min

const STEP_S = 60;
const FULL_EVERY_S = 900;
const HISTORY_S = 3 * 3600;
export const SPEED = 12; // default: 60 s of device time every 5 s of real time
export const SPEED_OPTIONS = [0, 1, 12, 60, 300]; // 0 = paused

const SPECS = [
  {
    id: "esp32s3-a1b2c3d4e5f6",
    offset: 0,
    net: { type: "wifi", rssi: -61, ssid: "Warehouse-IoT", channel: 6, ip: "192.168.1.42" },
    tsSource: "ntp",
    power: "external",
    reset: "watchdog",
    sensors: [{ id: "sht45-1A2B3C4D", ch: 0, base: 3.6 }],
    door: { ratePerMin: 0.05 },
    gps: { lat: 25.252812, lon: 55.364421 },
  },
  {
    id: "esp32s3-0f1e2d3c4b5a",
    offset: 20,
    net: { type: "cellular", rssi: -84, ip: "10.64.12.7" },
    tsSource: "gps",
    power: "battery",
    reset: "power_on",
    sensors: [
      { id: "sht45-5E6F7A8B", ch: 0, base: 2.9 },
      { id: "sht45-9C0D1E2F", ch: 1, base: 3.4 },
    ],
    door: { ratePerMin: 0.01 },
    route: [
      [25.243981, 55.372907],
      [25.254623, 55.360158],
    ],
  },
  {
    id: "esp32s3-9a8b7c6d5e4f",
    offset: 40,
    net: { type: "wifi", rssi: -58, ssid: "ColdRoom-IoT", channel: 11, ip: "192.168.1.57" },
    tsSource: "ntp",
    power: "external",
    reset: "power_on",
    sensors: [{ id: "sht45-3A4B5C6D", ch: 0, base: 2.2 }],
    door: null, // no door sensor fitted (optional feature)
    gps: { lat: 25.244023, lon: 55.372881 },
    indoor: true,
  },
  {
    id: "esp32s3-1c2d3e4f5a6b",
    offset: 10,
    net: { type: "wifi", rssi: -66, ssid: "Warehouse-IoT", channel: 6, ip: "192.168.1.44" },
    tsSource: "ntp",
    power: "external",
    reset: "power_on",
    sensors: [{ id: "sht45-7B8C9D0E", ch: 0, base: 3.1 }],
    door: { ratePerMin: 0.04 },
    gps: { lat: 25.252901, lon: 55.364512 },
  },
  {
    id: "esp32s3-6b5a4f3e2d1c",
    offset: 30,
    net: { type: "wifi", rssi: -74, ssid: "Warehouse-IoT", channel: 6, ip: "192.168.1.48" },
    tsSource: "ntp",
    power: "battery",
    batteryStart: 27, // drains below the low-battery threshold during the replay
    reset: "brownout",
    sensors: [{ id: "sht45-2E3F4A5B", ch: 0, base: 3.6 }],
    door: { ratePerMin: 0.03 },
    gps: { lat: 25.253114, lon: 55.364203 },
  },
  {
    id: "esp32s3-a9b8c7d6e5f4",
    offset: 50,
    net: { type: "cellular", rssi: -77, ip: "10.64.12.19" },
    tsSource: "gps",
    power: "battery",
    batteryStart: 92,
    reset: "power_on",
    sensors: [
      { id: "sht45-6C7D8E9F", ch: 0, base: 2.6 },
      { id: "sht45-0A1B2C3D", ch: 1, base: 3.0 },
    ],
    door: { ratePerMin: 0.015 },
    route: [
      [25.248511, 55.368102],
      [25.262305, 55.352617],
    ],
  },
];

// Small seeded random generator so every run shows the same history.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const rawT = (t) => Math.round(((t + 45) * 65535) / 175);
const rawRh = (rh) => Math.round(((rh + 6) * 65535) / 125);

export function createSimulator() {
  const rand = mulberry32(20261110);
  const realStart = Date.now() / 1000;
  const T = Math.floor(realStart);
  const t0 = T - HISTORY_S;
  // Simulated clock. Changing the speed re-anchors it so time never jumps.
  let speed = SPEED;
  let anchorSim = T;
  let anchorReal = realStart;
  const now = () => anchorSim + (Date.now() / 1000 - anchorReal) * speed;
  const setSpeed = (v) => {
    anchorSim = now();
    anchorReal = Date.now() / 1000;
    speed = v;
  };

  const devices = SPECS.map((spec, i) => ({
    spec,
    seq: 1,
    nextTs: t0 + spec.offset,
    bootTs: t0 - 600 - i * 3600,
    lastFull: -Infinity,
    buffer: [],
    heat: 0,
    door: { open: false, openedAt: null, closeAt: null, count: 0, totalOpen: 0, lastDuration: 0 },
    booted: false,
  }));

  const inWindow = (ts, from, to) => ts >= T + from * 60 && ts < T + to * 60;

  function envelope(dev, type, ts, offline) {
    return {
      msg_type: type,
      device_id: dev.spec.id,
      ts: Math.round(ts),
      ts_source: offline ? "rtc" : dev.spec.tsSource,
      seq: dev.seq++,
      interval_s: STEP_S,
      from_buffer: false,
    };
  }

  function gps(dev, ts) {
    const { spec } = dev;
    if (spec.route) {
      const p = (Math.sin((ts / 3600) * Math.PI) + 1) / 2;
      const [[la1, lo1], [la2, lo2]] = spec.route;
      return { lat: round(la1 + (la2 - la1) * p, 6), lon: round(lo1 + (lo2 - lo1) * p, 6), fix_age_ms: 200 + Math.round(rand() * 700) };
    }
    return { ...spec.gps, fix_age_ms: spec.indoor ? 5_400_000 : 300 + Math.round(rand() * 600) };
  }

  function shouldOpen(dev, ts) {
    if (dev.spec.id === SPECS[1].id && inWindow(ts, -80, -79)) return 15 * 60;
    if (rand() < dev.spec.door.ratePerMin) return 30 + Math.round(rand() * 170);
    return 0;
  }

  // Produces the messages for one 60 s step of one device, in send order.
  function step(dev, ts) {
    const { spec } = dev;
    const out = [];
    const offline = spec.id === SPECS[0].id && inWindow(ts, -40, -25);
    const lost = spec.id === SPECS[0].id && inWindow(ts, -100, -98);
    const send = (msg) => {
      if (lost) return; // sequence number used, message never arrives
      if (offline) {
        dev.buffer.push({ ...msg, from_buffer: true });
        return;
      }
      if (dev.buffer.length) {
        out.push(...dev.buffer);
        dev.buffer = [];
      }
      out.push(msg);
    };

    if (!dev.booted) {
      dev.booted = true;
      out.push({
        ...envelope(dev, "boot", dev.bootTs, false),
        system: { fw: "1.0.3", chip: "ESP32-S3", chip_rev: "0.2", reset_reason: spec.reset, boot_count: 3 },
        sensors: spec.sensors.map((s) => ({ sensor_id: s.id, model: "SHT45", mux: "0x70", ch: s.ch })),
      });
    }

    // Door activity during this step
    let openSeconds = 0;
    if (spec.door) {
      const d = dev.door;
      const prevTs = ts - STEP_S;
      if (!d.open) {
        const duration = shouldOpen(dev, ts);
        if (duration) {
          d.open = true;
          d.openedAt = prevTs + 5 + Math.round(rand() * 50);
          d.closeAt = d.openedAt + duration;
          d.count++;
          send({ ...envelope(dev, "event", d.openedAt, offline), door: { state: "open" }, gps: gps(dev, d.openedAt) });
        }
      }
      if (d.open) {
        const end = Math.min(ts, d.closeAt);
        openSeconds = end - Math.max(d.openedAt, prevTs);
        d.totalOpen += openSeconds;
        if (d.closeAt <= ts) {
          d.open = false;
          d.lastDuration = d.closeAt - d.openedAt;
          send({ ...envelope(dev, "event", d.closeAt, offline), door: { state: "closed" }, gps: gps(dev, d.closeAt) });
        }
      }
    }

    // Temperature model: base + slow cycle + noise + door warming + scenario faults
    dev.heat = openSeconds > 0 ? dev.heat + 0.3 * (openSeconds / 60) : dev.heat * 0.82;
    const readings = spec.sensors.map((s) => {
      let t = s.base + 0.12 * Math.sin((ts / 1800) * 2 * Math.PI + s.ch) + (rand() - 0.5) * 0.08 + dev.heat * (s.ch === 0 ? 1 : 0.8);
      if (spec.id === SPECS[1].id && s.ch === 1 && ts >= T - 12 * 60) t += Math.min(2.4, ((ts - (T - 12 * 60)) / 60) * 0.2);
      const rh = Math.min(99, 79 + 2 * Math.sin(ts / 2400) + (rand() - 0.5) * 1.2 + dev.heat * 1.5);
      const crcOk = rand() > 0.004;
      return { s, t: round(t, 2), rh: round(rh, 1), crcOk };
    });

    const full = ts - dev.lastFull >= FULL_EVERY_S;
    const msg = {
      ...envelope(dev, "telemetry", ts, offline),
      gps: gps(dev, ts),
      readings: readings.map(({ s, t, rh, crcOk }) =>
        full
          ? {
              sensor_id: s.id,
              model: "SHT45",
              mux: "0x70",
              ch: s.ch,
              temp_c: t,
              rh,
              raw_t: rawT(t),
              raw_rh: rawRh(rh),
              precision: "high",
              crc_ok: crcOk,
              heater_last_run: Math.round(ts - 3600 - s.ch * 600),
              read_errors: s.ch,
              last_ok_ts: Math.round(ts),
              status: "ok",
            }
          : { sensor_id: s.id, temp_c: t, rh, crc_ok: crcOk, status: "ok" },
      ),
    };
    if (spec.door) {
      const d = dev.door;
      msg.door = full
        ? {
            state: d.open ? "open" : "closed",
            last_open_duration_s: d.lastDuration,
            open_count: d.count,
            total_open_s: Math.round(d.totalOpen),
            alarm: d.open && ts - d.openedAt > 120,
            alarm_threshold_s: 120,
          }
        : { state: d.open ? "open" : "closed" };
    }
    if (full) {
      dev.lastFull = ts;
      if (spec.door) {
        dev.door.count = 0;
        dev.door.totalOpen = 0;
      }
      const battery = spec.power === "battery" ? Math.max(5, (spec.batteryStart ?? 64) - ((ts - t0) / 3600) * 3) : 78;
      msg.system = {
        fw: "1.0.3",
        chip: "ESP32-S3",
        chip_rev: "0.2",
        uptime_s: Math.round(ts - dev.bootTs),
        boot_count: 3,
        reset_reason: spec.reset,
        free_heap: 214560 - Math.round(rand() * 2000),
        min_free_heap: 198220,
        chip_temp_c: round(40 + rand() * 3, 1),
        i2c_errors: spec.sensors.length > 1 ? 2 : 0,
      };
      msg.power = {
        source: spec.power,
        supply_mv: spec.power === "external" ? 4960 + Math.round(rand() * 40) : 0,
        battery_mv: Math.round(3500 + battery * 6.5),
        battery_pct: Math.round(battery),
      };
      msg.storage = {
        sd_present: true,
        sd_total_mb: 7580,
        sd_free_mb: 7412 - Math.round((ts - t0) / 3600),
        buffered_msgs: offline ? dev.buffer.length : 0,
        write_errors: 0,
      };
      msg.network = {
        ...spec.net,
        rssi: spec.net.rssi + Math.round((rand() - 0.5) * 6),
        ntp_synced: !offline,
        last_ntp_sync: Math.round(ts - 3000),
        reconnects: spec.net.type === "cellular" ? 4 : 1,
      };
    }
    send(msg);
    return out;
  }

  function advance(to) {
    const out = [];
    for (;;) {
      const dev = devices.reduce((a, b) => (b.nextTs < a.nextTs ? b : a));
      if (dev.nextTs > to) break;
      out.push(...step(dev, dev.nextTs));
      dev.nextTs += STEP_S;
    }
    return out;
  }

  return {
    label: "Simulated data",
    now,
    speeds: SPEED_OPTIONS,
    getSpeed: () => speed,
    setSpeed,
    start(onMessages) {
      onMessages(advance(now()));
      const timer = setInterval(() => {
        const msgs = advance(now());
        if (msgs.length) onMessages(msgs);
      }, 1000);
      return () => clearInterval(timer);
    },
  };
}
