import { deviceInfo } from "../data/registry.js";
import { sensorLabel } from "../lib/alerts.js";
import { MSG_TIME_SOURCE, SIGNAL_HELP, STATUS, powerInfo, unitStatus } from "../lib/describe.js";
import { fmtAgo, fmtNum } from "../lib/format.js";
import { LIMITS } from "../config.js";
import { Battery, InfoTip, Signal, StatusBadge } from "./Badges.jsx";

export default function DeviceTable({ devices, allCount, alerts, now, selectedId, onSelect, columns, query, onQuery }) {
  const col = (k) => columns[k];
  return (
    <section className="card">
      <div className="card-head">
        <h2>
          Carts, trucks &amp; rooms <span className="count">{devices.length === allCount ? allCount : `${devices.length} of ${allCount}`}</span>
        </h2>
        <input
          type="search"
          className="search"
          placeholder="Search unit, flight, device or sensor ID…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          aria-label="Search units"
        />
      </div>
      <div className="table-wrap">
        <table className="units">
          <thead>
            <tr>
              {col("status") && <th>Status</th>}
              <th>Unit</th>
              {col("temperature") && <th>Temperature</th>}
              {col("humidity") && <th>Humidity</th>}
              {col("door") && <th>Door</th>}
              {col("lastMessage") && <th>Last message</th>}
              {col("signal") && (
                <th>
                  Signal <InfoTip text={SIGNAL_HELP} />
                </th>
              )}
              {col("power") && <th>Power &amp; battery</th>}
              {col("location") && <th>Location</th>}
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => {
              const info = deviceInfo(d.id);
              const status = unitStatus(d, alerts, now);
              const sensors = Object.entries(d.sensors).filter(([, s]) => Number.isFinite(s.temp_c));
              return (
                <tr key={d.id} className={`row-${status.key} ${d.id === selectedId ? "selected" : ""}`} onClick={() => onSelect(d.id)}>
                  {col("status") && (
                    <td>
                      <StatusBadge status={status} />
                    </td>
                  )}
                  <td>
                    <div className="unit-name">{info.name}</div>
                    <div className="muted small">{info.assignment}</div>
                  </td>
                  {col("temperature") && (
                    <td>
                      {sensors.map(([id, s]) => {
                        const out = s.temp_c < LIMITS.tempMinC || s.temp_c > LIMITS.tempMaxC;
                        return (
                          <div key={id}>
                            <strong className={out ? "tone-bad" : ""}>{fmtNum(s.temp_c, 1, " °C")}</strong>
                            {sensors.length > 1 && <span className="muted small"> {sensorLabel(d, id)}</span>}
                          </div>
                        );
                      })}
                    </td>
                  )}
                  {col("humidity") && (
                    <td>
                      {sensors.map(([id, s]) => (
                        <div key={id}>{fmtNum(s.rh, 0, " %")}</div>
                      ))}
                    </td>
                  )}
                  {col("door") && (
                    <td>
                      {d.door ? (
                        <span className={`pill ${d.door.state === "open" ? "pill-warning" : "pill-ok"}`}>{d.door.state === "open" ? "Open" : "Closed"}</span>
                      ) : (
                        <span className="muted small">No door sensor</span>
                      )}
                    </td>
                  )}
                  {col("lastMessage") && (
                    <td>
                      {fmtAgo(d.lastTs, now)}
                      {d.tsSource && <div className="muted small">{MSG_TIME_SOURCE[d.tsSource] ?? d.tsSource}</div>}
                    </td>
                  )}
                  {col("signal") && <td>{d.network ? <Signal rssi={d.network.rssi} type={d.network.type} /> : "–"}</td>}
                  {col("power") && (
                    <td>
                      <Battery info={powerInfo(d.power)} />
                    </td>
                  )}
                  {col("location") && <td className="small">{d.gps ? `${d.gps.lat.toFixed(4)}, ${d.gps.lon.toFixed(4)}` : "–"}</td>}
                </tr>
              );
            })}
            {devices.length === 0 && (
              <tr>
                <td colSpan={9} className="empty">
                  No units match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {columns.status && (
        <div className="legend small">
          {Object.values(STATUS).map((s) => (
            <span key={s.key}>
              <StatusBadge status={s} /> <span className="muted">{s.hint}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
