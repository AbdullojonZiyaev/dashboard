// Which cart, truck or room each sensor node is attached to.
// In the real system this comes from the backend's device registry
// (device management, process 3.5); it is hard-coded here for the prototype.
export const REGISTRY = {
  "esp32s3-a1b2c3d4e5f6": { name: "Cart C-104", kind: "Cart", assignment: "Flight FL-101 · 3 batches" },
  "esp32s3-0f1e2d3c4b5a": { name: "Truck T-07", kind: "Truck", assignment: "Kitchen → Aircraft stand B12" },
  "esp32s3-9a8b7c6d5e4f": { name: "Cold Room 2", kind: "Room", assignment: "Finished-meal storage" },
};

export function deviceInfo(id) {
  return REGISTRY[id] ?? { name: id, kind: "Device", assignment: "Not assigned" };
}
