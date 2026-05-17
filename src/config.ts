import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-overrated-underrated",
  description:
    "Rotating topic; slide overrated ↔ correct ↔ underrated; see your gap from the room.",
  accentHex: "#aaff00",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
