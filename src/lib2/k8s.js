'use strict';

var config = require('./config');
var Client = require('node-kubernetes-client');
var fs = require('fs');

var readToken = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token');

var client = new Client({
    host:  config.kubernetesROServiceAddress,
    protocol: 'https',
    version: 'v1',
    namespace: config.k8snamespace,
    token: readToken
});

var createServiceIfNotExists = function(ctx, done){

    var serviceexists = false;
    for(var i=0; i<ctx.glusterservices.length; i+=1){
        if(ctx.glusterservices[i].metadata.name == name){
            serviceexists = true;
            break;
        }
    }
    if(!serviceexists){
        var body = {
            kind:"Service",
            apiVersion:"v1",
            metadata:{
                name:ctx.servicename
            },
            spec:{
                selector:ctx.labels,
                ports:[{
                    port:ctx.clusterport
                }]
            }
        };
        console.log('client.services.create('+JSON.stringify(body)+')');
        client.services.create(body,function(err, response){
            if(!err){
                done(null,response);
            }else{
                done(err);
            }
        });
    }

};

module.exports = {
    createServiceIfNotExists:createServiceIfNotExists
};
