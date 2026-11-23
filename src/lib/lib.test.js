import { describe, expect, it } from "vitest";
import { initialState, reducer } from "../data/store.js";
import { allAlerts } from "./alerts.js";
import { powerInfo, signalInfo, unitStatus } from "./describe.js";
import { deviceStats, sensorStats } from "./stats.js";
import { buildSnapshot, localAnswer } from "./assistant.js";
import { DEFAULT_VIEW } from "./view.js";

const ID = "esp32s3-0f1e2d3c4b5a"; // Truck T-07 in the registry
const tele = (seq, ts, temp, extra = {}) => ({
  msg_type: "telemetry",
  device_id: ID,
  ts,
  ts_source: "gps",
  seq,
  interval_s: 60,
  readings: [{ sensor_id: "sht45-A", temp_c: temp, rh: 80, crc_ok: true, status: "ok" }],
  ...extra,
});
const run = (msgs) => reducer(initialState, { type: "messages", msgs });

describe("stats", () => {
  const s = run([tele(1, 1000, 3), tele(2, 1060, 4), tele(3, 1120, 6), tele(4, 1180, 7), tele(5, 1240, 4)]);
  const d = s.devices[ID];

  it("computes min, avg, max and time in range", () => {
    const st = sensorStats(d, "sht45-A", 0, 1300);
    expect(st.min).toBe(3);
    expect(st.max).toBe(7);
    expect(st.avg).toBeCloseTo(4.8);
    expect(st.inRangePct).toBeCloseTo(60);
    expect(st.excursions).toBe(1);
    expect(st.outsideS).toBe(120);
  });

  it("only uses readings inside the period", () => {
    expect(sensorStats(d, "sht45-A", 1150, 1300).count).toBe(2);
    expect(sensorStats(d, "sht45-A", 5000, 6000)).toBeNull();
  });

  it("reports no door numbers for a unit without a door sensor", () => {
    expect(deviceStats(d, 0, 1300).doorOpenings).toBeNull();
  });
});

describe("descriptions", () => {
  it("turns dBm into plain words", () => {
    expect(signalInfo(-55).label).toBe("Excellent");
    expect(signalInfo(-75).label).toBe("Fair");
    expect(signalInfo(-86).label).toBe("Weak");
    expect(signalInfo(-95).label).toBe("Very weak");
  });

  it("says whether a unit is plugged in or running on its battery", () => {
    expect(powerInfo({ source: "external", battery_pct: 78 }).label).toBe("Plugged in · backup battery 78%");
    expect(powerInfo({ source: "battery", battery_pct: 15 })).toMatchObject({ short: "On battery", tone: "bad" });
  });

  it("gives an offline unit the Offline status", () => {
    const s = run([tele(1, 1000, 3)]);
    expect(unitStatus(s.devices[ID], [], 1100).label).toBe("Normal");
    expect(unitStatus(s.devices[ID], [], 2000).label).toBe("Offline");
  });
});

describe("assistant (offline answers)", () => {
  const s = run([tele(1, 1000, 3), tele(2, 1060, 6.5, { door: { state: "open" } })]);
  const now = 1070;
  const devices = Object.values(s.devices);
  const snap = buildSnapshot({ devices, alerts: allAlerts(s.devices, now), stats: s.stats, now, rangeS: 3600, rangeLabel: "1 h" });

  it("lists sensors outside the limits", () => {
    expect(localAnswer("Any temperature excursions?", snap)).toMatch(/Truck T-07 ch|Truck T-07 sht45-A: 6.5 °C/);
  });

  it("answers about a unit by name", () => {
    const a = localAnswer("how is truck t-07 doing", snap);
    expect(a).toMatch(/^Truck T-07/);
    expect(a).toMatch(/Temperature excursion/);
  });

  it("explains dBm", () => {
    expect(localAnswer("what does dbm mean", snap)).toMatch(/decibel-milliwatts/);
  });
});

describe("view settings", () => {
  it("shows everything by default except the location column", () => {
    expect(DEFAULT_VIEW.sections).toEqual({ kpis: true, units: true, alerts: true, detail: true });
    expect(DEFAULT_VIEW.columns.location).toBe(false);
    expect(DEFAULT_VIEW.columns.humidity).toBe(true);
  });
});
