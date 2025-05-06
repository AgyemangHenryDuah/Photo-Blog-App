# Team Guidelines for Photo Blog Project

## 1. AWS Accounts and Access Keys

* **DO NOT share AWS access keys**.
* Each member must use the designated AWS permissions.
* AWS credentials have been securely stored on Github so don't bother passing it to anything in template
* Never commit `.aws/credentials`, `.env`, or key files to Github.

## 2. Environment Setup

Each team member must install:

* **AWS CLI**
* **AWS SAM CLI**
* **Node.js (v20 or higher)**
* **Docker** (for local testing)

Also:

* Use `.env.example` as a reference.
* Never push personal `.env` files to GitHub.
* Use `samconfig.toml` with defined environments (`dev`, `test`, `prod`).

## 3. Project Structure

```bash
project-root/
├── src/
│   ├── functions/
│   ├── utils/
│   ├── middlewares/
│   └── services/
├── resources/
│   ├── cognito.yml
│   ├── api-gateway.yml
│   └── step-functions.yml
├── template.yml
├── samconfig.toml
├── .github/workflows/
├── .env.example
└── README.md
```

* Stick to this structure. Don't create random folders.
* Discuss any major structure changes with the team.

## 4. Branching Strategy

* Main branches:

  * `main`: production-ready code only
  * `dev`: staging and team-wide integration
* Feature branches:

  * `feature/*` for new features
  * `bugfix/*` for fixing issues
  * `test/*` for testing deployments

## 5. CI/CD Deployment Rules

* GitHub Actions will handle deployments.
* Deployment environments:

  * **Dev/Test**: all team members can deploy
  * **Prod**: only team lead (or assigned deployer) can deploy
* Never push directly to `main`
* All PRs must pass checks before merging

## 6. Code Quality
* Write clear, concise comments when necessary
* Follow DRY and modular code practices

---

**NOTE:** These rules are to ensure smooth collaboration and avoid conflicts, especially during deployments or handling AWS resources.

For questions or suggestions, contact the project lead.
