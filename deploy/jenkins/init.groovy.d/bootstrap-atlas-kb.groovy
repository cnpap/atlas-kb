import jenkins.model.Jenkins
import org.jenkinsci.plugins.workflow.job.WorkflowJob

Thread.startDaemon("atlas-kb-bootstrap") {
  while (Jenkins.instanceOrNull == null) {
    sleep(1000)
  }

  sleep(10000)

  def jobName = System.getenv("JENKINS_ATLAS_KB_JOB") ?: "atlas-kb"
  def dockerHost = "unix:///var/run/docker-host.sock"
  def jenkins = Jenkins.instance
  WorkflowJob job = null

  for (int attempt = 0; attempt < 30; attempt++) {
    job = jenkins.getItemByFullName(jobName, WorkflowJob)
    if (job != null) {
      break
    }
    sleep(1000)
  }

  if (job == null) {
    println("[atlas-kb/jenkins] bootstrap skipped: missing job ${jobName}")
    return
  }

  if (job.getLastBuild() != null) {
    println("[atlas-kb/jenkins] bootstrap skipped: ${jobName} already has build history")
    return
  }

  def process = [
    "docker",
    "--host=${dockerHost}",
    "container",
    "inspect",
    "atlas-kb",
  ].execute()
  process.waitFor()

  if (process.exitValue() == 0) {
    println("[atlas-kb/jenkins] bootstrap skipped: atlas-kb container already exists")
    return
  }

  if (job.scheduleBuild2(0) != null) {
    println("[atlas-kb/jenkins] scheduled initial build for ${jobName}")
    return
  }

  println("[atlas-kb/jenkins] bootstrap skipped: failed to schedule ${jobName}")
}
