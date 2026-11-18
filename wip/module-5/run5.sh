#!/bin/bash
# Compile l5 main + test and run the JUnit suite.
cd "$(dirname "$0")"
rm -rf l5out && mkdir -p l5out
find l5/main l5/test -name "*.java" > l5src.txt
javac -parameters -Xlint:deprecation @cp5.arg -d l5out @l5src.txt 2>&1 | grep -v "^Note" 
[ -d l5/resources ] && cp -r l5/resources/. l5out/
java @cp5.arg org.junit.platform.console.ConsoleLauncher execute ${@:---scan-classpath l5out} --disable-banner --details=summary --details-theme=ascii 2>&1 | grep -v "DEBUG\|^SLF4J"
