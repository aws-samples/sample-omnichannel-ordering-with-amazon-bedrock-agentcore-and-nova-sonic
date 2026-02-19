# Frontend CDK Stack

Deploys an AWS Amplify App for hosting the QSR Voice Ordering frontend.

## What It Does

- Creates an Amplify App (`qsr-ordering-frontend`)
- Creates a `main` branch with manual deployment (no auto-build)
- Outputs the Amplify App ID and URL

## Deploy

```bash
npm install
cdk deploy
```

After the CDK stack is deployed, deploy the frontend code:

```bash
cd ..
npm run deploy:amplify
```

## Destroy

```bash
cdk destroy
```
