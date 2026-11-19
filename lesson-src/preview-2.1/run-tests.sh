#!/bin/bash
# Compiles one preview lesson's project, code/<lesson>/main and test (for example decision-models), and runs its JUnit tests.
# Extra arguments go to the JUnit console launcher, for example
#   bash run-tests.sh decision-models --select-class com.example.support.routing.TicketRouterIT
# (the *IT tests need Ollama with the lesson's models and are tagged ollama, so the default run leaves them out). Needs cp.arg, the classpath of pom.xml (Windows separators), written once with:
#   mvn -q dependency:build-classpath -Dmdep.outputFile=cp.txt && printf -- '-cp "out;%s"' "$(tr '\\' / < cp.txt)" > cp.arg
cd "$(dirname "$0")" || exit 1
lesson="code/${1:?usage: run-tests.sh <lesson> [junit options]}"
shift
[ -d "$lesson" ] || { echo "no such lesson project: $lesson"; exit 1; }
rm -rf out && mkdir -p out
cp -r "$lesson/main-resources/." "$lesson/test-resources/." out/
# Probe-only settings (the workspace classpath has more starters than the lesson app); never shown in a lesson.
cp code/probe-only.properties out/application.properties
# A lesson's own workspace-only settings, for starters its app doesn't have (for example a second chat model).
[ -f "$lesson/probe-only.properties" ] && cat "$lesson/probe-only.properties" >> out/application.properties
find "$lesson/main" "$lesson/test" -name "*.java" > out/sources.txt
javac -parameters -Xlint:deprecation @cp.arg -d out @out/sources.txt 2>&1 | grep -v "^Note"
selection=("$@")
[ ${#selection[@]} -eq 0 ] && selection=(--scan-classpath out --include-classname '.*(Test|Tests|IT)' --exclude-tag ollama)
java @cp.arg \
  org.junit.platform.console.ConsoleLauncher execute "${selection[@]}" --disable-banner --details=summary --details-theme=ascii \
  2>&1 | grep -v "DEBUG\|^SLF4J"
