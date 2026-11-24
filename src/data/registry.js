// Which cart, truck or room each sensor node is attached to.
// In the real system this comes from the backend's device registry
// (device management, process 3.5); it is hard-coded here for the prototype.
export const REGISTRY = {
  "esp32s3-a1b2c3d4e5f6": { name: "Trolley C-104", kind: "Cart", assignment: "Meal trolley" },
  "esp32s3-0f1e2d3c4b5a": { name: "Truck T-07", kind: "Truck", assignment: "Kitchen → aircraft stands" },
  "esp32s3-9a8b7c6d5e4f": { name: "Cold Room 2", kind: "Room", assignment: "Finished-meal storage" },
  "esp32s3-1c2d3e4f5a6b": { name: "Trolley C-105", kind: "Cart", assignment: "Meal trolley" },
  "esp32s3-6b5a4f3e2d1c": { name: "Trolley C-118", kind: "Cart", assignment: "Meal trolley" },
  "esp32s3-a9b8c7d6e5f4": { name: "Truck T-11", kind: "Truck", assignment: "Kitchen → aircraft stands" },
};

export function deviceInfo(id) {
  return REGISTRY[id] ?? { name: id, kind: "Device", assignment: "Not assigned" };
}
