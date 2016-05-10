var worker = require('./lib/worker');

console.log('Starting up gluster-k8s-sidecar');

worker.init(function(err) {
  if (err) {
    console.error('Error trying to initialize gluster-k8s-sidecar', err);
  }

  worker.workloop();
});
