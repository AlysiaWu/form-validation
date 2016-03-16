clusterStatus_int : function(is_deployment_appliance) {
    $('#content').html(new ClusterStatusView().el);


    console.log("Adding recreate button handler.");
    var app_router = this;
    $('#recreateButton').click(function() {
        if(is_deployment_appliance) {
          app_router.handleClusterRecreateDeploymentAppliance();
        }
        else {
          app_router.handleClusterRecreateDirect();
        }
    });
    console.log("Added recreate button handler.");

    var updateProgressPercentageMap = function(progressList) {
      var percentageMap = {};
      var stepPercentages = [{id: 'validateNetwork',percentage: 5},
                             {id: 'applyNetwork', percentage: 10},
                             {id: 'validateCluster', percentage: 22},
                             {id: 'ZK', percentage: 36},
                             {id: 'StCluster', percentage: 90},
                             {id: 'VirtCluster', percentage: 95}];
      var sortedProgressList = _.sortBy(progressList, function(p) { return p.entity ? p.entity.name : p.name } );
      var nodes = [];
      _.each(sortedProgressList, function(entry) {
        if(entry.name == 'Node') {
          var divId = entry.name + entry.entity.name;
          divId = divId.split('.').join("");
          nodes.push({controller: entry.entity.name, id: divId});
        }
      });
      var perNodePercentage = 50 / nodes.length;
      var idx = 1;
      _.each(nodes, function(node) {
        var nodeId = node.id;
        var nodePercentage = 36 + (idx * perNodePercentage);
        idx++;
        stepPercentages.push({id: nodeId, percentage: nodePercentage});
      });
      $('#status').html('');
      var statusContent = utils.getClusterCreationProgressSteps(true, nodes);
      _.each(statusContent, function(step) {
        $('#status').append(step);
      });
      $('#totalSteps').html(statusContent.length);
      percentageMap = _.indexBy(stepPercentages, 'id');
      var completedSteps = ['validateNetwork', 'applyNetwork', 'validateCluster'];
      _.each(completedSteps, function(step) {
        utils.updateProgressStep(step, 'succeeded');
        utils.updateOverallProgress(percentageMap[step].percentage, 'succeeded');
      });
      utils.updateProgressStep('StCluster', 'inprogress');

      console.log("Updated progress percentage map.", percentageMap)
      return percentageMap;
    };

    var updateProgress = function(progressList, percentageMap, workflowType) {
      var sortedProgressList = _.sortBy(progressList, function(p) { return p.entity ? p.entity.name : p.name } );
      var stepsToShow = [ 'ZK', 'StCluster', 'VirtCluster', 'Node'];
      var diskProgressMap = [];
      var nodeProgressUpdate = false;
      var overallNodeProgress = 0;
      var numberOfNodes = 0;
      _.each(sortedProgressList, function(entry) {
        if (entry.state == 'NOTSTARTED') {
          return;
        }
        var nodeProgress = entry.name.toLowerCase().indexOf('node disk') == 0;
        var diskProgress = entry.name.toLowerCase().indexOf('disk prepare') == 0;
        var visibleStep = _.contains(stepsToShow, entry.name);
        if(visibleStep) {
          var entityName = '';
          if (entry.entity) {
            entityName = entry.entity.name;
          }
          var divId = entry.name;
          if (entry.name === 'Node') {
            divId += entityName;
          }
          divId = divId.replace(/[^\w\s]/gi, '');
          utils.updateProgressStep(divId, entry.state);
          if(entry.state.toLowerCase() === 'succeeded') {

            console.log("Updating step: " + divId + " in percentage map to success.", percentageMap)
            utils.updateOverallProgress(percentageMap[divId].percentage, 'succeeded');
          } else if(entry.state.toLowerCase() === 'failed') {

            console.log("Updating progress description: " + divId + " to failed.")
            utils.updateProgressDescription(divId, entry, workflowType);
          }
          if(entry.name.toLowerCase() === 'VirtCluster' && entry.state.toLowerCase() === 'inprogress') {
            utils.updateOverallProgress(percentageMap[divId].percentage, 'succeeded');
          }
          if(entry.name === 'Node') {
            nodeProgressUpdate = true;
          }
        } else if(nodeProgress) {
          var entityName = entry.entity.name;
          var divId = 'Node'+entityName.replace(/[^\w\s]/gi, '');
          utils.updateProgressDescription(divId, entry, workflowType);
          if(entry.completion) {
            console.log(divId, entry.completion);
            overallNodeProgress += entry.completion;
            numberOfNodes++;
          }
        } else if(diskProgress) {
          var entityName = entry.parent.name;
          var divId = entityName.replace(/[^\w\s]/gi, '');
          console.log(entityName, entry.description);
          var diskEntityId = entry.entity.id;
          diskEntityId = diskEntityId.replace(/[^\w\s]/gi, '');
          diskProgressMap.push({parent: divId,
                                desc: entry.description,
                                diskId: diskEntityId});
        }
      }, this);
      if(nodeProgressUpdate && numberOfNodes) {
        var averagePercentage = overallNodeProgress / numberOfNodes;
        var weightedPercentage = averagePercentage * 0.5; // 50% for overall nodes progress;
        console.log('weighted percentage ', weightedPercentage);
        utils.updateOverallProgress(percentageMap['ZK'].percentage + weightedPercentage, 'succeeded');
      }
      // console.log('Disk progress Map', diskProgressMap);
    }

    var updateWorkflowProgress_CreateCluster = function(cluster) {
      if(cluster) {

        console.log('Updating cluster creation progress...', cluster);
        var status = cluster.state;
        console.log('Cluster creation status ', status);

        var progressList = cluster.progress;
        if(_.size(percentageMap) == 0) {
          percentageMap = updateProgressPercentageMap(progressList);
        }

        if(showProgress) {
          utils.updateProgressTable('progressTable', progressList);
        }

        if(status && status == 'INPROGRESS') {

          console.log("Status is INPROGRESS. Updating Progress accordingly.");
          updateProgress(progressList, percentageMap);
        } else if(status && status == 'FAILED') {

          console.log("Status is FAILED. Updating Progress accordingly.");
          updateProgress(progressList, percentageMap);
          //utils.stopSpinner(spinner);
          console.log('Create cluster failed');
          clusters_info.stopMonitoring();
          bootbox.hideAll();
          $('#clusterCreationProgress').hide();
          $('#errorElem').show();
          if(Cookies.get('showTimer') == "yes") {
            $('#countUpTimer').countdown('pause');
          }

          utils.updateProgressTable('progressListTable', progressList);

          var dialogHandle = $('#moreDetailsDialog');
          dialogHandle.css('width', '960px');
          dialogHandle.css('margin-left', '-480px');
          var params = '/st-support/StorvisorSupportBundle?';
          _.each(progressList, function(entry) {
            if(entry.name == 'VirtNode') {
              params += 'host='+entry.entity.name+'&';
            }
          }, this);
          params = params.substring(0, params.length-1);
          $('#supportBundle').attr('href', params);
        } else {
          utils.updateOverallProgress(100, 'succeeded');
          //utils.stopSpinner(spinner);
          // cluster creation succeeded, navigate to summary page
          console.log('Create cluster succeeded. navigating to summary');
          clusters_info.stopMonitoring();
          $('#clusterCreationProgress').hide();
          Backbone.history.navigate('summary', true);
        }
      }
    };

    var updateWorkflowProgress_AddNodes = function(nodes) {

      if(nodes) {

        console.log('Updating node add progress...', nodes);

        var progressList = [];
        $('ul.wizard-breadcrumb > li#creation').text('3. Cluster Expansion');

        _.each(nodes, function(node) {
          $.merge(progressList, node.progress);
        })

        var status = 'COMPLETE';
        _.each(progressList, function(entry) {
          if(entry.state == 'INPROGRESS') {
            status = 'INPROGRESS';
          }
        })

        console.log('Node add status ', status);

        if(_.size(percentageMap) == 0) {
          percentageMap = updateProgressPercentageMap(progressList);
        }

        if(showProgress) {
          utils.updateProgressTable('progressTable', progressList);
        }

        if(status && status == 'INPROGRESS') {
          updateProgress(progressList, percentageMap, 'ADD_NODES');
        } else if(status && status == 'FAILED') {

          updateProgress(progressList, percentageMap, 'ADD_NODES');
          //utils.stopSpinner(spinner);
          console.log('Add node failed');
          clusters_info.stopMonitoring();
          bootbox.hideAll();
          $('#clusterCreationProgress').hide();
          $('#errorElem').show();
          if(Cookies.get('showTimer') == "yes") {
            $('#countUpTimer').countdown('pause');
          }

          utils.updateProgressTable('progressListTable', progressList);

          var dialogHandle = $('#moreDetailsDialog');
          dialogHandle.css('width', '960px');
          dialogHandle.css('margin-left', '-480px');
          var params = '/st-support/StorvisorSupportBundle?';
          _.each(progressList, function(entry) {
            if(entry.name == 'VirtNode') {
              params += 'host='+entry.entity.name+'&';
            }
          }, this);
          params = params.substring(0, params.length-1);
          $('#supportBundle').attr('href', params);
        } else {
          utils.updateOverallProgress(100, 'succeeded');
          //utils.stopSpinner(spinner);
          // cluster creation succeeded, navigate to summary page
          console.log('Create cluster succeeded. navigating to summary');
          clusters_info.stopMonitoring();
          $('#clusterCreationProgress').hide();
          Backbone.history.navigate('summary', true);
        }
      }
    };

    /** Show detailed cluster creation steps by default - Bug 8506 */
    var showProgress = true;
    if(showProgress) {
      $('#progressTableDiv').show();
    }

    var percentageMap = {};
    var clusters_info = null;
    if (is_deployment_appliance) {
        clusters_info = new StClusterWorkflowProgressCollection();
    } else {
	    clusters_info = new StClusterCollection();
    }

    clusters_info.startMonitoring({
      interval: 10000, // Check every 10 seconds
      success: function() {
        console.log("Got cluster info: ", clusters_info);

		if(!is_deployment_appliance) {
			var cluster = clusters_info.models[0];
		    updateWorkflowProgress_CreateCluster(cluster.attributes);
		}
		else {

		    workflow_model = clusters_info.getLatestWorkflowModel();
            CurrentState.workflow_model = workflow_model;

		    if(workflow_model) {

              //TODO: add type of workflow so don't have to infer from fields
		      if(workflow_model.nodes) {
		        updateWorkflowProgress_AddNodes(workflow_model.nodes);
		      }
		      else if (workflow_model.cluster) {
		        updateWorkflowProgress_CreateCluster(workflow_model.cluster);
		      }
		      else {
		        console.log("Error - do not have cluster workflow progress populated correctly.");
                clusters_info.stopMonitoring();
                $('#clusterCreationProgress').hide();
                Backbone.history.navigate('intro', true);
		      }
		    }
		    else {
		      console.log("No cluster workflows in progress. Navigating to intro screen.");
		      clusters_info.stopMonitoring();
		      $('#clusterCreationProgress').hide();
		      Backbone.history.navigate('intro', true);
		    }
		}
      },
      error : function() {
        console.log("Get cluster info failed. Navigating to intro screen.");
        //utils.stopSpinner(spinner);
        clusters_info.stopMonitoring();
        $('#clusterCreationProgress').hide();
        Backbone.history.navigate('intro', true);
      }
    });
  },
