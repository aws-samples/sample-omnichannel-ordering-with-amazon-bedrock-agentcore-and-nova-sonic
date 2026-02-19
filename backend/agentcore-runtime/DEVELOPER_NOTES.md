# Developer Notes — AgentCore Runtime

Lessons learned while building the voice ordering agent.

## Nova 2 Sonic — Language Bias

Nova 2 Sonic tends to mix languages based on the customer's name. For example, a customer named "Sergio" triggers Spanish responses. Two mitigations are applied:

1. **System prompt**: An explicit English-only directive as the FIRST instruction
2. **Voice ID**: Using a US English voice (e.g., `en-us.tiffany`) anchors the model to English output. This is the more effective of the two approaches — the voice selection strongly influences the model's language behavior.

## Nova 2 Sonic — Address Pronunciation

The model mispronounces common abbreviations in addresses:
- "Dr" → "Doctor" (should be "Drive")
- "St" → "S T" (should be "Street")
- "TX" → "Tea Ex" (should be "Texas")

**This cannot be fixed in the system prompt.** The instruction "read Dr as Drive" is ignored by the speech synthesis layer. The fix must happen at the data layer — expand abbreviations before they reach the model. See `backend/synthetic-data/DEVELOPER_NOTES.md` and `backend/backend-infrastructure/DEVELOPER_NOTES.md`.

## Nova 2 Sonic — Speaking Rate

The model's speaking rate cannot be controlled via the system prompt or API parameters. From the [Nova 2 Sonic Service Card](https://docs.aws.amazon.com/ai/responsible-ai/nova-2-sonic/overview.html): "Amazon Nova 2 Sonic does not allow developers to modify the pitch, tenor, accent, and speaking rate of the generated speech responses."

The only lever for perceived speed is response length — shorter responses = less rushing. The prompt uses a hard constraint: "Keep each response under 2 sentences."

## System Prompt Length

Longer system prompts degrade Nova 2 Sonic's performance — the model becomes less responsive and more likely to ignore instructions. The current prompt is ~1,200 characters, down from ~2,200 in the original version. Keep it concise.

## Cart Management in Conversations

The agent has access to GetCart and UpdateCart tools. Key prompt instructions:
- Always read back the cart before placing an order
- Use UpdateCart to remove items or change location (don't add duplicates)
- When repeating a previous order, list items with prices before adding

Without these instructions, the agent tends to keep adding items on retries without checking what's already in the cart, leading to duplicate orders.

## JWT Authentication Flow

The agent verifies the Access Token via Cognito's `GetUser` API (not by parsing the JWT locally). This means:
- No JWT libraries needed
- Token signature, expiration, and revocation are all checked server-side
- Verified user attributes (name, email, customerId) are embedded in the system prompt

See `jwt_auth.py` for the implementation.
