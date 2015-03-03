
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var q = require('q');
var async = require('async');
var ljm = require('labjack-nodejs');
var driver_const = require('ljswitchboard-ljm_driver_constants');
var driver = ljm.driver();
var data_parser = require('ljswitchboard-data_parser');
var curatedDevice = require('ljswitchboard-ljm_device_curator');
var modbus_map = require('ljswitchboard-modbus_map');
var constants = modbus_map.getConstants();
var requiredInformation = {};

var eventList = require('./event_list').eventList;
var mock_device_scanner = require('./mock_device_scanner');

var REQUIRED_INFO_BY_DEVICE = {
	'LJM_dtDIGIT': [
		'DEVICE_NAME_DEFAULT',
		'DGT_INSTALLED_OPTIONS'
	],
	'LJM_dtT7': [
		'DEVICE_NAME_DEFAULT',
        'HARDWARE_INSTALLED',
        'ETHERNET_IP',
        'WIFI_STATUS',
        'WIFI_IP',
        'WIFI_RSSI',
        'FIRMWARE_VERSION'
	]
};
var getModelType = {
	'LJM_dtDIGIT': function(attrs) {
		var name = 'Digit-Variant';
		if(attrs.DGT_INSTALLED_OPTIONS) {
			name = attrs.DGT_INSTALLED_OPTIONS.productType;
		}
		return name;
	},
	'LJM_dtT7': function(attrs) {
		var name = 'T7-Variant';
		if(attrs.HARDWARE_INSTALLED) {
			if(attrs.HARDWARE_INSTALLED.productType) {
				name = attrs.HARDWARE_INSTALLED.productType;
			}
		}
		return name;
	}
};
var getProductType = {
	'LJM_dtDIGIT': function(attrs) {
		var name = 'Digit';
		if(attrs.DGT_INSTALLED_OPTIONS) {
			name = attrs.DGT_INSTALLED_OPTIONS.productType;
		}
		return name;
	},
	'LJM_dtT7': function(attrs) {
		var name = 'T7';
		if(attrs.HARDWARE_INSTALLED) {
			if(attrs.HARDWARE_INSTALLED.productType) {
				name = attrs.HARDWARE_INSTALLED.productType;
			}
		}
		return name;
	}
};

exports.REQUIRED_INFO_BY_DEVICE = REQUIRED_INFO_BY_DEVICE;

var SCAN_REQUEST_LIST = [
	{
        'deviceType': 'LJM_dtDIGIT',
        'connectionType': 'LJM_ctUSB',
        'addresses': REQUIRED_INFO_BY_DEVICE.LJM_dtDIGIT
    },
    {
        'deviceType': 'LJM_dtT7',
        'connectionType': 'LJM_ctUSB',
        'addresses': REQUIRED_INFO_BY_DEVICE.LJM_dtT7
    },
    {
        'deviceType': 'LJM_dtT7',
        'connectionType': 'LJM_ctTCP',
        'addresses': REQUIRED_INFO_BY_DEVICE.LJM_dtT7
    },
    // {
    //     'deviceType': 'LJM_dtANY',
    //     'connectionType': 'LJM_ctANY',
    //     'addresses': REQUIRED_INFO_BY_DEVICE.LJM_dtT7
    // }
];

var scanStrategies = [
	{'type': 'listAllExtended', 'enabled': true},
	// {'type': 'listAllExtended', 'enabled': true},
	// {'type': 'listAllExtended', 'enabled': true},
	{'type': 'listAll', 'enabled': true},
];


