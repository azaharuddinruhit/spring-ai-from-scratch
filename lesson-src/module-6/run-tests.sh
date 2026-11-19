#!/bin/bash
# Compiles the lesson code in code/main and code/test, and runs its JUnit tests. Extra arguments go to the JUnit console
# launcher, for example --include-tag eval or --select-class com.example.support.chat.SupportChatIT.
# The *IT and eval tests need Docker. Needs cp.arg, the classpath of pom.xml (Windows separators), written once with:
#   mvn -q dependency:build-classpath -Dmdep.outputFile=cp.txt && printf -- '-cp "out;%s"' "$(tr '\\' / < cp.txt)" > cp.arg
cd "$(dirname "$0")" || exit 1
rm -rf out && mkdir -p out
cp -r code/main-resources/. code/test-resources/. out/
# Probe-only settings as the lowest-ranked file, so the it and eval profiles can override them.
cp code/probe-only.properties out/application.properties
find code/main code/test -name "*.java" > out/sources.txt
javac -parameters -Xlint:deprecation @cp.arg -d out @out/sources.txt 2>&1 | grep -v "^Note"
selection=("$@")
[ ${#selection[@]} -eq 0 ] && selection=(--scan-classpath out --include-classname '.*(Test|Tests|IT)' --exclude-tag eval)
java @cp.arg \
  org.junit.platform.console.ConsoleLauncher execute "${selection[@]}" --disable-banner --details=summary --details-theme=ascii \
  2>&1 | grep -v "DEBUG\|^SLF4J"
