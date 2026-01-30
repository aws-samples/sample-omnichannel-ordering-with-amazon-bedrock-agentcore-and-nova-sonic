import * as cdk from 'aws-cdk-lib';
import * as location from 'aws-cdk-lib/aws-location';
import { Construct } from 'constructs';

export class LocationStack extends cdk.Stack {
  public readonly placeIndex: location.CfnPlaceIndex;
  public readonly routeCalculator: location.CfnRouteCalculator;
  public readonly map: location.CfnMap;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Place Index for geocoding and place search
    this.placeIndex = new location.CfnPlaceIndex(this, 'QSRPlaceIndex', {
      indexName: 'QSRRestaurantIndex',
      dataSource: 'Esri', // Using Esri as data provider
      description: 'Place index for QSR restaurant geocoding and search',
      pricingPlan: 'RequestBasedUsage',
      tags: [
        {
          key: 'Environment',
          value: 'Development',
        },
        {
          key: 'ManagedBy',
          value: 'CDK',
        },
        {
          key: 'Project',
          value: 'QSR-Ordering',
        },
      ],
    });

    // Create Route Calculator for route optimization
    this.routeCalculator = new location.CfnRouteCalculator(this, 'QSRRouteCalculator', {
      calculatorName: 'QSRRouteCalculator',
      dataSource: 'Esri', // Using Esri as data provider
      description: 'Route calculator for QSR restaurant route optimization',
      pricingPlan: 'RequestBasedUsage',
      tags: [
        {
          key: 'Environment',
          value: 'Development',
        },
        {
          key: 'ManagedBy',
          value: 'CDK',
        },
        {
          key: 'Project',
          value: 'QSR-Ordering',
        },
      ],
    });

    // Create Map for interactive visualization (test client and frontend)
    // Frontend will use Cognito Identity Pool credentials to access the map
    this.map = new location.CfnMap(this, 'QSRMap', {
      mapName: 'QSRRestaurantMap',
      configuration: {
        style: 'VectorEsriNavigation', // Navigation-optimized style for driving use case
      },
      description: 'Map for QSR restaurant location visualization and coordinate selection',
      pricingPlan: 'RequestBasedUsage',
      tags: [
        {
          key: 'Environment',
          value: 'Development',
        },
        {
          key: 'ManagedBy',
          value: 'CDK',
        },
        {
          key: 'Project',
          value: 'QSR-Ordering',
        },
      ],
    });

    // Stack Outputs
    new cdk.CfnOutput(this, 'PlaceIndexName', {
      value: this.placeIndex.indexName,
      description: 'Place Index name for geocoding and address search',
      exportName: 'QSR-PlaceIndexName',
    });

    new cdk.CfnOutput(this, 'PlaceIndexArn', {
      value: this.placeIndex.attrIndexArn,
      description: 'Place Index ARN',
      exportName: 'QSR-PlaceIndexArn',
    });

    new cdk.CfnOutput(this, 'RouteCalculatorName', {
      value: this.routeCalculator.calculatorName,
      description: 'Route Calculator name for route optimization',
      exportName: 'QSR-RouteCalculatorName',
    });

    new cdk.CfnOutput(this, 'RouteCalculatorArn', {
      value: this.routeCalculator.attrCalculatorArn,
      description: 'Route Calculator ARN',
      exportName: 'QSR-RouteCalculatorArn',
    });

    new cdk.CfnOutput(this, 'MapName', {
      value: this.map.mapName,
      description: 'Map name for interactive visualization (use with Cognito Identity Pool credentials)',
      exportName: 'QSR-MapName',
    });

    new cdk.CfnOutput(this, 'MapArn', {
      value: this.map.attrMapArn,
      description: 'Map ARN',
      exportName: 'QSR-MapArn',
    });
  }
}
