# Spring AI from Scratch

A hands-on project for building AI-powered applications with [Spring AI](https://docs.spring.io/spring-ai/reference/) and Spring Boot, starting from an empty project and adding features step by step.

## Tech stack

- Java 21
- Spring Boot 3
- Spring AI
- Maven (via the included wrapper `./mvnw`)

## Prerequisites

- JDK 21+ ([Eclipse Temurin](https://adoptium.net/) recommended)
- An API key for the model provider you configure in Spring AI (for example, OpenAI or Anthropic)
- Docker (optional, for building container images)

## Getting started

1. Clone the repository:

   ```bash
   git clone https://github.com/azaharuddinruhit/spring-ai-from-scratch.git
   cd spring-ai-from-scratch
   ```

2. Provide your model provider's API key as an environment variable. Don't commit it. For example:

   ```bash
   export OPENAI_API_KEY=your-key-here        # macOS / Linux
   $env:OPENAI_API_KEY = "your-key-here"      # Windows PowerShell
   ```

3. Run the application:

   ```bash
   ./mvnw spring-boot:run
   ```

## Build and test

```bash
./mvnw verify
```

## Container image

Build an OCI image with Spring Boot's buildpacks support (no Dockerfile needed):

```bash
./mvnw spring-boot:build-image -Dspring-boot.build-image.imageName=spring-ai-from-scratch
docker run -p 8080:8080 -e OPENAI_API_KEY=$OPENAI_API_KEY spring-ai-from-scratch
```

## CI/CD

The [`deploy.yml`](.github/workflows/deploy.yml) workflow runs on every push and pull request to `main`:

- **Pull requests:** builds the project and runs the tests.
- **Pushes to `main`** (or a manual run): also builds a container image and publishes it to GitHub Container Registry as
  `ghcr.io/<owner>/spring-ai-from-scratch`, tagged with `latest` and the commit SHA.

The workflow uses the built-in `GITHUB_TOKEN`, so it needs no extra secrets.
