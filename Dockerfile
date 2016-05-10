FROM node:latest
MAINTAINER neshte

COPY . /opt/neshte/gluster-k8s-sidecar

WORKDIR /opt/neshte/gluster-k8s-sidecar

RUN npm install

CMD ["npm", "start"]
