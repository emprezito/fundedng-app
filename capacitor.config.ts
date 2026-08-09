import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fun.fundedng.app',
  appName: 'FundedNG',
  webDir: 'dist/client',
  server: {
    url: 'https://fundedng.fun',
    cleartext: true
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;