
var Client = require('node-kubernetes-client');
var config = require('./config');
var exec = require('child_process').exec;
var validator = require('validator');
var SSH = require('simple-ssh');
var fs = require('fs');

var readToken = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token');

var client = new Client({
  host:  config.kubernetesROServiceAddress,
  protocol: 'https',
  version: 'v1',
  token: readToken
});

var peerProbeServer = function(host, ip, callback){
    console.log('being asked to probe ip '+ip);
    if(validator.isIP(ip) && validator.isIP(host)){
        console.log('has valid ip '+ip);
        console.log('has valid host '+host);
        console.log('will connect by ssh ');
        var ssh = new SSH({
            host: host,
            user: 'root',
            pass: 'password'
        });
        var serr = '';
        var sout = '';
        console.log('will send the command by ssh');
        ssh.exec('gluster peer probe '+ip, {
            err: function(stderr){
                console.log('received stderr');
                serr += stderr;
            },
            out: function(stdout) {
                console.log('received stdout');
                sout += stdout;
            },
            exit: function(code){
                console.log('received exit '+code);
                if(code == 0){
                    callback(null, stdout);
                }else{
                    callback(code, stderr);
                }
            }
        }).start();
    }else{
        callback('invalid server ip and/or host ip');
    }
};

var setGlusterEndpoints = function setGlusterEndpoints(ips, callback){
    if(ips.length > 0){
        var body = {
            "kind": "Endpoints",
            "apiVersion": "v1",
            "metadata": {
                "name": "glusterfs-cluster"
            },
            "subsets": []
        };
        for(var i=0; i<ips.length; i+=1){
            body.subsets.push({
                "addresses": [
                    {
                        "ip": ips[i]
                    }
                ],
                "ports": [
                    {
                        "port":config.glusterClusterPort
                    }
                ]
            });
        }
        client.endpoints.update(config.glusterClusterName, body, function(err, res, body){
            callback(err, body);
        });
    }else{
        callback('cannot set empty endpoints');
    }
};

module.exports = {
  peerProbeServer: peerProbeServer,
  setGlusterEndpoints: setGlusterEndpoints
};