var deviceScanner = function() {

	this.scanResults = [];
	this.activeDeviceResults = [];
	this.currentDeviceList = null;
	this.scanInProgress = false;
	this.sortedResults = [];

	this.mockDeviceScanner = new mock_device_scanner.createMockDeviceScanner();

	var deviceScanningEnabled = true;
	this.disableDeviceScanning = function() {
		var defered = q.defer();
		deviceScanningEnabled = false;
		defered.resolve();
		return defered.promise;
	};
	this.enableDeviceScanning = function() {
		var defered = q.defer();
		deviceScanningEnabled = true;
		defered.resolve();
		return defered.promise;
	};
	this.getDeviceScanningState = function() {
		var defered = q.defer();
		defered.resolve(deviceScanningEnabled);
		return defered.promise;
	};

	var isNewDevice = function(newScanResult) {
		var isNew = true;
		self.scanResults.forEach(function(scanResult) {
			if(scanResult.serialNumber == newScanResult.serialNumber) {
				isNew = false;
			}
		});
		return isNew;
	};
	var getInitialConnectionTypeData = function(dt, ct, ip, method) {
		var insertionMethod = 'scan';
		var foundByAttribute = false;
		var isActive = false;
		var isVerified = false;
		var verificationAttempted = false;
		if(method) {
			if(method === 'attribute') {
				insertionMethod = 'attribute';
				foundByAttribute = true;
			} else if(method === 'connected') {
				insertionMethod = 'connected';
				isActive = true;
				isVerified = true;
				verificationAttempted = true;
			}
		}
		return {
			'dt': dt,
			'ct': ct,
			'connectionType': ct,
			'str': driver_const.DRIVER_CONNECTION_TYPE_NAMES[ct],
			'name': driver_const.CONNECTION_TYPE_NAMES[ct],
			'ipAddress': ip,
			'safeIP': ip.split('.').join('_'),
			'verified': isVerified,
			'verificationAttempted': verificationAttempted,
			'verifying': false,
			'isActive': isActive,
			'foundByAttribute': foundByAttribute,
			'insertionMethod': insertionMethod
		};
	};
	var saveResult = function(newScanResult) {
		var ct;
		var ip;
		var dt = newScanResult.deviceType;
		var virtualCT;
		var i;
		var isMockDevice = false;
		if(isNewDevice(newScanResult)) {
			ct = newScanResult.connectionType;
			dt = newScanResult.deviceType;
			ip = newScanResult.ipAddress;
			if(newScanResult.isMockDevice) {
				isMockDevice = true;
			}
			var deviceInfo = {
				'deviceType': dt,
				'deviceTypeString': driver_const.DRIVER_DEVICE_TYPE_NAMES[dt],
				'deviceTypeName': driver_const.DEVICE_TYPE_NAMES[dt],
				'serialNumber': newScanResult.serialNumber,
				'acquiredRequiredData': false,
				'connectionTypes': [getInitialConnectionTypeData(dt, ct, ip)],
				'isMockDevice': isMockDevice,
			};
			deviceInfo.acquiredRequiredData = false;
			if(newScanResult.data) {
				deviceInfo.acquiredRequiredData = true;
				newScanResult.data.forEach(function(res) {
					deviceInfo[res.name] = data_parser.parseResult(
						res.name,
						res.val
					);
				});
				// Add extra connection types based off attributes.
				if(deviceInfo.ETHERNET_IP) {
					if(deviceInfo.ETHERNET_IP.isReal) {
						virtualCT = driver_const.connectionTypes.Ethernet;
						ip = deviceInfo.ETHERNET_IP.str;
						deviceInfo.connectionTypes.push(
							getInitialConnectionTypeData(dt, virtualCT, ip, 'attribute')
						);
					}
				}
				if(deviceInfo.WIFI_IP) {
					if(deviceInfo.WIFI_IP.isReal) {
						virtualCT = driver_const.connectionTypes.Wifi;
						ip = deviceInfo.WIFI_IP.str;
						deviceInfo.connectionTypes.push(
							getInitialConnectionTypeData(dt, virtualCT, ip, 'attribute')
						);
					}
				}
			}
			
			self.emit(eventList.DISCOVERED_DEVICE, deviceInfo);
			self.scanResults.push(deviceInfo);
		} else {
			// If the device already exists then add information to the
			// object.
			for(i = 0; i < self.scanResults.length; i++) {
				var sr = self.scanResults[i];
				if(sr.serialNumber == newScanResult.serialNumber) {
					var j;
					// Determine if the new scanResult's connection type
					// has already been added, if not, add it.
					ct = newScanResult.connectionType;
					ip = newScanResult.ipAddress;
					dt = newScanResult.deviceType;
					var addCT = true;
					for(j = 0; j < sr.connectionTypes.length; j++) {
						if(ct == sr.connectionTypes[j].ct) {
							addCT = false;
						}
					}
					if(addCT) {
						sr.connectionTypes.push(
							getInitialConnectionTypeData(dt, ct, ip)
						);
					}
					// If data has already been saved for this device, don't
					// save it.
					if(!sr.acquiredRequiredData) {
						if(newScanResult.data) {
							sr.acquiredRequiredData = true;
							for(j = 0; j < newScanResult.data.length; j++) {
								var res = newScanResult.data[j];
								sr[res.name] = data_parser.parseResult(
									res.name,
									res.val
								);
							}

							// Add extra connection types based off attributes.
							if(newScanResult.data.ETHERNET_IP) {
								if(newScanResult.data.ETHERNET_IP.isReal) {
									virtualCT = driver_const.connectionTypes.Ethernet;
									ip = newScanResult.data.ETHERNET_IP.str;
									sr.connectionTypes.push(
										getInitialConnectionTypeData(dt, virtualCT, ip, 'attribute')
									);
								}
							}
							if(newScanResult.data.WIFI_IP) {
								if(newScanResult.data.WIFI_IP.isReal) {
									virtualCT = driver_const.connectionTypes.Wifi;
									ip = newScanResult.data.WIFI_IP.str;
									sr.connectionTypes.push(
										getInitialConnectionTypeData(dt, virtualCT, ip, 'attribute')
									);
								}
							}
						}
					}
				}
			}
		}
	};
	var saveResults = function(scanRequest, newScanResults) {
		// printDuration(scanRequest);
		// console.log(
		// 'Number of devices found:',
		// newScanResults.length,
		// scanRequest.connectionType,
		// scanRequest.scanNum
		// );
		newScanResults.forEach(saveResult);
	};

	var printDuration = function(scanRequest) {
		var stopTime = new Date();
		console.log(
			scanRequest.scanType,
			scanRequest.connectionType,
			// scanRequest.startTime, // All times are equal for each request.
			// aka they are being made in parallel and LJM is blocking the
			// requests.
			scanRequest.stopTime - scanRequest.startTime
		);
	};

	var configureScannedMockDevice = function(data) {
		var defered = q.defer();
		var configData = {};
		var ignoredScanResultKeys = [
			'acquiredRequiredData',
			'connectionTypes',
			'isMockDevice'
		];
		var scanKeys = Object.keys(data.scanResult);
		scanKeys.forEach(function(key) {
			if(ignoredScanResultKeys.indexOf(key) < 0) {
				configData[key] = data.scanResult[key];
			}
		});
		configData.ipAddress = data.connectionType.ipAddress;
		self.mockDeviceScanner.getMockDeviceData(
			data.scanResult.serialNumber,
			data.registers
		).then(function(mockDeviceData) {
			var keys = Object.keys(mockDeviceData);
			keys.forEach(function(key) {
				configData[key] = mockDeviceData[key];
			});
			data.device.configureMockDevice(configData)
			.then(function(res) {
				defered.resolve(data);
			});
		});
		
		return defered.promise;
	};
	var delayProcessViaSetImmediate = function() {
		var defered = q.defer();
		setImmediate(defered.resolve);
		return defered.promise;
	};
	var openScannedDevice = function(data) {
		var defered = q.defer();
		var serialNumber = data.scanResult.serialNumber;
		var connectionType = data.connectionType.str;
		var deviceType = data.scanResult.deviceTypeString;
		var ipAddress = data.connectionType.ipAddress;
		var openParameters = {
			'dt': deviceType,
			'ct': connectionType
		};
		if(data.connectionType.str === 'LJM_ctUSB') {
			openParameters.id = serialNumber;
		} else {
			openParameters.id = ipAddress;
		}
		data.openParameters = openParameters;
		delayProcessViaSetImmediate()
		.then(function() {
			/* Added a simpleOpen function call to the device_curator that 
			doesn't perform the calibration check, consider adding an even less
			device-intrusive open command.

			Also, noticed that in the LabJack-nodejs library, the device object
			is ALWAYS created, it should be up to the consumer to create the 
			device object.  The library should only "cache" the require() call.
			This behavior is OK for the driver, but it should be "cached" 
			instead of created every time as well.
			*/
			// console.log('Opening Device', serialNumber, openParameters.ct, openParameters.id);
			self.emit(eventList.VERIFYING_DEVICE_CONNECTION, openParameters);
			data.device.simpleOpen(
				openParameters.dt,
				openParameters.ct,
				openParameters.id
			)
			.then(function(res) {
				// console.log('!! Verified Connection Type !!', serialNumber, openParameters.ct);
				data.connectionType.verified = true;
				data.openedDevice = true;
				defered.resolve(data);
				self.emit(eventList.VERIFIED_DEVICE_CONNECTION, openParameters);
			}, function(err) {
				console.info('!! Device Scanner Failed to open Device', serialNumber, openParameters.ct, err);
				
				self.emit(eventList.FAILED_DEVICE_CONNECTION_VERIFICATION, openParameters);
				defered.resolve(data);
			});
		});
		return defered.promise;
	};
	var collectDeviceData = function(data) {
		var defered = q.defer();
		var parseResults = function(results) {
			// console.log('!! Collected Info !!', data.scanResult.serialNumber, data.openParameters.ct);
			data.scanResult.acquiredRequiredData = true;
			var i;
			for(i = 0; i < results.length; i++) {
				var address = results[i].address;
				var isErr = results[i].isErr;
				var val = results[i].data;
				var res = data_parser.parseResult(address, val);
				data.scanResult[results[i].address] = res;
			}
			var addCT;
			var cts = data.scanResult.connectionTypes;
			var dt = data.scanResult.deviceType;
			if(data.scanResult.ETHERNET_IP) {
				if(data.scanResult.ETHERNET_IP.isReal) {
					addCT = true;
					for(i = 0; i < cts.length; i++) {
						if(cts[i].ct == driver_const.connectionTypes.ethernet) {
							addCT = false;
						}
					}
					if(addCT) {
						data.scanResult.connectionTypes.push(
							getInitialConnectionTypeData(
								dt,
								driver_const.connectionTypes.ethernet,
								data.scanResult.ETHERNET_IP.str,
								'attribute'
							)
						);
					}
				}
			}
			if(data.scanResult.WIFI_IP) {
				if(data.scanResult.WIFI_IP.isReal) {
					addCT = true;
					for(i = 0; i < cts.length; i++) {
						if(cts[i].ct == driver_const.connectionTypes.wifi) {
							addCT = false;
						}
					}
					if(addCT) {
						data.scanResult.connectionTypes.push(
							getInitialConnectionTypeData(
								dt,
								driver_const.connectionTypes.wifi,
								data.scanResult.WIFI_IP.str,
								'attribute'
							)
						);
					}
				}
			}
			defered.resolve(data);
		};
		if(true) {
			if(data.openedDevice) {
				if(data.registers.length > 0) {
					self.emit(eventList.COLLECTING_REMAINING_DEVICE_INFO, data.openParameters);
					data.device.readMultiple(data.registers)
					.then(
						parseResults,
						function(err) {
							console.warn('!! Error collecting info!!');
							defered.resolve(data);
						});
				} else {
					defered.resolve(data);
				}
			} else {
				defered.resolve(data);
			}
		} else {
			console.info('Skipping Collect', data.scanResult.serialNumber, data.openParameters.ct);
			data.scanResult.acquiredRequiredData = true;
			defered.resolve(data);
		}
		return defered.promise;
	};
	var closeScannedDevice = function(data) {
		var defered = q.defer();
		if(data.openedDevice) {
			// If the device is opened, try to close the device at most 2x
			// and then return.
			self.emit(eventList.CLOSING_FOUND_DEVICE, data.openParameters);
			data.device.close()
			.then(function(res) {
				defered.resolve(data.scanResult);
			}, function(err) {
				device.close()
				.then(function(res) {
					defered.resolve(data.scanResult);
				}, function(err) {
					defered.resolve(data.scanResult);
				});
			});
		} else {
			defered.resolve(data.scanResult);
		}
		return defered.promise;
	};
	var verifyConnectionType = function(scanResult, connectionType, registers) {
		var defered = q.defer();
		var createVerifierObject = function(isMockDevice) {
			this.device = new curatedDevice.device(isMockDevice);
			this.openedDevice = false;
			this.openParameters = {};
		};
		var finishVerification = function(res) {
			connectionType.verifying = false;
			defered.resolve(scanResult);
		};
		if(!connectionType.verificationAttempted) {
			if(!connectionType.verifying) {
				connectionType.verificationAttempted = true;
				connectionType.verifying = true;

				var data = new createVerifierObject(scanResult.isMockDevice);
				data.scanResult = scanResult;
				data.connectionType = connectionType;
				data.registers = registers;

				if(scanResult.isMockDevice) {
					// If we are using a mock device we need to configure the
					// device which requires performing an async call.
					configureScannedMockDevice(data)
					.then(openScannedDevice)
					.then(collectDeviceData)
					.then(closeScannedDevice)
					.then(finishVerification);
				} else {
					// otherwise we don't need to configure the device and can
					// just start using it.
					openScannedDevice(data)
					.then(collectDeviceData)
					.then(closeScannedDevice)
					.then(finishVerification);
				}
			} else {
				defered.resolve(scanResult);
			}
		} else {
			defered.resolve(scanResult);
		}
		return defered.promise;
	};
	var finalizeScanResult = function(scanResult) {
		var defered = q.defer();
		// console.log('Num Connection Types', scanResult.connectionTypes.length);

		var promises = [];
		scanResult.connectionTypes.forEach(function(connectionType) {
			if(!(connectionType.verified && scanResult.acquiredRequiredData)) {
				var dt = connectionType.dt;
				var deviceType = driver_const.DRIVER_DEVICE_TYPE_NAMES[dt];
				var scanAddresses = REQUIRED_INFO_BY_DEVICE[deviceType];
				var registerList = [];
				if(!scanResult.acquiredRequiredData) {
					registerList = scanAddresses;
				}
				promises.push(verifyConnectionType(
					scanResult,
					connectionType,
					registerList
				));
			}
		});
		if(promises.length === 0) {
			defered.resolve(scanResult);
		} else {
			q.allSettled(promises)
			.then(function(res) {
				defered.resolve(scanResult);
			}, function(err) {
				console.error('Error finalizeScanResult');
				defered.reject(scanResult);
			});
		}
		
		return defered.promise;
	};
	var finalizeScanResults = function(scanRequest) {
		var defered = q.defer();
		var numDevices = self.scanResults.length;
		// console.log('Collecting info for',
		// 	numDevices,
		// 	'devices',
		// 	scanRequest.scanNum,
		// 	scanRequest.connectionType,
		// 	scanRequest.deviceType);
		var promises = self.scanResults.map(finalizeScanResult);

		q.allSettled(promises)
		.then(function(res) {
			defered.resolve(scanRequest);
		}, function(err) {
			defered.reject(scanRequest);
		});
		return defered.promise;
	};

	var listAllExtended = function(scanRequest) {
		var defered = q.defer();
		var deviceType = scanRequest.deviceType;
		var connectionType = scanRequest.connectionType;
		var addresses = scanRequest.addresses;
		scanRequest.startTime = new Date();
		setImmediate(function() {
			self.emit(eventList.PERFORMING_LIST_ALL_EXTENDED, scanRequest);
			driver.listAllExtended(
				deviceType,
				connectionType,
				addresses,
				function(err) {
					// console.warn('listAllExtended err', err);
					self.emit(eventList.LIST_ALL_EXTENDED_ERROR, err);
					defered.reject(err);
				}, function(res) {
					scanRequest.stopTime = new Date();
					saveResults(scanRequest, res);
					scanRequest.scanNum += 1;
					self.emit(eventList.FINISHED_LIST_ALL_EXTENDED, scanRequest);
					finalizeScanResults(scanRequest)
					.then(finalizeScanResults)
					.then(defered.resolve, defered.reject);
				});
		});
		return defered.promise;
	};

	var listAll = function(scanRequest) {
		var defered = q.defer();
		var deviceType = scanRequest.deviceType;
		var connectionType = scanRequest.connectionType;
		scanRequest.startTime = new Date();
		setImmediate(function() {
			self.emit(eventList.PERFORMING_LIST_ALL, scanRequest);
			driver.listAll(
				deviceType,
				connectionType,
				function(err) {
					defered.reject(err);
				}, function(res) {
					scanRequest.stopTime = new Date();
					saveResults(scanRequest, res);
					scanRequest.scanNum += 1;
					self.emit(eventList.FINISHED_LIST_ALL, scanRequest);
					finalizeScanResults(scanRequest)
					.then(finalizeScanResults)
					.then(defered.resolve, defered.reject);
				});
		});
		return defered.promise;
	};

	var customWiFiScan = function(scanRequest) {
		var defered = q.defer();
		var deviceType = scanRequest.deviceType;
		var connectionType = scanRequest.connectionType;
		var addresses = scanRequest.addresses;

		var results = [];
		setImmediate(function() {
			defered.resolve(results);
		});
		return defered.promise;
	};
	var customEthernetScan = function(scanRequest) {
		var defered = q.defer();
		var deviceType = scanRequest.deviceType;
		var connectionType = scanRequest.connectionType;
		var addresses = scanRequest.addresses;

		var results = [];
		setImmediate(function() {
			defered.resolve(results);
		});
		return defered.promise;
	};
	var customUSBScan = function(scanRequest) {
		var defered = q.defer();
		var deviceType = scanRequest.deviceType;
		var connectionType = scanRequest.connectionType;
		var addresses = scanRequest.addresses;

		var results = [];
		setImmediate(function() {
			defered.resolve(results);
		});
		return defered.promise;
	};

	var scanForDevices = function(scanRequest) {
		var defered = q.defer();
		var promises = [];
		scanRequest.scanNum = 0;
		scanRequest.scanTypes = [];
		scanStrategies.forEach(function(scanStrategy) {
			if(scanStrategy.enabled) {
				if(scanStrategy.type === 'listAllExtended') {
					scanRequest.scanTypes.push('listAllExtended');
					promises.push(listAllExtended(scanRequest));
				} else if(scanStrategy.type === 'listAll') {
					scanRequest.scanTypes.push('listAll');
					promises.push(listAll(scanRequest));
				}
			}
		});

		q.allSettled(promises)
		.then(function(results) {
			defered.resolve();
		}, function(err) {
			console.error("singleScan error", err);
			defered.reject();
		});
		return defered.promise;
	};

	var combineScanResults = function() {
		var defered = q.defer();
		var i, j, k;
		
		for(i = 0; i < self.activeDeviceResults.length; i++) {
			var activeDevice = self.activeDeviceResults[i];
			var addDevice = true;
			for(j = 0; j < self.scanResults.length; j++) {
				var curDev = self.scanResults[j];
				var foundSN = curDev.serialNumber;

				// Check to see if the active device was found by the scanner.
				if(activeDevice.serialNumber == foundSN) {
					// Make sure that the device doesn't get added.
					addDevice = false;
					var connectionTypes = curDev.connectionTypes;
					var addCT = true;
					for(k = 0; k < connectionTypes.length; k++) {
						if(addDevice.connectionType.ct == connectionTypes[k].ct) {
							addCT = false;
							// Mark CT as active
							self.scanResults[j].connectionTypes[k].isActive = true;
						}
					}

					// If the CT wasn't already there, add it
					if(addCT) {
						self.scanResults[j].connectionTypes.push(
							addDevice.connectionType
						);
					}
				}
			}

			// If the device wasn't found by the scan, then add it
			if(addDevice) {
				// Add the connectionTypes key
				activeDevice.connectionTypes = [
					activeDevice.connectionType
				];

				// Add the device to the self.scanResults object
				self.scanResults.push(activeDevice);
			}
		}

		defered.resolve(self.scanResults);
		return defered.promise;
	};

	var populateDeviceInfo = function(deviceAttributes, currentDevices) {
		var defered = q.defer();

		var deviceKey = deviceAttributes.key;
		var dev = currentDevices[deviceKey].device;
		var attrs = dev.savedAttributes;
		var attrKeys = Object.keys(attrs);
		var dt = dev.savedAttributes.deviceType;
		var dtStr = driver_const.DRIVER_DEVICE_TYPE_NAMES[dt];
		var reqKeys = REQUIRED_INFO_BY_DEVICE[dtStr];
		
		// Add flag indicating whether or not device data has been acquired
		deviceAttributes.acquiredRequiredData = false;

		// Save any immediately available data from cached device values and
		// create a list of missing information.
		var missingKeys = [];
		reqKeys.forEach(function(reqKey) {
			if(attrKeys.indexOf(reqKey) < 0) {
				missingKeys.push(reqKey);
			} else {
				deviceAttributes[reqKey] = data_parser.parseResult(
					reqKey,
					attrs[reqKey],
					dt
				);
			}
		});

		// Also get & save custom attributes that the "deviceScanner.findAllDevices" adds
		// deviceType, deviceTypeName, serialNumber, acquiredRequiredData, connectionTypes
		var availableKeys = [
			'deviceType', 'deviceTypeString', 'serialNumber'
		];
		availableKeys.forEach(function(availableKey) {
			deviceAttributes[availableKey] = attrs[availableKey];
		});

		// Save the connected devices deivce type.
		deviceAttributes.connectionType = getInitialConnectionTypeData(
			attrs.deviceType,
			attrs.connectionType,
			attrs.ip,
			'connected'
		);

		// Save mock-device flag
		deviceAttributes.isMockDevice = dev.isMockDevice;

		// If there is any missing information, query the device for the data.
		if(missingKeys.length > 0) {
			self.emit(eventList.COLLECTING_DATA_FROM_CONNECTED_DEVICE, {
				'serialNumber': attrs.serialNumber,
				'deviceType': attrs.deviceType,
				'deviceTypeString': attrs.deviceTypeString,
				'connectionType': attrs.connectionType,
				'ip': attrs.ip,
				'missingKeys': missingKeys
			});

			dev.iReadMultiple(missingKeys)
			.then(function(missingVals) {
				var i;
				for(i = 0; i < missingVals.length; i++) {
					var addr = missingVals[i].address;
					if(!missingVals[i].isErr) {
						deviceAttributes[addr] = missingVals[i].data;
					} else {
						var info = constants.getAddressInfo(addr);
						var val;
						if(info.typeString === 'STRING') {
							val = data_parser.parseResult(addr, 'Unknown');
						} else {
							val = data_parser.parseResult(addr, 0);
						}
						val.isError = true;
						deviceAttributes[addr] = val;
					}
					
				}
				deviceAttributes.acquiredRequiredData = true;
				defered.resolve(deviceAttributes);
			});
		} else {
			deviceAttributes.acquiredRequiredData = true;
			defered.resolve(deviceAttributes);
			defered.resolve();
		}
		return defered.promise;
	};
	
	var getCurrentDeviceListing = function(currentDevices) {
		var defered = q.defer();
		self.activeDeviceResults = [];
		var currentDeviceListing = [];
		var promises = [];
		var deviceKeys = Object.keys(currentDevices);
		deviceKeys.forEach(function(deviceKey) {
			var devInfo = {
				'key': deviceKey
			};
			currentDeviceListing.push(devInfo);
			promises.push(populateDeviceInfo(devInfo, currentDevices));
		});

		q.allSettled(promises)
		.then(function(res) {
			self.activeDeviceResults = currentDeviceListing;
			defered.resolve();
		}, function(err) {
			console.error('Error finalizeScanResult');
			defered.reject();
		});
		return defered.promise;
	};
	var getFindAllDevices = function(currentDevices) {
		var findAllDevices = function() {
			var defered = q.defer();
			var promises = SCAN_REQUEST_LIST.map(scanForDevices);
			if(currentDevices) {
				if(Object.keys(currentDevices).length > 0) {
					// Add task that queries currently connected devices for their data.
					promises.push(getCurrentDeviceListing(currentDevices));
				}
			}

			q.allSettled(promises)
			.then(function(res) {
				self.emit(eventList.COMBINING_SCAN_RESULTS);
				combineScanResults()
				.then(defered.resolve, defered.reject);
			}, function(err) {
				// console.log("scan error", err);
				defered.reject(self.scanResults);
			});
			
			return defered.promise;
		};
		return findAllDevices;
	};

	this.originalOldfwState = 0;
	var saveDriverOldfwState = function() {
		var defered = q.defer();
		driver.readLibrary(
			'LJM_OLD_FIRMWARE_CHECK',
			function(err) {
				defered.reject(err);
			}, function(res) {
				self.originalOldfwState = res;
				defered.resolve();
			});
		
		return defered.promise;
	};
	var disableDriverOldfwState = function() {
		var defered = q.defer();
		driver.writeLibrary(
			'LJM_OLD_FIRMWARE_CHECK',
			0,
			function(err) {
				defered.reject(err);
			}, function() {
				defered.resolve();
			});
		return defered.promise;
	};
	var restoreDriverOldfwState = function() {
		var defered = q.defer();
		driver.writeLibrary(
			'LJM_OLD_FIRMWARE_CHECK',
			self.originalOldfwState,
			function(err) {
				defered.reject(err);
			}, function() {
				defered.resolve();
			});
		return defered.promise;
	};
	var populateMissingScanData = function() {
		var defered = q.defer();
		self.scanResults.forEach(function(scanResult) {
			var deviceType = scanResult.deviceType;
			var ljmDT = driver_const.DRIVER_DEVICE_TYPE_NAMES[deviceType];
			var requiredKeys = REQUIRED_INFO_BY_DEVICE[ljmDT];
			var availableKeys = Object.keys(scanResult);
			var productType = getProductType[ljmDT](scanResult);
			var modelType = getModelType[ljmDT](scanResult);
			scanResult.productType = productType;
			scanResult.modelType = modelType;
			// console.log('scan result device name', deviceName);
			var missingKeys = [];
			requiredKeys.forEach(function(requiredKey) {
				if(availableKeys.indexOf(requiredKey) < 0) {
					missingKeys.push(requiredKey);
					var info = constants.getAddressInfo(requiredKey);
					var val;
					if(info.typeString === 'STRING') {
						val = data_parser.parseResult(requiredKey, 'Unknown');
					} else {
						val = data_parser.parseResult(requiredKey, 0);
					}
					val.isError = true;
					scanResult[requiredKey] = val;
				}
			});
		});
		defered.resolve();
		return defered.promise;
	};

	var markActiveDevices = function() {
		var defered = q.defer();
		var i, j;
		for(i = 0; i < self.scanResults.length; i++) {
			var scanResult = self.scanResults[i];
			var connectionTypes = scanResult.connectionTypes;
			self.scanResults[i].isActive = false;
			for(j = 0; j < connectionTypes.length; j++) {
				var connectionType = connectionTypes[j];
				if(connectionType.isActive) {
					// Mark the device as active
					self.scanResults[i].isActive = true;
				}
			}
		}
		defered.resolve();
		return defered.promise;
	};
	var sortScanResults = function() {
		var defered = q.defer();
		var tmpSortedResults = {};
		var i;
		for(i = 0; i < self.scanResults.length; i++) {
			var str = self.scanResults[i].deviceTypeString;
			if(tmpSortedResults[str]) {
				tmpSortedResults[str].devices.push(self.scanResults[i]);
			} else {
				tmpSortedResults[str] = {
					'deviceTypeString': self.scanResults[i].deviceTypeString,
					'deviceTypeName': self.scanResults[i].deviceTypeName,
					'devices': [],
				};
				tmpSortedResults[str].devices.push(self.scanResults[i]);
			}
			
		}
		var keys = Object.keys(tmpSortedResults);
		for(i = 0; i < keys.length; i++) {
			if(tmpSortedResults[keys[i]].devices.length > 0) {
				self.sortedResults.push(tmpSortedResults[keys[i]]);
			}
		}
		defered.resolve();
		return defered.promise;
	};
	var returnResults = function() {
		var defered = q.defer();
		defered.resolve(self.sortedResults);
		self.scanInProgress = false;
		return defered.promise;
	};
	this.findAllDevices = function(currentDevices) {
		var defered = q.defer();
		if(!self.scanInProgress) {
			self.scanInProgress = true;
			self.scanResults = [];
			self.activeDeviceResults = [];
			self.sortedResults = [];

			var getOnError = function(msg) {
				return function(err) {
					console.error('An Error', err, msg);
					var errDefered = q.defer();
					errDefered.reject(err);
					return errDefered.promise;
				};
			};

			if(deviceScanningEnabled) {
				saveDriverOldfwState()
				.then(disableDriverOldfwState, getOnError('saveDriverOldfwState'))
				.then(getFindAllDevices(currentDevices), getOnError('disableDriverOldfwState'))
				.then(restoreDriverOldfwState, getOnError('getFindAllDevices'))
				.then(populateMissingScanData, getOnError('restoreDriverOldfwState'))
				.then(markActiveDevices, getOnError('populateMissingScanData'))
				.then(sortScanResults, getOnError('markActiveDevices'))
				.then(returnResults, getOnError('sortScanResults'))
				.then(defered.resolve, defered.reject);
			} else {
				getFindMockDevices(currentDevices)()
				.then(populateMissingScanData, getOnError('getFindAllDevices'))
				.then(markActiveDevices, getOnError('populateMissingScanData'))
				.then(sortScanResults, getOnError('markActiveDevices'))
				.then(returnResults, getOnError('sortScanResults'))
				.then(defered.resolve, defered.reject);
			}
		} else {
			defered.reject('Scan in progress');
		}
		return defered.promise;
	};
	this.getLastFoundDevices = function() {
		var defered = q.defer();
		if(!self.scanInProgress) {
			defered.resolve(self.sortedResults);
		} else {
			defered.resolve([]);
		}
		return defered.promise;
	};

	this.addMockDevice = function(device) {
		return self.mockDeviceScanner.addDevice(device);
	};
	this.addMockDevices = function(devices) {
		return self.mockDeviceScanner.addDevices(devices);
	};
	var scanForMockDevices = function(scanRequest) {
		var defered = q.defer();
		var promises = [];
		scanRequest.scanNum = 0;
		scanRequest.scanTypes = [];
		scanStrategies.forEach(function(scanStrategy) {
			if(scanStrategy.enabled) {
				if(scanStrategy.type === 'listAllExtended') {
					scanRequest.scanTypes.push('listAllExtended');
					promises.push(
						self.mockDeviceScanner.listAllExtended(scanRequest)
					);
				} else if(scanStrategy.type === 'listAll') {
					scanRequest.scanTypes.push('listAll');
					promises.push(
						self.mockDeviceScanner.listAll(scanRequest)
					);
				}
			}
		});

		q.allSettled(promises)
		.then(function(results) {
			var innerDefered = q.defer();
			var innerPromises = [];
			innerPromises = results.map(function(result, i) {
				var scanResults = result.value;
				var scanType = scanRequest.scanTypes[i];
				// console.log('Scan type:', scanType, 'finished');
				// console.log(scanType, 'data', JSON.stringify(scanResults, null, 2));

				saveResults(scanRequest, scanResults);
				scanRequest.scanNum += 1;
				self.emit(eventList.FINISHED_MOCK_LIST_ALL, scanRequest);
				return finalizeScanResults(scanRequest)
				.then(finalizeScanResults);
			});
			q.allSettled(innerPromises)
			.then(function() {
				defered.resolve(scanRequest);
			});
		}, function(err) {
			console.error("singleScan error", err);
			defered.reject();
		});
		return defered.promise;
	};
	var getFindMockDevices = function(currentDevices) {
		var findMockDevices = function() {
			var defered = q.defer();
			var promises = SCAN_REQUEST_LIST.map(scanForMockDevices);
			if(currentDevices) {
				if(Object.keys(currentDevices).length > 0) {
					// Add task that queries currently connected devices for their data.
					promises.push(getCurrentDeviceListing(currentDevices));
				}
			}

			q.allSettled(promises)
			.then(function(res) {
				self.emit(eventList.COMBINING_SCAN_RESULTS);
				combineScanResults()
				.then(defered.resolve, defered.reject);
			}, function(err) {
				// console.log("scan error", err);
				defered.reject(self.scanResults);
			});
			
			return defered.promise;
		};
		return findMockDevices;
	};

	/*
	var defered = q.defer();
	var promises = [];
	scanRequest.scanNum = 0;
	scanRequest.scanTypes = [];
	scanStrategies.forEach(function(scanStrategy) {
		if(scanStrategy.enabled) {
			if(scanStrategy.type === 'listAllExtended') {
				scanRequest.scanTypes.push('listAllExtended');
				promises.push(listAllExtended(scanRequest));
			} else if(scanStrategy.type === 'listAll') {
				scanRequest.scanTypes.push('listAll');
				promises.push(listAll(scanRequest));
			}
		}
	});

	q.allSettled(promises)
	.then(function(results) {
		defered.resolve();
	}, function(err) {
		console.error("singleScan error", err);
		defered.reject();
	});
	return defered.promise;
	*/

	var self = this;
};
util.inherits(deviceScanner, EventEmitter);

exports.deviceScanner = deviceScanner;