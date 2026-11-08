/**
 * Suggestions for the "Insert new branch" form: departments, then country → state/region → city. These are
 * suggestions only; every field also accepts free text.
 */

export const DEPARTMENTS = [
  'Upper Management',
  'Supply Chain',
  'Logistics',
  'Procurement',
  'Purchasing',
  'Distribution',
  'Fulfillment',
  'Air Operations',
  'Cold Chain',
  'Pharmacy Operations',
  'Kitchen Operations',
  'Finance',
  'Security Operations',
  'Customer Service',
  'Human Resources',
];

/** country → region (state, province, prefecture…) → cities */
export const LOCATIONS: Record<string, Record<string, string[]>> = {
  'United States': {
    Arizona: ['Phoenix', 'Tucson'],
    California: ['Los Angeles', 'San Francisco', 'San Diego', 'Oakland', 'Long Beach'],
    Colorado: ['Denver', 'Aurora'],
    Florida: ['Miami', 'Orlando', 'Tampa', 'Jacksonville'],
    Georgia: ['Atlanta', 'Savannah'],
    Illinois: ['Chicago', 'Joliet'],
    Kentucky: ['Louisville', 'Hebron', 'Lexington'],
    Massachusetts: ['Boston', 'Worcester'],
    Michigan: ['Detroit', 'Grand Rapids'],
    'New Jersey': ['Newark', 'Edison', 'Jersey City'],
    'New York': ['New York City', 'Buffalo', 'Albany'],
    'North Carolina': ['Charlotte', 'Raleigh'],
    Ohio: ['Columbus', 'Cleveland', 'Cincinnati'],
    Oregon: ['Portland'],
    Pennsylvania: ['Philadelphia', 'Pittsburgh', 'Allentown'],
    'Rhode Island': ['Providence', 'Woonsocket'],
    Tennessee: ['Memphis', 'Nashville'],
    Texas: ['Dallas', 'Houston', 'Austin', 'San Antonio', 'Fort Worth', 'Richardson', 'Plano', 'Grand Prairie'],
    Washington: ['Seattle', 'Tacoma', 'Spokane'],
  },
  Canada: {
    Alberta: ['Calgary', 'Edmonton'],
    'British Columbia': ['Vancouver', 'Surrey'],
    Ontario: ['Toronto', 'Ottawa', 'Mississauga'],
    Quebec: ['Montreal', 'Quebec City'],
  },
  Mexico: {
    Jalisco: ['Guadalajara'],
    'Mexico City': ['Mexico City'],
    'Nuevo León': ['Monterrey'],
  },
  'Puerto Rico': {
    'San Juan': ['San Juan'],
    Ponce: ['Ponce'],
  },
  Brazil: {
    'Rio de Janeiro': ['Rio de Janeiro'],
    'São Paulo': ['São Paulo', 'Campinas', 'Santos'],
  },
  'United Kingdom': {
    England: ['London', 'Manchester', 'Birmingham', 'Felixstowe'],
    Scotland: ['Glasgow', 'Edinburgh'],
  },
  Netherlands: {
    'North Holland': ['Amsterdam'],
    'South Holland': ['Rotterdam', 'The Hague'],
  },
  Germany: {
    Bavaria: ['Munich', 'Nuremberg'],
    Berlin: ['Berlin'],
    Hamburg: ['Hamburg'],
    Hesse: ['Frankfurt'],
  },
  France: {
    'Auvergne-Rhône-Alpes': ['Lyon'],
    'Île-de-France': ['Paris'],
    "Provence-Alpes-Côte d'Azur": ['Marseille'],
  },
  'United Arab Emirates': {
    'Abu Dhabi': ['Abu Dhabi'],
    Dubai: ['Dubai', 'Jebel Ali'],
  },
  India: {
    Delhi: ['New Delhi'],
    Karnataka: ['Bengaluru'],
    Maharashtra: ['Mumbai', 'Pune'],
    Telangana: ['Hyderabad'],
  },
  China: {
    Beijing: ['Beijing'],
    Guangdong: ['Shenzhen', 'Guangzhou', 'Dongguan'],
    Shanghai: ['Shanghai'],
    Zhejiang: ['Ningbo', 'Hangzhou'],
  },
  Vietnam: {
    Hanoi: ['Hanoi'],
    'Ho Chi Minh City': ['Ho Chi Minh City'],
  },
  Singapore: {
    Singapore: ['Singapore'],
  },
  Japan: {
    Aichi: ['Nagoya'],
    Osaka: ['Osaka'],
    Tokyo: ['Tokyo'],
  },
  Australia: {
    'New South Wales': ['Sydney'],
    Victoria: ['Melbourne'],
  },
};

export const COUNTRIES = Object.keys(LOCATIONS);
