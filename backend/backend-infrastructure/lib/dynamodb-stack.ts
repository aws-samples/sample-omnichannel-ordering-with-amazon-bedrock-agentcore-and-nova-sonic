import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class DynamoDBStack extends cdk.Stack {
  public readonly tables: {
    customers: dynamodb.Table;
    orders: dynamodb.Table;
    menu: dynamodb.Table;
    carts: dynamodb.Table;
    locations: dynamodb.Table;
  };

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Customers Table
    // PK: CUSTOMER#{customerId}, SK: PROFILE
    const customersTable = new dynamodb.Table(this, 'CustomersTable', {
      tableName: 'QSR-Customers',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    // Orders Table
    // PK: CUSTOMER#{customerId}, SK: ORDER#{orderId}#{timestamp}
    // GSI1: PK: LOCATION#{locationId}, SK: ORDER#{timestamp}
    const ordersTable = new dynamodb.Table(this, 'OrdersTable', {
      tableName: 'QSR-Orders',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    // Add GSI for location-based queries
    ordersTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Menu Table
    // PK: LOCATION#{locationId}#ITEM#{itemId}
    const menuTable = new dynamodb.Table(this, 'MenuTable', {
      tableName: 'QSR-Menu',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    // Carts Table
    // PK: SESSION#{sessionId}
    // TTL: expiresAt (24 hours from creation)
    const cartsTable = new dynamodb.Table(this, 'CartsTable', {
      tableName: 'QSR-Carts',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development
      timeToLiveAttribute: 'expiresAt',
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    // Locations Table
    // PK: LOCATION#{locationId}
    const locationsTable = new dynamodb.Table(this, 'LocationsTable', {
      tableName: 'QSR-Locations',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    // Store table references
    this.tables = {
      customers: customersTable,
      orders: ordersTable,
      menu: menuTable,
      carts: cartsTable,
      locations: locationsTable,
    };

    // Stack Outputs
    new cdk.CfnOutput(this, 'CustomersTableName', {
      value: customersTable.tableName,
      description: 'Customers table name',
      exportName: 'QSR-CustomersTableName',
    });

    new cdk.CfnOutput(this, 'CustomersTableArn', {
      value: customersTable.tableArn,
      description: 'Customers table ARN',
      exportName: 'QSR-CustomersTableArn',
    });

    new cdk.CfnOutput(this, 'OrdersTableName', {
      value: ordersTable.tableName,
      description: 'Orders table name',
      exportName: 'QSR-OrdersTableName',
    });

    new cdk.CfnOutput(this, 'OrdersTableArn', {
      value: ordersTable.tableArn,
      description: 'Orders table ARN',
      exportName: 'QSR-OrdersTableArn',
    });

    new cdk.CfnOutput(this, 'MenuTableName', {
      value: menuTable.tableName,
      description: 'Menu table name',
      exportName: 'QSR-MenuTableName',
    });

    new cdk.CfnOutput(this, 'MenuTableArn', {
      value: menuTable.tableArn,
      description: 'Menu table ARN',
      exportName: 'QSR-MenuTableArn',
    });

    new cdk.CfnOutput(this, 'CartsTableName', {
      value: cartsTable.tableName,
      description: 'Carts table name',
      exportName: 'QSR-CartsTableName',
    });

    new cdk.CfnOutput(this, 'CartsTableArn', {
      value: cartsTable.tableArn,
      description: 'Carts table ARN',
      exportName: 'QSR-CartsTableArn',
    });

    new cdk.CfnOutput(this, 'LocationsTableName', {
      value: locationsTable.tableName,
      description: 'Locations table name',
      exportName: 'QSR-LocationsTableName',
    });

    new cdk.CfnOutput(this, 'LocationsTableArn', {
      value: locationsTable.tableArn,
      description: 'Locations table ARN',
      exportName: 'QSR-LocationsTableArn',
    });
  }
}
