#!/usr/bin/env python3
"""
Synthetic Data Population Script

Interactive CLI tool for populating DynamoDB tables with synthetic test data.
Queries AWS Geo Places API for real locations and generates realistic test data.

Usage:
    python populate_data.py
"""
import os
import sys
import json
from pathlib import Path
from typing import Dict, List, Tuple, Optional

# Add lib directory to path
sys.path.insert(0, str(Path(__file__).parent / 'lib'))

from validators import (
    validate_coordinates,
    validate_business_name,
    sanitize_location_id
)
from geo_places import GeoPlacesClient
from data_generator import DataGenerator
from dynamodb_client import DynamoDBClient


# Color codes for terminal output
class Colors:
    BLUE = '\033[0;34m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    RED = '\033[0;31m'
    CYAN = '\033[0;36m'
    NC = '\033[0m'  # No Color


def print_header(text: str):
    """Print section header."""
    print(f"\n{Colors.BLUE}{'=' * 80}{Colors.NC}")
    print(f"{Colors.BLUE}  {text}{Colors.NC}")
    print(f"{Colors.BLUE}{'=' * 80}{Colors.NC}\n")


def print_success(text: str):
    """Print success message."""
    print(f"{Colors.GREEN}✅ {text}{Colors.NC}")


def print_error(text: str):
    """Print error message."""
    print(f"{Colors.RED}❌ {text}{Colors.NC}")


def print_warning(text: str):
    """Print warning message."""
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.NC}")


def print_info(text: str):
    """Print info message."""
    print(f"{Colors.CYAN}ℹ️  {text}{Colors.NC}")


