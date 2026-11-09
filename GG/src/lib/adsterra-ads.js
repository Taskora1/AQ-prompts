export const ADSTERRA_NATIVE_DOMAIN = 'https://pl29777486.profitableratecpmnetwork.com';
export const ADSTERRA_NATIVE_KEY = '08e364828f4f82ab5fed9cb95b8ebe2b';
export const ADSTERRA_NATIVE_SCRIPT_ID = 'adsterra-native-banner-script';
export const ADSTERRA_NATIVE_CONTAINER_ID = `container-${ADSTERRA_NATIVE_KEY}`;
export const ADSTERRA_NATIVE_SCRIPT_URL =
  `${ADSTERRA_NATIVE_DOMAIN}/${ADSTERRA_NATIVE_KEY}/invoke.js`;

export const ADSTERRA_DISPLAY_DOMAIN = 'https://www.highperformanceformat.com';
export const ADSTERRA_DISPLAY_UNITS = {
  '300x250': {
    key: 'c077460f59332352402ebb8e56de5e59',
    width: 300,
    height: 250,
  },
  '320x50': {
    key: 'a7800e494fb2d80916d8a3a64cbfdff8',
    width: 320,
    height: 50,
  },
  '468x60': {
    key: 'e3f8e27fbd32d7ee81a4746eebdbfb43',
    width: 468,
    height: 60,
  },
};

export function getAdsterraDisplayScriptUrl(unit) {
  return `${ADSTERRA_DISPLAY_DOMAIN}/${unit.key}/invoke.js`;
}
