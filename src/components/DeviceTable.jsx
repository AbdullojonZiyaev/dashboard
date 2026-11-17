import { deviceInfo } from "../data/registry.js";
import { isOffline, sensorLabel, worstSeverity } from "../lib/alerts.js";
import { fmtAgo, fmtNum } from "../lib/format.js";

export default function DeviceTable({ devices, alerts, now, selectedId, onSelect }) {
  return (
    <section className="card">
      <h2>Carts, trucks &amp; rooms</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Unit</th>
              <th>Temperature</th>
              <th>RH</th>
              <th>Door</th>
              <th>Last message</th>
              <th>Signal</th>
              <th>Battery</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => {
              const info = deviceInfo(d.id);
              const mine = alerts.filter((a) => a.deviceId === d.id);
              const status = isOffline(d, now) ? "critical" : worstSeverity(mine);
              const sensors = Object.entries(d.sensors).filter(([, s]) => Number.isFinite(s.temp_c));
              return (
                <tr key={d.id} className={d.id === selectedId ? "selected" : ""} onClick={() => onSelect(d.id)}>
                  <td>
                    <span className={`dot dot-${status}`} title={status} />
                  </td>
                  <td>
                    <div className="unit-name">{info.name}</div>
                    <div className="muted small">{info.assignment}</div>
                  </td>
                  <td>
                    {sensors.map(([id, s]) => (
                      <div key={id}>
                        <strong>{fmtNum(s.temp_c, 1, " °C")}</strong>
                        {sensors.length > 1 && <span className="muted small"> {sensorLabel(d, id)}</span>}
                      </div>
                    ))}
                  </td>
                  <td>
                    {sensors.map(([id, s]) => (
                      <div key={id}>{fmtNum(s.rh, 0, " %")}</div>
                    ))}
                  </td>
                  <td>{d.door ? <span className={`pill ${d.door.state === "open" ? "pill-warn" : ""}`}>{d.door.state}</span> : <span className="muted">no sensor</span>}</td>
                  <td>
                    {fmtAgo(d.lastTs, now)}
                    {d.tsSource && <div className="muted small">time: {d.tsSource}</div>}
                  </td>
                  <td>{d.network ? `${d.network.rssi} dBm` : "–"}</td>
                  <td>{d.power ? `${d.power.battery_pct}%${d.power.source === "battery" ? " (on battery)" : ""}` : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
