/**
 * Pakistan Cities & Areas Data — RentAnything PK
 * All major cities with their popular areas/localities (OLX-style)
 */

export interface PakistanCity {
  name:  string;
  areas: string[];
}

export const PAKISTAN_CITIES: PakistanCity[] = [
  {
    name: 'Karachi',
    areas: [
      'DHA Phase 1', 'DHA Phase 2', 'DHA Phase 3', 'DHA Phase 4', 'DHA Phase 5',
      'DHA Phase 6', 'DHA Phase 7', 'DHA Phase 8',
      'Clifton', 'Bath Island', 'Boat Basin',
      'Gulshan-e-Iqbal', 'Gulistan-e-Johar', 'Gulshan-e-Hadeed',
      'North Nazimabad', 'Nazimabad', 'New Nazimabad',
      'PECHS', 'Bahadurabad', 'Tariq Road',
      'Saddar', 'Garden', 'Soldier Bazaar',
      'Korangi', 'Landhi', 'Shah Faisal Colony',
      'Malir', 'Malir Cantonment',
      'Orangi Town', 'Baldia Town', 'Site Area',
      'Liaquatabad', 'New Karachi', 'Surjani Town',
      'Federal B Area', 'Buffer Zone',
      'Scheme 33', 'Scheme 45',
      'Model Colony', 'Airport',
      'Lyari', 'Keamari',
    ],
  },
  {
    name: 'Lahore',
    areas: [
      'DHA Phase 1', 'DHA Phase 2', 'DHA Phase 3', 'DHA Phase 4', 'DHA Phase 5',
      'DHA Phase 6', 'DHA Phase 7', 'DHA Phase 8', 'DHA Phase 9',
      'Bahria Town', 'Bahria Orchard',
      'Gulberg I', 'Gulberg II', 'Gulberg III',
      'Model Town', 'Garden Town', 'Township',
      'Johar Town', 'Faisal Town',
      'Wapda Town', 'Lake City',
      'Cantt', 'Cavalry Ground',
      'Iqbal Town', 'Muslim Town',
      'Allama Iqbal Town', 'Samanabad',
      'Shadman', 'Wahdat Colony',
      'Raiwind Road', 'Multan Road',
      'Manga Mandi', 'Bedian Road',
      'Valencia', 'Paragon City',
      'Mall Road', 'Data Darbar Area',
      'Shalimar', 'Kot Lakhpat',
    ],
  },
  {
    name: 'Islamabad',
    areas: [
      'F-6', 'F-7', 'F-8', 'F-10', 'F-11',
      'G-6', 'G-7', 'G-8', 'G-9', 'G-10', 'G-11', 'G-13',
      'E-7', 'E-9', 'E-11',
      'I-8', 'I-9', 'I-10',
      'DHA Islamabad', 'DHA Phase 1', 'DHA Phase 2',
      'Bahria Town Phase 1', 'Bahria Town Phase 2', 'Bahria Town Phase 3',
      'Bahria Town Phase 4', 'Bahria Town Phase 7', 'Bahria Enclave',
      'Blue Area', 'Jinnah Avenue',
      'Bani Gala', 'Chak Shehzad',
      'Sector H-13', 'PWD Colony',
      'Koral Town', 'Tarnol',
    ],
  },
  {
    name: 'Rawalpindi',
    areas: [
      'Bahria Town Rawalpindi',
      'DHA Rawalpindi',
      'Satellite Town',
      'Westridge', 'Askari', 'Chaklala Scheme',
      'Gulraiz', 'Gulshan Abad',
      'Raja Bazaar', 'Saddar',
      'Murree Road', 'GT Road',
      'Lalkurti', 'Airport',
      'Tench Bhatta', 'Dhoke Hassu',
      'Adiala Road', 'Chakri Road',
    ],
  },
  {
    name: 'Faisalabad',
    areas: [
      'Peoples Colony', 'Ghulam Muhammad Abad',
      'Jinnah Colony', 'Canal Road',
      'Susan Road', 'Satiana Road',
      'Sargodha Road', 'Sheikhupura Road',
      'Samanabad', 'Madina Town',
      'D Ground', 'Millat Road',
      'Gulistan Colony', 'Nishatabad',
      'Kohinoor City',
    ],
  },
  {
    name: 'Peshawar',
    areas: [
      'Hayatabad Phase 1', 'Hayatabad Phase 2', 'Hayatabad Phase 3',
      'Hayatabad Phase 4', 'Hayatabad Phase 5', 'Hayatabad Phase 6',
      'University Town', 'Saddar',
      'Cantt', 'Gulberg',
      'Regi Model Town', 'Warsak Road',
      'Ring Road', 'GT Road',
      'Dalazak Road', 'Jamrud Road',
    ],
  },
  {
    name: 'Quetta',
    areas: [
      'Satellite Town', 'Jinnah Town',
      'Airport Road', 'Brewery Road',
      'Zarghoon Road', 'Hali Road',
      'Cantonment', 'GPO Chowk Area',
      'Sariab Road', 'Western Bypass',
    ],
  },
  {
    name: 'Multan',
    areas: [
      'Cantt', 'Shah Rukn-e-Alam Colony',
      'Gulgasht Colony', 'Garden Town',
      'Model Town', 'Wapda Town',
      'Bosan Road', 'Vehari Road',
      'Nishtar Colony', 'Railway Road',
    ],
  },
  {
    name: 'Gujranwala',
    areas: [
      'Satellite Town', 'Model Town',
      'Green Town', 'Peoples Colony',
      'GT Road', 'Sialkot Road',
      'Eminabad Road', 'Hafizabad Road',
    ],
  },
  {
    name: 'Sialkot',
    areas: [
      'Cantt', 'Gulshan Colony',
      'Paris Road', 'Allama Iqbal Road',
      'Sambrial', 'Pasrur Road',
      'Daska Road',
    ],
  },
  {
    name: 'Hyderabad',
    areas: [
      'Latifabad', 'Qasimabad',
      'Hirabad', 'Cantt',
      'Market', 'Saddar',
      'Hussainabad', 'Hali Road',
    ],
  },
  {
    name: 'Sukkur',
    areas: [
      'Airport Road', 'Military Road',
      'Minara Road', 'Rohri',
      'Station Road',
    ],
  },
  {
    name: 'Bahawalpur',
    areas: [
      'Cantt', 'Model Town A',
      'Model Town B', 'Satellite Town',
      'Baghdad ul Jadeed', 'Circular Road',
    ],
  },
  {
    name: 'Sargodha',
    areas: [
      'Satellite Town', 'University Road',
      'Faisalabad Road', 'Lahore Road',
      'Cantt',
    ],
  },
  {
    name: 'Abbottabad',
    areas: [
      'Cantt', 'Mandian',
      'Abbottabad City', 'Havelian',
      'Kakul Road',
    ],
  },
  {
    name: 'Mardan',
    areas: [
      'Cantt', 'Hoti Road',
      'Swabi Road', 'GT Road',
    ],
  },
  {
    name: 'Mirpur (AJK)',
    areas: [
      'Sector A', 'Sector B', 'Sector C',
      'Chehla Bandi', 'Allama Iqbal Road',
    ],
  },
  {
    name: 'Muzaffarabad',
    areas: [
      'City Centre', 'Chattar Domel',
      'Dhani Bakhtawar', 'Forward Kahuta',
    ],
  },
  {
    name: 'Larkana',
    areas: ['City Area', 'Station Road', 'Cantt'],
  },
  {
    name: 'Rahim Yar Khan',
    areas: ['Satellite Town', 'Model Town', 'Cantt'],
  },
  {
    name: 'Jhang',
    areas: ['City', 'Satellite Town', 'Cantt'],
  },
  {
    name: 'Sheikhupura',
    areas: ['City', 'Lahore Road', 'Model Town'],
  },
  {
    name: 'Nawabshah',
    areas: ['City', 'Cantt', 'Airport Road'],
  },
  {
    name: 'Mingora (Swat)',
    areas: ['City', 'Fizagat', 'Marghuzar'],
  },
  {
    name: 'Gujrat',
    areas: ['City', 'Lalamusa', 'Kharian'],
  },
  {
    name: 'Kasur',
    areas: ['City', 'Chunian', 'Pattoki'],
  },
  {
    name: 'Okara',
    areas: ['City', 'Cantt', 'Depalpur'],
  },
  {
    name: 'Sahiwal',
    areas: ['City', 'Cantt', 'Model Town'],
  },
  {
    name: 'Chiniot',
    areas: ['City', 'Bhawana', 'Lalian'],
  },
  {
    name: 'Hafizabad',
    areas: ['City', 'Pindi Bhattian'],
  },
  {
    name: 'Mianwali',
    areas: ['City', 'Piplan', 'Kundian'],
  },
  {
    name: 'Khanewal',
    areas: ['City', 'Mian Channu', 'Kabirwala'],
  },
  {
    name: 'Vihari',
    areas: ['City', 'Burewala', 'Mailsi'],
  },
];

/** Get all city names as a flat string array */
export const CITY_NAMES: string[] = PAKISTAN_CITIES.map(c => c.name);

/** Get areas for a given city name */
export const getAreasForCity = (cityName: string): string[] => {
  const found = PAKISTAN_CITIES.find(c => c.name === cityName);
  return found ? found.areas : [];
};
