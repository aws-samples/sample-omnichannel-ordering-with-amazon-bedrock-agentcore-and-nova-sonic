# AgentCore Gateway Test Client

A Python test client for testing AgentCore Gateway MCP endpoints with AWS IAM authentication.

## Features

- ✅ Test gateway connectivity
- ✅ List all available MCP tools
- ✅ Call tools with parameters
- ✅ AWS SigV4 authentication
- ✅ Detailed error reporting

## Prerequisites

- Python 3.9 or later
- AWS credentials configured
- Access to the AgentCore Gateway

## Installation

1. Install dependencies:

```bash
pip install -r requirements.txt
```

Or install globally:

```bash
pip3 install boto3 requests
```

## Usage

### Test Connection

Test basic connectivity to the gateway:

```bash
python test_gateway.py \
  --gateway-url <your-gateway-url> \
  --test-connection
```

### List Available Tools

List all tools exposed by the gateway:

```bash
python test_gateway.py \
  --gateway-url <your-gateway-url> \
  --list-tools
```

**Example output:**

```
============================================================
  Listing Available Tools
============================================================

✓ Found 8 tool(s)

1. get_menu
   Description: Get the restaurant menu
   Parameters:
     - location: string (optional)
       Filter menu by location

2. get_customer_profile
   Description: Get customer profile information
   Parameters:
     - customer_id: string (required)
       Customer identifier

3. create_order
   Description: Create a new order
   Parameters:
     - customer_id: string (required)
       Customer identifier
     - items: array (required)
       Order items
     - location: string (required)
       Restaurant location
```

### Call a Tool

Call a specific tool with arguments:

```bash
python test_gateway.py \
  --gateway-url <your-gateway-url> \
  --tool-name get_menu \
  --tool-args '{}'
```

**With parameters:**

```bash
python test_gateway.py \
  --gateway-url <your-gateway-url> \
  --tool-name get_customer_profile \
  --tool-args '{"customer_id": "user123"}'
```

**Complex example (create order):**

```bash
python test_gateway.py \
  --gateway-url <your-gateway-url> \
  --tool-name create_order \
  --tool-args '{
    "customer_id": "user123",
    "items": [
      {"item_id": "burger", "quantity": 2},
      {"item_id": "fries", "quantity": 1}
    ],
    "location": "store-001"
  }'
```

### Use Different AWS Profile

```bash
python test_gateway.py \
  --gateway-url <your-gateway-url> \
  --profile my-aws-profile \
  --list-tools
```

### Use Different Region

```bash
python test_gateway.py \
  --gateway-url <your-gateway-url> \
  --region us-west-2 \
  --list-tools
```

## Command Line Options

| Option | Description | Required |
|--------|-------------|----------|
| `--gateway-url` | Full gateway URL | Yes |
| `--region` | AWS region (default: us-east-1) | No |
| `--profile` | AWS CLI profile | No |
| `--test-connection` | Test basic connectivity | No |
| `--list-tools` | List all available tools | No |
| `--tool-name` | Name of tool to call | No |
| `--tool-args` | Tool arguments as JSON string | No* |

*Required when using `--tool-name`

## Authentication

The test client uses AWS SigV4 authentication with your AWS credentials. Ensure you have:

1. AWS credentials configured via:
   - Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`)
   - AWS CLI profile (`~/.aws/credentials`)
   - IAM role (if running on EC2/Lambda)

2. IAM permissions to invoke the gateway:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "bedrock-agentcore:InvokeGateway",
         "Resource": "arn:aws:bedrock-agentcore:us-east-1:*:gateway/*"
       }
     ]
   }
   ```

## Troubleshooting

### Connection Failed

**Error:** `Connection failed: 403 Forbidden`

**Cause:** Missing IAM permissions

**Solution:** Ensure your AWS credentials have `bedrock-agentcore:InvokeGateway` permission

---

**Error:** `Connection failed: 404 Not Found`

**Cause:** Invalid gateway URL

**Solution:** Verify the gateway URL is correct and the gateway exists

---

**Error:** `Connection failed: Connection timeout`

**Cause:** Network connectivity issue

**Solution:** 
1. Check your internet connection
2. Verify the gateway is in the correct region
3. Check if you're behind a proxy

### Tool Call Failed

**Error:** `Tool call failed: Invalid arguments`

**Cause:** Tool arguments don't match the expected schema

**Solution:** Use `--list-tools` to see the expected parameters and their types

---

**Error:** `Tool call failed: Tool not found`

**Cause:** Tool name is incorrect

**Solution:** Use `--list-tools` to see available tool names

## Examples

### Complete Testing Workflow

1. **Test connectivity:**
   ```bash
   python test_gateway.py --gateway-url <url> --test-connection
   ```

2. **List available tools:**
   ```bash
   python test_gateway.py --gateway-url <url> --list-tools
   ```

3. **Call a simple tool (no parameters):**
   ```bash
   python test_gateway.py --gateway-url <url> --tool-name get_menu --tool-args '{}'
   ```

4. **Call a tool with parameters:**
   ```bash
   python test_gateway.py --gateway-url <url> --tool-name get_customer_profile --tool-args '{"customer_id": "user123"}'
   ```

### Testing All QSR Tools

```bash
# Get menu
python test_gateway.py --gateway-url <url> --tool-name get_menu --tool-args '{}'

# Get customer profile
python test_gateway.py --gateway-url <url> --tool-name get_customer_profile --tool-args '{"customer_id": "user123"}'

# Get nearest locations
python test_gateway.py --gateway-url <url> --tool-name get_nearest_locations --tool-args '{"latitude": 47.6062, "longitude": -122.3321}'

# Get route to location
python test_gateway.py --gateway-url <url> --tool-name get_route --tool-args '{"origin": "47.6062,-122.3321", "destination": "47.6101,-122.3420"}'

# Add item to cart
python test_gateway.py --gateway-url <url> --tool-name add_to_cart --tool-args '{"customer_id": "user123", "item_id": "burger", "quantity": 2}'

# Create order
python test_gateway.py --gateway-url <url> --tool-name create_order --tool-args '{"customer_id": "user123", "items": [{"item_id": "burger", "quantity": 2}], "location": "store-001"}'

# Get order history
python test_gateway.py --gateway-url <url> --tool-name get_order_history --tool-args '{"customer_id": "user123"}'
```

## Integration with Other Tools

### Use with jq for JSON formatting

```bash
python test_gateway.py --gateway-url <url> --list-tools | jq '.'
```

### Save tool list to file

```bash
python test_gateway.py --gateway-url <url> --list-tools > tools.txt
```

### Use in shell scripts

```bash
#!/bin/bash
GATEWAY_URL="<your-gateway-url>"

# Test connection
if python test_gateway.py --gateway-url "$GATEWAY_URL" --test-connection; then
  echo "Gateway is accessible"
  
  # List tools
  python test_gateway.py --gateway-url "$GATEWAY_URL" --list-tools
  
  # Call a tool
  python test_gateway.py --gateway-url "$GATEWAY_URL" --tool-name get_menu --tool-args '{}'
else
  echo "Gateway is not accessible"
  exit 1
fi
```

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review CloudWatch Logs for the gateway (with `exceptionLevel: DEBUG` enabled)
3. Verify your AWS credentials and IAM permissions
4. Check the gateway deployment status

## Related Documentation

- [AgentCore Gateway README](../README.md)
- [CDK Developer Notes](../cdk/DEVELOPER_NOTES.md)
- [Backend API Documentation](../../backend-infrastructure/README.md)
