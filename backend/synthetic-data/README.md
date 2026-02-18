# Synthetic Data Population

This directory contains an interactive Python CLI tool for populating DynamoDB tables with synthetic but realistic test data.

## Technology Stack

- **Python 3.8+** for scripting
- **AWS SDK (boto3)** for AWS service integration
- **AWS Geo Places API** for real location discovery
- **DynamoDB** for data storage

## Directory Structure

```
backend/synthetic-data/
├── populate_data.py                # Main interactive CLI script
├── requirements.txt                # Python dependencies
├── lib/
│   ├── __init__.py
│   ├── geo_places.py              # AWS Geo Places API integration
│   ├── data_generator.py          # Synthetic data generation
│   ├── dynamodb_client.py         # DynamoDB operations
│   └── validators.py              # Input validation
├── output/                         # Generated JSON files (gitignored)
│   ├── locations.json
│   ├── customer.json
│   ├── menu.json
│   └── orders.json
├── .gitignore
└── README.md                       # This file
```

## Purpose

Populate DynamoDB tables with realistic test data for:
- Development and testing
- Demo scenarios
- Integration testing
- Agent conversation testing

The script uses **AWS Geo Places API** to discover real restaurant locations near a user-provided address, then generates synthetic menu items, customer profiles, and order history.

## Features

### 1. Interactive CLI
- User-friendly prompts for all inputs
- Validates addresses and coordinates
- Provides helpful examples and error messages

### 2. Real Location Discovery
- Queries AWS Geo Places API for actual businesses
- Searches within 60-mile radius
- Returns up to 20 nearby locations with addresses and coordinates

### 3. Local File Generation
- Saves all data to JSON files before ingestion
- Allows review and modification before DynamoDB write
- Pretty-printed JSON for readability

### 4. Comprehensive Data Generation
- **Locations**: Real addresses from Geo Places API
- **Customer**: Uses deployment parameters (name, email, customer ID)
- **Menu**: Consistent menu across all locations
- **Orders**: Realistic order history with timestamps

### 5. Safe Ingestion
- Verifies tables exist before writing
- Batch writes for efficiency
- Error handling and retry logic
- Idempotent (can run multiple times)

## Prerequisites

1. **Backend Infrastructure Deployed**
   ```bash
   ./deploy-all.sh --user-email your@email.com --user-name "Your Name"
   ```
   This creates the DynamoDB tables and Cognito user with customer ID.

2. **Python 3.8 or higher**
   ```bash
   python3 --version
   ```

3. **AWS Credentials Configured**
   ```bash
   aws configure
   # OR use environment variables
   export AWS_ACCESS_KEY_ID=...
   export AWS_SECRET_ACCESS_KEY=...
   export AWS_REGION=us-east-1
   ```

4. **AWS Geo Places API Access**
   - Ensure your AWS account has access to Geo Places API
   - Service is available in us-east-1 region

## Installation

```bash
cd backend/synthetic-data

# Install Python dependencies
pip3 install -r requirements.txt

# Make script executable (optional)
chmod +x populate_data.py
```

## Usage

### Interactive Mode (Recommended)

```bash
python3 populate_data.py
```

The script will guide you through:

1. **Location Input**
   - Enter your current address or coordinates
   - Example: `123 Main St, Van Alstyne, TX 75495`
   - Example: `33.4127, -96.5837`

2. **Business Name**
   - Enter the restaurant or business to search for
   - Example: `pizza`, `burgers`, `coffee shop`

3. **Location Discovery**
   - Script queries AWS Geo Places API
   - Displays found locations with distances
   - Finds up to 20 locations within 60 miles

4. **Customer Home Address**
   - Choose to use same address or enter different one
   - Used for customer profile

5. **Data Generation**
   - Generates location records
   - Creates customer profile
   - Generates menu items for all locations
   - Creates sample orders

6. **Review**
   - Data saved to `output/` directory
   - Review JSON files before ingestion

7. **Ingestion**
   - Confirm to write to DynamoDB
   - Batch writes to all tables
   - Displays progress and results

### Example Session

