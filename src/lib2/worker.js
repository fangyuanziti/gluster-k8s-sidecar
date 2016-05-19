'use strict';

var config = require('./config');
var selfawareness = require('./determination');
var k8s = require('./k8s');
var gluster = require('./gluster');

var loopSleepSeconds = config.loopSleepSeconds;
var unhealthySeconds = config.unhealthySeconds;

var ctx = {
    k8snamespace:config.k8snamespace,
    volumename:config.glusterVolumeName,
    brickname:config.glusterBrickName,
    replication:config.glusterReplication,
    labels:config.glusterPodLabelCollection,
    servicename:config.glusterClusterName,
    clusterport:config.glusterClusterPort,
    this:{
        podname:'',
        ip:'',
        hostname:''
    },
    glusterrcs:[],
    glusterpods:[],
    glusterservices:[]
};

var init = function(done){

    selfawareness.whoAmI(ctx, function(err){
        done(err);
    });

};

var workloop = function(){

    selfawareness.readKubernetesContext(ctx, function(err){
        if(!err){
            var role = selfawareness.whatRoleShouldITake(ctx);
            switch(role){
                case 'server1':{
                    console.log('k8s.createServiceIfNotExists');
                    k8s.createServiceIfNotExists(ctx, function(err){
                        if(!err){
                            console.log('gluster.peerProbeServer2IfReady');
                            gluster.peerProbeServer2IfReady(ctx, function(err){
                                if(!err){
                                    console.log('gluster.createVolumeIfNotExists');
                                    gluster.createVolumeIfNotExists(ctx, function(err){
                                        if(!err){
                                            console.log('gluster.startVolumeIfNotStarted');
                                            gluster.startVolumeIfNotStarted(ctx, function(err){
                                                if(!err){
                                                    console.log('gluster.expandIfNecessary');
                                                    gluster.expandIfNecessary(ctx, function(err){
                                                        if(!err){
                                                            finish();
                                                        }else{
                                                            finish(err);
                                                        }
                                                    });
                                                }else{
                                                    finish(err);
                                                }
                                            });
                                        }else{
                                            finish(err);
                                        }
                                    });
                                }else{
                                    finish(err);
                                }
                            });
                        }else{
                            finish(err);
                        }
                    });
                    break;
                }
                case 'server2':{
                    gluster.peerProbeServer1(ctx, function(err){
                        if(!err){
                            finish();
                        }else{
                            finish(err);
                        }
                    });
                    break;
                }
                case 'serverX':{
                    finish();
                    break;
                }
                default:{
                    finish('unable to self determine');
                    break;
                }
            }
        }else{
            finish(err);
        }
    });

};

function finish(err){
    if(err){
        console.log(err);
        console.log('Sleeping '+unhealthySeconds+' seconds...');
        setTimeout(workloop, unhealthySeconds*1000);
    }else{
        setTimeout(workloop, loopSleepSeconds*1000);
    }
}

module.exports = {
    init: init,
    workloop: workloop
};
