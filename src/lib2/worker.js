'use strict';

var config = require('./config');
var selfawareness = require('./determination');
var k8s = require('./k8s');
var gluster = require('./gluster');

var loopSleepSeconds = config.loopSleepSeconds;
var unhealthySeconds = config.unhealthySeconds;

var ctx = {
    volumename:config.volumename,
    brickname:config.brickname,
    replication:config.replication,
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
                    console.log(JSON.stringify(ctx));
                    k8s.createServiceIfNotExists(ctx, port, labels, function(err){
                        if(!err){
                            gluster.peerProbeServer2IfReady(ctx, function(err){
                                if(!err){
                                    gluster.createVolumeIfNotExists(ctx, function(err){
                                        if(!err){
                                            gluster.startVolumeIfNotStarted(ctx, function(err){
                                                if(!err){
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
