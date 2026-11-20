# Module 6 sources

The Module 6 lessons are generated from this folder. `code/` is the Module 5 support app plus the Module 6 changes, verified
against Spring AI 2.1.0 and Boot 4.2.0 (Testcontainers from Boot's BOM).

- `code/main`, `code/test` — the Java code. `code/main-resources/application.yaml` is the app's configuration as Modules 3–5 build
  it; `code/test-resources` holds the `it` and `eval` profiles, test data and knowledge files.
  `code/lesson1/` holds the versions Lesson 1 shows of files that later lessons change (not compiled).
- `templates/*.mdx` — the lesson sources. Generate a lesson with:

  ```bash
  python lesson-src/module-6/assemble.py lesson-src/module-6/templates/testing-and-evals.mdx \
    src/content/lessons/06-production-hardening/testing-and-evals.mdx lesson-src/module-6/code
  ```

  `@@CODE <file> | <regex>; <regex>@@` lines become fenced code with the matching lines highlighted. Lines marked
  `// probe-only` (workarounds for this machine) are left out.
- `findings.md` — every verified fact, with how it was checked. `probes/` — the scripts and recorded model output behind the
  `AnswerCheckLab`, `TraceLab` and `AttackLab` sandboxes. `AttackRecordingProbe` and `attacks-to-sandbox.py` record and
  convert the attacks the same way. To record traces, compile with `run-tests.sh`, then run its `java` line yourself
  with `-Dmanagement.tracing.sampling.probability=1.0 -Dprobe.out=probes/trace-after.json` (plus the content switches listed
  in `findings.md`) and `--select-class com.example.support.TraceRecordingProbe`, and finish with
  `python lesson-src/module-6/probes/trace-to-sandbox.py`. The 2.1.0 recordings ran chat on the 27B Qwen model through the
  OpenAI starter (`-Dspring.ai.model.chat=openai` with `spring.ai.openai.base-url`, `api-key`, `chat.model` and
  `support.knowledge.rewrite-model` from the `QWEN_*` env vars); run the converters with those vars set: they replace the
  model alias with `qwen-27b` and refuse to write if a server value remains. Scrub the raw recordings the same way before
  committing them.
- `run-tests.sh` — compiles the code and runs the tests (84: unit, slice and verdict tests, and four `*IT` classes against Docker). Pass
  JUnit console arguments to select others, for example the eval:
  `bash run-tests.sh --select-class com.example.support.chat.SupportAnswerEvalTest`. It needs `cp.arg` (see its header). On this
  machine the integration tests also need `TESTCONTAINERS_REUSE_ENABLE=true` and `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1`.
