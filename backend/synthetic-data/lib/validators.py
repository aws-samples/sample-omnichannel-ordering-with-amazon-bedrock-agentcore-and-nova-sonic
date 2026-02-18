"""
Input validation utilities for synthetic data generation.
"""
import re
from typing import Tuple, Optional
from email_validator import validate_email, EmailNotValidError


def validate_coordinates(input_str: str) -> Tuple[bool, Optional[Tuple[float, float]], str]:
    """
    Validate and parse coordinate input.
    
    Accepts formats:
    - "lat, long" (e.g., "33.4127, -96.5837")
    - "lat,long" (no space)
    
    Args:
        input_str: User input string
        
    Returns:
        Tuple of (is_valid, (latitude, longitude) or None, error_message)
    """
    input_str = input_str.strip()
    
    # Try to parse as coordinates
    coord_pattern = r'^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$'
    match = re.match(coord_pattern, input_str)
    
    if match:
        try:
            lat = float(match.group(1))
            lon = float(match.group(2))
            
            # Validate ranges
            if not (-90 <= lat <= 90):
                return False, None, f"Latitude must be between -90 and 90 (got {lat})"
            if not (-180 <= lon <= 180):
                return False, None, f"Longitude must be between -180 and 180 (got {lon})"
            
            return True, (lat, lon), ""
        except ValueError as e:
            return False, None, f"Invalid coordinate format: {e}"
    
    return False, None, "Invalid format. Use: latitude, longitude (e.g., 33.4127, -96.5837)"


def validate_email_address(email: str) -> Tuple[bool, str]:
    """
    Validate email address format.
    
    Args:
        email: Email address to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        # Validate and normalize
        valid = validate_email(email, check_deliverability=False)
        return True, ""
    except EmailNotValidError as e:
        return False, str(e)


def validate_customer_id(customer_id: str) -> Tuple[bool, str]:
    """
    Validate customer ID format.
    
    Expected format: cust-{alphanumeric}
    
    Args:
        customer_id: Customer ID to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    pattern = r'^cust-[a-zA-Z0-9]+$'
    if re.match(pattern, customer_id):
        return True, ""
    return False, "Customer ID must match format: cust-{alphanumeric}"


def validate_business_name(name: str) -> Tuple[bool, str]:
    """
    Validate business name input.
    
    Args:
        name: Business name to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    name = name.strip()
    if len(name) < 2:
        return False, "Business name must be at least 2 characters"
    if len(name) > 100:
        return False, "Business name must be less than 100 characters"
    return True, ""


def sanitize_location_id(place_id: str, business_name: str) -> str:
    """
    Generate a clean location ID from place ID or business name.
    
    Args:
        place_id: AWS Geo Places place ID
        business_name: Business name
        
    Returns:
        Sanitized location ID (e.g., "loc-pizza-place-12345")
    """
    # Use last 8 chars of place_id as unique suffix
    suffix = place_id[-8:] if len(place_id) >= 8 else place_id
    
    # Sanitize business name
    clean_name = business_name.lower()
    clean_name = re.sub(r'[^a-z0-9]+', '-', clean_name)
    clean_name = clean_name.strip('-')
    
    # Limit length
    if len(clean_name) > 30:
        clean_name = clean_name[:30].rstrip('-')
    
    return f"loc-{clean_name}-{suffix}"
