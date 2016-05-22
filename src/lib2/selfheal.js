'use strict';

var async = require('async');
var exec = require('child_process').exec;
var dns = require('dns');
const HEAL_QUERYPROGRESS_INTERVAL = 5;
const HEAL_QUERYPROGRESS_MAXQUERIES = 25;
const FIXLAYOUT_QUERYPROGRESS_INTERVAL = 5;
const FIXLAYOUT_QUERYPROGRESS_MAXQUERIES = 25;

var tryToRecoverPeer = function(ctx, peer, allpeers, done){

    //based on this https://support.rackspace.com/how-to/recover-from-a-failed-server-in-a-glusterfs-array/
    //first query all pods and check if the ip still exists
    //if it still exists, check if it will restore automatically (by checking for gluster daemon and uuid set up)
    //if it does not exist, check if there is a pod out there waiting to be adopted (which is, is not alreay a peer)
    //if there is, then peer probe and then set replace-brick and then set peer detach and then set heal
    var ipstillexists = false;
    var ip = null;
    var newpod = null;
    for(var j=0; j<ctx.glusterpods.length; j+=1){
        if(ctx.glusterpods[j].status.podIP == peer['Hostname']){
            ipstillexists = true;
            ip = ctx.glusterpods[j].status.podIP;
            newpod = ctx.glusterpods[j];
            break;
        }
    }
    if(ipstillexists){
        sameIPRecoverStrategy(ctx, peer, newpod, allpeers, function(err){
            if(!err){
                done(null);
            }else{
                done(err);
            }
        });
    }else{
        diffIPRecoverStrategy(ctx, peer, allpeers, function(err){
            if(!err){
                done(null);
            }else{
                done(err);
            }
        });
    }

};

