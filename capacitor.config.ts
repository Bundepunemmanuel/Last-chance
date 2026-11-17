import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lastchance.game',
  appName: 'LAST CHANCE',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#090b0f',
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    ScreenOrientation: {
      orientation: 'landscape',
    },
  },
};

export default config;
