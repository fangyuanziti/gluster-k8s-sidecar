'use strict';

var selfheal = require('./selfheal');
var async = require('async');
var exec = require('child_process').exec;
var dns = require('dns');
var config = require('./config');
const INDEX_SERVER1 = 0;
const INDEX_SERVER2 = 1;
const REBALANCE_QUERYSTATUS_INTERVAL = 5;
const REBALANCE_QUERYSTATUS_MAXQUERIES = 25;

var kubeCmd = require('./common').kubeCmd;

var checkStatusOfPeersAndMakeSureEverythingIsRight = function(ctx, done){

    if(ctx.glusterpods.length > 1){
        var cmd = kubeCmd(ctx.this.podname, "gluster peer status");
        console.log(cmd);
        exec(cmd,function(err,stdout,stderr){
            console.log(stdout);
            console.log(stderr);
            if(!err){
                var peerInfo = parsePeerStatuses(stdout);
                console.log('parsed peers: ',peerInfo);
                var tasks = [];
                for(var i=0; i<peerInfo.length; i+=1){
                    if(peerInfo[i]['State'].indexOf('Disconnected')>-1 || peerInfo[i]['State'].indexOf('Rejected')>-1){
                        (function(peer){
                            tasks.push(function(cb){
                                selfheal.tryToRecoverPeer(ctx, peer, peerInfo, function(err){
                                    if(!err){
                                        cb(null,null);
                                    }else{
                                        cb(err,null);
                                    }
                                });
                            });
                        })(peerInfo[i]);
                    }
                }
                if(tasks.length > 0){
                    async.series(tasks,function(err, results){
                        if(!err){
                            done(null);
                        }else{
                            done(err);
                        }
                    });
                }else{
                    done(null);
                }
            }else{
                done([err,stderr]);
            }
        });
    }else{
        done(null);
    }

};

var parsePeerStatuses = function(stdout){

    var parts = stdout.split("\nHostname: ");
    var peers = [];
    for(var i=0; i<parts.length; i+=1){
        var part = "Hostname: "+parts[i];
        var lines = part.split("\n");
        var obj = {};
        for(var j=0; j<lines.length; j+=1){
            var keyval = lines[j].split(": ");
            if(keyval.length == 2){
                obj[keyval[0].trim()] = keyval[1].trim();
            }
        }
        if(obj['Hostname'] && obj['Uuid'] && obj['State']){
            peers.push(obj);
        }
    }
    return peers;

};

//Purpose: to create trusted storage pool
var peerProbeServer2IfReady = function(ctx, done){

    if(typeof ctx.glusterpods[INDEX_SERVER2] !== 'undefined'){
        var cmd = kubeCmd(ctx.this.podname, "gluster peer status");
        console.log(cmd);
        exec(cmd,function(err,stdout,stderr){
            console.log(stdout);
            console.log(stderr);
            if(!err){
                var checks = [ctx.glusterpods[INDEX_SERVER2].status.podIP];
                var found = false;
                dns.reverse(ctx.glusterpods[INDEX_SERVER2].status.podIP,function(err,domains){
                    if(!err){
                        for(var i=0; i<domains.length; i++){
                            checks.push(domains[i]);
                        }
                    }
                    for(var i=0; i<checks.length; i++){
                        if(stdout.indexOf('Hostname: '+checks[i])>-1){
                            found = true;
                            break;
                        }
                    }
                    if(!found){
                        var cmd = kubeCmd(ctx.this.podname, "gluster peer probe "+ctx.glusterpods[INDEX_SERVER2].status.podIP);

                        console.log(cmd);
                        exec(cmd,function(err,stdout,stderr){
                            console.log(stdout);
                            console.log(stderr);
                            if(!err){
                                done(null);
                            }else{
                                done([err,stderr]);
                            }
                        });
                    }else{
                        done(null);
                    }
                });
            }else{
                done([err,stderr]);
            }
        });
    }else{
        done(null);
    }

};

