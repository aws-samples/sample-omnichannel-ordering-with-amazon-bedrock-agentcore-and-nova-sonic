"""
AWS Geo Places API integration for location discovery.
"""
import boto3
from typing import List, Dict, Tuple, Optional
from botocore.exceptions import ClientError


class GeoPlacesClient:
    """Client for AWS Geo Places API operations."""
    
    def __init__(self, region: str = 'us-east-1'):
        """
        Initialize Geo Places client.
        
        Args:
            region: AWS region
        """
        self.client = boto3.client('geo-places', region_name=region)
        self.region = region
    
    def geocode_address(self, address: str) -> Optional[Tuple[float, float]]:
        """
        Convert address to coordinates using geocoding.
        
        Args:
            address: Full address string
            
        Returns:
            Tuple of (latitude, longitude) or None if geocoding fails
        """
        try:
            # Use search_text without filters for geocoding
            # BiasPosition is not required for simple geocoding
            response = self.client.search_text(
                QueryText=address,
                MaxResults=1,
                # Use a default bias position (center of US) to satisfy API requirements
                BiasPosition=[-98.5795, 39.8283]  # Geographic center of contiguous US
            )
            
            if response.get('ResultItems') and len(response['ResultItems']) > 0:
                result = response['ResultItems'][0]
                position = result.get('Position')
                if position and len(position) >= 2:
                    # AWS returns [longitude, latitude]
                    return (position[1], position[0])
            
            return None
            
        except ClientError as e:
            print(f"❌ Geocoding error: {e}")
            return None
        except Exception as e:
            print(f"❌ Unexpected geocoding error: {e}")
            return None
    
    def search_nearby_places(
        self,
        latitude: float,
        longitude: float,
        business_name: str,
        radius_miles: int = 60,
        max_results: int = 20
    ) -> List[Dict]:
        """
        Search for places near coordinates.
        
        Args:
            latitude: Center point latitude
            longitude: Center point longitude
            business_name: Business name to search for
            radius_miles: Search radius in miles (default: 60)
            max_results: Maximum number of results (default: 20)
            
        Returns:
            List of place dictionaries with location data
        """
        # Convert miles to meters (1 mile = 1609.34 meters)
        radius_meters = int(radius_miles * 1609.34)
        
        try:
            # Use SearchText API with Circle filter only (not BiasPosition)
            # According to AWS docs, use exactly one of: BiasPosition, BoundingBox, or Circle
            response = self.client.search_text(
                QueryText=business_name,
                Filter={
                    'Circle': {
                        'Center': [longitude, latitude],  # AWS expects [lon, lat]
                        'Radius': radius_meters
                    }
                },
                MaxResults=max_results
            )
            
            places = []
            for item in response.get('ResultItems', []):
                place = self._parse_place_result(item, latitude, longitude)
                if place:
                    places.append(place)
            
            return places
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_msg = e.response.get('Error', {}).get('Message', str(e))
            print(f"❌ AWS Geo Places API error ({error_code}): {error_msg}")
            return []
        except Exception as e:
            print(f"❌ Unexpected error searching places: {e}")
            return []
    
    def _parse_place_result(self, item: Dict, center_lat: float = None, center_lon: float = None) -> Optional[Dict]:
        """
        Parse a place result item into standardized format.
        
        Args:
            item: Result item from AWS Geo Places API
            center_lat: Center latitude for distance calculation (optional)
            center_lon: Center longitude for distance calculation (optional)
            
        Returns:
            Parsed place dictionary or None if parsing fails
        """
        try:
            position = item.get('Position', [])
            if len(position) < 2:
                return None
            
            # Extract address components from structured API response
            address_obj = item.get('Address', {})
            
            # Region: structured object with Code and Name
            region_obj = address_obj.get('Region', {})
            region_name = region_obj.get('Name', '') if isinstance(region_obj, dict) else str(region_obj)
            
            # Country: structured object with Code2, Code3, Name
            country_obj = address_obj.get('Country', {})
            country_name = country_obj.get('Name', '') if isinstance(country_obj, dict) else str(country_obj)
            country_code = country_obj.get('Code3', '') if isinstance(country_obj, dict) else ''
            
            # City: Locality is the correct field (not Municipality)
            city = address_obj.get('Locality', '')
            
            # Build speech-friendly street from StreetComponents
            street_components = address_obj.get('StreetComponents', [])
            address_number = address_obj.get('AddressNumber', '')
            
            if street_components:
                comp = street_components[0]
                base_name = comp.get('BaseName', '')
                street_type = comp.get('Type', '')
                placement = comp.get('TypePlacement', 'AfterBaseName')
                separator = comp.get('TypeSeparator', ' ')
                
                if placement == 'BeforeBaseName':
                    full_street = f"{street_type}{separator}{base_name}" if street_type else base_name
                else:
                    full_street = f"{base_name}{separator}{street_type}" if street_type else base_name
                
                if address_number:
                    full_street = f"{address_number} {full_street}"
            else:
                # Fallback to Street field
                full_street = address_obj.get('Street', '')
                if address_number and full_street:
                    full_street = f"{address_number} {full_street}"
            
            # Build speech-friendly address from structured fields
            addr_parts = [p for p in [full_street, city, f"{region_name} {address_obj.get('PostalCode', '')}".strip(), country_name] if p]
            speech_friendly_address = ', '.join(addr_parts)
            
            # Calculate distance if center coordinates provided
            distance_meters = 0
            if center_lat is not None and center_lon is not None:
                distance_meters = item.get('Distance', self._calculate_distance(
                    center_lat, center_lon, position[1], position[0]
                ))
            
            place = {
                'place_id': item.get('PlaceId', ''),
                'title': item.get('Title', 'Unknown Location'),
                'address': {
                    'label': speech_friendly_address,
                    'street': full_street,
                    'city': city,
                    'state': region_name,
                    'postal_code': address_obj.get('PostalCode', ''),
                    'country': country_code or country_name
                },
                'coordinates': {
                    'latitude': position[1],  # AWS returns [lon, lat]
                    'longitude': position[0]
                },
                'distance_meters': distance_meters,
                'categories': item.get('Categories', [])
            }
            
            return place
            
        except Exception as e:
            print(f"⚠️  Warning: Failed to parse place result: {e}")
            return None
    
    def _calculate_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Calculate distance between two coordinates using Haversine formula.
        
        Args:
            lat1: First point latitude
            lon1: First point longitude
            lat2: Second point latitude
            lon2: Second point longitude
            
        Returns:
            Distance in meters
        """
        from math import radians, sin, cos, sqrt, atan2
        
        # Earth radius in meters
        R = 6371000
        
        # Convert to radians
        lat1_rad = radians(lat1)
        lat2_rad = radians(lat2)
        delta_lat = radians(lat2 - lat1)
        delta_lon = radians(lon2 - lon1)
        
        # Haversine formula
        a = sin(delta_lat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon / 2) ** 2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        distance = R * c
        
        return distance
    
    def format_distance(self, distance_meters: float) -> str:
        """
        Format distance in human-readable format.
        
        Args:
            distance_meters: Distance in meters
            
        Returns:
            Formatted distance string (e.g., "5.2 miles")
        """
        distance_miles = distance_meters / 1609.34
        return f"{distance_miles:.1f} miles"
