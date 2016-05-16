NUM_SERVERNODES=$(shell kubectl get rc -l role=gluster -o template --template='{{ len .items }}')
NEW_SERVERNODE_NUM=$(shell expr $(NUM_SERVERNODES) + 1 )
CREATE_SERVICE=TRUE


# ENV Options
# -GoogleCloudPlatform
# -FLOCKERAWS
# -AWS (NOT YET SUPPORTED)
ENV=GoogleCloudPlatform

# Default volume size on creation
DISK_SIZE=100GB

# GoogleCloudPlatform Specific Environment Variables
ZONE=us-central1-f

# FLOCKERAWS Specific Environment Variables
CONTROL_DNS=<FLOCKER CONTROL DNS>
INITIAL_NODE_ID=<A FLOCKER NODE ID TO SEED A VOLUME>
VOLUME_PREFIX=<any name to prefix your volumes with>
KUBECONFIG=clusters/<K8s Cluster Name>/kubeconfig


count:
	@echo 'Current Number of GlusterFS servernodes: $(NUM_SERVERNODES)'
create-volume:
ifeq ($(ENV),FLOCKERAWS)
	-flockerctl --control-service=$(CONTROL_DNS) create -m name=$(VOLUME_PREFIX)-$(NEW_SERVERNODE_NUM) -s $(DISK_SIZE) --node=$(INITIAL_NODE_ID)
endif
add-glusternode:
ifeq ($(CREATE_SERVICE),TRUE)
	@echo 'Creating Service'
	-sed -e 's~<num>~$(NEW_SERVERNODE_NUM)~g' gluster-service-template.yaml | kubectl create -f -
endif
ifeq ($(ENV),GoogleCloudPlatform)
	@echo 'Creating Disk'
	-gcloud compute disks create gluster-persistent-storage-node-$(NEW_SERVERNODE_NUM)-disk --size $(DISK_SIZE) --zone $(ZONE)

	@echo 'Adding Glusternode'
	-sed -e 's~<num>~$(NEW_SERVERNODE_NUM)~g' gluster-controller-template.yaml | kubectl create -f -
endif
ifeq ($(ENV),AWS)
	@echo 'AWS not supported yet'
endif
ifeq ($(ENV),FLOCKERAWS)
	@echo 'Adding Glusternode $(NEW_SERVERNODE_NUM)'

	-touch gluster-rc-$(NEW_SERVERNODE_NUM).yaml
	# replace volume name with declared $(VOLUME_PREFIX) and $(NEW_SERVERNODE_NUM)
	# This will create a new file allowing you to remove and redeploy specific Replication Controllers
	# kubectl create -f gluster-rc-1.yaml
	# kubectl delete -f gluster-rc-1.yaml
	-sed -e 's/<num>/$(NEW_SERVERNODE_NUM)/g' -e 's/VOLUME_PREFIX/$(VOLUME_PREFIX)/g' gluster-controller-flocker-template.yaml | tee gluster-rc-$(NEW_SERVERNODE_NUM).yaml
	-kubectl create -f gluster-rc-$(NEW_SERVERNODE_NUM).yaml
endif

delete-glusternode:
	@echo 'Deleting Service'
	-kubectl delete svc gluster-$(NUM_SERVERNODES)
ifeq ($(ENV),GoogleCloudPlatform)
	@echo 'Deleting ReplicationController'
	-kubectl delete rc gluster-$(NUM_SERVERNODES)

	@echo 'Deleting Disk'
	sleep 60
	-yes | gcloud compute disks delete gluster-persistent-storage-node-$(NUM_SERVERNODES)-disk --zone $(ZONE)
endif
ifeq ($(ENV),AWS)
	@echo 'AWS not supported yet'
endif
