# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

The repository has no application code yet. It contains only `README.md`, `.github/workflows/deploy.yml`, and an untracked `prompt.md`. Update this file once a project is scaffolded.

## Two conflicting specs

The tracked files and `prompt.md` describe different projects. Ask the user which one is authoritative before scaffolding:

- **`README.md` + `deploy.yml`:** a Spring Boot application built with Java 21, Spring Boot 3, Spring AI, and Maven (`./mvnw`).
- **`prompt.md`:** an interactive web platform that teaches Spring AI, with lessons, Mermaid diagrams, client-side visualizers, and a capstone. Its code samples target Java 25, Gradle 9 (Groovy DSL), Spring Boot 4, Spring Framework 7, and Spring AI 2.x. `prompt.md` requires a discovery step first: ask the user its 5 scoping questions (frontend stack, Gradle DSL toggle, client-only vs. companion backend, visual theme, build pacing) before writing any code.

## Commands (from README, Maven setup)

```bash
./mvnw spring-boot:run          # run the app; needs a provider key such as OPENAI_API_KEY in the environment
./mvnw verify                   # build and run all tests (this is what CI runs)
./mvnw test -Dtest=ClassName#method   # run a single test
./mvnw spring-boot:build-image -Dspring-boot.build-image.imageName=spring-ai-from-scratch   # build an OCI image with buildpacks (no Dockerfile)
```

On Windows, use `.\mvnw.cmd` in place of `./mvnw`.

## CI (`.github/workflows/deploy.yml`)

- Runs on pushes and pull requests to `main`, and on manual dispatch. Uses JDK 21 (Temurin).
- Pull requests run `./mvnw -B verify` only.
- Pushes to `main` also build an image with `spring-boot:build-image` and push it to `ghcr.io/<owner>/<repo>` (lowercased), tagged with the commit SHA and `latest`. Authentication uses the built-in `GITHUB_TOKEN`.
- The workflow assumes the Maven wrapper (`mvnw`, `.mvn/`) is committed at the repo root. It runs `chmod +x mvnw` because the executable bit is lost on commits from Windows. CI will fail until the wrapper exists. If the project moves to Gradle, rewrite the workflow to match.
