var assert = require('chai').assert;

/**
	This test aims to show how the io_manager library should be used.  It
	shows the initialization, some basic usage steps, and destruction of the
	library.
**/

var q = require('q');

var io_manager;
var io_interface;

// Managers
var driver_controller;
var device_controller;

var device;

var getPerformTest = function(functionName, testArguments, numReads) {
	// var numReads = numReads;
	// var functionName = functionName;
	// var testArguments = testArguments;
	var testingFunc = function(done) {
		var promises = [];
		var i;
		var startTime = new Date();
		var endTime;

		for(i = 0; i < numReads; i++) {
			promises.push(device[functionName](testArguments));
		}

		q.allSettled(promises)
		.then(function() {
			endTime = new Date();

			var totalTime = (endTime - startTime)/1000;
			var timePerRead = totalTime/numReads;
			var rate = 1/timePerRead;
			var stats = {
				'functionName': functionName,
				'arguments': testArguments,
				'totalTime': totalTime,
				'timePerRead': timePerRead,
				'rate': rate,
			};
			console.log('Finished Reading, Stats:');
			console.log(JSON.stringify(stats, null, 2));
			done();
		});
	};
	return testingFunc;
};

describe('mock device speed', function() {
	return;
	this.skip();
	it('initialization', function (done) {
		// Require the io_manager library
		io_manager = require('../lib/io_manager');

		// Require the io_interface that gives access to the ljm driver,
		// device controller, logger, and file_io_controller objects.
		io_interface = io_manager.io_interface();

		// Initialize the io_interface
		io_interface.initialize()
		.then(function(res) {
			// io_interface has initialized and is ready for use
			// Save local pointers to the created objects
			driver_controller = io_interface.getDriverCotroller();
			device_controller = io_interface.getDeviceController();

			assert.isOk(true);
			done();
		}, function(err) {
			assert.isOk(false, 'error initializing io_interface' + JSON.stringify(err));
			done();
		});
	});
	it('open mock device', function (done) {
		var params = {
			'deviceType': 'LJM_dtT7',
			'connectionType': 'LJM_ctUSB',
			'identifier': 'LJM_idANY',
			'mockDevice': true
		};

		console.log('opening mock device');
		device_controller.openDevice(params)
		.then(function(newDevice) {
			// save device reference
			device = newDevice;
			device_controller.getNumDevices()
			.then(function(res) {
				assert.strictEqual(res, 1, 'wrong number of devices are open');
				done();
			});
		}, function(err) {
			console.log("Error opening device", err);
			assert.isOk(false, 'failed to create new device object');
			done();
		});
	});
	it('read single AIN0', function (done) {
		device.read('AIN0')
		.then(function(res) {
			var isOk = true;
			if((res > 11) || (res < -11)) {
				isOk = false;
			}
			assert.isOk(isOk, 'AIN0 read result is out of range');
			done();
		}, function(err) {
			assert.isOk(false, 'AIN0 read result returned an error');
			done();
		});
	});
	it('read x2000, AIN0', function (done) {
		getPerformTest('read', 'AIN0', 2000)(done);
	});
	it('iRead x2000, AIN0', function (done) {
		getPerformTest('iRead', 'AIN0', 2000)(done);
	});
	it('sRead x2000, AIN0', function (done) {
		getPerformTest('sRead', 'AIN0', 2000)(done);
	});
	// it('update firmware', function (done) {
	// 	var fwLocation = '';
	// 	var numPercentUpdates = 0;
	// 	var percentListener = function(percent) {
	// 		numPercentUpdates += 1;
	// 	};
	// 	var numStepUpdates = 0;
	// 	var stepListener = function(step) {
	// 		numStepUpdates += 1;
	// 	};
	// 	device.updateFirmware(
	// 		fwLocation,
	// 		percentListener,
	// 		stepListener
	// 	)
	// 	.then(function(res) {
	// 		assert.isOk(true);
	// 		if(numPercentUpdates > 0) {
	// 			assert.isOk(true);
	// 		} else {
	// 			assert.isOk(false, 'did not receive any percent updates');
	// 		}
	// 		if(numPercentUpdates > 0) {
	// 			assert.isOk(true);
	// 		} else {
	// 			assert.isOk(false, 'did not receive any step updates');
	// 		}
	// 		done();
	// 	}, function(err) {
	// 		console.log('Update Failed', err);
	// 		assert.isOk(false, 'Update failed to complete');
	// 		done();
	// 	});
	// },
	it('close mock device', function (done) {
		device.close()
		.then(function(res) {
			assert.strictEqual(res.comKey, 0, 'expected to receive a different comKey');
			done();
		}, function(err) {
			console.log('Failed to close mock device', err);
			assert.isOk(false, 'Failed to close mock device');
			done();
		});
	});
	it('destruction', function (done) {
		io_interface.destroy()
		.then(function(res) {
			// io_interface process has been shut down
			assert.isOk(true);
			done();
		}, function(err) {
			assert.isOk(false, 'io_interface failed to shut down' + JSON.stringify(err));
			done();
		});
	});
});
