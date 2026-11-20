# Module 5 sources

The three Module 5 lessons are published. This folder holds what they are generated from.

- `code/` — the lesson Java code, verified against Spring AI 2.1.0 on Boot 4.2.0 (62 tests pass). Shared support-app code from Modules 3 and 4
  is included so it compiles. `lesson1/` and `lesson2/` hold the earlier versions of files that later lessons change.
- `templates/*.mdx` — the lesson sources. `@@CODE <file> | <regex>; <regex>@@` lines become fenced code with the matching lines
  highlighted:

  ```bash
  python lesson-src/module-5/assemble.py lesson-src/module-5/templates/tool-calling.mdx \
    src/content/lessons/05-tools-mcp-agents/tool-calling.mdx lesson-src/module-5/code
  ```

  Edit the template, then regenerate the MDX.
- `findings.md` — every verified fact (2.0.2, then re-checked on 2.1.0), with the probe that showed it (summarised in CLAUDE.md).
- `probes/` — the programs that produced the findings. `RepoProbe` ran the order and refund repositories against PostgreSQL 17.
  Their classpath comes from `pom.xml`.
- `run-tests.sh` compiles `code/main` and `code/test` and runs the 62 tests. It needs `cp.arg`, the classpath of `pom.xml`; the
  script's header shows how to write it. Build output (`out/`) and `cp.arg` are ignored.
