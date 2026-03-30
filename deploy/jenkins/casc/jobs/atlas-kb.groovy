def atlasKbJobName = System.getenv("JENKINS_ATLAS_KB_JOB") ?: "atlas-kb"
def atlasKbRepositoryUrl =
  System.getenv("JENKINS_ATLAS_KB_REPOSITORY_URL") ?: "https://github.com/cnpap/atlas-kb.git"
def atlasKbBranch = System.getenv("JENKINS_ATLAS_KB_BRANCH") ?: "*/main"
def atlasKbCredentialsId =
  System.getenv("JENKINS_GITHUB_CREDENTIALS_ID") ?: "atlas-kb-github-token"
def atlasKbUseCredentials =
  (System.getenv("JENKINS_ATLAS_KB_USE_CREDENTIALS") ?: "false").toBoolean()
def atlasKbPollSchedule =
  System.getenv("JENKINS_ATLAS_KB_POLL_SCHEDULE") ?: "H/5 * * * *"

pipelineJob(atlasKbJobName) {
  displayName("atlas-kb")
  description("Builds the backend image, publishes the web console to RustFS, and deploys atlas-kb through Docker Compose.")

  logRotator {
    numToKeep(20)
    artifactNumToKeep(10)
  }

  parameters {
    booleanParam("RUN_TESTS", true, "Run the Docker test stage before building the release image.")
    booleanParam("USE_DIND", true, "Build and push the image through the isolated docker-dind daemon.")
    stringParam("IMAGE_TAG", "", "Optional release tag. Defaults to build-<BUILD_NUMBER>.")
  }

  triggers {
    githubPush()
    scm(atlasKbPollSchedule)
  }

  definition {
    cpsScm {
      scm {
        git {
          remote {
            url(atlasKbRepositoryUrl)
            if (atlasKbUseCredentials && atlasKbCredentialsId?.trim()) {
              credentials(atlasKbCredentialsId)
            }
          }
          branch(atlasKbBranch)
          extensions {
            cleanBeforeCheckout()
            pruneBranches()
          }
        }
      }
      scriptPath("Jenkinsfile")
      lightweight(false)
    }
  }

  properties {
    disableConcurrentBuilds()
  }
}
