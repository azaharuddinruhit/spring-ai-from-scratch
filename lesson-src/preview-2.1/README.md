# Spring AI 2.1 preview sources

The four preview lessons (1.5 Message Parts & Reasoning, 2.3 Decision Models, 4.4 Decision Filter & Reranker, 5.4 Tool Search &
DecisionToolIndex) are generated from this folder, on the same workflow as `lesson-src/module-5` and `module-6`. Everything here
targets Spring AI 2.1.0-RC2 and Spring Boot 4.2.0-RC2 (`pom.xml`, and `PREVIEW_STACK` in `src/data/versions.ts`). The plan is in
`UPGRADE-2.1.md`.

- `code/<lesson>/main`, `test`, `main-resources`, `test-resources`: each preview lesson is its own small project
  (`decision-models`, `decision-filter`, ...), with its own `application.yaml`. `code/probe-only.properties` (and a lesson's own `code/<lesson>/probe-only.properties`) holds settings the
  shared workspace classpath needs and the lessons never show.
- `templates/*.mdx`: the lesson sources. Generate a lesson with
  `python lesson-src/preview-2.1/assemble.py <template> <out.mdx> lesson-src/preview-2.1/code/<lesson>`; `@@CODE <file> | <regex>@@`
  lines become fenced code with those lines highlighted.
- `run-tests.sh <lesson>`: compiles that lesson's project and runs its tests. It needs `cp.arg` (see its header; `cp.arg`, `cp.txt` and `out/` are
  git-ignored).
- `findings.md`: every verified fact and recording, with how it was checked.
- `probes/`: the scripts behind the findings and the sandbox recordings.

## Running the probes

Compile them with `javac -parameters @cp.arg -d out $(find probes/java -name "*.java")`. Each is a Spring Boot app without a web
server; pass the models it doesn't use as `none` (`--spring.ai.model.chat=none`, `embedding`, `image`, `audio.speech`,
`audio.transcription`, `moderation`).

- `DecisionFactsProbe`, `RagToolFactsProbe`: Ollama with `d1-omni:600m` pulled, and `--spring.ai.model.decision=ollama`.
- `PartsRecordingProbe`: the Lesson 1.5 recordings. It runs the lesson app (compile `code/message-parts/main` into `out/` too)
  through the logging proxy, with `-Dprobe.log=<the proxy's file> -Dprobe.out=probes/parts-recording.json`; then
  `probes/parts-to-sandbox.py` writes the sandbox data from both files.
- `PartsFactsProbe`: an OpenAI-compatible server with a reasoning model. Its address, key and model name come from the
  environment (`QWEN_BASE_URL`, `QWEN_API_KEY`, `QWEN_MODEL`) and are never written to this repository. To see what Spring AI
  sends, run `python -I probes/logging-proxy.py 4555 probes/parts-log.jsonl` and point the app at it:
  `--spring.ai.model.chat=openai --spring.ai.openai.base-url=http://127.0.0.1:4555/v1 --spring.ai.openai.api-key=$QWEN_API_KEY
  --spring.ai.openai.chat.model=$QWEN_MODEL`. The `*-log.jsonl` files are git-ignored, because they hold the server's model
  names.
- `probes/java-options/OptionsMergeProbe`: compiled and run separately against this classpath and Module 6's (2.0.2), to compare
  how runtime options merge.
