# Stage 1: Frontend build with Node 22 LTS
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install --legacy-peer-deps
COPY frontend/ .
RUN npm run build

# Stage 2: Backend build with frontend static embedding
FROM maven:3.9-eclipse-temurin-21 AS backend-build
WORKDIR /app/backend
COPY backend/pom.xml .
RUN mvn -f pom.xml -q dependency:resolve
COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist /app/fe-dist
ARG COMMIT_SHA=local
ARG BUILD_VERSION=dev
# Create build-info.properties before Maven processes it with release version and commit SHA
# Placed in src/main/resources/ (not META-INF/) so Spring Boot repackage keeps it in BOOT-INF/classes/
RUN mkdir -p src/main/resources && \
    echo "build.name=andjoy-gitops" > src/main/resources/build-info.properties && \
    echo "build.version=${BUILD_VERSION}" >> src/main/resources/build-info.properties && \
    echo "build.group=com.gitlabops" >> src/main/resources/build-info.properties && \
    echo "build.artifact=andjoy-gitops-backend" >> src/main/resources/build-info.properties && \
    echo "build.time=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> src/main/resources/build-info.properties && \
    echo "build.git.commit.id=${COMMIT_SHA}" >> src/main/resources/build-info.properties
# Copy static files into the resources directory for Spring Boot to embed them
RUN mkdir -p src/main/resources/static && cp -r /app/fe-dist/* src/main/resources/static/
# Build: Maven package handles resources, static embedding, and repackage
RUN mvn -f pom.xml -q clean package -DskipTests

# Stage 3: Runtime image (Debian-based for argon2-jvm glibc compatibility)
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
COPY --from=backend-build /app/backend/target/*.jar app.jar
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 8090
ENTRYPOINT ["java", "-jar", "app.jar"]

