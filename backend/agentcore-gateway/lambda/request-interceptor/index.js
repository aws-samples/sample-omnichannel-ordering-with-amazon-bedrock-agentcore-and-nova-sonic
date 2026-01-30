/**
 * Request Interceptor Lambda for AgentCore Gateway
 * 
 * This Lambda intercepts requests from the AgentCore Gateway and transforms
 * the Authorization header to be forwarded to the Backend API Gateway.
 * 
 * This is a workaround for the limitation that AgentCore Gateway cannot
 * directly propagate the Authorization header to API Gateway targets.
 * 
 * See: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-headers.html
 */

exports.handler = async (event) => {
  try {
    console.log('Request Interceptor invoked', JSON.stringify(event, null, 2));

    // Extract Authorization header (case-insensitive)
    const authHeader = event.headers['Authorization'] || 
                      event.headers['authorization'] ||
                      event.headers['AUTHORIZATION'];

    if (!authHeader) {
      console.warn('Missing Authorization header in request');
      throw new Error('Missing Authorization header');
    }

    // Forward the request with all headers including Authorization
    // The Authorization header will be passed to the Backend API Gateway
    const modifiedHeaders = {
      ...event.headers,
      'Authorization': authHeader,
    };

    const response = {
      headers: modifiedHeaders,
      path: event.path,
      httpMethod: event.httpMethod,
      body: event.body,
      queryStringParameters: event.queryStringParameters,
    };

    console.log('Request Interceptor response', JSON.stringify(response, null, 2));

    return response;
  } catch (error) {
    console.error('Request interceptor error:', error);
    throw error;
  }
};
