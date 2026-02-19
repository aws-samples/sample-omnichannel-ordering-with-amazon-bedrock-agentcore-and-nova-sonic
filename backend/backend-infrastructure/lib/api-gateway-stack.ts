import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export interface ApiGatewayStackProps extends cdk.StackProps {
  userPool: cognito.UserPool;
  lambdaFunctions: {
    getCustomerProfile: lambda.Function;
    getPreviousOrders: lambda.Function;
    getMenu: lambda.Function;
    addToCart: lambda.Function;
    getCart: lambda.Function;
    updateCart: lambda.Function;
    placeOrder: lambda.Function;
    getNearestLocations: lambda.Function;
    findLocationAlongRoute: lambda.Function;
    geocodeAddress: lambda.Function;
  };
}

export class ApiGatewayStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    // Create CloudWatch Log Group for API Gateway access logs
    const accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: `/aws/apigateway/qsr-api-access-logs`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create REST API
    this.api = new apigateway.RestApi(this, 'QSRApi', {
      restApiName: 'QSR Ordering API',
      description: 'REST API for QSR ordering system with Cognito JWT authentication',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
        accessLogDestination: new apigateway.LogGroupLogDestination(accessLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
    });

    // Define response models for OpenAPI schema
    const successResponseModel = this.api.addModel('SuccessResponse', {
      contentType: 'application/json',
      modelName: 'SuccessResponse',
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT4,
        title: 'Success Response',
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          statusCode: { type: apigateway.JsonSchemaType.INTEGER },
          body: { type: apigateway.JsonSchemaType.STRING },
        },
      },
    });

    const errorResponseModel = this.api.addModel('ErrorResponse', {
      contentType: 'application/json',
      modelName: 'ErrorResponse',
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT4,
        title: 'Error Response',
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          statusCode: { type: apigateway.JsonSchemaType.INTEGER },
          message: { type: apigateway.JsonSchemaType.STRING },
        },
      },
    });

    // Define request body models for POST operations
    const addToCartRequestModel = this.api.addModel('AddToCartRequest', {
      contentType: 'application/json',
      modelName: 'AddToCartRequest',
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT4,
        title: 'Add To Cart Request',
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          customerId: { 
            type: apigateway.JsonSchemaType.STRING,
            description: 'Customer ID from Cognito authentication'
          },
          locationId: { 
            type: apigateway.JsonSchemaType.STRING,
            description: 'Restaurant location ID'
          },
          items: {
            type: apigateway.JsonSchemaType.ARRAY,
            description: 'Array of items to add to cart',
            items: {
              type: apigateway.JsonSchemaType.OBJECT,
              properties: {
                itemId: {
                  type: apigateway.JsonSchemaType.STRING,
                  description: 'Menu item ID'
                },
                quantity: {
                  type: apigateway.JsonSchemaType.INTEGER,
                  description: 'Quantity of this item to add'
                }
              },
              required: ['itemId', 'quantity']
            }
          },
        },
        required: ['customerId', 'locationId', 'items'],
      },
    });

    const placeOrderRequestModel = this.api.addModel('PlaceOrderRequest', {
      contentType: 'application/json',
      modelName: 'PlaceOrderRequest',
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT4,
        title: 'Place Order Request',
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          customerId: { 
            type: apigateway.JsonSchemaType.STRING,
            description: 'Customer ID from Cognito authentication'
          },
          locationId: { 
            type: apigateway.JsonSchemaType.STRING,
            description: 'Restaurant location ID for pickup'
          },
        },
        required: ['customerId', 'locationId'],
      },
    });

    // Create request validator for body validation
    const requestValidator = new apigateway.RequestValidator(this, 'RequestValidator', {
      restApi: this.api,
      requestValidatorName: 'request-body-validator',
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    // Note: Using AWS_IAM authorization instead of Cognito User Pool Authorizer
    // This allows both:
    // 1. Frontend users (via Cognito Identity Pool temporary credentials + SigV4)
    // 2. AgentCore Gateway (via IAM role + SigV4)
    // to access the API with a single authorization method

    // Create Lambda integrations
    const getCustomerProfileIntegration = new apigateway.LambdaIntegration(
      props.lambdaFunctions.getCustomerProfile,
      {
        proxy: true,
        allowTestInvoke: true,
      }
    );

    const getPreviousOrdersIntegration = new apigateway.LambdaIntegration(
      props.lambdaFunctions.getPreviousOrders,
      {
        proxy: true,
        allowTestInvoke: true,
      }
    );

    const getMenuIntegration = new apigateway.LambdaIntegration(
      props.lambdaFunctions.getMenu,
      {
        proxy: true,
        allowTestInvoke: true,
      }
    );

    const addToCartIntegration = new apigateway.LambdaIntegration(
      props.lambdaFunctions.addToCart,
      {
        proxy: true,
        allowTestInvoke: true,
      }
    );

    const getCartIntegration = new apigateway.LambdaIntegration(
      props.lambdaFunctions.getCart,
      {
        proxy: true,
        allowTestInvoke: true,
      }
    );

    const updateCartIntegration = new apigateway.LambdaIntegration(
      props.lambdaFunctions.updateCart,
      {
        proxy: true,
        allowTestInvoke: true,
      }
    );

    const placeOrderIntegration = new apigateway.LambdaIntegration(
      props.lambdaFunctions.placeOrder,
      {
        proxy: true,
        allowTestInvoke: true,
      }
    );

    const getNearestLocationsIntegration = new apigateway.LambdaIntegration(
      props.lambdaFunctions.getNearestLocations,
      {
        proxy: true,
        allowTestInvoke: true,
      }
    );

    const findLocationAlongRouteIntegration = new apigateway.LambdaIntegration(
      props.lambdaFunctions.findLocationAlongRoute,
      {
        proxy: true,
        allowTestInvoke: true,
      }
    );

    const geocodeAddressIntegration = new apigateway.LambdaIntegration(
      props.lambdaFunctions.geocodeAddress,
      {
        proxy: true,
        allowTestInvoke: true,
      }
    );

    // Create resource paths and methods with Cognito authorization
    // Customer operations
    const customers = this.api.root.addResource('customers', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'OPTIONS'],
      },
    });
    
    const customerProfile = customers.addResource('profile');
    customerProfile.addMethod('GET', getCustomerProfileIntegration, {
      authorizationType: apigateway.AuthorizationType.IAM,
      operationName: 'GetCustomerProfile',
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': successResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
        {
          statusCode: '401',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
      ],
      requestParameters: {
        'method.request.querystring.customerId': true,
      },
    });

    const orders = customers.addResource('orders');
    orders.addMethod('GET', getPreviousOrdersIntegration, {
      authorizationType: apigateway.AuthorizationType.IAM,
      operationName: 'GetPreviousOrders',
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': successResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
        {
          statusCode: '401',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
      ],
      requestParameters: {
        'method.request.querystring.customerId': true,
      },
    });

    // Menu operations
    const menu = this.api.root.addResource('menu');
    menu.addMethod('GET', getMenuIntegration, {
      authorizationType: apigateway.AuthorizationType.IAM,
      operationName: 'GetMenu',
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': successResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
        {
          statusCode: '401',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
      ],
      requestParameters: {
        'method.request.querystring.locationId': true,
      },
    });

    // Cart operations
    const cart = this.api.root.addResource('cart');
    cart.addMethod('POST', addToCartIntegration, {
      authorizationType: apigateway.AuthorizationType.IAM,
      operationName: 'AddToCart',
      requestValidator: requestValidator,
      requestModels: {
        'application/json': addToCartRequestModel,
      },
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': successResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
        {
          statusCode: '401',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
      ],
    });

    cart.addMethod('GET', getCartIntegration, {
      authorizationType: apigateway.AuthorizationType.IAM,
      operationName: 'GetCart',
      requestParameters: {
        'method.request.querystring.customerId': true,
      },
      methodResponses: [
        {
          statusCode: '200',
          responseModels: { 'application/json': successResponseModel },
          responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true },
        },
        { statusCode: '400', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    cart.addMethod('PUT', updateCartIntegration, {
      authorizationType: apigateway.AuthorizationType.IAM,
      operationName: 'UpdateCart',
      methodResponses: [
        {
          statusCode: '200',
          responseModels: { 'application/json': successResponseModel },
          responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true },
        },
        { statusCode: '400', responseModels: { 'application/json': errorResponseModel } },
        { statusCode: '500', responseModels: { 'application/json': errorResponseModel } },
      ],
    });

    // Order operations
    const order = this.api.root.addResource('order');
    order.addMethod('POST', placeOrderIntegration, {
      authorizationType: apigateway.AuthorizationType.IAM,
      operationName: 'PlaceOrder',
      requestValidator: requestValidator,
      requestModels: {
        'application/json': placeOrderRequestModel,
      },
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': successResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
        {
          statusCode: '401',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
      ],
    });

    // Location operations
    const locations = this.api.root.addResource('locations');
    const nearest = locations.addResource('nearest');
    nearest.addMethod('GET', getNearestLocationsIntegration, {
      authorizationType: apigateway.AuthorizationType.IAM,
      operationName: 'GetNearestLocations',
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': successResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
        {
          statusCode: '401',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
      ],
      requestParameters: {
        'method.request.querystring.latitude': true,
        'method.request.querystring.longitude': true,
        'method.request.querystring.maxResults': false,
      },
    });

    const route = locations.addResource('route');
    route.addMethod('GET', findLocationAlongRouteIntegration, {
      authorizationType: apigateway.AuthorizationType.IAM,
      operationName: 'FindLocationAlongRoute',
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': successResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
        {
          statusCode: '401',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
      ],
      requestParameters: {
        'method.request.querystring.startLatitude': true,
        'method.request.querystring.startLongitude': true,
        'method.request.querystring.endLatitude': true,
        'method.request.querystring.endLongitude': true,
        'method.request.querystring.maxDetourMinutes': false,
      },
    });

    const geocode = locations.addResource('geocode');
    geocode.addMethod('GET', geocodeAddressIntegration, {
      authorizationType: apigateway.AuthorizationType.IAM,
      operationName: 'GeocodeAddress',
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': successResponseModel,
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
        {
          statusCode: '401',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': errorResponseModel,
          },
        },
      ],
      requestParameters: {
        'method.request.querystring.address': true,
      },
    });

    // Stack outputs
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'API Gateway endpoint URL',
      exportName: 'QSR-ApiGatewayUrl',
    });

    new cdk.CfnOutput(this, 'ApiGatewayId', {
      value: this.api.restApiId,
      description: 'API Gateway ID',
      exportName: 'QSR-ApiGatewayId',
    });

    new cdk.CfnOutput(this, 'ApiGatewayArn', {
      value: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*`,
      description: 'API Gateway ARN for IAM permissions',
      exportName: 'QSR-ApiGatewayArn',
    });

    // Suppress cdk-nag findings
    // AwsSolutions-COG4: This API uses AWS_IAM authorization, not Cognito User Pool Authorizer
    // The finding is a false positive - we intentionally use IAM authorization to support both
    // frontend users (via Cognito Identity Pool + SigV4) and AgentCore Gateway (via IAM role + SigV4)
    // Apply suppression to the entire API since all methods use IAM authorization
    NagSuppressions.addResourceSuppressions(
      this.api,
      [
        {
          id: 'AwsSolutions-COG4',
          reason: 'This API uses AWS_IAM authorization instead of Cognito User Pool Authorizer. This is intentional to support both frontend users (via Cognito Identity Pool temporary credentials) and AgentCore Gateway (via IAM role) with a single authorization method.',
        },
        {
          id: 'AwsSolutions-APIG3',
          reason: 'WAF is not enabled for this demo application to minimize costs. In production deployments, WAF should be enabled for enhanced security against common web exploits.',
        },
      ],
      true // Apply to all child resources
    );
  }
}