def load_deployment_outputs() -> Optional[Dict]:
    """
    Load deployment outputs from CDK.
    
    Returns:
        Deployment outputs dictionary or None if not found
    """
    outputs_path = Path(__file__).parent.parent.parent / 'cdk-outputs' / 'backend-infrastructure.json'
    
    if not outputs_path.exists():
        print_error(f"Deployment outputs not found at: {outputs_path}")
        print_info("Please deploy the backend infrastructure first using: ./deploy-all.sh")
        return None
    
    try:
        with open(outputs_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print_error(f"Failed to load deployment outputs: {e}")
        return None


def extract_customer_info(outputs: Dict) -> Optional[Tuple[str, str, str]]:
    """
    Extract customer ID, name, and email from deployment outputs.
    
    Args:
        outputs: Deployment outputs dictionary
        
    Returns:
        Tuple of (customer_id, name, email) or None if extraction fails
    """
    try:
        cognito_stack = outputs.get('QSR-CognitoStack', {})
        
        customer_id = cognito_stack.get('AppUserCustomerId')
        name = cognito_stack.get('AppUserName')
        email = cognito_stack.get('AppUserEmail')
        
        if not all([customer_id, name, email]):
            print_error("Missing customer information in deployment outputs")
            print_info("Expected: AppUserCustomerId, AppUserName, AppUserEmail")
            return None
        
        return (customer_id, name, email)
        
    except Exception as e:
        print_error(f"Failed to extract customer info: {e}")
        return None


def extract_table_names(outputs: Dict) -> Optional[Dict[str, str]]:
    """
    Extract DynamoDB table names from deployment outputs.
    
    Args:
        outputs: Deployment outputs dictionary
        
    Returns:
        Dictionary of table names or None if extraction fails
    """
    try:
        dynamodb_stack = outputs.get('QSR-DynamoDBStack', {})
        
        tables = {
            'locations': dynamodb_stack.get('LocationsTableName'),
            'customers': dynamodb_stack.get('CustomersTableName'),
            'menu': dynamodb_stack.get('MenuTableName'),
            'orders': dynamodb_stack.get('OrdersTableName')
        }
        
        if not all(tables.values()):
            print_error("Missing table names in deployment outputs")
            print_info("Expected: LocationsTableName, CustomersTableName, MenuTableName, OrdersTableName")
            return None
        
        return tables
        
    except Exception as e:
        print_error(f"Failed to extract table names: {e}")
        return None


def get_user_location() -> Optional[Tuple[float, float, str]]:
    """
    Prompt user for location (address or coordinates).
    
    Returns:
        Tuple of (latitude, longitude, address_string) or None
    """
    print_info("Enter a city name, zip code, or full address to find nearby locations")
    print_info("Examples:")
    print_info("  - City: Dallas")
    print_info("  - City, State: Dallas, Texas")
    print_info("  - Zip code: 75495")
    print_info("  - Full address: 123 Main St, Dallas, TX 75201")
    print_info("  - Coordinates: 33.4127, -96.5837")
    print()
    
    while True:
        user_input = input(f"{Colors.CYAN}Enter location (city, zip code, or address): {Colors.NC}").strip()
        
        if not user_input:
            print_warning("Input cannot be empty")
            continue
        
        # Try parsing as coordinates first
        is_valid, coords, error = validate_coordinates(user_input)
        if is_valid:
            print_success(f"Coordinates: {coords[0]}, {coords[1]}")
            return (coords[0], coords[1], f"{coords[0]}, {coords[1]}")
        
        # Try geocoding as address
        print_info("Geocoding address...")
        geo_client = GeoPlacesClient()
        coords = geo_client.geocode_address(user_input)
        
        if coords:
            print_success(f"Address geocoded to: {coords[0]}, {coords[1]}")
            return (coords[0], coords[1], user_input)
        else:
            print_error("Could not geocode address. Please try again or use coordinates.")
            print_info("Coordinate format: latitude, longitude (e.g., 33.4127, -96.5837)")


def get_business_name() -> str:
    """
    Prompt user for business name to search.
    
    Returns:
        Business name
    """
    print_info("Enter the name of a restaurant or business you want to search for")
    print_info("Examples: pizza, burgers, coffee shop, sandwich, tacos")
    print()
    
    while True:
        business_name = input(f"{Colors.CYAN}Enter restaurant or business name to search: {Colors.NC}").strip()
        
        is_valid, error = validate_business_name(business_name)
        if is_valid:
            return business_name
        else:
            print_error(error)


def search_locations(
    geo_client: GeoPlacesClient,
    latitude: float,
    longitude: float,
    business_name: str
) -> List[Dict]:
    """
    Search for locations using Geo Places API.
    
    Args:
        geo_client: Geo Places client
        latitude: Center latitude
        longitude: Center longitude
        business_name: Business name to search
        
    Returns:
        List of found places
    """
    print_info(f"Searching for '{business_name}' within 100 miles...")
    print_info("This may take a moment...")
    print()
    
    places = geo_client.search_nearby_places(
        latitude=latitude,
        longitude=longitude,
        business_name=business_name,
        radius_miles=100,
        max_results=20
    )
    
    if not places:
        print_warning("No locations found")
        return []
    
    print_success(f"Found {len(places)} locations")
    print()
    
    # Display found locations
    for i, place in enumerate(places, 1):
        distance = geo_client.format_distance(place['distance_meters'])
        print(f"  {i}. {place['title']}")
        print(f"     {place['address']['label']}")
        print(f"     Distance: {distance}")
        print()
    
    return places


def get_home_address(
    user_location: Tuple[float, float, str]
) -> Tuple[float, float, str]:
    """
    Prompt user for home address (or use same as search location).
    
    Args:
        user_location: User's search location (lat, lon, address)
        
    Returns:
        Tuple of (latitude, longitude, address_string)
    """
    print_info("Customer home address can be the same as your current location or different")
    print()
    
    while True:
        choice = input(f"{Colors.CYAN}Use same address for customer home? (yes/no): {Colors.NC}").strip().lower()
        
        if choice in ['yes', 'y']:
            print_success("Using same address for customer home")
            return user_location
        elif choice in ['no', 'n']:
            print()
            print_info("Enter customer home address")
            home_location = get_user_location()
            if home_location:
                return home_location
        else:
            print_warning("Please enter 'yes' or 'no'")


def save_to_json(data: Dict, filename: str, output_dir: Path):
    """
    Save data to JSON file.
    
    Args:
        data: Data to save
        filename: Output filename
        output_dir: Output directory
    """
    output_dir.mkdir(exist_ok=True)
    filepath = output_dir / filename
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, default=str)
    
    print_success(f"Saved to: {filepath}")


