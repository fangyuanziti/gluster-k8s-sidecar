var gluster = require('./gluster');
var k8s = require('./k8s');
var config = require('./config');
var dns = require('dns');
var async = require('async');
var os = require('os');
var exec = require('child_process').exec;

var loopSleepSeconds = config.loopSleepSeconds;
var unhealthySeconds = config.unhealthySeconds;

var hostIp = false;
var thisPodName = false;
var lastPods = [];

var init = function(done) {
  //Borrowed from here: http://stackoverflow.com/questions/3653065/get-local-ip-address-in-node-js
  var hostName = os.hostname();
  dns.lookup(hostName, function (err, addr) {
    if (err) {
      return done(err);
    }

    hostIp = addr;
    console.log('this pod ip: '+hostIp);

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
        var healthyPeeredPods = [];
        var queriedPods = [];
        for(var i=0; i< pods.length; i+=1){
            if(hostIp !== pods[i].status.podIP && pods[i].status.podIP !== undefined){
                queriedPods.push(pods[i]);
            }else{
                if(hostIp == pods[i].status.podIP){
                    if(thisPodName == false){
                        console.log('this pod name: '+pods[i].metadata.name);
                    }
                    thisPodName = pods[i].metadata.name;
                }
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
            if(!foundPod && lastPods[i].status.podIP !== undefined){
                podsObsolete.push(lastPods[i]);
                console.log('obsolete pod detected: '+lastPods[i].status.podIP);
            }
        }

        var ips = [];
        for(var i=0; i<lastPods.length; i+=1){
            var stillAlive = true;
            for(var j=0; j<podsObsolete.length; j+=1){
                if(lastPods[i].status.podIP == podsObsolete[j].status.podIP){
                    stillAlive = false;
                    break;
                }
            }
            if(stillAlive){
                ips.push(lastPods[i].status.podIP);
                healthyPeeredPods.push(lastPods[i]);
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
                    gluster.peerProbeServer(hostIp, thisPodName, ip, function(err, res){
                        if(!err){
                            probedips.push(ip);
                            console.log('probed: '+ip);
                        }else{
                            console.log(err);
                        }
                        console.log(res);
                        callback(err, res);
                    });
                })
            }
            async.parallel(probes,function(err, results){
                if(err){
                    console.log(err);
                    finish();
                }else{
                    //build the new endpoint yaml
                    //kubectl replace -f newyaml of endpoints
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
                            healthyPeeredPods.push(podsDetectedNew[i]);
                        }
                    }
                    console.log('healthy cluster ips ', ips);
                    finish();
                }
            });

        }else{
            finish();
        }

        function finish(){
            lastPods = healthyPeeredPods;
            //wait 5 seconds and check again ips
            setTimeout(workloop, loopSleepSeconds * 1000);
        }

  });

};

module.exports = {
  init: init,
  workloop: workloop
};