var sameIPRecoverStrategy = function(ctx, badpeer, newpod, allpeers, done){

    var cmd = "kubectl exec "+newpod.metadata.name+" -- service glusterfs-server stop";
    console.log(cmd);
    exec(cmd,function(err,stdout,stderr){
        console.log(stdout);
        console.log(stderr);
        if(!err){
            var cmd = "kubectl exec "+newpod.metadata.name+" -- UUID="+badpeer['Uuid']+' sed  -i "s/\\(UUID\\)=\\(.*\\)/\\1=$UUID/g" /var/lib/glusterd/glusterd.info && cat /var/lib/glusterd/glusterd.info';
            console.log(cmd);
            exec(cmd,function(err,stdout,stderr){
                console.log(stdout);
                console.log(stderr);
                if(!err){
                    var cmd = "kubectl exec "+newpod.metadata.name+" -- service glusterfs-server start";
                    console.log(cmd);
                    exec(cmd,function(err,stdout,stderr){
                        console.log(stdout);
                        console.log(stderr);
                        if(!err){
                            var cmd = "kubectl exec "+newpod.metadata.name+" -- gluster peer status";
                            console.log(cmd);
                            exec(cmd,function(err,stdout,stderr){
                                console.log(stdout);
                                console.log(stderr);
                                if(!err){
                                    var tasks = [];
                                    for(var i=0; i<allpeers.length; i+=1){
                                        if(allpeers[i]['Hostname'] != badpeer['Hostname']){
                                            (function(peer){
                                                tasks.push(function(cb){
                                                    var cmd = "kubectl exec "+newpod.metadata.name+" -- gluster peer probe "+peer['Hostname'];
                                                    console.log(cmd);
                                                    exec(cmd,function(err,stdout,stderr){
                                                        console.log(stdout);
                                                        console.log(stderr);
                                                        if(!err){
                                                            cb(null,null);
                                                        }else{
                                                            cb(err,null);
                                                        }
                                                    });
                                                });
                                            })(allpeers[i]);
                                        }
                                    }
                                    async.parallel(tasks, function(err, results){
                                        if(!err){
                                            var cmd = "kubectl exec "+newpod.metadata.name+" -- gluster peer status";
                                            console.log(cmd);
                                            exec(cmd,function(err,stdout,stderr){
                                                console.log(stdout);
                                                console.log(stderr);
                                                if(!err){
                                                    var cmd = "kubectl exec "+newpod.metadata.name+" -- service glusterfs-server restart";
                                                    console.log(cmd);
                                                    exec(cmd,function(err,stdout,stderr){
                                                        console.log(stdout);
                                                        console.log(stderr);
                                                        if(!err){
                                                            var cmd = "kubectl exec "+newpod.metadata.name+" -- gluster peer status";
                                                            console.log(cmd);
                                                            exec(cmd,function(err,stdout,stderr){
                                                                console.log(stdout);
                                                                console.log(stderr);
                                                                if(!err){
                                                                    var cmd = "kubectl exec "+newpod.metadata.name+" -- gluster volume status";
                                                                    console.log(cmd);
                                                                    exec(cmd,function(err,stdout,stderr){
                                                                        console.log(stdout);
                                                                        console.log(stderr);
                                                                        if(!err){
                                                                            var cmd = "kubectl exec "+newpod.metadata.name+" -- yes | gluster volume sync "+ctx.this.ip+" all";
                                                                            console.log(cmd);
                                                                            exec(cmd,function(err,stdout,stderr){
                                                                                console.log(stdout);
                                                                                console.log(stderr);
                                                                                if(!err){
                                                                                    var cmd = "kubectl exec "+ctx.this.podname+" -- getfattr -n trusted.glusterfs.volume-id /"+ctx.volumename+"/brick";
                                                                                    console.log(cmd);
                                                                                    exec(cmd,function(err,stdout,stderr){
                                                                                        console.log(stdout);
                                                                                        console.log(stderr);
                                                                                        if(!err){
                                                                                            var lines = stdout.split("\n");
                                                                                            var volumeid = null;
                                                                                            for(var i=0; i<lines.length; i+=1){
                                                                                                if(lines[i].indexOf('trusted.glusterfs.volume-id')>-1){
                                                                                                    var kv = lines[i].split('glusterfs.volume-id=');
                                                                                                    if(kv[1]){
                                                                                                        volumeid = kv[1];
                                                                                                        break;
                                                                                                    }
                                                                                                }
                                                                                            }
                                                                                            if(volumeid){
                                                                                                var cmd = "kubectl exec "+newpod.metadata.name+" -- setfattr -n trusted.glusterfs.volume-id -v '"+volumeid+"' /"+ctx.volumename+"/brick";
                                                                                                console.log(cmd);
                                                                                                exec(cmd,function(err,stdout,stderr){
                                                                                                    console.log(stdout);
                                                                                                    console.log(stderr);
                                                                                                    if(!err){
                                                                                                        var cmd = "kubectl exec "+ctx.this.podname+" -- service glusterfs-server restart";
                                                                                                        console.log(cmd);
                                                                                                        exec(cmd,function(err,stdout,stderr){
                                                                                                            console.log(stdout);
                                                                                                            console.log(stderr);
                                                                                                            if(!err){
                                                                                                                var cmd = "kubectl exec "+ctx.this.podname+" -- gluster volume heal "+ctx.volumename+" full";
                                                                                                                console.log(cmd);
                                                                                                                exec(cmd,function(err,stdout,stderr){
                                                                                                                    console.log(stdout);
                                                                                                                    console.log(stderr);
                                                                                                                    if(!err){
                                                                                                                        var timesqueried = 0;
                                                                                                                        (function queryProgressHeal(){
                                                                                                                            if(timesqueried < HEAL_QUERYPROGRESS_MAXQUERIES){
                                                                                                                                timesqueried += 1;
                                                                                                                                var cmd = "kubectl exec "+ctx.this.podname+" -- gluster volume heal "+ctx.volumename+" info";
                                                                                                                                console.log(cmd);
                                                                                                                                exec(cmd,function(err,stdout,stderr){
                                                                                                                                    console.log(stdout);
                                                                                                                                    console.log(stderr);
                                                                                                                                    if(!err){
                                                                                                                                        if(stdout.indexOf('success')>-1){
                                                                                                                                            done(null);
                                                                                                                                        }else{
                                                                                                                                            setTimeout(function(){
                                                                                                                                                queryProgressHeal();
                                                                                                                                            },HEAL_QUERYPROGRESS_INTERVAL);
                                                                                                                                        }
                                                                                                                                    }else{
                                                                                                                                        done([err,stderr]);
                                                                                                                                    }
                                                                                                                                });
                                                                                                                            }else{
                                                                                                                                done('something is maybe bad, heal job has taken too long');
                                                                                                                            }
                                                                                                                        })();
                                                                                                                    }else{
                                                                                                                        done([err,stderr]);
                                                                                                                    }
                                                                                                                });
                                                                                                            }else{
                                                                                                                done([err,stderr]);
                                                                                                            }
                                                                                                        });
                                                                                                    }else{
                                                                                                        done([err,stderr]);
                                                                                                    }
                                                                                                });
                                                                                            }else{
                                                                                                done('could not find volume id, command is wrong');
                                                                                            }
                                                                                        }else{
                                                                                            done([err,stderr]);
                                                                                        }
                                                                                    });
                                                                                }else{
                                                                                    done([err,stderr]);
                                                                                }
                                                                            });
                                                                        }else{
                                                                            done([err,stderr]);
                                                                        }
                                                                    });
                                                                }else{
                                                                    done([err,stderr]);
                                                                }
                                                            });
                                                        }else{
                                                            done([err,stderr]);
                                                        }
                                                    });
                                                }else{
                                                    done([err,stderr]);
                                                }
                                            });
                                        }else{
                                            done(err);
                                        }
                                    });
                                }else{
                                    done([err,stderr]);
                                }
                            });
                        }else{
                            done([err,stderr]);
                        }
                    });
                }else{
                    done([err,stderr]);
                }
            });
        }else{
            done([err,stderr]);
        }
    });

};