def display_summary(data: Dict):
    """
    Display summary of generated data.
    
    Args:
        data: Generated data dictionary
    """
    print_header("Generated Data Summary")
    
    print(f"{Colors.CYAN}Locations:{Colors.NC} {len(data['locations'])} locations")
    print(f"{Colors.CYAN}Customer:{Colors.NC} {data['customer']['name']} ({data['customer']['customerId']})")
    print(f"{Colors.CYAN}Menu Items:{Colors.NC} {len(data['menu'])} items per location")
    print(f"{Colors.CYAN}Orders:{Colors.NC} {len(data['orders'])} sample orders")
    print()


def confirm_ingestion() -> bool:
    """
    Ask user to confirm data ingestion.
    
    Returns:
        True if user confirms, False otherwise
    """
    print_info("Review the generated JSON files in the output/ directory")
    print()
    
    while True:
        choice = input(f"{Colors.CYAN}Ready to ingest data into DynamoDB? (yes/no): {Colors.NC}").strip().lower()
        
        if choice in ['yes', 'y']:
            return True
        elif choice in ['no', 'n']:
            return False
        else:
            print_warning("Please enter 'yes' or 'no'")


def ingest_data(
    dynamodb_client: DynamoDBClient,
    table_names: Dict[str, str],
    data: Dict
):
    """
    Ingest generated data into DynamoDB tables.
    
    Args:
        dynamodb_client: DynamoDB client
        table_names: Dictionary of table names
        data: Generated data dictionary
    """
    print_header("Ingesting Data into DynamoDB")
    
    # Verify tables exist
    print_info("Verifying tables exist...")
    for table_type, table_name in table_names.items():
        if not dynamodb_client.verify_table_exists(table_name):
            print_error(f"Table does not exist: {table_name}")
            return
    print_success("All tables verified")
    print()
    
    # Ingest locations
    print_info(f"Ingesting {len(data['locations'])} locations...")
    result = dynamodb_client.batch_write_items(table_names['locations'], data['locations'])
    if result['failed'] > 0:
        print_error(f"Failed to write {result['failed']} locations")
        for error in result['errors']:
            print_error(f"  {error['error_message']}")
    else:
        print_success(f"Successfully wrote {result['success']} locations")
    print()
    
    # Ingest customer
    print_info("Ingesting customer profile...")
    result = dynamodb_client.batch_write_items(table_names['customers'], [data['customer']])
    if result['failed'] > 0:
        print_error("Failed to write customer")
    else:
        print_success("Successfully wrote customer profile")
    print()
    
    # Ingest menu items
    print_info(f"Ingesting {len(data['menu'])} menu items...")
    result = dynamodb_client.batch_write_items(table_names['menu'], data['menu'])
    if result['failed'] > 0:
        print_error(f"Failed to write {result['failed']} menu items")
    else:
        print_success(f"Successfully wrote {result['success']} menu items")
    print()
    
    # Ingest orders
    print_info(f"Ingesting {len(data['orders'])} orders...")
    result = dynamodb_client.batch_write_items(table_names['orders'], data['orders'])
    if result['failed'] > 0:
        print_error(f"Failed to write {result['failed']} orders")
    else:
        print_success(f"Successfully wrote {result['success']} orders")
    print()
    
    print_success("Data ingestion complete!")


