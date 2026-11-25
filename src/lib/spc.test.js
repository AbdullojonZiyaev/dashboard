import { describe, expect, it } from "vitest";
import { controlLimits, evaluate, sampleSeries } from "./spc.js";

const pts = (vs) => vs.map((v, i) => ({ ts: i * 300, v }));

describe("controlLimits (I-MR placeholder)", () => {
  it("uses the mean and the average moving range", () => {
    const l = controlLimits([2, 3, 2, 3, 2, 3, 2, 3]);
    expect(l.cl).toBeCloseTo(2.5);
    expect(l.mrBar).toBeCloseTo(1);
    expect(l.ucl).toBeCloseTo(2.5 + 3 / 1.128);
    expect(l.lcl).toBeCloseTo(2.5 - 3 / 1.128);
  });
  it("needs enough readings", () => {
    expect(controlLimits([1, 2, 3])).toBeNull();
  });
});

describe("evaluate", () => {
  const limits = { cl: 2.5, ucl: 3.5, lcl: 1.5 };
  const spec = { usl: 4, lsl: 0 };

  it("flags spec and control limit breaches once per run", () => {
    const r = evaluate(pts([2.4, 2.6, 3.8, 3.9, 4.5, 2.5]), limits, spec);
    expect(r.points[2].flags).toContain("control");
    expect(r.points[4].flags).toEqual(expect.arrayContaining(["spec", "control"]));
    expect(r.events.filter((e) => e.rule === "control")).toHaveLength(1);
    expect(r.events.filter((e) => e.rule === "spec")).toHaveLength(1);
    expect(r.status).toBe("ok"); // the last reading is back to normal
  });

  it("finds 6 increasing readings as a trend, like the QA mock-up", () => {
    const r = evaluate(pts([2.4, 2.3, 2.5, 2.8, 3.1, 3.2, 3.3, 3.4]), limits, spec);
    const trend = r.events.find((e) => e.rule === "trend");
    expect(trend.title).toBe("Increasing temperature trend");
    expect(trend.from).toBe(300);
    expect(r.status).toBe("warning");
  });

  it("finds 8 readings in a row above the centre line", () => {
    const r = evaluate(pts([2.6, 2.7, 2.6, 2.8, 2.6, 2.7, 2.6, 2.7]), limits, spec);
    expect(r.events.some((e) => e.rule === "shift")).toBe(true);
  });

  it("status is Act now when the newest reading is outside spec", () => {
    expect(evaluate(pts([2.5, 4.5]), limits, spec).status).toBe("critical");
  });
});

describe("sampleSeries", () => {
  it("keeps the last reading of each interval", () => {
    const h = [0, 60, 120, 300, 360, 600].map((ts) => ({ ts, "t:a": ts / 60 }));
    expect(sampleSeries(h, "t:a", 0, 600, 300).map((p) => p.ts)).toEqual([120, 360, 600]);
  });
});
