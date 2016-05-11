var gluster = require('./gluster');
var k8s = require('./k8s');
var config = require('./config');
var dns = require('dns');
var async = require('async');
var os = require('os');
var exec = exec = require('child_process').exec;

var loopSleepSeconds = config.loopSleepSeconds;
var unhealthySeconds = config.unhealthySeconds;

var hostIp = false;
var lastPods = [];

var init = function(done) {
  //Borrowed from here: http://stackoverflow.com/questions/3653065/get-local-ip-address-in-node-js
  var hostName = os.hostname();
  dns.lookup(hostName, function (err, addr) {
    if (err) {
      return done(err);
    }

    console.log('this pod ip: '+hostIp);
    hostIp = addr;

    done();
  });
};

var workloop = function workloop() {

    if (!hostIp) {
        throw new Error('Must initialize with the host machine\'s addr');
    }

    //check ips of pods with label GlusterFS
    k8s.getGlusterPods(function(err, pods){

        //filter just those that are not my ip
        var queriedPods = [];
        for(var i=0; i< pods.length; i+=1){
            if(hostIp !== pods[i].status.podIP){
                queriedPods.push(pods[i]);
            }
        }

        //compare with latest queried what pods are new
        var podsDetectedNew = [];
        for(var i=0; i<queriedPods.length; i+=1){
            var alreadyDetectedPod = false;
            for(var j=0; j<lastPods.length; j+=1){
                if(queriedPods[i].status.podIP == lastPods[j].status.podIP){
                    alreadyDetectedPod = true;
                    break;
                }
            }
            if(!alreadyDetectedPod && queriedPods[i].status.podIP !== undefined){
                podsDetectedNew.push(queriedPods[i]);
                console.log('new pod detected: '+queriedPods[i].status.podIP);
            }
        }

        //compare with latest queried what pods became obsolete
        var podsObsolete = [];
        for(var i=0; i<lastPods.length; i+=1){
            var foundPod = false;
            for(var j=0; j<queriedPods.length; j+=1){
                if(lastPods[i].status.podIP == queriedPods[j].status.podIP){
                    foundPod = true;
                    break;
                }
            }
            if(!foundPod){
                podsObsolete.push(lastPods[i]);
                console.log('obsolete pod detected: '+lastPods[i].status.podIP);
            }
        }

        if(podsDetectedNew.length > 0){

            //on this container exec gluster peer probe for all pods that are not this one
            var probes = [];
            var probedips = [];
            for(var i=0; i<podsDetectedNew.length; i+=1){
                var ip = podsDetectedNew[i].status.podIP;
                probes.push(function(callback){
                    console.log('probing: '+ip);
                    gluster.peerProbeServer(hostIp, ip, function(err, res){
                        if(!err){
                            probedips.push(ip);
                            console.log('probed: '+ip);
                            console.log(res);
                        }
                        callback(err, res);
                    });
                })
            }
            async.parallel(probes,function(err, results){
                if(err){
                    console.log(err);
                }else{
                    //build the new endpoint yaml
                    //kubectl replace -f newyaml of endpoints
                    var ips = [];
                    for(var i=0; i<podsDetectedNew.length; i+=1){
                        var podProbed = false;
                        for(var j=0; j<probedips.length; j+=1){
                            if(podsDetectedNew[i].status.podIP == probedips[j]){
                                podProbed = true;
                                break;
                            }
                        }
                        if(podProbed){
                            ips.push(podsDetectedNew[i].status.podIP);
                        }
                    }
                    gluster.setGlusterEndpoints(ips, function(err, res){
                        if(err){
                            console.log(err);
                        }else{
                            console.log('updated gluster endpoints');
                            console.log(res);
                        }
                    });
                }
            });

        }
        lastPods = queriedPods;

        //wait 5 seconds and check again ips
        setTimeout(workloop, loopSleepSeconds * 1000);

  });

};

module.exports = {
  init: init,
  workloop: workloop
};