var diffIPRecoverStrategy = function(ctx, badpeer, allpeers, done){

    //find first if there is an ip orphan to be adopted to recover
    var orphansCandidates = [];
    for(var i=0; i<ctx.glusterpods.length; i+=1){
        var podalreadypeer = false;
        for(var j=0; j<allpeers.length; j+=1){
            if(ctx.glusterpods[i].status.podIP == allpeers[j]['Hostname']){
                podalreadypeer = true;
                break;
            }
        }
        if(!podalreadypeer){
            orphansCandidates.push(ctx.glusterpods[i]);
        }
    }
    if(orphansCandidates.length > 0){
        var orphanChosen = orphansCandidates[Math.floor(Math.random()*orphansCandidates.length)];//choose one randomly
        var cmd = "kubectl exec "+ctx.this.podname+" -- gluster peer probe "+orphanChosen.status.podIP;
        console.log(cmd);
        exec(cmd,function(err,stdout,stderr){
            console.log(stdout);
            console.log(stderr);
            if(!err){
                if(stdout.indexOf('successful')>-1){
                    var cmd = "kubectl exec "+ctx.this.podname+" -- gluster volume replace-brick "+ctx.volumename+" replica "+ctx.replication+" "+badpeer['Hostname']+":/"+ctx.brickname+"/brick "+orphanChosen.status.podIP['Hostname']+":/"+ctx.brickname+"/brick commit force";
                    console.log(cmd);
                    exec(cmd,function(err,stdout,stderr){
                        console.log(stdout);
                        console.log(stderr);
                        if(!err){
                            if(stdout.indexOf('success')>-1){
                                var cmd = "kubectl exec "+ctx.this.podname+" -- gluster volume heal "+ctx.volumename+" full";
                                console.log(cmd);
                                exec(cmd,function(err,stdout,stderr){
                                    console.log(stdout);
                                    console.log(stderr);
                                    if(!err){
                                        if(stdout.indexOf('success')>-1){
                                            var timesqueried = 0;
                                            (function queryProgressHeal(){
                                                if(timesqueried < HEAL_QUERYPROGRESS_MAXQUERIES){
                                                    timesqueried += 1;
                                                    var cmd = "kubectl exec "+ctx.this.podname+" -- gluster volume heal "+ctx.volumename+" info";
                                                    console.log(cmd);
                                                    exec(cmd,function(err,stdout,stderr){
                                                        console.log(stdout);
                                                        console.log(stderr);
                                                        if(!err){
                                                            if(stdout.indexOf('success')>-1){
                                                                var cmd = "kubectl exec "+ctx.this.podname+" -- gluster volume rebalance "+ctx.volumename+" fix-layout start";
                                                                console.log(cmd);
                                                                exec(cmd,function(err,stdout,stderr){
                                                                    console.log(stdout);
                                                                    console.log(stderr);
                                                                    if(!err){
                                                                        if(stdout.indexOf('success')>-1){
                                                                            var timesqueried = 0;
                                                                            (function queryProgressFixlayout(){
                                                                                if(timesqueried < FIXLAYOUT_QUERYPROGRESS_MAXQUERIES){
                                                                                    timesqueried += 1;
                                                                                    var cmd = "kubectl exec "+ctx.this.podname+" -- gluster volume rebalance "+ctx.volumename+" status";
                                                                                    console.log(cmd);
                                                                                    exec(cmd,function(err,stdout,stderr){
                                                                                        console.log(stdout);
                                                                                        console.log(stderr);
                                                                                        if(!err){
                                                                                            if(stdout.indexOf('success')>-1){
                                                                                                done(null);
                                                                                            }else{
                                                                                                setTimeout(function(){
                                                                                                    queryProgressFixlayout();
                                                                                                },FIXLAYOUT_QUERYPROGRESS_INTERVAL);
                                                                                            }
                                                                                        }else{
                                                                                            done([err,stderr]);
                                                                                        }
                                                                                    });
                                                                                }else{
                                                                                    done('something is maybe bad, fix-layout job has taken too long');
                                                                                }
                                                                            })();
                                                                        }else{
                                                                            done(stdout);
                                                                        }
                                                                    }else{
                                                                        done([err,stderr]);
                                                                    }
                                                                });
                                                            }else{
                                                                setTimeout(function(){
                                                                    queryProgressHeal();
                                                                },HEAL_QUERYPROGRESS_INTERVAL);
                                                            }
                                                        }else{
                                                            done([err,stderr]);
                                                        }
                                                    });
                                                }else{
                                                    done('something is maybe bad, heal job has taken too long');
                                                }
                                            })();
                                        }else{
                                            done(stdout);
                                        }
                                    }else{
                                        done([err,stderr]);
                                    }
                                });
                            }else{
                                done(stdout);
                            }
                        }else{
                            done([err,stderr]);
                        }
                    });
                }else{
                    done(stdout);
                }
            }else{
                done([err,stderr]);
            }
        });
    }else{
        done('error cannot find a candidate to recover from missing peer');
    }

};

module.exports = {
    tryToRecoverPeer:tryToRecoverPeer
};