```
============================================================
  QSR Ordering System - Synthetic Data Population
============================================================

ℹ️  Loading deployment outputs...
✅ Customer: Sergio Barraza (cust-qsrcogni)
✅ Deployment outputs loaded

============================================================
  Step 1: Location Input
============================================================

ℹ️  You can provide either an address or coordinates
ℹ️  Examples:
ℹ️    - Address: 123 Main St, Van Alstyne, TX 75495
ℹ️    - Coordinates: 33.4127, -96.5837

Enter your current address or coordinates: 33.4127, -96.5837
✅ Coordinates: 33.4127, -96.5837

============================================================
  Step 2: Business Name
============================================================

ℹ️  Enter the name of a restaurant or business you want to search for
ℹ️  Examples: pizza, burgers, coffee shop, sandwich, tacos

Enter restaurant or business name to search: pizza

============================================================
  Step 3: Location Discovery
============================================================

ℹ️  Searching for 'pizza' within 100 miles...
ℹ️  This may take a moment...

✅ Found 15 locations

  1. Pizza Place - McKinney
     123 Main St, McKinney, TX 75069
     Distance: 12.3 miles

  2. Pizza Kitchen - Plano
     456 Oak Ave, Plano, TX 75023
     Distance: 18.7 miles

  [... more locations ...]

============================================================
  Step 4: Customer Home Address
============================================================

ℹ️  Customer home address can be the same as your current location or different

Use same address for customer home? (yes/no): yes
✅ Using same address for customer home

============================================================
  Step 5: Generating Synthetic Data
============================================================

ℹ️  Generating location records...
✅ Generated 15 location records
ℹ️  Generating customer profile...
✅ Generated customer profile
ℹ️  Generating menu items...
✅ Generated 165 menu items (11 per location)
ℹ️  Generating sample orders...
✅ Generated 5 sample orders

============================================================
  Step 6: Saving to Local Files
============================================================

✅ Saved to: output/locations.json
✅ Saved to: output/customer.json
✅ Saved to: output/menu.json
✅ Saved to: output/orders.json

============================================================
  Generated Data Summary
============================================================

Locations: 15 locations
Customer: Sergio Barraza (cust-qsrcogni)
Menu Items: 165 items per location
Orders: 5 sample orders

============================================================
  Step 7: DynamoDB Ingestion
============================================================

ℹ️  Review the generated JSON files in the output/ directory

Ready to ingest data into DynamoDB? (yes/no): yes

ℹ️  Verifying tables exist...
✅ All tables verified

ℹ️  Ingesting 15 locations...
✅ Successfully wrote 15 locations

ℹ️  Ingesting customer profile...
✅ Successfully wrote customer profile

ℹ️  Ingesting 165 menu items...
✅ Successfully wrote 165 menu items

ℹ️  Ingesting 5 orders...
✅ Successfully wrote 5 orders

✅ Data ingestion complete!

============================================================
  Complete!
============================================================

✅ Synthetic data has been populated successfully

ℹ️  You can now test the QSR ordering agent with realistic data
ℹ️  Customer: Sergio Barraza (cust-qsrcogni)
ℹ️  Locations: 15 locations
ℹ️  Menu Items: 165 items
ℹ️  Orders: 5 sample orders
```

## Verification

After deployment, verify data:

```bash
# Check Customers table
aws dynamodb scan --table-name <CustomersTableName> --max-items 5

# Check Locations table
aws dynamodb scan --table-name <LocationsTableName> --max-items 5

# Check Menu table
aws dynamodb query \
  --table-name <MenuTableName> \
  --key-condition-expression "begins_with(PK, :loc)" \
  --expression-attribute-values '{":loc":{"S":"LOCATION#loc-van-alstyne"}}'

# Check Orders table
aws dynamodb query \
  --table-name <OrdersTableName> \
  --key-condition-expression "PK = :pk" \
  --expression-attribute-values '{":pk":{"S":"CUSTOMER#cust-001"}}'
```

## Customization

To add more test data:
1. Edit JSON files in `populate-data/data/`
2. Redeploy CloudFormation stack
3. Lambda will update tables with new data

## Notes

- Data is idempotent (can be run multiple times)
- Existing records are overwritten
- Use for development/testing only
- Do NOT use in production
- Includes realistic Texas locations for route testing
- Customer emails are fake (example.com domain)


## Generated Data Structure

