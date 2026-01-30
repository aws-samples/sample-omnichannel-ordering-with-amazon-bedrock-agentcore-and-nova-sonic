const { LocationClient, SearchPlaceIndexForTextCommand } = require('@aws-sdk/client-location');

const locationClient = new LocationClient({});
const PLACE_INDEX_NAME = process.env.PLACE_INDEX_NAME;

exports.handler = async (event) => {
  console.log('GeocodeAddress event:', JSON.stringify(event));

  try {
    const params = event.queryStringParameters || JSON.parse(event.body || '{}');
    const address = params.address;

    if (!address) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Address parameter is required' })
      };
    }

    const result = await locationClient.send(new SearchPlaceIndexForTextCommand({
      IndexName: PLACE_INDEX_NAME,
      Text: address,
      MaxResults: 1
    }));

    if (!result.Results || result.Results.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          coordinates: null,
          message: 'No results found for the provided address'
        })
      };
    }

    const place = result.Results[0].Place;
    const coordinates = {
      latitude: place.Geometry.Point[1],
      longitude: place.Geometry.Point[0],
      label: place.Label,
      address: place.Label
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ coordinates })
    };
  } catch (error) {
    console.error('Error geocoding address:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        error: 'Failed to geocode address',
        message: error.message
      })
    };
  }
};