def main():
    """Main execution flow."""
    print_header("QSR Ordering System - Synthetic Data Population")
    
    # Step 1: Load deployment outputs
    print_info("Loading deployment outputs...")
    outputs = load_deployment_outputs()
    if not outputs:
        return 1
    
    customer_info = extract_customer_info(outputs)
    if not customer_info:
        return 1
    
    customer_id, customer_name, customer_email = customer_info
    print_success(f"Customer: {customer_name} ({customer_id})")
    
    table_names = extract_table_names(outputs)
    if not table_names:
        return 1
    
    print_success("Deployment outputs loaded")
    print()
    
    # Step 2: Get user location
    print_header("Step 1: Location Input")
    user_location = get_user_location()
    if not user_location:
        return 1
    
    user_lat, user_lon, user_address = user_location
    print()
    
    # Step 3: Get business name
    print_header("Step 2: Business Name")
    business_name = get_business_name()
    print()
    
    # Step 4: Search for locations
    print_header("Step 3: Location Discovery")
    geo_client = GeoPlacesClient()
    places = search_locations(geo_client, user_lat, user_lon, business_name)
    
    if not places:
        print_error("No locations found. Try a different business name or location.")
        return 1
    
    # Step 5: Get home address
    print_header("Step 4: Customer Home Address")
    home_location = get_home_address(user_location)
    home_lat, home_lon, home_address = home_location
    print()
    
    # Step 6: Generate data
    print_header("Step 5: Generating Synthetic Data")
    
    generator = DataGenerator()
    
    # Generate locations
    print_info("Generating location records...")
    locations = []
    for place in places:
        location_id = sanitize_location_id(place['place_id'], business_name)
        location_data = generator.generate_location_data(place, business_name, location_id)
        locations.append(location_data)
    print_success(f"Generated {len(locations)} location records")
    
    # Generate customer
    print_info("Generating customer profile...")
    customer = generator.generate_customer_data(
        customer_id=customer_id,
        name=customer_name,
        email=customer_email,
        home_address=home_address,
        home_coordinates=(home_lat, home_lon)
    )
    print_success("Generated customer profile")
    
    # Generate menu items for all locations
    print_info("Generating menu items...")
    menu_items = []
    for location in locations:
        location_menu = generator.generate_menu_items(location['locationId'])
        menu_items.extend(location_menu)
    print_success(f"Generated {len(menu_items)} menu items ({len(menu_items) // len(locations)} per location)")
    
    # Generate orders (use locations within 10 miles for orders)
    print_info("Generating sample orders...")
    nearby_locations = [loc for loc in locations if loc.get('distance_meters', 0) < 16093]  # 10 miles
    if not nearby_locations:
        nearby_locations = locations[:3]  # Use first 3 if none within 10 miles
    
    orders = generator.generate_orders(
        customer_id=customer_id,
        nearby_locations=nearby_locations,
        num_orders=5
    )
    print_success(f"Generated {len(orders)} sample orders")
    print()
    
    # Step 7: Save to JSON files
    print_header("Step 6: Saving to Local Files")
    
    output_dir = Path(__file__).parent / 'output'
    
    data = {
        'locations': locations,
        'customer': customer,
        'menu': menu_items,
        'orders': orders
    }
    
    save_to_json(locations, 'locations.json', output_dir)
    save_to_json([customer], 'customer.json', output_dir)
    save_to_json(menu_items, 'menu.json', output_dir)
    save_to_json(orders, 'orders.json', output_dir)
    print()
    
    # Display summary
    display_summary(data)
    
    # Step 8: Confirm and ingest
    print_header("Step 7: DynamoDB Ingestion")
    
    if not confirm_ingestion():
        print_warning("Data ingestion cancelled")
        print_info("Generated files are saved in: output/")
        print_info("Run this script again to ingest the data")
        return 0
    
    print()
    
    # Ingest data
    dynamodb_client = DynamoDBClient()
    ingest_data(dynamodb_client, table_names, data)
    
    # Final summary
    print_header("Complete!")
    print_success("Synthetic data has been populated successfully")
    print()
    print_info("You can now test the QSR ordering agent with realistic data")
    print_info(f"Customer: {customer_name} ({customer_id})")
    print_info(f"Locations: {len(locations)} {business_name} locations")
    print_info(f"Menu Items: {len(menu_items)} items")
    print_info(f"Orders: {len(orders)} sample orders")
    print()
    
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print()
        print_warning("Interrupted by user")
        sys.exit(1)
    except Exception as e:
        print_error(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
