
var Client = require('node-kubernetes-client');
var config = require('./config');
var exec = require('child_process').exec;
var validator = require('validator');
var fs = require('fs');

var readToken = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token');

var client = new Client({
  host:  config.kubernetesROServiceAddress,
  protocol: 'https',
  version: 'v1',
  token: readToken
});

var peerProbeServer = function(hostip, podname, ip, callback){
    console.log('being asked to probe ip '+ip);
    if(validator.isIP(ip)){
        console.log('has valid ip '+ip);
        var cmd = "kubectl exec "+podname+" -- gluster peer probe "+ip;
        console.log(cmd);
        exec(cmd, function(err, stdout, stderr){
            console.log(stdout);
            if(err){
                console.log(ip);
                console.log(err);
                callback(err, stderr);
            }else{
                cmd = "kubectl exec "+podname+" -- gluster volume create "+process.env.GLUSTERVOLNAME+" "+hostip+":/data force";
                console.log(cmd);
                exec(cmd, function(err, stdout, stderr){
                    console.log(stdout);
                    if(err){
                        console.log(err);
                        console.log(stderr);
                    }
                    cmd = "kubectl exec "+podname+" -- gluster volume start "+process.env.GLUSTERVOLNAME;
                    console.log(cmd);
                    exec(cmd, function(err, stdout, stderr){
                        console.log(stdout);
                        if(err){
                            console.log(err);
                            console.log(stderr);
                        }
                        callback(null, stdout);
                    });
                });
            }
        });
    }else{
        callback('invalid server ip and/or host ip');
    }
};

module.exports = {
  peerProbeServer: peerProbeServer,
  setGlusterEndpoints: setGlusterEndpoints
};
