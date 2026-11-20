# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Working Java and Spring Boot developers who have not yet built an AI feature. They already know dependency injection,
auto-configuration, `@ConfigurationProperties`, `RestClient` and Spring testing, so lessons explain AI concepts by mapping them
onto those Spring primitives rather than teaching Spring itself. They usually arrive with a concrete job: add a chat, RAG or
tool-calling feature to a Spring service and run it in production.

## Product Purpose

Spring AI from Scratch is a free, interactive course that takes a Spring developer from a first `ChatClient` call to a
production assistant that remembers, retrieves, calls tools, returns typed results, and is tested, observed and guarded like any
other Spring service. Success means a reader can write idiomatic Spring AI 2.x code, predict how a request flows through the
framework, and avoid the failures that only show up in production.

## Positioning

- It teaches the current stack only: Java 25, Spring Boot 4.1, Spring Framework 7, Spring AI 2.0 and Gradle 9 with the Groovy
  DSL. Versions are pinned in `src/data/versions.ts` and code is checked against the real 2.0.x jars and reference docs.
- Every lesson has a sandbox that simulates the framework's behaviour in the browser (options merging, the advisor chain, the
  tool loop, chunking, schema generation), so readers see the mechanism without an API key or a backend.
- Every lesson ends with production gotchas (reliability, security, cost, 1.x to 2.0 migration), not just a happy path.

## Operating Context

Readers study on a laptop, often with an IDE open next to the site, and copy code and `build.gradle` / `application.yml` files
straight into a project. Some read on a phone. Lessons are meant to be taken in order, module by module, and the site
links into the official Spring AI reference documentation for depth.

## Capabilities and Constraints

- Static site (Astro, React islands, Tailwind, MDX) deployed to GitHub Pages under `/spring-ai-from-scratch`. No backend, no
  accounts, no analytics, no stored learner progress.
- Six modules. The owner replaced the capstone in `prompt.md` with a final production module, because the Module 5 app
  already brings every part together. `src/data/curriculum.ts` is the source of truth; unpublished lessons are listed as
  "soon". Content is released module by module.
- Lesson anatomy is fixed: Spring mental model, interactive sandbox, idiomatic Java 25 and Gradle 9 code, production gotchas,
  recap.
- Sandboxes are simulations and must say so. They never call a model provider.
- Gradle examples use the Groovy DSL only.
- Code must match the real Spring AI 2.1.x API; names are verified before they are written.
- Facts recorded on a release candidate say so (a few 2.1 recordings ran on 2.1.0-RC2 and were re-checked on 2.1.0).

## Brand Commitments

- Name: "Spring AI from Scratch". The leaf logo mark in `src/components/Logo.astro` and `public/favicon.svg`.
- Voice: plain, direct, sentence case, written to a working engineer. Explains by analogy to Spring the reader already knows.
  No hype and no marketing superlatives.
- The course is independent: it must not present itself as an official Spring or Broadcom product or use their marks.

## Evidence on Hand

- The Module 1 to 6 lessons and their sandboxes in `src/content/lessons/`.
- The source repository on GitHub.
- There are no testimonials, learner counts, endorsements or benchmarks. Do not invent any.

## Product Principles

1. **Spring first.** Every AI concept is introduced through the Spring abstraction it resembles.
2. **Show the mechanism.** Readers should be able to predict what the framework does; sandboxes and diagrams exist for that.
3. **Accurate to the version.** A wrong API name costs more trust than a missing topic.
4. **Production is part of the lesson.** Failure modes, security and cost are taught alongside the feature.
5. **Free and open.** The course is free to read and open source; contributions are welcome.

## Accessibility & Inclusion

No formal conformance target has been set. Work to a sensible baseline anyway: readable contrast in both themes, full keyboard
access to sandboxes and navigation, visible focus, reduced-motion support, and code that can be copied without line numbers.
