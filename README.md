# Spring AI from Scratch

An interactive course for Java and Spring Boot developers who want to build production AI applications with Spring AI. It runs from
the first `ChatClient` call to a multi-tenant, tool-calling, RAG-backed assistant.

Every lesson has four parts:

1. **Spring mental model.** The abstraction is mapped to Spring primitives you already know, with a Mermaid diagram of the request lifecycle.
2. **Interactive sandbox.** A deterministic simulation that runs in the browser, with no backend and no API keys.
3. **Idiomatic code.** Copy-pasteable Java, `application.yml` and `build.gradle` (Groovy DSL) files.
4. **Production gotchas.** Reliability, security, cost and migration pitfalls, and how to avoid them.

## Stack taught in the lessons

| | Version |
| --- | --- |
| Java | 25 |
| Spring Boot | 4.1.2 |
| Spring Framework | 7 |
| Spring AI | 2.0.2 |
| Gradle | 9.9.1 (Groovy DSL) |

These versions are pinned in [`src/data/versions.ts`](src/data/versions.ts), and every generated build snippet reads them from there.

## Curriculum

| Module | Topic | Status |
| --- | --- | --- |
| 1 | Foundations & core abstractions | Published |
| 2 | Deterministic structured outputs | Published |
| 3 | The Advisors API & chat memory | Published |
| 4 | RAG & ETL pipelines | Published |
| 5 | Tool calling, MCP & agents | Published |
| 6 | Testing, evaluation & production hardening | Planned |
| 7 | Capstone: enterprise support & knowledge assistant | Planned |

## Running the site locally

Requires Node.js 22.23 or later.

```bash
npm install
npm run dev        # http://localhost:4321/spring-ai-from-scratch/
npm run build      # astro check + static build into dist/
npm run preview    # serve the production build
```

## Project layout

```text
src/
  data/curriculum.ts        course structure and lesson titles (single source of truth)
  data/versions.ts          pinned stack versions and the site version shown in the header
  data/snippets.ts          generated build.gradle / application.yml snippets and provider data
  content/lessons/<module>/<lesson>.mdx   lesson content
  components/islands/       React sandboxes (client-side simulations)
  components/               Astro components: HeroTrace (home), Mermaid, CodeFile, Gotcha, layout pieces
  layouts/                  base and lesson layouts
```

A lesson goes live when its MDX file exists at the path that matches its entry in `curriculum.ts`. Until then it appears as "soon" in the navigation.

`PRODUCT.md` describes who the course is for and what it may claim; `DESIGN.md` is the visual system that every UI change follows.

## Deployment

[`deploy.yml`](.github/workflows/deploy.yml) type-checks and builds on every pull request and push to `main`. Pushes to `main` (or a
manual run) also publish `dist/` to GitHub Pages. In the repository settings, set **Pages → Source** to **GitHub Actions** once.

Each deploy is versioned automatically: `VERSION` holds `major.minor` and the workflow adds its run number as the patch (for example
`1.0.37`), which the header shows. Local and pull request builds show `dev`. Edit `VERSION` only for a minor or major release.
