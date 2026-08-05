import { createHash } from 'node:crypto';

export const DEFAULT_PARCEL_PERFECT_SERVICE_URL = 'https://siyweb45531.pperfect.com/ecomService/v28/Json/';

export interface ParcelPerfectLocation {
  name: string;
  contact: string;
  address1: string;
  address2?: string;
  address3?: string;
  address4?: string;
  phone?: string;
  cell?: string;
  email?: string;
  place: string;
  town: string;
  postalCode: string;
}

export interface ParcelPerfectContentsItem {
  description: string;
  pieces: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  actualWeightKg: number;
}

export interface ParcelPerfectConfig {
  serviceUrl: string;
  email: string;
  password: string;
  origin: ParcelPerfectLocation;
}

type Environment = Record<string, string | undefined>;
type FetchLike = typeof fetch;

const readRequired = (environment: Environment, key: string) => {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} must be configured on the server.`);
  return value;
};

const cleanServiceUrl = (value: string | undefined) => {
  const url = (value || DEFAULT_PARCEL_PERFECT_SERVICE_URL).trim();
  return url.endsWith('/') ? url : `${url}/`;
};

export const readParcelPerfectConfig = (environment: Environment = process.env): ParcelPerfectConfig => ({
  serviceUrl: cleanServiceUrl(environment.PP_ECOM_SERVICE_URL),
  email: readRequired(environment, 'PP_ECOM_EMAIL'),
  password: readRequired(environment, 'PP_ECOM_PASSWORD'),
  origin: {
    name: readRequired(environment, 'PP_ORIGIN_NAME'),
    contact: readRequired(environment, 'PP_ORIGIN_CONTACT'),
    address1: readRequired(environment, 'PP_ORIGIN_ADDRESS1'),
    address2: environment.PP_ORIGIN_ADDRESS2?.trim(),
    address3: environment.PP_ORIGIN_ADDRESS3?.trim(),
    address4: environment.PP_ORIGIN_ADDRESS4?.trim(),
    phone: environment.PP_ORIGIN_PHONE?.trim(),
    cell: environment.PP_ORIGIN_CELL?.trim(),
    email: environment.PP_ORIGIN_EMAIL?.trim(),
    place: readRequired(environment, 'PP_ORIGIN_PLACE'),
    town: readRequired(environment, 'PP_ORIGIN_TOWN'),
    postalCode: readRequired(environment, 'PP_ORIGIN_POSTCODE')
  }
});

export const hashParcelPerfectPassword = (password: string, salt: string) => (
  createHash('md5').update(`${password}${salt}`).digest('hex')
);

export const buildParcelPerfectUrl = (
  serviceUrl: string,
  className: string,
  method: string,
  parameters: unknown,
  token?: string
) => {
  const url = new URL(cleanServiceUrl(serviceUrl));
  url.searchParams.set('class', className);
  url.searchParams.set('method', method);
  url.searchParams.set('params', JSON.stringify(parameters ?? {}));
  if (token) url.searchParams.set('token_id', token);
  return url.toString();
};

const requireNonEmpty = (value: unknown, label: string) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
};

const requirePositiveNumber = (value: unknown, label: string) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) throw new Error(`${label} must be greater than zero.`);
  return normalized;
};

export const normalizeLocation = (value: unknown, label: string): ParcelPerfectLocation => {
  const location = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    name: requireNonEmpty(location.name, `${label} name`),
    contact: requireNonEmpty(location.contact || location.name, `${label} contact`),
    address1: requireNonEmpty(location.address1, `${label} address line 1`),
    address2: typeof location.address2 === 'string' ? location.address2.trim() : undefined,
    address3: typeof location.address3 === 'string' ? location.address3.trim() : undefined,
    address4: typeof location.address4 === 'string' ? location.address4.trim() : undefined,
    phone: typeof location.phone === 'string' ? location.phone.trim() : undefined,
    cell: typeof location.cell === 'string' ? location.cell.trim() : undefined,
    email: typeof location.email === 'string' ? location.email.trim() : undefined,
    place: requireNonEmpty(location.place, `${label} courier area`),
    town: requireNonEmpty(location.town, `${label} town/city`),
    postalCode: requireNonEmpty(location.postalCode, `${label} postal code`)
  };
};

export const normalizeContentsItem = (value: unknown): ParcelPerfectContentsItem => {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    description: requireNonEmpty(item.description, 'Parcel description'),
    pieces: requirePositiveNumber(item.pieces, 'Parcel pieces'),
    lengthCm: requirePositiveNumber(item.lengthCm, 'Parcel length'),
    widthCm: requirePositiveNumber(item.widthCm, 'Parcel width'),
    heightCm: requirePositiveNumber(item.heightCm, 'Parcel height'),
    actualWeightKg: requirePositiveNumber(item.actualWeightKg, 'Parcel actual weight')
  };
};

const addLocation = (target: Record<string, unknown>, prefix: 'orig' | 'dest', location: ParcelPerfectLocation) => {
  target[`${prefix}peradd1`] = location.address1;
  target[`${prefix}peradd2`] = location.address2 || '';
  target[`${prefix}peradd3`] = location.address3 || '';
  target[`${prefix}peradd4`] = location.address4 || '';
  target[`${prefix}perphone`] = location.phone || '';
  target[`${prefix}percell`] = location.cell || '';
  target[`${prefix}peremail`] = location.email || '';
  target[`${prefix}place`] = location.place;
  target[`${prefix}town`] = location.town;
  target[`${prefix}pers`] = location.name;
  target[`${prefix}percontact`] = location.contact;
  target[`${prefix}perpcode`] = location.postalCode;
};

export const buildParcelPerfectQuoteParameters = (
  origin: ParcelPerfectLocation,
  destination: ParcelPerfectLocation,
  item: ParcelPerfectContentsItem,
  reference = ''
) => {
  const details: Record<string, unknown> = { reference: reference.trim() };
  addLocation(details, 'orig', origin);
  addLocation(details, 'dest', destination);

  return {
    details,
    contents: [{
      item: 1,
      desc: item.description,
      pieces: item.pieces,
      dim1: item.lengthCm,
      dim2: item.widthCm,
      dim3: item.heightCm,
      actmass: item.actualWeightKg
    }]
  };
};

const callParcelPerfect = async (
  fetchImpl: FetchLike,
  config: ParcelPerfectConfig,
  className: string,
  method: string,
  parameters: unknown,
  token?: string
) => {
  const response = await fetchImpl(buildParcelPerfectUrl(config.serviceUrl, className, method, parameters, token), {
    headers: { Accept: 'application/json' }
  });
  const body = await response.text();
  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error('Parcel Perfect returned an unreadable response.');
  }
  if (!response.ok) throw new Error(data?.errormessage || `Parcel Perfect request failed (${response.status}).`);
  if (data?.errorcode && Number(data.errorcode) !== 0) throw new Error(data.errormessage || 'Parcel Perfect rejected the request.');
  return data;
};

export const requestParcelPerfectQuote = async (
  destinationInput: unknown,
  itemInput: unknown,
  reference: unknown,
  fetchImpl: FetchLike = fetch,
  environment: Environment = process.env
) => {
  const config = readParcelPerfectConfig(environment);
  const destination = normalizeLocation(destinationInput, 'Delivery');
  const item = normalizeContentsItem(itemInput);
  const saltResponse = await callParcelPerfect(fetchImpl, config, 'Auth', 'getSalt', { email: config.email });
  const salt = saltResponse?.results?.[0]?.salt;
  if (typeof salt !== 'string' || !salt) throw new Error('Parcel Perfect did not return an authentication salt.');

  const tokenResponse = await callParcelPerfect(fetchImpl, config, 'Auth', 'getSecureToken', {
    email: config.email,
    password: hashParcelPerfectPassword(config.password, salt)
  });
  const token = tokenResponse?.results?.[0]?.token_id;
  if (typeof token !== 'string' || !token) throw new Error('Parcel Perfect did not return an access token.');

  return callParcelPerfect(
    fetchImpl,
    config,
    'Quote',
    'requestQuote',
    buildParcelPerfectQuoteParameters(config.origin, destination, item, typeof reference === 'string' ? reference : ''),
    token
  );
};