//to complete trusted storage pool configuration
var peerProbeServer1 = function(ctx, done){

    if(typeof ctx.glusterpods[INDEX_SERVER1] !== 'undefined'){
        var cmd =kubeCmd(ctx.this.podname, "gluster peer status");
        console.log(cmd);
        exec(cmd,function(err,stdout,stderr){
            console.log(stdout);
            console.log(stderr);
            if(!err){
                var checks = [ctx.glusterpods[INDEX_SERVER1].status.podIP];
                var found = false;
                dns.reverse(ctx.glusterpods[INDEX_SERVER1].status.podIP,function(err,domains){
                    if(!err){
                        for(var i=0; i<domains.length; i++){
                            checks.push(domains[i]);
                        }
                    }
                    for(var i=0; i<checks.length; i++){
                        if(stdout.indexOf('Hostname: '+checks[i])>-1){
                            found = true;
                            break;
                        }
                    }
                    if(!found){
                        var cmd = kubeCmd(ctx.this.podname, "gluster peer probe "+ctx.glusterpods[INDEX_SERVER1].status.podIP);
                        console.log(cmd);
                        exec(cmd,function(err,stdout,stderr){
                            console.log(stdout);
                            console.log(stderr);
                            if(!err){
                                done(null);
                            }else{
                                done([err,stderr]);
                            }
                        });
                    }else{
                        done(null);
                    }
                });
            }else{
                done([err,stderr]);
            }
        });
    }else{
        done(null);
    }

};

var createVolumeIfNotExists = function(ctx, done){

    //also if server2 does not exist, don't create volume, until trusted storage pool has been created
    if(typeof ctx.glusterpods[INDEX_SERVER2] !== 'undefined'){
        var cmd = kubeCmd(ctx.this.podname, "gluster volume info all");
        console.log(cmd);
        exec(cmd,function(err,stdout,stderr){
            console.log(stdout);
            console.log(stderr);
            if(!err){
                if(stdout.indexOf('Volume Name: '+ctx.volumename)<=-1){
                    var cmd = kubeCmd(ctx.this.podname, "gluster volume create "+ctx.volumename+" replica "+ctx.replication+" transport tcp "+ctx.this.ip+":/"+ctx.brickname+"/brick "+ctx.glusterpods[INDEX_SERVER2].status.podIP+":/"+ctx.brickname+"/brick");
                    console.log(cmd);
                    exec(cmd,function(err,stdout,stderr){
                        console.log(stdout);
                        console.log(stderr);
                        if(!err){
                            done(null);
                        }else{
                            done([err,stderr]);
                        }
                    });
                }else{
                    done(null);
                }
            }else{
                done([err,stderr]);
            }
        });
    }else{
        done(null);
    }

};

var startVolumeIfNotStarted = function(ctx, done){

    var cmd = kubeCmd(ctx.this.podname, "gluster volume info "+ctx.volumename);
    console.log(cmd);
    exec(cmd,function(err,stdout,stderr){
        console.log(stdout);
        if(!err){
            if(stdout.indexOf('Status: Started')<=-1){
                var cmd = kubeCmd(ctx.this.podname, "gluster volume start "+ctx.volumename);
                console.log(cmd);
                exec(cmd,function(err,stdout,stderr){
                    console.log(stdout);
                    console.log(stderr);
                    if(!err){
                        done(null);
                    }else{
                        done([err,stderr]);
                    }
                });
            }else{
                done(null);
            }
        }else{
            if(stderr.indexOf('Volume data does not exist')>-1){
                done(null);
            }else{
                console.log(stderr);
                done([err,stderr]);
            }
        }
    });

};

var expandIfNecessary = function(ctx, done){

    //When expanding distributed replicated and distributed striped volumes, you need to add a number of bricks that is a multiple of the replica or stripe count
    //http://www.gluster.org/community/documentation/index.php/Gluster_3.1:_Expanding_Volumes
    getOrphanPodsInMultiplesOf(ctx, function(err, orphanPods){
        if(!err){
            var tasks = [];
            for(var i=0; i<orphanPods.length; i+=1){
                (function(orphanPod){
                    tasks.push(function(cb){
                        probePod(ctx, orphanPod, function(err){
                            if(!err){
                                cb(null,null);
                            }else{
                                cb(err,null);
                            }
                        });
                    });
                })(orphanPods[i]);
            }
            async.parallel(tasks, function(err,results){
                if(!err){
                    addBricksIfMissing(ctx, function(err,numbricksadded){
                        if(!err){
                            if(numbricksadded > 0){
                                rebalanceNodes(ctx, function(err){
                                    if(!err){
                                        done(null);
                                    }else{
                                        done(err);
                                    }
                                });
                            }else{
                                done(null);
                            }
                        }else{
                            done(err);
                        }
                    });
                }else{
                    done(err);
                }
            });
        }else{
            done(err);
        }
    });

};

