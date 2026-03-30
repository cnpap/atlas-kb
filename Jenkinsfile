pipeline {
  agent any

  options {
    buildDiscarder(logRotator(numToKeepStr: "20", artifactNumToKeepStr: "10"))
    disableConcurrentBuilds()
    skipDefaultCheckout(true)
    timestamps()
  }

  parameters {
    booleanParam(
      name: "RUN_TESTS",
      defaultValue: true,
      description: "Run the Docker test stage before building the release image."
    )
    booleanParam(
      name: "USE_DIND",
      defaultValue: true,
      description: "Build and push the image through the isolated docker-dind daemon."
    )
    string(
      name: "IMAGE_TAG",
      defaultValue: "",
      description: "Optional release tag. Defaults to build-<BUILD_NUMBER>."
    )
  }

  environment {
    APP_NAME = "atlas-kb"
    BUILD_DOCKER_HOST = "tcp://docker-dind:2375"
    DEPLOY_DOCKER_HOST = "unix:///var/run/docker-host.sock"
    BUILD_REGISTRY = "zot:5000"
    DEPLOY_REGISTRY = "127.0.0.1:5000"
  }

  stages {
    stage("Checkout") {
      steps {
        deleteDir()
        checkout scm
      }
    }

    stage("Prepare") {
      steps {
        script {
          env.RESOLVED_COMPOSE_DIR = env.DOCKER_STACK_DIR?.trim()
            ? env.DOCKER_STACK_DIR.trim()
            : "/root/docker"
          env.RESOLVED_API_BASE_URL = env.ATLAS_KB_BUILD_API_BASE_URL?.trim()
            ? env.ATLAS_KB_BUILD_API_BASE_URL.trim()
            : "/"
          env.RESOLVED_IMAGE_TAG = params.IMAGE_TAG?.trim()
            ? params.IMAGE_TAG.trim()
            : "build-${env.BUILD_NUMBER}"
          env.BUILD_IMAGE = "${env.BUILD_REGISTRY}/${env.APP_NAME}:${env.RESOLVED_IMAGE_TAG}"
          env.BUILD_IMAGE_LATEST = "${env.BUILD_REGISTRY}/${env.APP_NAME}:latest"
          env.DEPLOY_IMAGE = "${env.DEPLOY_REGISTRY}/${env.APP_NAME}:${env.RESOLVED_IMAGE_TAG}"
          env.TEST_RUNNER_IMAGE = "${env.APP_NAME}:ci-${env.BUILD_NUMBER}"
          env.WEB_BUILD_IMAGE = "${env.APP_NAME}:web-build-${env.BUILD_NUMBER}"
          env.SELECTED_BUILD_DOCKER_HOST = params.USE_DIND
            ? env.BUILD_DOCKER_HOST
            : env.DEPLOY_DOCKER_HOST

          env.RESOLVED_TEST_NETWORK = sh(
            script: """
              set -eu
              DOCKER_HOST="${env.DEPLOY_DOCKER_HOST}" docker network ls --format '{{.Name}}' | awk '/_app-network\$/ { print; exit }'
            """,
            returnStdout: true,
          ).trim()

          if (!env.RESOLVED_TEST_NETWORK) {
            error("Could not resolve the Atlas KB application Docker network.")
          }
        }
      }
    }

    stage("Verify Docker") {
      steps {
        sh '''
          set -eu
          DOCKER_HOST="${SELECTED_BUILD_DOCKER_HOST}" docker version
          DOCKER_HOST="${DEPLOY_DOCKER_HOST}" docker version
          DOCKER_HOST="${DEPLOY_DOCKER_HOST}" docker compose -f "${RESOLVED_COMPOSE_DIR}/compose.yml" config -q
          test -n "${RESOLVED_TEST_NETWORK}"
          DOCKER_HOST="${DEPLOY_DOCKER_HOST}" docker network inspect "${RESOLVED_TEST_NETWORK}" >/dev/null
        '''
      }
    }

    stage("Test") {
      when {
        expression { return params.RUN_TESTS }
      }
      steps {
        sh '''
          set -eu
          DOCKER_HOST="${DEPLOY_DOCKER_HOST}" docker build \
            --target ci-runner \
            --secret id=github_token_classic,env=JENKINS_GITHUB_TOKEN \
            -t "${TEST_RUNNER_IMAGE}" \
            .

          DOCKER_HOST="${DEPLOY_DOCKER_HOST}" docker run --rm \
            --network "${RESOLVED_TEST_NETWORK}" \
            --env-file "${RESOLVED_COMPOSE_DIR}/atlas-kb.env" \
            "${TEST_RUNNER_IMAGE}" \
            sh -lc 'bun run lint && bun run test'
        '''
      }
    }

    stage("Build Web Artifacts") {
      steps {
        sh '''
          set -eu
          export VITE_API_BASE_URL="${RESOLVED_API_BASE_URL}"
          rm -rf .artifacts/web-dist
          mkdir -p .artifacts/web-dist

          DOCKER_HOST="${SELECTED_BUILD_DOCKER_HOST}" docker build \
            --target web-build \
            --secret id=github_token_classic,env=JENKINS_GITHUB_TOKEN \
            --build-arg VITE_API_BASE_URL="${RESOLVED_API_BASE_URL}" \
            -t "${WEB_BUILD_IMAGE}" \
            .

          WEB_CONTAINER_ID="$(DOCKER_HOST="${SELECTED_BUILD_DOCKER_HOST}" docker create "${WEB_BUILD_IMAGE}")"
          trap 'DOCKER_HOST="${SELECTED_BUILD_DOCKER_HOST}" docker rm -f "${WEB_CONTAINER_ID}" >/dev/null 2>&1 || true' EXIT
          DOCKER_HOST="${SELECTED_BUILD_DOCKER_HOST}" docker cp "${WEB_CONTAINER_ID}:/app/packages/web/dist/." ".artifacts/web-dist"
          DOCKER_HOST="${SELECTED_BUILD_DOCKER_HOST}" docker rm -f "${WEB_CONTAINER_ID}" >/dev/null
          trap - EXIT

          test -f .artifacts/web-dist/index.html
        '''
      }
    }

    stage("Build Backend Image") {
      steps {
        sh '''
          set -eu
          DOCKER_HOST="${SELECTED_BUILD_DOCKER_HOST}" docker build \
            --target api-runtime \
            --secret id=github_token_classic,env=JENKINS_GITHUB_TOKEN \
            -t "${BUILD_IMAGE}" \
            -t "${BUILD_IMAGE_LATEST}" \
            .
        '''
      }
    }

    stage("Push Backend Image") {
      steps {
        sh '''
          set -eu
          DOCKER_HOST="${SELECTED_BUILD_DOCKER_HOST}" docker push "${BUILD_IMAGE}"
          DOCKER_HOST="${SELECTED_BUILD_DOCKER_HOST}" docker push "${BUILD_IMAGE_LATEST}"
        '''
      }
    }

    stage("Publish Frontend") {
      steps {
        sh '''
          set -eu
          set +x
          set -a
          . "${RESOLVED_COMPOSE_DIR}/.env"
          . "${RESOLVED_COMPOSE_DIR}/atlas-kb.env"
          set +a
          set -x

          ./deploy/scripts/publish-web-to-rustfs.sh ".artifacts/web-dist"
        '''
      }
    }

    stage("Deploy Backend") {
      steps {
        sh '''
          set -eu
          cd "${RESOLVED_COMPOSE_DIR}"

          DOCKER_HOST="${DEPLOY_DOCKER_HOST}" \
          ATLAS_KB_IMAGE="${DEPLOY_IMAGE}" \
          docker compose pull atlas-kb

          DOCKER_HOST="${DEPLOY_DOCKER_HOST}" \
          ATLAS_KB_IMAGE="${DEPLOY_IMAGE}" \
          docker compose up -d --force-recreate atlas-kb
        '''
      }
    }

    stage("Verify Deployment") {
      steps {
        sh '''
          set -eu
          DOCKER_HOST="${DEPLOY_DOCKER_HOST}" docker ps --filter "name=atlas-kb"
          HEALTH_STATUS=""
          for attempt in $(seq 1 30); do
            HEALTH_STATUS="$(DOCKER_HOST="${DEPLOY_DOCKER_HOST}" docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' atlas-kb)"
            if [ "${HEALTH_STATUS}" = "healthy" ]; then
              break
            fi
            sleep 2
          done
          test "${HEALTH_STATUS}" = "healthy"

          curl --fail --silent --show-error \
            --header "Host: atlas-kb.apitype.com" \
            "http://caddy:7171/api/health" >/tmp/atlas-kb-api-health.json

          curl --fail --silent --show-error \
            --header "Host: atlas-kb.apitype.com" \
            "http://caddy:7171/" >/tmp/atlas-kb-web-home.html

          test -s /tmp/atlas-kb-api-health.json
          test -s /tmp/atlas-kb-web-home.html
        '''
      }
    }
  }

  post {
    always {
      sh '''
        rm -rf .artifacts /tmp/atlas-kb-api-health.json /tmp/atlas-kb-web-home.html

        if [ -n "${TEST_RUNNER_IMAGE:-}" ]; then
          DOCKER_HOST="${DEPLOY_DOCKER_HOST}" docker image rm -f "${TEST_RUNNER_IMAGE}" >/dev/null 2>&1 || true
        fi

        if [ -n "${WEB_BUILD_IMAGE:-}" ]; then
          DOCKER_HOST="${SELECTED_BUILD_DOCKER_HOST}" docker image rm -f "${WEB_BUILD_IMAGE}" >/dev/null 2>&1 || true
        fi
      '''
    }
  }
}
