'use strict';

var config = require('./config');
var Client = require('node-kubernetes-client');
var fs = require('fs');
var async = require('async');
var os = require('os');
var dns = require('dns');

var readToken = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token');

var client = new Client({
    host:  config.kubernetesROServiceAddress,
    protocol: 'https',
    version: 'v1',
    token: readToken
});

var whoAmI = function(ctx, done){

    var hostName = os.hostname();
    dns.lookup(hostName, function (err, addr) {
        if (err) {
            return done(err);
        }
        ctx.this.ip = addr;
        ctx.this.hostname = hostName;
        client.pods.get(function(err, podsres){
            if(!err){
                var podlist = podsres[0];
                if(podlist){
                    var pods = podlist.items;
                    for(var i=0; i<pods.length; i+=1){
                        if(pods[i].status && pods[i].status.podIP && ctx.this.ip == pods[i].status.podIP){
                            ctx.this.podname = pods[i].metadata.name;
                        }
                    }
                    done(null);
                }else{
                    done('kubernetes unexpected response, no pods')
                }
            }else{
                done(['could not get pods',err]);
            }
        });
    });

};

var whatRoleShouldITake = function(ctx){

    var howCloseAmIToLeadership = -1;
    for(var i=0; i<ctx.glusterpods.length; i+=1){
        if(ctx.this.ip == ctx.glusterpods[i].status.podIP){
            howCloseAmIToLeadership = i;
            break;
        }
    }
    switch(howCloseAmIToLeadership){
        case 0:{
            return 'server1';
        }
        case 1:{
            return 'server2';
        }
        default:{
            if(howCloseAmIToLeadership > 1){
                return 'serverX';
            }else{
                return 'indifferent existentialist nihilist';
            }
        }
    }

};

var readKubernetesContext = function(ctx, done){

    async.parallel([function(cb){
        var glusterrcs = [];
        client.replicationControllers.get(function(err,rcres){
            if(!err){
                var rclist = rcres[0];
                if(rclist){
                    var rcs = rclist.items;
                    for(var i=0; i<rcs.length; i+=1){
                        if(rcSelectorWithLabels(rcs[i], ctx.labels) && rcIsReady(rcs[i])){
                            glusterrcs.push(rcs[i]);
                        }
                    }
                    //base criteria in resource controller creation time
                    glusterrcs.sort(function(a,b){
                        var ats = (new Date(a.metadata.creationTimestamp)).getTime();
                        var bts = (new Date(b.metadata.creationTimestamp)).getTime();
                        if(ats < bts){
                            return -1;
                        }else if(ats > bts){
                            return 1;
                        }else{
                            return 0;
                        }
                    });
                    ctx.glusterrcs = glusterrcs;
                    var glusterpods = [];
                    client.pods.get(function(err,podsres){
                        if(!err){
                            var podslist = podsres[0];
                            if(podslist){
                                var pods = podslist.items;
                                for(var i=0; i<glusterrcs.length; i+=1){//get pods in order of rc creation
                                    for(var j=0; j<pods.length; j+=1){
                                        if(podContainsLabels(pods[j], [{name:glusterrcs[i].spec.selector.name}]) && podIsReady(pods[j])){
                                            glusterpods.push(pods[j]);
                                        }
                                    }
                                }
                                ctx.glusterpods = glusterpods;
                                cb(null);
                            }else{
                                cb('kubernetes unexpected response, no podslist');
                            }
                        }else{
                            cb(['could not get pods',err]);
                        }
                    });
                }else{
                    cb('kubernetes unexpected response, no rc list');
                }
            }else{
                cb(['could not get rcs',err]);
            }
        });
    },function(cb){
        client.services.get(function(err,svcres){
            if(!err){
                var svclist = svcres[0];
                if(svclist){
                    var services = svclist.items;
                    var glusterservices = [];
                    for(var i=0; i<services.length; i+=1){
                        if(svcSelectorWithLabels(services[i], ctx.labels)){
                            glusterservices.push(services[i]);
                        }
                    }
                    ctx.glusterservices = glusterservices;
                    cb(null);
                }else{
                    cb('kubernetes unexpected response, no svc list');
                }
            }else{
                cb(['could not get svcs',err]);
            }
        });
    }],function(err,results){
        if(!err){
            done(null);
        }else{
            done(err);
        }
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

var rcIsReady = function rcIsReady(rc){
    if(rc.status.replicas == 1){
        return true;
    }else{
        return false;
    }
};

var rcSelectorWithLabels = function rcSelectorWithLabels(rc, labels) {
  if (!rc.spec || !rc.spec.selector) return false;

  for (var i in labels) {
    var kvp = labels[i];
    if (!rc.spec.selector[kvp.key] || rc.spec.selector[kvp.key] != kvp.value) {
      return false;
    }
  }

  return true;
};

var svcSelectorWithLabels = function svcSelectorWithLabels(svc, labels) {
  if (!svc.spec || !svc.spec.selector) return false;

  for (var i in labels) {
    var kvp = labels[i];
    if (!svc.spec.selector[kvp.key] || svc.spec.selector[kvp.key] != kvp.value) {
      return false;
    }
  }

  return true;
};



module.exports = {
    whoAmI:whoAmI,
    whatRoleShouldITake:whatRoleShouldITake,
    readKubernetesContext:readKubernetesContext
};