### 1. Locations Table (QSR-Locations)

Real locations from AWS Geo Places API:

```json
{
  "PK": "LOCATION#loc-pizza-place-abc12345",
  "locationId": "loc-pizza-place-abc12345",
  "placeId": "aws-geo-places-id",
  "name": "Pizza Place - McKinney",
  "businessName": "Pizza Place",
  "address": "123 Main St, McKinney, TX 75069",
  "street": "123 Main St",
  "city": "McKinney",
  "state": "TX",
  "zipCode": "75069",
  "country": "USA",
  "latitude": 33.1972,
  "longitude": -96.6397,
  "phone": "+1-555-0201",
  "hours": {
    "monday": { "open": "06:00", "close": "22:00" },
    "tuesday": { "open": "06:00", "close": "22:00" },
    "wednesday": { "open": "06:00", "close": "22:00" },
    "thursday": { "open": "06:00", "close": "22:00" },
    "friday": { "open": "06:00", "close": "23:00" },
    "saturday": { "open": "07:00", "close": "23:00" },
    "sunday": { "open": "07:00", "close": "22:00" }
  },
  "isActive": true,
  "createdAt": "2025-01-26T12:00:00Z"
}
```

### 2. Customers Table (QSR-Customers)

Customer profile from deployment parameters:

```json
{
  "PK": "CUSTOMER#cust-qsrcogni",
  "SK": "PROFILE",
  "customerId": "cust-qsrcogni",
  "name": "Sergio Barraza",
  "email": "sercast@amazon.com",
  "homeAddress": "123 Main St, Van Alstyne, TX 75495",
  "homeLatitude": 33.4127,
  "homeLongitude": -96.5837,
  "loyaltyTier": "Gold",
  "loyaltyPoints": 1250,
  "dietaryPreferences": [],
  "createdAt": "2025-01-26T12:00:00Z"
}
```

**Loyalty Tiers**: Bronze (0-499), Silver (500-999), Gold (1000-1999), Platinum (2000+)

### 3. Menu Table (QSR-Menu)

Same menu for all locations:

```json
{
  "PK": "LOCATION#loc-pizza-place-abc12345#ITEM#burger-classic",
  "locationId": "loc-pizza-place-abc12345",
  "itemId": "burger-classic",
  "name": "Classic Burger",
  "description": "Quarter pound beef patty with lettuce, tomato, onions, pickles",
  "price": 5.99,
  "category": ["burgers", "All Items"],
  "isAvailable": true,
  "isCombo": false,
  "availableCustomizations": [
    { "id": "no-onions", "name": "No Onions", "price": 0, "isRemoval": true },
    { "id": "extra-cheese", "name": "Extra Cheese", "price": 0.50, "isRemoval": false }
  ],
  "createdAt": "2025-01-26T12:00:00Z"
}
```

**Categories**: burgers, chicken, combos, sides, drinks, desserts (11 items total)

### 4. Orders Table (QSR-Orders)

Sample order history (5 orders):

```json
{
  "PK": "CUSTOMER#cust-qsrcogni",
  "SK": "ORDER#order-abc123#1737892800",
  "GSI1PK": "LOCATION#loc-pizza-place-abc12345",
  "GSI1SK": "ORDER#1737892800",
  "customerId": "cust-qsrcogni",
  "orderId": "order-abc123",
  "locationId": "loc-pizza-place-abc12345",
  "locationName": "Pizza Place - McKinney",
  "items": [
    {
      "itemId": "combo-burger",
      "name": "Burger Combo",
      "price": 8.99,
      "quantity": 1,
      "customizations": [
        { "id": "large-fries", "name": "Large Fries", "price": 1.00 }
      ]
    }
  ],
  "subtotal": 9.99,
  "tax": 0.80,
  "total": 10.79,
  "status": "completed",
  "estimatedReadyTime": "2025-01-15T18:45:00Z",
  "createdAt": "2025-01-15T18:30:00Z",
  "completedAt": "2025-01-15T18:50:00Z"
}
```

**Order Statuses**: completed (all generated orders)  
**Timestamps**: Random dates within past 30 days

## Troubleshooting

### AWS Geo Places API Errors

