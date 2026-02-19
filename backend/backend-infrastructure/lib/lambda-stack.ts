import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as location from 'aws-cdk-lib/aws-location';
import * as path from 'path';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export interface LambdaStackProps extends cdk.StackProps {
  tables: {
    customers: dynamodb.Table;
    orders: dynamodb.Table;
    menu: dynamodb.Table;
    carts: dynamodb.Table;
    locations: dynamodb.Table;
  };
  placeIndex: location.CfnPlaceIndex;
  routeCalculator: location.CfnRouteCalculator;
}

export class LambdaStack extends cdk.Stack {
  public readonly functions: {
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

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    // Lambda function for GetCustomerProfile
    const getCustomerProfile = new lambda.Function(this, 'GetCustomerProfile', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/get-customer-profile')),
      environment: {
        CUSTOMERS_TABLE_NAME: props.tables.customers.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      description: 'Retrieve customer profile including name, email, phone, loyalty points, and tier. Requires customerId query parameter. Returns customer details or 404 if not found.',
    });

    // Grant read permissions to Customers table
    props.tables.customers.grantReadData(getCustomerProfile);

    // Lambda function for GetPreviousOrders
    const getPreviousOrders = new lambda.Function(this, 'GetPreviousOrders', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/get-previous-orders')),
      environment: {
        ORDERS_TABLE_NAME: props.tables.orders.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      description: 'Retrieve customer order history (last 5 orders) including order ID, date, location, items, total, and status. Requires customerId query parameter. Returns array of orders sorted by date descending.',
    });

    // Grant read permissions to Orders table
    props.tables.orders.grantReadData(getPreviousOrders);

    // Lambda function for GetMenu
    const getMenu = new lambda.Function(this, 'GetMenu', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/get-menu')),
      environment: {
        MENU_TABLE_NAME: props.tables.menu.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      description: 'Retrieve location-specific menu items including name, description, price, category, and availability. Requires locationId query parameter. Returns array of menu items available at the specified location.',
    });

    // Grant read permissions to Menu table
    props.tables.menu.grantReadData(getMenu);

    // Lambda function for AddToCart
    const addToCart = new lambda.Function(this, 'AddToCart', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/add-to-cart')),
      environment: {
        MENU_TABLE_NAME: props.tables.menu.tableName,
        CARTS_TABLE_NAME: props.tables.carts.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      description: 'Add menu items to shopping cart with availability verification. Requires sessionId, locationId, itemId, and quantity in request body. Validates item availability before adding. Returns updated cart contents.',
    });

    // Grant read permissions to Menu table and read/write to Carts table
    props.tables.menu.grantReadData(addToCart);
    props.tables.carts.grantReadWriteData(addToCart);

    // Lambda function for GetCart
    const getCart = new lambda.Function(this, 'GetCart', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/get-cart')),
      environment: {
        CARTS_TABLE_NAME: props.tables.carts.tableName,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      description: 'Get current cart contents for a customer. Returns items, quantities, prices, subtotal, and location. Requires customerId parameter.',
    });

    props.tables.carts.grantReadData(getCart);

    // Lambda function for UpdateCart
    const updateCart = new lambda.Function(this, 'UpdateCart', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/update-cart')),
      environment: {
        CARTS_TABLE_NAME: props.tables.carts.tableName,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      description: 'Update cart: clear all items, remove a specific item, update item quantity, or change pickup location. Requires customerId and action in request body.',
    });

    props.tables.carts.grantReadWriteData(updateCart);

    // Lambda function for PlaceOrder
    const placeOrder = new lambda.Function(this, 'PlaceOrder', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/place-order')),
      environment: {
        CARTS_TABLE_NAME: props.tables.carts.tableName,
        ORDERS_TABLE_NAME: props.tables.orders.tableName,
        LOCATIONS_TABLE_NAME: props.tables.locations.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      description: 'Create order from cart with automatic tax calculation based on location. Requires sessionId, customerId, and locationId in request body. Calculates subtotal, tax, and total. Returns order confirmation with order ID and estimated pickup time.',
    });

    // Grant read/write permissions to Carts and Orders tables, read to Locations
    props.tables.carts.grantReadWriteData(placeOrder);
    props.tables.orders.grantReadWriteData(placeOrder);
    props.tables.locations.grantReadData(placeOrder);

    // Lambda function for GetNearestLocations
    const getNearestLocations = new lambda.Function(this, 'GetNearestLocations', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/get-nearest-locations')),
      environment: {
        LOCATIONS_TABLE_NAME: props.tables.locations.tableName,
        PLACE_INDEX_NAME: props.placeIndex.indexName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      description: 'Find nearest restaurant locations using GPS coordinates. Requires latitude and longitude query parameters. Optional maxResults parameter (default 5). Returns sorted array of locations with distance, address, hours, and contact info.',
    });

    // Grant read permissions to Locations table
    props.tables.locations.grantReadData(getNearestLocations);

    // Grant permissions to use Place Index
    getNearestLocations.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['geo:SearchPlaceIndexForPosition'],
      resources: [props.placeIndex.attrArn],
    }));

    // Lambda function for FindLocationAlongRoute
    const findLocationAlongRoute = new lambda.Function(this, 'FindLocationAlongRoute', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/find-location-along-route')),
      environment: {
        LOCATIONS_TABLE_NAME: props.tables.locations.tableName,
        ROUTE_CALCULATOR_NAME: props.routeCalculator.calculatorName,
      },
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      description: 'Find restaurant locations along a driving route with detour time calculation. Requires startLatitude, startLongitude, endLatitude, endLongitude query parameters. Optional maxDetourMinutes (default 10). Returns locations with detour time and distance.',
    });

    // Grant read permissions to Locations table
    props.tables.locations.grantReadData(findLocationAlongRoute);

    // Grant permissions to use Route Calculator
    findLocationAlongRoute.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['geo:CalculateRoute'],
      resources: [props.routeCalculator.attrArn],
    }));

    // Lambda function for GeocodeAddress
    const geocodeAddress = new lambda.Function(this, 'GeocodeAddress', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/geocode-address')),
      environment: {
        PLACE_INDEX_NAME: props.placeIndex.indexName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      description: 'Convert street address to GPS coordinates (latitude/longitude) using AWS Location Services. Requires address query parameter (full street address). Returns coordinates and formatted address. Useful for location-based searches.',
    });

    // Grant permissions to use Place Index
    geocodeAddress.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['geo:SearchPlaceIndexForText'],
      resources: [props.placeIndex.attrArn],
    }));

    // Export Lambda functions
    this.functions = {
      getCustomerProfile,
      getPreviousOrders,
      getMenu,
      addToCart,
      getCart,
      updateCart,
      placeOrder,
      getNearestLocations,
      findLocationAlongRoute,
      geocodeAddress,
    };

    // Stack outputs
    new cdk.CfnOutput(this, 'GetCustomerProfileFunctionArn', {
      value: getCustomerProfile.functionArn,
      description: 'ARN of GetCustomerProfile Lambda function',
      exportName: 'GetCustomerProfileFunctionArn',
    });

    new cdk.CfnOutput(this, 'GetPreviousOrdersFunctionArn', {
      value: getPreviousOrders.functionArn,
      description: 'ARN of GetPreviousOrders Lambda function',
      exportName: 'GetPreviousOrdersFunctionArn',
    });

    new cdk.CfnOutput(this, 'GetMenuFunctionArn', {
      value: getMenu.functionArn,
      description: 'ARN of GetMenu Lambda function',
      exportName: 'GetMenuFunctionArn',
    });

    new cdk.CfnOutput(this, 'AddToCartFunctionArn', {
      value: addToCart.functionArn,
      description: 'ARN of AddToCart Lambda function',
      exportName: 'AddToCartFunctionArn',
    });

    new cdk.CfnOutput(this, 'GetCartFunctionArn', {
      value: getCart.functionArn,
      description: 'ARN of GetCart Lambda function',
    });

    new cdk.CfnOutput(this, 'UpdateCartFunctionArn', {
      value: updateCart.functionArn,
      description: 'ARN of UpdateCart Lambda function',
    });

    new cdk.CfnOutput(this, 'PlaceOrderFunctionArn', {
      value: placeOrder.functionArn,
      description: 'ARN of PlaceOrder Lambda function',
      exportName: 'PlaceOrderFunctionArn',
    });

    new cdk.CfnOutput(this, 'GetNearestLocationsFunctionArn', {
      value: getNearestLocations.functionArn,
      description: 'ARN of GetNearestLocations Lambda function',
      exportName: 'GetNearestLocationsFunctionArn',
    });

    new cdk.CfnOutput(this, 'FindLocationAlongRouteFunctionArn', {
      value: findLocationAlongRoute.functionArn,
      description: 'ARN of FindLocationAlongRoute Lambda function',
      exportName: 'FindLocationAlongRouteFunctionArn',
    });

    new cdk.CfnOutput(this, 'GeocodeAddressFunctionArn', {
      value: geocodeAddress.functionArn,
      description: 'ARN of GeocodeAddress Lambda function',
      exportName: 'GeocodeAddressFunctionArn',
    });

    // Suppress cdk-nag findings for all Lambda functions
    // AwsSolutions-IAM4: AWS managed policy AWSLambdaBasicExecutionRole is acceptable
    // This policy only grants permissions to create CloudWatch Logs, which is minimal and appropriate
    const lambdaFunctions = [
      getCustomerProfile,
      getPreviousOrders,
      getMenu,
      addToCart,
      getCart,
      updateCart,
      placeOrder,
      getNearestLocations,
      findLocationAlongRoute,
      geocodeAddress,
    ];

    lambdaFunctions.forEach((fn) => {
      NagSuppressions.addResourceSuppressions(
        fn,
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'AWSLambdaBasicExecutionRole is an AWS managed policy that only grants CloudWatch Logs permissions, which is minimal and appropriate for Lambda functions.',
          },
          {
            id: 'AwsSolutions-L1',
            reason: 'Lambda functions are using Node.js 20.x runtime, which is the latest LTS version available in AWS Lambda at the time of development. Runtime will be updated when newer versions become available.',
          },
        ],
        true // Apply to all child resources (including the execution role)
      );
    });

    // Suppress DynamoDB index wildcard permissions for functions that query by GSI
    // AwsSolutions-IAM5: Wildcard permissions on DynamoDB indexes are required for GSI queries
    NagSuppressions.addResourceSuppressions(
      getPreviousOrders,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Wildcard permissions on DynamoDB table indexes are required to query the customerId-orderDate-index GSI. The permissions are scoped to the specific Orders table.',
        },
      ],
      true
    );

    NagSuppressions.addResourceSuppressions(
      placeOrder,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Wildcard permissions on DynamoDB table indexes are required for potential GSI queries on Orders and Carts tables. The permissions are scoped to specific tables.',
        },
      ],
      true
    );
  }
}
