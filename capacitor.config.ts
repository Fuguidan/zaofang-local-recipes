import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "cn.zaofang.recipes",
  appName: "灶房",
  webDir: "dist-android",
  server: {
    androidScheme: "https",
  },
};

export default config;