var getOrphanPodsInMultiplesOf = function(ctx, done){

    var cmd = kubeCmd(ctx.this.podname, "gluster peer status");
    console.log(cmd);
    exec(cmd,function(err,stdout,stderr){
        console.log(stdout);
        console.log(stderr);
        if(!err){
            var tasks = [];
            for(var i=0; i<ctx.glusterpods.length; i+=ctx.replication){
                var completeset = true;
                for(var j=0; j<ctx.replication; j+=1){
                    if(typeof ctx.glusterpods[i+j] === 'undefined'){
                        completeset = false;
                        break;
                    }
                }
                if(completeset === true){
                    for(var j=0; j<ctx.replication; j+=1){
                        (function(pod){
                            tasks.push(function(cb){
                                dns.reverse(pod.status.podIP, function(err,domains){
                                    if(!err){
                                        var peerconnected = false;
                                        if(stdout.indexOf(pod.status.podIP)>-1){
                                            peerconnected = true;
                                        }
                                        for(var k=0; k<domains.length; k+=1){
                                            if(stdout.indexOf(domains[k])>-1){
                                                peerconnected = true;
                                                break;
                                            }
                                        }
                                        if(!peerconnected){
                                            cb(null,pod);
                                        }else{
                                            cb(null,null);
                                        }
                                    }else{
                                        cb(err,null);
                                    }
                                });
                            });
                        })(ctx.glusterpods[i+j]);
                    }
                }else{
                    console.log('there are '+(ctx.glusterpods.length-i)+' gluster servers needing to be multiples of replication '+ctx.replication);
                }
            }
            async.parallel(tasks, function(err, results){
                if(!err){
                    var collectedpods = [];
                    for(var i=0; i<results.length; i+=1){
                        if(results[i] != null){
                            collectedpods.push(results[i]);
                        }
                    }
                    done(null,collectedpods);
                }else{
                    done([err,results]);
                }
            });
        }else{
            done([err,stderr]);
        }
    });

};

var probePod = function(ctx, orphanPod, done){

    if(typeof orphanPod !== 'undefined'){
        var cmd = kubeCmd(ctx.this.podname, "gluster peer status");
        console.log(cmd);
        exec(cmd,function(err,stdout,stderr){
            console.log(stdout);
            console.log(stderr);
            if(!err){
                var checks = [orphanPod.status.podIP];
                var found = false;
                // Does't work now
                dns.reverse(orphanPod.status.podIP,function(err,domains){
                    if(!err){
                        for(var i=0; i<domains.length; i++){
                            checks.push(domains[i]);
                        }
                    }
                    for(var i=0; i<checks.length; i++){
                        if(stdout.indexOf('Hostname: '+checks[i])>-1){
                            found = true;
                            break;
                        }
                    }
                    if(!found){
                        var cmd = kubeCmd(ctx.this.podname, "gluster peer probe "+orphanPod.status.podIP);
                        console.log(cmd);
                        exec(cmd,function(err,stdout,stderr){
                            console.log(stdout);
                            console.log(stderr);
                            if(!err){
                                done(null);
                            }else{
                                done([err,stderr]);
                            }
                        });
                    }else{
                        done(null);
                    }
                });
            }else{
                done([err,stderr]);
            }
        });
    }else{
        done(null);
    }

};

