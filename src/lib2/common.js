var config = require('./config');

function kubeCmd(podname, cmd) {
  var newCmd = "kubectl exec --namespace="+ config.k8snamespace + 
       " "+podname+" -- "+ cmd;
  return newCmd;
}

class Pod {
  constructor(podName) {
    this.podName = podName; 
  }

  kubeCmd(oldCmd) {
    return kubeCmd(this.podName, oldCmd);
  }
}

module.exports= {
    kubeCmd: kubeCmd,
    Pod: Pod,
}
