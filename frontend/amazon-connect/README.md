# Amazon Connect Integration (Planned)

## Overview

This module will extend the QSR Voice Ordering system to support phone-based ordering through Amazon Connect. Customers will be able to call a phone number, be identified by their caller ID, and place orders using the same AI agent that powers the web/mobile experience.

## Architecture

```
Caller → Amazon Connect → Lambda (session bridge) → AppSync Events → AgentCore Runtime
                                                          ↕
                                                    Nova 2 Sonic Agent
                                                          ↕
                                                   AgentCore Gateway (MCP)
                                                          ↕
                                                    Backend APIs (Lambda)
```

The key addition is **AppSync Events** as a real-time audio bus that decouples the telephony layer (Connect) from the agent layer (AgentCore Runtime). This enables the same agent to serve both web/mobile and phone channels.

## Planned Flow

1. Caller dials the Connect phone number
2. Connect contact flow invokes a session Lambda with the caller's phone number
3. Lambda looks up the customer by phone number in DynamoDB, creates a session
4. Lambda invokes the AgentCore Runtime agent, which subscribes to the AppSync Events channel
5. Connect streams caller audio to AppSync Events via a media streaming Lambda
6. AgentCore Runtime receives audio, processes with Nova 2 Sonic, sends responses back via AppSync
7. Connect receives agent audio from AppSync and plays it to the caller
8. Conversation history is stored in DynamoDB

## Key Differences from Mobile/Web

| Aspect | Mobile/Web | Amazon Connect |
|--------|-----------|----------------|
| Authentication | Cognito JWT (username/password) | Caller ID → customer lookup |
| Audio transport | Direct WebSocket to AgentCore | AppSync Events as audio bus |
| Session initiation | Frontend opens WebSocket | Connect contact flow triggers Lambda |
| Initial greeting | Frontend sends trigger message | Lambda sends trigger after agent subscribes |

## Prerequisites

- Amazon Connect instance
- AppSync Events API
- Phone number provisioned in Connect
- Customer records with phone numbers in DynamoDB

## Status

🔲 Not started — this is a planned extension.

## Reference

Architecture inspired by [sample-serverless-nova-sonic-chat](https://github.com/aws-samples/sample-serverless-nova-sonic-chat).
