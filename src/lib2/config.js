var getGlusterPodLabels = function() {
  return process.env.GLUSTER_SIDECAR_POD_LABELS || 'role=gluster,environment=test';
};

var getGlusterPodLabelCollection = function() {
  var podLabels = getGlusterPodLabels();
  if (!podLabels) {
    return false;
  }
  var labels = process.env.GLUSTER_SIDECAR_POD_LABELS.split(',');
  for (var i in labels) {
    var keyAndValue = labels[i].split('=');
    labels[i] = {
      key: keyAndValue[0],
      value: keyAndValue[1]
    };
  }

  return labels;
};

var getKubernetesROServiceAddress = function() {
  return process.env.KUBERNETES_SERVICE_HOST + ":" + process.env.KUBERNETES_SERVICE_PORT
};

module.exports = {
  loopSleepSeconds: process.env.GLUSTER_SIDECAR_SLEEP_SECONDS || 5,
  unhealthySeconds: process.env.GLUSTER_SIDECAR_UNHEALTHY_SECONDS || 15,
  glusterClusterName: process.env.GLUSTER_SIDECAR_CLUSTER_NAME || 'glusterfs-cluster',
  glusterClusterPort: process.env.GLUSTER_SIDECAR_CLUSTER_PORT || 1,
  glusterVolumeName: process.env.GLUSTER_SIDECAR_VOLUME_NAME || 'data',
  glusterBrickName: process.env.GLUSTER_SIDECAR_BRICK_NAME || 'data',
  glusterReplication: process.env.GLUSTER_SIDECAR_REPLICATION || 2,
  env: process.env.NODE_ENV || 'local',
  glusterPodLabels: getGlusterPodLabels(),
  glusterPodLabelCollection: getGlusterPodLabelCollection(),
  kubernetesROServiceAddress: getKubernetesROServiceAddress()
};