**Error**: `AccessDeniedException` or `UnrecognizedClientException`
- **Solution**: Ensure your AWS account has access to Geo Places API
- **Check**: Service is available in us-east-1 region
- **Verify**: AWS credentials are configured correctly

**Error**: No locations found
- **Solution**: Try a different business name or location
- **Tip**: Try common search terms like pizza, burgers, coffee, tacos, or sandwich
- **Tip**: Ensure you're in an area with commercial establishments

### DynamoDB Errors

**Error**: `ResourceNotFoundException`
- **Solution**: Deploy backend infrastructure first: `./deploy-all.sh`
- **Check**: Table names in deployment outputs

**Error**: `AccessDeniedException`
- **Solution**: Ensure AWS credentials have DynamoDB write permissions
- **Check**: IAM policy includes `dynamodb:PutItem` and `dynamodb:BatchWriteItem`

### Deployment Outputs Not Found

**Error**: `cdk-outputs/backend-infrastructure.json` not found
- **Solution**: Run `./deploy-all.sh` to deploy infrastructure
- **Check**: Outputs file exists in `cdk-outputs/` directory

### Geocoding Failures

**Error**: Address cannot be geocoded
- **Solution**: Use coordinates instead: `latitude, longitude`
- **Example**: `33.4127, -96.5837`
- **Tip**: Get coordinates from Google Maps

## Data Cleanup

To remove all synthetic data from DynamoDB tables, use the cleanup script:

```bash
python3 cleanup_data.py
```

The script will:
1. Show current item counts in all tables
2. Ask for confirmation before deletion
3. Scan and delete all items from:
   - QSR-Locations
   - QSR-Customers
   - QSR-Menu
   - QSR-Orders
4. Display deletion progress and results

**Warning**: This operation cannot be undone!

### Example Cleanup Session

```
============================================================
  QSR Ordering System - Cleanup Synthetic Data
============================================================

ℹ️  Loading deployment outputs...
✅ Deployment outputs loaded

============================================================
  Current Table Status
============================================================

Locations: 20 items in QSR-Locations
Customers: 1 items in QSR-Customers
Menu: 220 items in QSR-Menu
Orders: 5 items in QSR-Orders

⚠️  This will DELETE ALL DATA from the following tables:
⚠️    - QSR-Locations
⚠️    - QSR-Customers
⚠️    - QSR-Menu
⚠️    - QSR-Orders

⚠️  This operation CANNOT be undone!

Are you sure you want to proceed? (yes/no): yes

============================================================
  Deleting Data
============================================================

ℹ️  Cleaning QSR-Locations...
✅ Deleted 20 items

ℹ️  Cleaning QSR-Customers...
✅ Deleted 1 items

ℹ️  Cleaning QSR-Menu...
✅ Deleted 220 items

ℹ️  Cleaning QSR-Orders...
✅ Deleted 5 items

============================================================
  Cleanup Complete!
============================================================

✅ Successfully deleted 246 items

ℹ️  All synthetic data has been removed from DynamoDB tables
```

### Alternative: Manual Cleanup

You can also delete items manually using AWS CLI:

```bash
# Delete all items from tables (use with caution!)
aws dynamodb scan --table-name QSR-Locations --attributes-to-get PK \
  --query "Items[*].PK.S" --output text | \
  xargs -I {} aws dynamodb delete-item --table-name QSR-Locations --key '{"PK":{"S":"{}"}}'

# Repeat for other tables: QSR-Customers, QSR-Menu, QSR-Orders
```

Or redeploy the entire stack:

```bash
./cleanup-all.sh
./deploy-all.sh --user-email your@email.com --user-name "Your Name"
```

## Notes

- Data is idempotent (can be run multiple times)
- Existing records are overwritten
- Use for development/testing only
- Do NOT use in production
- Includes realistic locations from Geo Places API
- Customer data uses deployment parameters
- Menu is consistent across all locations
- Orders use nearby locations (within 10 miles of home)

## Future Enhancements

- [ ] Support for multiple customers
- [ ] Configurable menu items
- [ ] More order statuses (pending, preparing, etc.)
- [ ] Dietary preferences and restrictions
- [ ] Loyalty program transactions
- [ ] Peak hours and wait times
- [ ] Seasonal menu items
- [ ] Location-specific pricing
