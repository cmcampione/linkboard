import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.linkboard.app',
  appName: 'Linkboard',
  webDir: 'www',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
