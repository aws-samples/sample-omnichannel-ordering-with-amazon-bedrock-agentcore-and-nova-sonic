#!/usr/bin/env node
/**
 * Synthetic Data Population Script
 *
 * Interactive CLI tool for populating DynamoDB tables with synthetic test data.
 * Queries AWS Geo Places API for real locations and generates realistic test data.
 *
 * Usage:
 *   node populate-data.js [--company-name "Burger Palace"]
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { validateCoordinates, validateBusinessName, sanitizeLocationId } = require('./lib/validators');
const { GeoPlaces } = require('./lib/geo-places');
const { generateLocationData, generateCustomerData, generateMenuItems, generateOrders } = require('./lib/data-generator');
const { DynamoDB } = require('./lib/dynamodb-client');

// ── Colors ──
const C = {
  BLUE: '\x1b[34m', GREEN: '\x1b[32m', YELLOW: '\x1b[33m',
  RED: '\x1b[31m', CYAN: '\x1b[36m', NC: '\x1b[0m',
};

const header = (t) => console.log(`\n${C.BLUE}${'='.repeat(80)}${C.NC}\n${C.BLUE}  ${t}${C.NC}\n${C.BLUE}${'='.repeat(80)}${C.NC}\n`);
const ok = (t) => console.log(`${C.GREEN}✅ ${t}${C.NC}`);
const fail = (t) => console.log(`${C.RED}❌ ${t}${C.NC}`);
const warn = (t) => console.log(`${C.YELLOW}⚠️  ${t}${C.NC}`);
const info = (t) => console.log(`${C.CYAN}ℹ️  ${t}${C.NC}`);

// ── Readline helper ──
let rl;
function ask(prompt) {
  if (!rl) rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(`${C.CYAN}${prompt}${C.NC}`, resolve));
}
function closeRl() { if (rl) { rl.close(); rl = null; } }

// ── Parse CLI args ──
function parseArgs() {
  const args = process.argv.slice(2);
  let companyName = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--company-name' && args[i + 1]) { companyName = args[i + 1]; i++; }
  }
  return { companyName: companyName.trim() };
}

// ── Load CDK outputs ──
function loadDeploymentOutputs() {
  const outputsPath = path.join(__dirname, '..', '..', 'cdk-outputs', 'backend-infrastructure.json');
  if (!fs.existsSync(outputsPath)) { fail(`Deployment outputs not found at: ${outputsPath}`); info('Please deploy the backend infrastructure first using: ./deploy-all.sh'); return null; }
  try { return JSON.parse(fs.readFileSync(outputsPath, 'utf-8')); } catch (e) { fail(`Failed to load deployment outputs: ${e.message}`); return null; }
}

function extractCustomerInfo(outputs) {
  const cog = outputs['QSR-CognitoStack'] || {};
  const id = cog.AppUserCustomerId, name = cog.AppUserName, email = cog.AppUserEmail;
  if (!id || !name || !email) { fail('Missing customer information in deployment outputs'); return null; }
  return { id, name, email };
}

function extractTableNames(outputs) {
  const ddb = outputs['QSR-DynamoDBStack'] || {};
  const tables = { locations: ddb.LocationsTableName, customers: ddb.CustomersTableName, menu: ddb.MenuTableName, orders: ddb.OrdersTableName };
  if (!tables.locations || !tables.customers || !tables.menu || !tables.orders) { fail('Missing table names in deployment outputs'); return null; }
  return tables;
}

// ── Interactive prompts ──
async function getUserLocation(geoClient) {
  info('Enter a city name, zip code, or full address to find nearby locations');
  info('Examples:');
  info('  - City: Dallas');
  info('  - City, State: Dallas, Texas');
  info('  - Zip code: 75495');
  info('  - Full address: 123 Main St, Dallas, TX 75201');
  info('  - Coordinates: 33.4127, -96.5837');
  console.log();

  while (true) {
    const input = (await ask('Enter location (city, zip code, or address): ')).trim();
    if (!input) { warn('Input cannot be empty'); continue; }

    const { isValid, coords } = validateCoordinates(input);
    if (isValid) { ok(`Coordinates: ${coords[0]}, ${coords[1]}`); return { lat: coords[0], lon: coords[1], address: `${coords[0]}, ${coords[1]}` }; }

    info('Geocoding address...');
    const result = await geoClient.geocodeAddress(input);
    if (result) { ok(`Address geocoded to: ${result[0]}, ${result[1]}`); return { lat: result[0], lon: result[1], address: input }; }

    fail('Could not geocode address. Please try again or use coordinates.');
    info('Coordinate format: latitude, longitude (e.g., 33.4127, -96.5837)');
  }
}

async function getBusinessName() {
  info('Enter the name of a restaurant or business you want to search for');
  info('Examples: pizza, burgers, coffee shop, sandwich, tacos');
  console.log();

  while (true) {
    const name = (await ask('Enter restaurant or business name to search: ')).trim();
    const { isValid, error } = validateBusinessName(name);
    if (isValid) return name;
    fail(error);
  }
}

async function getHomeAddress(geoClient, userLocation) {
  info('Customer home address can be the same as your current location or different');
  console.log();

  while (true) {
    const choice = (await ask('Use same address for customer home? (yes/no): ')).trim().toLowerCase();
    if (['yes', 'y'].includes(choice)) { ok('Using same address for customer home'); return userLocation; }
    if (['no', 'n'].includes(choice)) { console.log(); info('Enter customer home address'); return getUserLocation(geoClient); }
    warn("Please enter 'yes' or 'no'");
  }
}

async function confirmYesNo(prompt) {
  while (true) {
    const choice = (await ask(`${prompt} (yes/no): `)).trim().toLowerCase();
    if (['yes', 'y'].includes(choice)) return true;
    if (['no', 'n'].includes(choice)) return false;
    warn("Please enter 'yes' or 'no'");
  }
}

function saveToJson(data, filename, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  ok(`Saved to: ${filepath}`);
}

async function ingestData(dynamodb, tableNames, data) {
  header('Ingesting Data into DynamoDB');

  info('Verifying tables exist...');
  for (const [type, name] of Object.entries(tableNames)) {
    if (!(await dynamodb.verifyTableExists(name))) { fail(`Table does not exist: ${name}`); return; }
  }
  ok('All tables verified');
  console.log();

  const datasets = [
    { label: `${data.locations.length} locations`, table: tableNames.locations, items: data.locations },
    { label: 'customer profile', table: tableNames.customers, items: [data.customer] },
    { label: `${data.menu.length} menu items`, table: tableNames.menu, items: data.menu },
    { label: `${data.orders.length} orders`, table: tableNames.orders, items: data.orders },
  ];

  for (const { label, table, items } of datasets) {
    info(`Ingesting ${label}...`);
    const result = await dynamodb.batchWriteItems(table, items);
    if (result.failed > 0) { fail(`Failed to write ${result.failed} items`); result.errors.forEach((e) => fail(`  ${e.error_message}`)); }
    else ok(`Successfully wrote ${result.success} items`);
    console.log();
  }

  ok('Data ingestion complete!');
}

// ── Main ──
async function main() {
  const { companyName } = parseArgs();

  header('QSR Ordering System - Synthetic Data Population');

  // Step 1: Load deployment outputs
  info('Loading deployment outputs...');
  const outputs = loadDeploymentOutputs();
  if (!outputs) return 1;

  const customer = extractCustomerInfo(outputs);
  if (!customer) return 1;
  ok(`Customer: ${customer.name} (${customer.id})`);

  const tableNames = extractTableNames(outputs);
  if (!tableNames) return 1;
  ok('Deployment outputs loaded');
  console.log();

  // Step 2: Get user location
  header('Step 1: Location Input');
  const geoClient = new GeoPlaces();
  const userLocation = await getUserLocation(geoClient);
  console.log();

  // Step 3: Get business name
  header('Step 2: Business Name');
  const businessName = await getBusinessName();
  console.log();

  // Step 4: Search for locations
  header('Step 3: Location Discovery');
  info(`Searching for '${businessName}' within 100 miles...`);
  info('This may take a moment...');
  console.log();

  const places = await geoClient.searchNearbyPlaces(userLocation.lat, userLocation.lon, businessName, 100, 50);
  if (!places.length) { fail('No locations found. Try a different business name or location.'); return 1; }

  ok(`Found ${places.length} locations`);
  console.log();
  places.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.title}`);
    console.log(`     ${p.address.label}`);
    console.log(`     Distance: ${geoClient.formatDistance(p.distance_meters)}`);
    console.log();
  });

  // Ask about rebranding
  let displayName = businessName;
  if (companyName && companyName.toLowerCase() !== businessName.toLowerCase()) {
    console.log();
    info(`Found ${places.length} '${businessName}' locations.`);
    info(`Company name from deployment: '${companyName}'`);
    if (await confirmYesNo(`Rename locations to '${companyName}' branding?`)) {
      displayName = companyName;
      ok(`Locations will be branded as '${companyName}'`);
    } else {
      info(`Keeping original name: '${businessName}'`);
    }
  }
  console.log();

  // Step 5: Get home address
  header('Step 4: Customer Home Address');
  const homeLocation = await getHomeAddress(geoClient, userLocation);
  console.log();

  // Step 6: Generate data
  header('Step 5: Generating Synthetic Data');

  info('Generating location records...');
  const locations = places.map((place) => {
    const locId = sanitizeLocationId(place.place_id, displayName);
    const locData = generateLocationData(place, displayName, locId);
    if (displayName !== businessName) {
      const city = locData.city || '';
      locData.name = city ? `${displayName} - ${city}` : displayName;
    }
    return locData;
  });
  ok(`Generated ${locations.length} location records`);

  info('Generating customer profile...');
  const customerData = generateCustomerData(customer.id, customer.name, customer.email, homeLocation.address, [homeLocation.lat, homeLocation.lon]);
  ok('Generated customer profile');

  info('Generating menu items...');
  const menuItems = locations.flatMap((loc) => generateMenuItems(loc.locationId));
  ok(`Generated ${menuItems.length} menu items (${Math.floor(menuItems.length / locations.length)} per location)`);

  info('Generating sample orders...');
  const nearbyLocations = locations.filter((l) => (l.distance_meters || 0) < 16093);
  const ordersLocations = nearbyLocations.length ? nearbyLocations : locations.slice(0, 3);
  const orders = generateOrders(customer.id, ordersLocations, 5);
  ok(`Generated ${orders.length} sample orders`);
  console.log();

  // Step 7: Save to JSON files
  header('Step 6: Saving to Local Files');
  const outputDir = path.join(__dirname, 'output');
  saveToJson(locations, 'locations.json', outputDir);
  saveToJson([customerData], 'customer.json', outputDir);
  saveToJson(menuItems, 'menu.json', outputDir);
  saveToJson(orders, 'orders.json', outputDir);
  console.log();

  // Display summary
  header('Generated Data Summary');
  console.log(`${C.CYAN}Locations:${C.NC} ${locations.length} locations`);
  console.log(`${C.CYAN}Customer:${C.NC} ${customerData.name} (${customerData.customerId})`);
  console.log(`${C.CYAN}Menu Items:${C.NC} ${menuItems.length} items`);
  console.log(`${C.CYAN}Orders:${C.NC} ${orders.length} sample orders`);
  console.log();

  // Step 8: Confirm and ingest
  header('Step 7: DynamoDB Ingestion');
  info('Review the generated JSON files in the output/ directory');
  console.log();

  if (!(await confirmYesNo('Ready to ingest data into DynamoDB?'))) {
    warn('Data ingestion cancelled');
    info('Generated files are saved in: output/');
    info('Run this script again to ingest the data');
    closeRl();
    return 0;
  }
  console.log();

  const dynamodb = new DynamoDB();
  await ingestData(dynamodb, tableNames, { locations, customer: customerData, menu: menuItems, orders });

  // Final summary
  header('Complete!');
  ok('Synthetic data has been populated successfully');
  console.log();
  info('You can now test the QSR ordering agent with realistic data');
  info(`Customer: ${customer.name} (${customer.id})`);
  info(`Locations: ${locations.length} ${displayName} locations`);
  info(`Menu Items: ${menuItems.length} items`);
  info(`Orders: ${orders.length} sample orders`);
  console.log();

  closeRl();
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => { fail(`Unexpected error: ${err.message}`); console.error(err); closeRl(); process.exit(1); });
