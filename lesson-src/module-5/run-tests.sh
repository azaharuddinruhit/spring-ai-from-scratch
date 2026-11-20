#!/bin/bash
# Compiles the lesson code in code/main and code/test, and runs its JUnit tests.
# Needs cp.arg, the classpath of pom.xml (Windows separators), written once with:
#   mvn -q dependency:build-classpath -Dmdep.outputFile=cp.txt && printf -- '-cp "out;%s"' "$(tr '\\' / < cp.txt)" > cp.arg
cd "$(dirname "$0")" || exit 1
rm -rf out && mkdir -p out
find code/main code/test -name "*.java" > out/sources.txt
javac -parameters -Xlint:deprecation @cp.arg -d out @out/sources.txt 2>&1 | grep -v "^Note"
java -Dspring.config.additional-location=file:code/probe-only.properties @cp.arg \
  org.junit.platform.console.ConsoleLauncher execute --scan-classpath out --disable-banner --details=summary --details-theme=ascii \
  2>&1 | grep -v "DEBUG\|^SLF4J"
