"""
Synthetic data generation for DynamoDB tables.

Security Note: This module uses Python's `random` module for generating test data.
The `random` module is appropriate for this use case (synthetic data generation)
and is NOT used for cryptographic purposes. For cryptographic operations, use
the `secrets` module instead.
"""
import random  # Used for test data generation, not cryptography
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Any


class DataGenerator:
    """Generate synthetic data for QSR ordering system."""
    
    # Sample menu data structure
    MENU_CATEGORIES = {
        'burgers': [
            {
                'itemId': 'burger-classic',
                'name': 'Classic Burger',
                'description': 'Quarter pound beef patty with lettuce, tomato, onions, pickles',
                'price': 5.99,
                'customizations': [
                    {'id': 'no-onions', 'name': 'No Onions', 'price': 0, 'isRemoval': True},
                    {'id': 'no-pickles', 'name': 'No Pickles', 'price': 0, 'isRemoval': True},
                    {'id': 'extra-cheese', 'name': 'Extra Cheese', 'price': 0.50, 'isRemoval': False},
                    {'id': 'bacon', 'name': 'Add Bacon', 'price': 1.50, 'isRemoval': False}
                ]
            },
            {
                'itemId': 'burger-deluxe',
                'name': 'Deluxe Burger',
                'description': 'Half pound beef patty with premium toppings',
                'price': 8.99,
                'customizations': [
                    {'id': 'no-onions', 'name': 'No Onions', 'price': 0, 'isRemoval': True},
                    {'id': 'extra-cheese', 'name': 'Extra Cheese', 'price': 0.50, 'isRemoval': False}
                ]
            }
        ],
        'chicken': [
            {
                'itemId': 'chicken-sandwich',
                'name': 'Chicken Sandwich',
                'description': 'Crispy or grilled chicken breast with lettuce and mayo',
                'price': 6.49,
                'customizations': [
                    {'id': 'grilled', 'name': 'Grilled Chicken', 'price': 0, 'isRemoval': False},
                    {'id': 'spicy', 'name': 'Spicy', 'price': 0, 'isRemoval': False},
                    {'id': 'no-mayo', 'name': 'No Mayo', 'price': 0, 'isRemoval': True}
                ]
            },
            {
                'itemId': 'chicken-tenders',
                'name': 'Chicken Tenders',
                'description': '4 piece crispy chicken tenders',
                'price': 7.99,
                'customizations': []
            }
        ],
        'combos': [
            {
                'itemId': 'combo-burger',
                'name': 'Burger Combo',
                'description': 'Classic burger with fries and drink',
                'price': 8.99,
                'customizations': [
                    {'id': 'large-fries', 'name': 'Large Fries', 'price': 1.00, 'isRemoval': False},
                    {'id': 'large-drink', 'name': 'Large Drink', 'price': 0.50, 'isRemoval': False}
                ]
            },
            {
                'itemId': 'combo-chicken',
                'name': 'Chicken Combo',
                'description': 'Chicken sandwich with fries and drink',
                'price': 9.49,
                'customizations': [
                    {'id': 'grilled', 'name': 'Grilled Chicken', 'price': 0, 'isRemoval': False}
                ]
            }
        ],
        'sides': [
            {
                'itemId': 'fries',
                'name': 'French Fries',
                'description': 'Crispy golden fries',
                'price': 2.99,
                'customizations': []
            },
            {
                'itemId': 'onion-rings',
                'name': 'Onion Rings',
                'description': 'Crispy battered onion rings',
                'price': 3.49,
                'customizations': []
            }
        ],
        'drinks': [
            {
                'itemId': 'soda',
                'name': 'Fountain Drink',
                'description': 'Choice of Coke, Sprite, or Dr Pepper',
                'price': 1.99,
                'customizations': []
            },
            {
                'itemId': 'shake',
                'name': 'Milkshake',
                'description': 'Vanilla, chocolate, or strawberry',
                'price': 3.99,
                'customizations': []
            }
        ],
        'desserts': [
            {
                'itemId': 'ice-cream',
                'name': 'Ice Cream Cone',
                'description': 'Soft serve vanilla or chocolate',
                'price': 1.99,
                'customizations': []
            }
        ]
    }
    
    @staticmethod
    def generate_location_data(place: Dict, business_name: str, location_id: str) -> Dict[str, Any]:
        """
        Generate DynamoDB location record from Geo Places result.
        
        Args:
            place: Place data from Geo Places API
            business_name: Business name
            location_id: Generated location ID
            
        Returns:
            DynamoDB location record
        """
        address = place['address']
        coords = place['coordinates']
        
        # Generate synthetic phone number
        phone = f"+1-{random.randint(200, 999)}-{random.randint(200, 999)}-{random.randint(1000, 9999)}"
        
        # Generate business hours (6 AM - 10 PM weekdays, 7 AM - 11 PM weekends)
        hours = {
            'monday': {'open': '06:00', 'close': '22:00'},
            'tuesday': {'open': '06:00', 'close': '22:00'},
            'wednesday': {'open': '06:00', 'close': '22:00'},
            'thursday': {'open': '06:00', 'close': '22:00'},
            'friday': {'open': '06:00', 'close': '23:00'},
            'saturday': {'open': '07:00', 'close': '23:00'},
            'sunday': {'open': '07:00', 'close': '22:00'}
        }
        
        return {
            'PK': f'LOCATION#{location_id}',
            'locationId': location_id,
            'placeId': place['place_id'],
            'name': place['title'],
            'businessName': business_name,
            'address': address['label'],
            'street': address['street'],
            'city': address['city'],
            'state': address['state'],
            'zipCode': address['postal_code'],
            'country': address['country'],
            'latitude': coords['latitude'],
            'longitude': coords['longitude'],
            'phone': phone,
            'hours': hours,
            'isActive': True,
            'createdAt': datetime.utcnow().isoformat() + 'Z'
        }
    
    @staticmethod
    def generate_customer_data(
        customer_id: str,
        name: str,
        email: str,
        home_address: str,
        home_coordinates: tuple
    ) -> Dict[str, Any]:
        """
        Generate DynamoDB customer record.
        
        Args:
            customer_id: Customer ID from Cognito
            name: Customer name
            email: Customer email
            home_address: Home address
            home_coordinates: (latitude, longitude)
            
        Returns:
            DynamoDB customer record
        """
        # Generate random loyalty tier and points
        loyalty_tiers = [
            ('Bronze', random.randint(0, 499)),
            ('Silver', random.randint(500, 999)),
            ('Gold', random.randint(1000, 1999)),
            ('Platinum', random.randint(2000, 5000))
        ]
        tier, points = random.choice(loyalty_tiers)
        
        return {
            'PK': f'CUSTOMER#{customer_id}',
            'SK': 'PROFILE',
            'customerId': customer_id,
            'name': name,
            'email': email,
            'homeAddress': home_address,
            'homeLatitude': home_coordinates[0],
            'homeLongitude': home_coordinates[1],
            'loyaltyTier': tier,
            'loyaltyPoints': points,
            'dietaryPreferences': [],
            'createdAt': datetime.utcnow().isoformat() + 'Z'
        }
    
    @staticmethod
    def generate_menu_items(location_id: str) -> List[Dict[str, Any]]:
        """
        Generate menu items for a location.
        
        Args:
            location_id: Location ID
            
        Returns:
            List of DynamoDB menu item records
        """
        menu_items = []
        
        for category, items in DataGenerator.MENU_CATEGORIES.items():
            for item in items:
                menu_item = {
                    'PK': f'LOCATION#{location_id}#ITEM#{item["itemId"]}',
                    'locationId': location_id,
                    'itemId': item['itemId'],
                    'name': item['name'],
                    'description': item['description'],
                    'price': item['price'],
                    'category': [category, 'All Items'],
                    'isAvailable': True,
                    'isCombo': 'combo' in category,
                    'availableCustomizations': item['customizations'],
                    'createdAt': datetime.utcnow().isoformat() + 'Z'
                }
                menu_items.append(menu_item)
        
        return menu_items
    
    @staticmethod
    def generate_orders(
        customer_id: str,
        nearby_locations: List[Dict],
        num_orders: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Generate sample orders for a customer.
        
        Args:
            customer_id: Customer ID
            nearby_locations: List of nearby location records
            num_orders: Number of orders to generate
            
        Returns:
            List of DynamoDB order records
        """
        if not nearby_locations:
            return []
        
        orders = []
        
        # Get all menu items (flatten categories)
        all_items = []
        for category_items in DataGenerator.MENU_CATEGORIES.values():
            all_items.extend(category_items)
        
        for i in range(num_orders):
            # Random location from nearby locations
            location = random.choice(nearby_locations)
            location_id = location['locationId']
            location_name = location['name']
            
            # Random timestamp in past 30 days
            days_ago = random.randint(1, 30)
            hours_ago = random.randint(0, 23)
            order_time = datetime.utcnow() - timedelta(days=days_ago, hours=hours_ago)
            
            # Generate order ID
            order_id = f'order-{uuid.uuid4().hex[:12]}'
            
            # Random 1-3 items
            num_items = random.randint(1, 3)
            order_items = []
            subtotal = 0.0
            
            for _ in range(num_items):
                item = random.choice(all_items)
                
                # Random customizations (0-2)
                selected_customizations = []
                if item['customizations']:
                    num_custom = random.randint(0, min(2, len(item['customizations'])))
                    selected_customizations = random.sample(item['customizations'], num_custom)
                
                # Calculate item price with customizations
                item_price = item['price']
                for custom in selected_customizations:
                    item_price += custom['price']
                
                order_items.append({
                    'itemId': item['itemId'],
                    'name': item['name'],
                    'price': item['price'],
                    'quantity': 1,
                    'customizations': selected_customizations
                })
                
                subtotal += item_price
            
            # Calculate tax (8% for Texas)
            tax = round(subtotal * 0.08, 2)
            total = round(subtotal + tax, 2)
            
            # Order timestamps
            created_at = order_time.isoformat() + 'Z'
            ready_time = (order_time + timedelta(minutes=15)).isoformat() + 'Z'
            completed_time = (order_time + timedelta(minutes=20)).isoformat() + 'Z'
            
            order = {
                'PK': f'CUSTOMER#{customer_id}',
                'SK': f'ORDER#{order_id}#{int(order_time.timestamp())}',
                'GSI1PK': f'LOCATION#{location_id}',
                'GSI1SK': f'ORDER#{int(order_time.timestamp())}',
                'customerId': customer_id,
                'orderId': order_id,
                'locationId': location_id,
                'locationName': location_name,
                'items': order_items,
                'subtotal': subtotal,
                'tax': tax,
                'total': total,
                'status': 'completed',
                'estimatedReadyTime': ready_time,
                'createdAt': created_at,
                'completedAt': completed_time
            }
            
            orders.append(order)
        
        return orders
