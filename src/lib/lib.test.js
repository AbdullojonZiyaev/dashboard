import { describe, expect, it } from "vitest";
import { initialState, reducer } from "../data/store.js";
import { allAlerts } from "./alerts.js";
import { powerInfo, signalInfo, unitStatus } from "./describe.js";
import { deviceStats, sensorStats } from "./stats.js";
import { buildSnapshot, localAnswer } from "./assistant.js";
import { DEFAULT_VIEW } from "./view.js";
import { batchTimeline, createMealPlan, mealPicture } from "../data/meals.js";
import { buildHash, parseHash } from "./router.js";

const ROOM = "esp32s3-9a8b7c6d5e4f";
const TRUCK = "esp32s3-0f1e2d3c4b5a";

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

  it("gives an offline unit the No signal status", () => {
    const s = run([tele(1, 1000, 3)]);
    expect(unitStatus(s.devices[ID], [], 1100).label).toBe("OK");
    expect(unitStatus(s.devices[ID], [], 2000).label).toBe("No signal");
  });
});

describe("assistant (offline answers)", () => {
  const s = run([tele(1, 1000, 3), tele(2, 1060, 6.5, { door: { state: "open" } })]);
  const now = 1070;
  const devices = Object.values(s.devices);
  const snap = buildSnapshot({ devices, alerts: allAlerts(s.devices, now), stats: s.stats, now, rangeS: 3600, rangeLabel: "1 h" });

  it("lists sensors outside the limits", () => {
    expect(localAnswer("Any temperature excursions?", snap)).toMatch(/Truck T-07 Sensor: 6.5 °C/);
  });

  it("answers about a unit by name", () => {
    const a = localAnswer("how is truck t-07 doing", snap);
    expect(a).toMatch(/^Truck T-07/);
    expect(a).toMatch(/is too warm \(6\.5 °C\)/);
  });

  it("explains dBm", () => {
    expect(localAnswer("what does dbm mean", snap)).toMatch(/decibel-milliwatts/);
  });
});

describe("view settings", () => {
  it("shows everything by default except the location column", () => {
    expect(DEFAULT_VIEW.sections).toEqual({ tiles: true, journey: true, units: true });
    expect(DEFAULT_VIEW.columns.location).toBe(false);
    expect(DEFAULT_VIEW.columns.humidity).toBe(true);
  });
});

describe("meals and flights", () => {
  const T = 1_800_000_000;
  const plan = createMealPlan(T);
  // Truck T-07 too warm at T, Cold Room 2 fine
  const s = run([
    { ...tele(1, T - 60, 3), device_id: ROOM },
    { ...tele(1, T - 600, 6.5), device_id: TRUCK },
    { ...tele(2, T - 60, 6.8), device_id: TRUCK },
  ]);
  const alerts = allAlerts(s.devices, T);
  const pic = mealPicture(plan, s.devices, alerts, T);

  it("puts batches on the unit they are in and marks them by its temperature", () => {
    const onTruck = pic.list.filter((x) => x.deviceId === TRUCK);
    expect(onTruck.length).toBeGreaterThan(0);
    expect(onTruck.every((x) => x.status.label === "Act now")).toBe(true);
  });

  it("flags the expired batch and the flight with a late batch", () => {
    expect(pic.alerts.some((a) => a.kind === "expired")).toBe(true);
    const late = pic.flights.find((f) => f.flight.no === "FL 117");
    expect(late.status.label).toBe("Check soon");
    expect(late.readiness).toMatch(/not packed yet/);
  });

  it("does not show batches that are not produced yet", () => {
    const future = plan.batches.filter((b) => b.producedAt > T);
    expect(future.length).toBeGreaterThan(0);
    expect(future.some((b) => pic.states[b.code])).toBe(false);
  });

  it("builds a journey timeline with the excursion in it, newest first", () => {
    const b = pic.list.find((x) => x.deviceId === TRUCK).batch;
    const tl = batchTimeline(b, s.devices, T);
    expect(tl[0].ts).toBeGreaterThanOrEqual(tl[tl.length - 1].ts);
    expect(tl.some((x) => x.type === "problem" && /Too warm/.test(x.label))).toBe(true);
  });
});

describe("router", () => {
  it("round-trips a page, an argument and filters", () => {
    const h = buildHash("batches", null, { stage: "truck", q: "" });
    expect(h).toBe("#/batches?stage=truck");
    expect(parseHash("#/find/B-2611-0383")).toMatchObject({ page: "find", arg: "B-2611-0383" });
    expect(parseHash(h).params).toEqual({ stage: "truck" });
  });
});
