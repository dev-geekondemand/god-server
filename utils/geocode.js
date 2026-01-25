const axios = require('axios');

const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_TOKEN || 'YOUR_MAPBOX_ACCESS_TOKEN';

const geocodeAddress = async ({ pin, city, state }) => {
  const query = `${pin}, ${city}, ${state}, India`;

  const encoded = encodeURIComponent(query);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json`;

  const { data } = await axios.get(url, {
    params: {
      access_token: process.env.MAPBOX_TOKEN,
      limit: 1,
      country: "IN"
    }
  });

  console.log(data);

  if (!data?.features?.length) return null;

  const feature = data.features[0];

  // 🔒 HARD FAILSAFES
  if (feature.relevance < 0.6) return null;

  const allowed = ["postcode", "place", "locality", "address"];
  if (!feature.place_type.some(t => allowed.includes(t))) return null;

  return feature.center; // [lng, lat]
};

 const geocodeByPin = async (pin) => {
  const query = `${pin}, India`;

  const { data } = await axios.get(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
    {
      params: {
        access_token: process.env.MAPBOX_TOKEN,
        limit: 1,
        country: "IN",
        types: "postcode"
      }
    }
  );

  console.log(data);

  if (!data?.features?.length) return null;

  const feature = data.features[0];

  // stricter for PIN
  if (feature.relevance < 0.7) return null;

  return feature.center;
};



module.exports = {
  geocodeAddress,
  geocodeByPin
};
