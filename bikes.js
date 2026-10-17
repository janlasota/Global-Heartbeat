// Public GBFS bike-share feeds per city: [station_information, station_status]. Shared by server + city view.
const g = (base, ext = '.json') => [`${base}/station_information${ext}`, `${base}/station_status${ext}`];
export const BIKES = {
  'New York': g('https://gbfs.citibikenyc.com/gbfs/en'),
  Chicago: g('https://gbfs.divvybikes.com/gbfs/en'),
  Toronto: g('https://tor.publicbikesystem.net/ube/gbfs/v1/en', ''),
  'Los Angeles': g('https://gbfs.bcycle.com/bcycle_lametro'),
  'Mexico City': g('https://gbfs.mex.lyftbikes.com/gbfs/en'),
  'Buenos Aires': g('https://buenosaires.publicbikesystem.net/customer/gbfs/v2/en', ''),
  Madrid: g('https://madrid.publicbikesystem.net/customer/gbfs/v2/en', ''),
  Paris: g('https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole'),
  Berlin: g('https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_bn/en'),
  Austin: g('https://austin.publicbikesystem.net/customer/gbfs/v2/en', ''),
  Vancouver: g('https://gbfs.kappa.fifteen.eu/gbfs/2.2/mobi/en', ''),
  'Sao Paulo': g('https://saopaulo.publicbikesystem.net/customer/gbfs/v2/en', ''),
  Bogota: g('https://bogota.publicbikesystem.net/customer/gbfs/v2/en', ''),
  Dubai: g('https://careem.publicbikesystem.net/customer/gbfs/v2/en', ''),
  London: ['https://api.tfl.gov.uk/BikePoint', 'https://api.tfl.gov.uk/BikePoint'], // TfL format, converted in server.mjs
  Tokyo: g('https://api-public.odpt.org/api/v4/gbfs/docomo-cycle-tokyo'),
};
