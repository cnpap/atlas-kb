FROM jenkins/jenkins:lts-jdk21

USER root

RUN apt-get update \
  && apt-get install -y --no-install-recommends awscli ca-certificates curl git gnupg jq \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
  && chmod a+r /etc/apt/keyrings/docker.asc \
  && . /etc/os-release \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends docker-buildx-plugin docker-ce-cli docker-compose-plugin \
  && rm -rf /var/lib/apt/lists/*

RUN git config --system http.version HTTP/1.1

COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

USER jenkins
