// Placeholder limits for the prototype.
// In the real system these come from the approved HACCP plan: the system admin
// enters them (process 7.2) and they are read from D4 Users & Safety Limits.
export const LIMITS = {
  tempMinC: 0,
  tempMaxC: 5, // chilled ready meals
};

export const THRESHOLDS = {
  offlineAfterIntervals: 3, // missed reporting intervals before a device counts as offline
  defaultDoorAlarmS: 120, // used when a message has no door.alarm_threshold_s
  lowBatteryPct: 20,
  weakRssiDbm: -80,
  heaterSkewS: 300, // readings this soon after a heater run may read high
};

export const HISTORY_LIMIT = 1440; // points kept per device (24 h at 60 s)
export const SEEN_SEQ_LIMIT = 3000; // sequence numbers remembered per device for duplicate checks
