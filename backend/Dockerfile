# syntax=docker/dockerfile:1

# Runs on the Oracle Ampere VM (linux/arm64). All build work happens on the build machine's own platform
# ($BUILDPLATFORM) because the jar is platform-independent; the final stage only copies files, so an arm64
# image built on an x86 machine or CI runner needs no QEMU emulation at all.
#
#   docker build -t earnings-tracker backend                                   # compile inside Docker
#   docker buildx build --platform linux/arm64 -t earnings-tracker backend    # arm64 image from any machine
#   docker buildx build --platform linux/arm64 --build-arg JAR_SOURCE=prebuilt -t earnings-tracker backend
#                                                # CI: reuse target/earnings-tracker.jar from ./mvnw verify

ARG JAR_SOURCE=build

FROM --platform=$BUILDPLATFORM eclipse-temurin:25-jdk AS build
WORKDIR /src
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
COPY src/ src/
RUN --mount=type=cache,target=/root/.m2 \
    sh ./mvnw -B -ntp -q package -DskipTests && cp target/earnings-tracker.jar /earnings-tracker.jar

FROM --platform=$BUILDPLATFORM eclipse-temurin:25-jdk AS prebuilt
COPY target/earnings-tracker.jar /earnings-tracker.jar

FROM ${JAR_SOURCE} AS jar

# Split the fat jar into layers so dependency layers are reused between releases.
FROM --platform=$BUILDPLATFORM eclipse-temurin:25-jdk AS layers
WORKDIR /layers
COPY --from=jar /earnings-tracker.jar app.jar
RUN java -Djarmode=tools -jar app.jar extract --layers --destination extracted \
    && mkdir -p extracted/dependencies extracted/spring-boot-loader extracted/snapshot-dependencies extracted/application

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=layers /layers/extracted/dependencies/ ./
COPY --from=layers /layers/extracted/spring-boot-loader/ ./
COPY --from=layers /layers/extracted/snapshot-dependencies/ ./
COPY --from=layers /layers/extracted/application/ ./
ENV SPRING_PROFILES_ACTIVE=prod \
    TZ=Europe/Prague
EXPOSE 8080
# uid 1000 is the "ubuntu" user of the Ubuntu base image and of the Oracle VM, so the mounted
# service-account key (owned by the VM's ubuntu user, chmod 600) stays readable.
USER 1000:1000
ENTRYPOINT ["java", "-XX:+ExitOnOutOfMemoryError", "-jar", "app.jar"]
