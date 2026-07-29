/**
 * Coordinates for major Pakistani cities — used to centre the map when a city
 * is selected, and as a fallback location for listings without exact pins.
 */
export interface CityCoords {
  name: string;
  lat: number;
  lng: number;
}

export const PK_CITY_COORDS: CityCoords[] = [
  { name: 'Karachi',     lat: 24.8607, lng: 67.0011 },
  { name: 'Lahore',      lat: 31.5204, lng: 74.3587 },
  { name: 'Islamabad',   lat: 33.6844, lng: 73.0479 },
  { name: 'Rawalpindi',  lat: 33.5651, lng: 73.0169 },
  { name: 'Faisalabad',  lat: 31.4504, lng: 73.1350 },
  { name: 'Multan',      lat: 30.1575, lng: 71.5249 },
  { name: 'Peshawar',    lat: 34.0151, lng: 71.5249 },
  { name: 'Quetta',      lat: 30.1798, lng: 66.9750 },
  { name: 'Sialkot',     lat: 32.4945, lng: 74.5229 },
  { name: 'Gujranwala',  lat: 32.1877, lng: 74.1945 },
  { name: 'Hyderabad',   lat: 25.3960, lng: 68.3578 },
  { name: 'Bahawalpur',  lat: 29.3956, lng: 71.6836 },
  { name: 'Sargodha',    lat: 32.0836, lng: 72.6711 },
  { name: 'Sukkur',      lat: 27.7052, lng: 68.8574 },
  { name: 'Abbottabad',  lat: 34.1688, lng: 73.2215 },
  { name: 'Mardan',      lat: 34.1986, lng: 72.0404 },
];

/** Geographic centre of Pakistan — default map centre. */
export const PK_CENTER: CityCoords = { name: 'Pakistan', lat: 30.3753, lng: 69.3451 };

/** Look up coordinates for a city name (case-insensitive). */
export function coordsForCity(name?: string | null): CityCoords | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return PK_CITY_COORDS.find(c => c.name.toLowerCase() === n) || null;
}
