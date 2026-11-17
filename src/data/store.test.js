import { describe, expect, it } from "vitest";
import { initialState, reducer, doorOpenSince } from "./store.js";
import { deviceAlerts } from "../lib/alerts.js";

const ID = "esp32s3-test";
const tele = (seq, ts, temp = 3.5, extra = {}) => ({
  msg_type: "telemetry",
  device_id: ID,
  ts,
  ts_source: "ntp",
  seq,
  interval_s: 60,
  from_buffer: false,
  readings: [{ sensor_id: "sht45-A", temp_c: temp, rh: 80, crc_ok: true, status: "ok" }],
  ...extra,
});
const run = (msgs, state = initialState) => reducer(state, { type: "messages", msgs });

describe("store", () => {
  it("rejects messages without the required envelope fields", () => {
    const s = run([{ msg_type: "telemetry", device_id: ID, ts: 1 }, null, { foo: 1 }]);
    expect(s.stats.rejected).toBe(3);
    expect(s.devices[ID]).toBeUndefined();
  });

  it("drops duplicate sequence numbers", () => {
    const s = run([tele(1, 1000), tele(1, 1000)]);
    expect(s.stats.duplicates).toBe(1);
    expect(s.devices[ID].history).toHaveLength(1);
  });

  it("marks skipped sequence numbers as missing and clears them when buffered copies arrive", () => {
    let s = run([tele(1, 1000), tele(4, 1180)]);
    expect([...s.devices[ID].missing]).toEqual([2, 3]);
    s = run([tele(2, 1060, 3.6, { from_buffer: true })], s);
    expect([...s.devices[ID].missing]).toEqual([3]);
    expect(s.devices[ID].bufferedReceived).toBe(1);
  });

  it("puts late messages into the history in time order without overwriting the latest state", () => {
    let s = run([tele(1, 1000, 3.0), tele(3, 1120, 4.0)]);
    s = run([tele(2, 1060, 9.9, { from_buffer: true })], s);
    const d = s.devices[ID];
    expect(d.history.map((p) => p.ts)).toEqual([1000, 1060, 1120]);
    expect(d.sensors["sht45-A"].temp_c).toBe(4.0);
    expect(d.lastTs).toBe(1120);
  });

  it("does not plot readings that failed the checksum", () => {
    const bad = tele(1, 1000);
    bad.readings[0].crc_ok = false;
    const s = run([bad]);
    expect(s.devices[ID].history).toHaveLength(0);
    expect(s.devices[ID].crcFailures).toBe(1);
  });

  it("restarts sequence tracking after a boot message", () => {
    let s = run([tele(500, 1000)]);
    s = run([{ msg_type: "boot", device_id: ID, ts: 1100, seq: 1, system: { reset_reason: "power_on" } }, tele(2, 1160)], s);
    expect(s.devices[ID].missing.size).toBe(0);
  });

  it("tracks door openings from event messages", () => {
    const s = run([
      tele(1, 1000, 3.5, { door: { state: "closed" } }),
      { msg_type: "event", device_id: ID, ts: 1030, seq: 2, door: { state: "open" } },
    ]);
    expect(doorOpenSince(s.devices[ID])).toBe(1030);
  });
});

describe("alerts", () => {
  it("reports an excursion with the time it started", () => {
    const s = run([tele(1, 1000, 4.0), tele(2, 1060, 5.6), tele(3, 1120, 6.1)]);
    const a = deviceAlerts(s.devices[ID], 1130).find((x) => x.title === "Temperature excursion");
    expect(a.severity).toBe("critical");
    expect(a.since).toBe(1060);
  });

  it("reports a device as offline after three missed intervals", () => {
    const s = run([tele(1, 1000)]);
    expect(deviceAlerts(s.devices[ID], 1100).some((x) => x.title === "No data received")).toBe(false);
    expect(deviceAlerts(s.devices[ID], 1200).some((x) => x.title === "No data received")).toBe(true);
  });

  it("raises a door alarm once the door has been open longer than the threshold", () => {
    const s = run([
      tele(1, 1000, 3.5, { door: { state: "closed", alarm_threshold_s: 120 } }),
      { msg_type: "event", device_id: ID, ts: 1010, seq: 2, door: { state: "open" } },
    ]);
    expect(deviceAlerts(s.devices[ID], 1100).some((x) => x.title === "Door open too long")).toBe(false);
    expect(deviceAlerts(s.devices[ID], 1140).some((x) => x.title === "Door open too long")).toBe(true);
  });
});
