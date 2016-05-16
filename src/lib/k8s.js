var Client = require('node-kubernetes-client');
var config = require('./config');

fs = require('fs');

var readToken = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token');

var client = new Client({
  host:  config.kubernetesROServiceAddress,
  protocol: 'https',
  version: 'v1',
  token: readToken
});

var getGlusterPods = function getGlusterPods(done) {
  client.pods.get(function (err, podResult) {
    if (err) {
      return done(err);
    }
    var pods = [];
    for (var j in podResult) {
      pods = pods.concat(podResult[j].items)
    }
    var labels = config.glusterPodLabelCollection;
    var results = [];
    for (var i in pods) {
      var pod = pods[i];
      if (podContainsLabels(pod, labels) && podIsReady(pod)) {
        results.push(pod);
      }
    }

    done(null, results);
  });
};

var podIsReady = function podIsReady(pod){
    if(pod.status.phase === 'Running'){
        return true;
    }else{
        return false;
    }
};

var podContainsLabels = function podContainsLabels(pod, labels) {
  if (!pod.metadata || !pod.metadata.labels) return false;

  for (var i in labels) {
    var kvp = labels[i];
    if (!pod.metadata.labels[kvp.key] || pod.metadata.labels[kvp.key] != kvp.value) {
      return false;
    }
  }

  return true;
};

module.exports = {
  getGlusterPods: getGlusterPods
};
