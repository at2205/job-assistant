# =============================================
# Backend: Spring Boot Multi-stage
# =============================================
FROM eclipse-temurin:17-jdk-alpine AS build
WORKDIR /app
COPY . .
RUN chmod +x mvnw && ./mvnw clean package -DskipTests -q

FROM eclipse-temurin:17-jre-alpine AS production
WORKDIR /app

# Security hardening
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN apk add --no-cache curl

COPY --from=build /app/target/*.jar app.jar
RUN chown appuser:appgroup app.jar

USER appuser

ENV JAVA_OPTS="-Xmx512m -Xms256m -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -Djava.security.egd=file:/dev/./urandom"
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=30s \
  CMD curl -f http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
