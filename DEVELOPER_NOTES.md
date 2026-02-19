# Developer Notes — Deployment Scripts

Lessons learned while building the deployment automation.

## Python-Free Deployment

All deployment and cleanup scripts use `node -e` for JSON parsing instead of `python3 -c`. This eliminates Python as a dependency for the deployment flow. Python is still required for the synthetic data generator and the AgentCore Runtime agent code, but not for deploying or cleaning up infrastructure.

## Deployment State (`.deployment-state.json`)

The state file uses absolute paths internally (resolved from the script's location) so it works correctly when called from subdirectories. The `deploy-all.sh` script `cd`s into various project directories during deployment — relative paths would break.

```bash
# This resolves to an absolute path at source time
STATE_FILE_ABS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$STATE_FILE"
```

## `--force-deploy` Flag

By default, `deploy-all.sh` skips CDK projects that are already marked as deployed in the state file. The `--force-deploy` flag bypasses this check and runs `cdk deploy` on all projects. This is needed when:
- Lambda code changes (CDK detects code changes but the state says "deployed")
- System prompt changes in the agent (requires runtime rebuild)
- API Gateway endpoint additions (gateway needs to refresh its target)

## Password Change — Last Interactive Step

The password change prompt was moved to the very end of the deployment (after all infrastructure, synthetic data, and frontend). This ensures that if the password change fails or times out, all infrastructure is already deployed. The state tracks `password_changed: true/false` so re-runs skip the prompt if already done.

The prompt has a 60-second timeout (`read -t 60`) that defaults to "skip" if the user doesn't respond.

## Cleanup Resumability

The cleanup script updates the deployment state after each successful step. If cleanup fails mid-way (e.g., a stack deletion times out), re-running the script skips already-cleaned components. The state file is only deleted when ALL components are successfully cleaned.

## AWS Credentials

Every terminal session requires fresh AWS credentials. The cleanup script checks credentials at startup with `aws sts get-caller-identity` and fails fast with a clear message if they're missing. The deploy script relies on CDK's own credential checking.

## CDK Output Lock Files

If a CDK deploy is interrupted (e.g., IDE crash), the `cdk.out` directory may contain lock files that prevent subsequent deploys. Fix: `rm -rf cdk.out` in the affected project directory.
