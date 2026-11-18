# Module 5 sources

The three Module 5 lessons are published. This folder holds what they are generated from.

- `code/` — the lesson Java code, verified against Spring AI 2.0.2 (63 tests pass). Shared support-app code from Modules 3 and 4
  is included so it compiles. `lesson1/` and `lesson2/` hold the earlier versions of files that later lessons change.
- `templates/*.mdx` — the lesson sources. `@@CODE <file> | <regex>; <regex>@@` lines become fenced code with the matching lines
  highlighted:

  ```bash
  python wip/module-5/assemble.py wip/module-5/templates/tool-calling.mdx \
    src/content/lessons/05-tools-mcp-agents/tool-calling.mdx wip/module-5/code
  ```

  Edit the template, then regenerate the MDX.
- `findings.md` — every verified 2.0.2 fact, with the probe that showed it (summarised in CLAUDE.md).
- `probes/` — the programs that produced the findings. `RepoProbe` ran the order and refund repositories against PostgreSQL 17.
  `run5.sh` and `pom.xml` built them; they need a classpath file, `cp5.arg`, from `mvn dependency:build-classpath`.
