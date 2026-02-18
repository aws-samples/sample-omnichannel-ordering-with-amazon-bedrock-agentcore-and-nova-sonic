# Quick Start Guide - Synthetic Data Population

## TL;DR

```bash
cd backend/synthetic-data
pip3 install -r requirements.txt
python3 populate_data.py
```

Follow the prompts to generate and ingest synthetic data.

## What You'll Need

1. ✅ Backend infrastructure deployed (`./deploy-all.sh`)
2. ✅ AWS credentials configured
3. ✅ Python 3.8+

## What It Does

1. **Discovers Real Locations** - Uses AWS Geo Places API to find actual businesses near you
2. **Generates Synthetic Data** - Creates customer profile, menu items, and order history
3. **Saves Locally** - Outputs JSON files to `output/` directory for review
4. **Ingests to DynamoDB** - Batch writes to all tables after confirmation

## Example Inputs

### Location
- **Address**: `123 Main St, Van Alstyne, TX 75495`
- **Coordinates**: `33.4127, -96.5837`

### Business Name
- `pizza`
- `burgers`
- `coffee shop`
- `tacos`

### Home Address
- Choose "yes" to use same as search location
- Choose "no" to enter different address

## Output

### Files Generated
- `output/locations.json` - Real locations from Geo Places API
- `output/customer.json` - Customer profile from deployment
- `output/menu.json` - Menu items for all locations
- `output/orders.json` - Sample order history

### DynamoDB Tables Populated
- `QSR-Locations` - Restaurant locations
- `QSR-Customers` - Customer profile
- `QSR-Menu` - Menu items
- `QSR-Orders` - Order history

## Common Issues

### "Deployment outputs not found"
**Solution**: Run `./deploy-all.sh` first

### "No locations found"
**Solution**: Try a different business name or location

### "AccessDeniedException"
**Solution**: Check AWS credentials and Geo Places API access

## Next Steps

After populating data:
1. Test the QSR ordering agent
2. Verify data in DynamoDB console
3. Run agent with realistic locations and menu

## Need Help?

See full documentation in [README.md](README.md)
