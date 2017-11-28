
/* Native Requirements */
var EventEmitter = require('events').EventEmitter;
var util = require('util');

/* 3rd party requirements */
var q = require('q');
var async = require('async');

/* LJ requirements, not sure if these are used. */
// var ljm = require('labjack-nodejs');
// var driver_const = require('ljswitchboard-ljm_driver_constants');
// var driver = ljm.driver();
// var data_parser = require('ljswitchboard-data_parser');
// var curatedDevice = require('ljswitchboard-ljm_device_curator');
// var modbus_map = require('ljswitchboard-modbus_map');
// var constants = modbus_map.getConstants();


// Utilities to load and verify logger config files.
var config_loader = require('./config_loader');
var config_checker = require('./config_checker');

// Code that coordinates the data collection & reporting efforts.
var log_coordinator = require('./coordinator');



var CONFIG_TYPES = {
	'FILE': 'filePath',
	'OBJECT': 'object',
};

var eventList = require('./events').events;

function rippleError(bundle) {
	var defered = q.defer();
	console.log('Ripple Error', bundle);
	defered.reject(bundle);
	return defered.promise;
}

function CREATE_SIMPLE_LOGGER () {
	this.devices = undefined;
	this.config = undefined;
	this.coordinator = undefined;

	var eventMap = [
		{from: 'CONFIGURATION_SUCCESSFUL', to: 'onConfigurationSuccessful'},
		{from: 'CONFIGURATION_ERROR', to: 'onConfigurationError'},
		
		{from:'STARTED_LOGGER', to: 'onStartedLogger'},
		{from: 'ERROR_STARTING_LOGGER', to: 'onErrorStartingLogger'},
		
		{from:'STOPPED_LOGGER', to: 'onStoppedLogger'},
		{from: 'ERROR_STOPPING_LOGGER', to: 'onErrorStoppingLogger'},
		
		{from:'NEW_VIEW_DATA', to: 'onNewViewData'},

		{from:'UPDATED_ACTIVE_FILES', to: 'onUpdatedActiveFiles'},
	];

	/*
	 * Use the eventMap to define functions for each event that needs to get 
	 * passed on.
	 */
	function createAndLinkEventListener(eventListing) {
		self[eventListing.to] = function(data) {
			self.emit(eventListing.from, data);
		};
		self.coordinator.on(eventListing.from, self[eventListing.to]);
	}

	function innerInitialize(bundle) {
		var defered = q.defer();

		self.coordinator = undefined;

		// Create a new coordinator instance.
		self.coordinator = log_coordinator.create();

		// Link to all of the events that it will emit.
		eventMap.forEach(createAndLinkEventListener);

		self.coordinator.initialize(bundle)
		.then(defered.resolve, defered.reject)
		.catch(defered.reject)
		.done();
		return defered.promise;
	}

	function innerUpdateDeviceListing(devices) {
		var defered = q.defer();

		self.devices = undefined;
		self.devices = devices;

		// Make sure that the coordinator is stopped before updating the
		// device listing.
		innerStopLogger(devices)

		// make sure that the coordinator is unconfigured.
		.then(self.coordinator.unconfigure)

		// After stopping & clearing the coordinators config. 
		//update its device listing.
		.then(self.coordinator.updateDeviceListing)
		.then(defered.resolve, defered.reject);
		return defered.promise;
	}

	

	function handleLoadConfigFileSuccess(configData) {
		var defered = q.defer();

		self.config = undefined;
		self.config = configData.data;

		defered.resolve(configData.data);
		return defered.promise;
	}
	function handleLoadConfigFileError(error) {
		var defered = q.defer();

		self.config = undefined;

		defered.reject(error);
		return defered.promise;
	}
	function loadConfigFile(filePath) {
		var defered = q.defer();
		
		config_checker.verifyConfigFile(filePath)
		.then(handleLoadConfigFileSuccess, handleLoadConfigFileError)
		.then(defered.resolve, defered.reject);
		return defered.promise;
	}

	function verifyAndLoadConfiguration(loggerConfig) {
		var defered = q.defer();

		var configType = loggerConfig.configType;
		var filePath = loggerConfig.filePath;

		if(configType === CONFIG_TYPES.FILE) {
			loadConfigFile(filePath)
			.then(function succFunc(configData) {
				loggerConfig.configData = configData;
				loggerConfig.isValid = true;
				defered.resolve(loggerConfig);
			}, function errFunc(errorData) {
				// TODO: Figure out what the error data looks like.
				loggerConfig.isValid = false;
				loggerConfig.message = 'Invalid Config... there is error data...';
				loggerConfig.errorData = errorData;
				defered.reject(loggerConfig);
			});
		} else if( configType === CONFIG_TYPES.OBJECT) {
			// Verify config data.
			loggerConfig.isValid = false;
			loggerConfig.message = 'Need to validate config data...';
			self.config = undefined;
			// self.config = undefined;
			// self.config = loggerConfig.configData;

			defered.reject(loggerConfig);
		}
		return defered.promise;
	}

	function resolveToConfigData(loggerConfig) {
		var defered = q.defer();
		defered.resolve(loggerConfig.configData);
		return defered.promise;
	}

	function innerConfigureLogger(loggerConfig) {
		var defered = q.defer();
		var configData = {
			'configType': CONFIG_TYPES.OBJECT,
			'configData': {},
			'filePath': '',
			'isValid': false,
			'message': 'Invalid Logger Config',
			'errorData': {},
		};
		var configType = '';
		var isValidCall = false;

		if(loggerConfig.configType) {
			configType = loggerConfig.configType;

			if(configType === CONFIG_TYPES.OBJECT) {
				configData.configData = loggerConfig.configData;
				isValidCall = true;
			} else if(configType === CONFIG_TYPES.FILE) {
				configData.filePath = loggerConfig.filePath;
				isValidCall = true;
			}

			configData.configType = configType;
		}

		function onSuccess(data) {
			// Let the coordinator fire the config-successful event.
			// self.onConfigurationSuccessful(data);
			defered.resolve(data);
		}
		function onError(data) {
			console.log('simple_logger.js config error', data);
			// Report the CONFIGURATION_ERROR event.
			self.onConfigurationError(data);
			// Force successful resolution of promise & errors to be handled via
			// event system.
			defered.reject(data);
		}
		if(isValidCall) {
			verifyAndLoadConfiguration(loggerConfig)
			.then(resolveToConfigData, rippleError)
			.then(innerStopLogger, rippleError)
			.then(self.coordinator.unconfigure, rippleError)
			.then(self.coordinator.configure, rippleError)
			.then(onSuccess, onError);
		} else {
			innerStopLogger(loggerConfig)
			.then(onError, onError);
		}
		return defered.promise;
	}
	function innerUnconfigureLogger(bundle) {
		return self.coordinator.unconfigure(bundle);
	}
	function innerStartLogger(startData) {
		var defered = q.defer();

		self.coordinator.start(startData)
		.then(defered.resolve, defered.reject)
		.catch(defered.reject)
		.done();
		return defered.promise;
	}
	function innerStopLogger(stopData) {
		var defered = q.defer();

		self.coordinator.stop(stopData)
		.then(defered.resolve, defered.reject)
		.catch(defered.reject)
		.done();
		return defered.promise;
	}

	/* Configuration File Loading & Checking functions */
	this.verifyConfigFile = function(filePath) {
		return config_checker.verifyConfigFile(filePath);
	};
	this.verifyConfigObject = function(dataObject) {
		return config_checker.verifyConfigObject(filePath);
	};

	/* Controls for the logger */
	this.initialize = function(bundle) {
		return innerInitialize(bundle);
	};
	this.updateDeviceListing = function(devices) {
		return innerUpdateDeviceListing(devices);
	};
	this.configureLogger = function(loggerConfig) {
		return innerConfigureLogger(loggerConfig);
	};
	this.unconfigureLogger = function(bundle) {
		return innerUnconfigureLogger(bundle);
	};
	this.startLogger = function(startData) {
		return innerStartLogger(startData);
	};
	this.stopLogger = function(stopData) {
		return innerStopLogger(stopData);
	};



	var self = this;
}
util.inherits(CREATE_SIMPLE_LOGGER, EventEmitter);


exports.create = function() {
	return new CREATE_SIMPLE_LOGGER();
};

/* feature discovery & event constant handling */
exports.eventList = eventList;

/* Functions for configuration file loading & verification */
exports.verifyConfigFile = function(filePath) {
	return config_checker.verifyConfigFile(filePath);
};
exports.verifyConfigObject = function(dataObject) {
	return config_checker.verifyConfigObject(filePath);
};


