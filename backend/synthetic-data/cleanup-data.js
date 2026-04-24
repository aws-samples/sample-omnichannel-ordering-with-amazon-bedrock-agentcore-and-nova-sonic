#!/usr/bin/env node
/**
 * Cleanup Script for Synthetic Data
 *
 * Removes all synthetic data from DynamoDB tables.
 *
 * Usage:
 *   node cleanup-data.js [--force]
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { DynamoDB } = require('./lib/dynamodb-client');

const C = {
  BLUE: '\x1b[34m', GREEN: '\x1b[32m', YELLOW: '\x1b[33m',
  RED: '\x1b[31m', CYAN: '\x1b[36m', NC: '\x1b[0m',
};

const header = (t) => console.log(`\n${C.BLUE}${'='.repeat(80)}${C.NC}\n${C.BLUE}  ${t}${C.NC}\n${C.BLUE}${'='.repeat(80)}${C.NC}\n`);
const ok = (t) => console.log(`${C.GREEN}✅ ${t}${C.NC}`);
const fail = (t) => console.log(`${C.RED}❌ ${t}${C.NC}`);
const warn = (t) => console.log(`${C.YELLOW}⚠️  ${t}${C.NC}`);
const info = (t) => console.log(`${C.CYAN}ℹ️  ${t}${C.NC}`);

let rl;
function ask(prompt) {
  if (!rl) rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(`${C.CYAN}${prompt}${C.NC}`, resolve));
}
function closeRl() { if (rl) { rl.close(); rl = null; } }

function loadDeploymentOutputs() {
  const outputsPath = path.join(__dirname, '..', '..', 'cdk-outputs', 'backend-infrastructure.json');
  if (!fs.existsSync(outputsPath)) { fail(`Deployment outputs not found at: ${outputsPath}`); return null; }
  try { return JSON.parse(fs.readFileSync(outputsPath, 'utf-8')); } catch (e) { fail(`Failed to load: ${e.message}`); return null; }
}

function extractTableNames(outputs) {
  const ddb = outputs['QSR-DynamoDBStack'] || {};
  const tables = { locations: ddb.LocationsTableName, customers: ddb.CustomersTableName, menu: ddb.MenuTableName, orders: ddb.OrdersTableName };
  if (!tables.locations || !tables.customers || !tables.menu || !tables.orders) { fail('Missing table names'); return null; }
  return tables;
}

async function main() {
  const force = process.argv.includes('--force');

  header('QSR Ordering System - Cleanup Synthetic Data');

  info('Loading deployment outputs...');
  const outputs = loadDeploymentOutputs();
  if (!outputs) return 1;

  const tableNames = extractTableNames(outputs);
  if (!tableNames) return 1;
  ok('Deployment outputs loaded');
  console.log();

  if (!force) {
    warn('This will DELETE ALL DATA from the following tables:');
    for (const name of Object.values(tableNames)) warn(`  - ${name}`);
    console.log();
    warn('This operation CANNOT be undone!');
    console.log();

    const choice = (await ask('Are you sure you want to proceed? (yes/no): ')).trim().toLowerCase();
    if (!['yes', 'y'].includes(choice)) { warn('Cleanup cancelled'); closeRl(); return 0; }
    console.log();
  }

  header('Deleting Data');
  const dynamodb = new DynamoDB();
  let totalDeleted = 0;
  let totalErrors = 0;

  for (const [type, name] of Object.entries(tableNames)) {
    info(`Cleaning ${name}...`);
    const result = await dynamodb.scanAndDeleteAll(name);
    if (result.errors > 0) fail(`Deleted ${result.deleted} items with ${result.errors} errors`);
    else ok(`Deleted ${result.deleted} items`);
    totalDeleted += result.deleted;
    totalErrors += result.errors;
    console.log();
  }

  header('Cleanup Complete!');
  if (totalErrors > 0) warn(`Deleted ${totalDeleted} items with ${totalErrors} errors`);
  else ok(`Successfully deleted ${totalDeleted} items`);
  console.log();
  info('All synthetic data has been removed from DynamoDB tables');
  console.log();

  closeRl();
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => { fail(`Unexpected error: ${err.message}`); console.error(err); closeRl(); process.exit(1); });