var addBricksIfMissing = function(ctx, done){

    var cmd = kubeCmd(ctx.this.podname, "gluster volume info "+ctx.volumename);
    console.log(cmd);
    exec(cmd,function(err,stdout,stderr){
        console.log(stdout);
        if(!err){
            var tasks = [];
            for(var i=0; i<ctx.glusterpods.length; i+=ctx.replication){
                var completeset = true;
                for(var j=0; j<ctx.replication; j+=1){
                    if(typeof ctx.glusterpods[i+j] === 'undefined'){
                        completeset = false;
                        break;
                    }
                }
                if(completeset === true){
                    for(var j=0; j<ctx.replication; j+=1){
                        (function(ip){
                            tasks.push(function(cb){
                                dns.reverse(ip, function(err,domains){
                                    if(!err){
                                        var brickexists = false;
                                        if(stdout.indexOf(ip)>-1){
                                            brickexists = true;
                                        }
                                        for(var k=0; k<domains.length; k+=1){
                                            if(stdout.indexOf(domains[k])>-1){
                                                brickexists = true;
                                                break;
                                            }
                                        }
                                        if(!brickexists){
                                            cb(null,ip+":/"+ctx.brickname+"/brick");
                                        }else{
                                            cb(null,null);
                                        }
                                    }else{
                                        cb(err,null);
                                    }
                                });
                            });
                        })(ctx.glusterpods[i+j].status.podIP);
                    }
                }else{
                    console.log('there are '+(ctx.glusterpods.length-i)+' gluster servers needing to be multiples of replication '+ctx.replication);
                }
            }
            async.parallel(tasks, function(err, brickstocreate){
                if(!err){
                    var bricks = []
                    for(var i=0; i<brickstocreate.length; i+=1){
                        if(brickstocreate[i] != null){
                            bricks.push(brickstocreate[i]);
                        }
                    }
                    if(bricks.length > 0){
                        var brickslist = bricks.join(' ');
                        var cmd = kubeCmd(ctx.this.podname, "gluster volume add-brick "+ctx.volumename+" replica "+ctx.replication+" "+brickslist);
                        console.log(cmd);
                        exec(cmd,function(err,stdout,stderr){
                            console.log(stdout);
                            console.log(stderr);
                            if(!err){
                                done(null,bricks.length);
                            }else{
                                done([err,stderr]);
                            }
                        });
                    }else{
                        done(null,bricks.length);
                    }
                }else{
                    done([err,results]);
                }
            });
        }else{
            if(stderr.indexOf('Volume data does not exist')>-1){
                done(null,0);
            }else{
                console.log(stderr);
                done([err,stderr]);
            }
        }
    });

};

var rebalanceNodes = function(ctx, done){

    var cmd = kubeCmd(ctx.this.podname, "gluster volume rebalance "+ctx.volumename+ " start");
    console.log(cmd);
    exec(cmd,function(err,stdout,stderr){
        console.log(stdout);
        console.log(stderr);
        if(!err){
            if(stdout.indexOf('successful')>-1){//avoid querying status if we have not received a word successful
                var timesqueried = 0;
                (function queryStatusRebalance(){
                    if(timesqueried < REBALANCE_QUERYSTATUS_MAXQUERIES){
                        timesqueried += 1;
                        var cmd = kubeCmd(ctx.this.podname, "gluster volume rebalance "+ctx.volumename+ " status");
                        console.log(cmd);
                        exec(cmd,function(err,stdout,stderr){
                            console.log(stdout);
                            console.log(stderr);
                            if(!err){
                                if(stdout.indexOf('success')>-1){
                                    done(null);
                                }else{
                                    setTimeout(function(){
                                        queryStatusRebalance();
                                    },REBALANCE_QUERYSTATUS_INTERVAL);
                                }
                            }else{
                                done([err,stderr]);
                            }
                        });
                    }else{
                        done('something is maybe bad, rebalance job has taken too long');
                    }
                })();
            }else{
                done(stdout);
            }
        }else{
            if(stderr.indexOf('not a distribute volume')>-1){
                done(null);
            }else{
                console.log(stderr);
                done([err,stderr]);
            }
        }
    });

};

module.exports = {
    checkStatusOfPeersAndMakeSureEverythingIsRight:checkStatusOfPeersAndMakeSureEverythingIsRight,
    peerProbeServer2IfReady:peerProbeServer2IfReady,
    createVolumeIfNotExists:createVolumeIfNotExists,
    startVolumeIfNotStarted:startVolumeIfNotStarted,
    expandIfNecessary:expandIfNecessary,
    peerProbeServer1:peerProbeServer1
};
