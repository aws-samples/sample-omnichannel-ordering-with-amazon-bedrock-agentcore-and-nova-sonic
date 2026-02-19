# Frontend — Omnichannel Ordering

This directory contains the frontend channels for the QSR Voice Ordering system. Each subdirectory represents a different customer-facing channel, all powered by the same backend agent and APIs.

## Channels

### [Mobile/Web Application](mobile-web/)

React + TypeScript + Vite web application hosted on AWS Amplify. Supports voice and text ordering through a browser or mobile device.

- 🎙️ Voice ordering with 16kHz PCM audio streaming
- 💬 Text-based ordering alternative
- 🔐 Cognito authentication (username/email + password)
- 🔄 Direct WebSocket connection to AgentCore Runtime
- 📱 Responsive design for desktop and mobile

**Status:** ✅ Implemented

### [Amazon Connect](amazon-connect/)

Phone-based ordering through Amazon Connect. Customers call a phone number, are identified by caller ID, and interact with the same AI agent via voice.

- 📞 Phone call ordering via Amazon Connect
- 🔍 Caller ID-based customer identification
- 🔄 AppSync Events as real-time audio bus
- 🤖 Same agent, same tools, same backend

**Status:** 🔲 Planned

## Architecture

Both channels share the same backend:

```
┌─────────────────┐     ┌──────────────────┐
│  Mobile/Web App  │     │  Amazon Connect   │
│  (Amplify)       │     │  (Phone)          │
└────────┬────────┘     └────────┬──────────┘
         │ WebSocket              │ AppSync Events
         └──────────┬─────────────┘
                    ▼
         ┌─────────────────────┐
         │  AgentCore Runtime   │
         │  (Nova 2 Sonic)      │
         └──────────┬──────────┘
                    │ MCP
                    ▼
         ┌─────────────────────┐
         │  AgentCore Gateway   │
         └──────────┬──────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │  Backend APIs        │
         │  (Lambda + DynamoDB) │
         └─────────────────────┘
```
