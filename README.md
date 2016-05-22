# Glusterfs Kubernetes Cluster Sidecar

This project is as a PoC to setup a gluster cluster using Kubernetes. It should handle resizing of any type and be
resilient to the various conditions both gluster and kubernetes can find themselves in.

## How to use it

There is an article here explaining how to use this here:
https://medium.com/@jaime_ecom/glusterfs-cluster-with-kubernetes-c09725d69900#.18m72xv4k

The docker image is hosted on docker hub and can be found here:  
https://hub.docker.com/r/neshte/gluster-k8s-sidecar/

An example kubernetes replication controller can be found in the examples directory on github here:  
https://github.com/neshte/gluster-k8s-sidecar

There you will also find some helper scripts to test out creating the cluster and resizing it.

### Settings

- GLUSTER_SIDECAR_POD_LABELS  
  Required: NO  
  Default: role=gluster,environment=test  
  This should be a be a comma separated list of key values the same as the podTemplate labels. See above for example.
- GLUSTER_SIDECAR_SLEEP_SECONDS  
  Required: NO  
  Default: 5  
  This is how long to sleep between work cycles.
- GLUSTER_SIDECAR_UNHEALTHY_SECONDS  
  Required: NO  
  Default: 15  
  This is how many seconds a cluster member has to get healthy before automatically being removed from the cluster.
- GLUSTER_SIDECAR_CLUSTER_NAME  
  Required: NO  
  Default: glusterfs-cluster  
  This is the meta.name of the kubernetes endpoints.
- GLUSTER_SIDECAR_CLUSTER_PORT  
  Required: NO  
  Default: 1  
  This is the cluster port for kubernetes gluster volume mounting.
- GLUSTER_SIDECAR_VOLUME_NAME  
  Required: NO  
  Default: data  
  This is the gluster volume name.
- GLUSTER_SIDECAR_BRICK_NAME  
  Required: NO  
  Default: data  
  This is the gluster brick name.
- GLUSTER_SIDECAR_REPLICATION  
  Required: NO  
  Default: 2  
  This is the replication factor for files on gluster cluster.
- GLUSTER_SIDECAR_K8SNAMESPACE  
  Required: NO  
  Default: default  
  This is the namespace in which this sidecar will run.

## Debugging

If you follow the instructions on article:
https://medium.com/@jaime_ecom/glusterfs-cluster-with-kubernetes-c09725d69900#.18m72xv4k

On the sidecar of the first node you create, you will see your logs for debugging

## Still to do

- Test performance of gluster (with more than 100 nodes or something like that)
- Test real cases of failure and autorecovery
- Allow to add/remove any pod number, not just the last one
- Add support for fully distributed non-replicated cluster
- Parametrize also on Makefile to avoid the need to change the rc-template and svc-template manually
- Add tests!
- Add to circleCi

## Inspired in

This sidecar is inspired in a sidecar for mongo on kubernetes
https://github.com/leportlabs/mongo-k8s-sidecar
