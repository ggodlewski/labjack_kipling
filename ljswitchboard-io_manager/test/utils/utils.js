var assert = require('chai').assert;

var q = require('q');
var util = require('util');

var qRunner = function(done, func) {
	var defered = q.defer();
	try {
		func()
		.then(function(res) {
			defered.resolve(res);
		}, function(err) {
			console.log('qRunner defered error err', err);
			assert.isOk(false, err);
			done();
		}, function(err) {
			console.log('qRunner syntax error err', err);
			assert.isOk(false, err);
			done();
		});
	} catch(err) {
			console.log('qRunner critical error err', err);
			assert.isOk(false, err);
			done();
		}
	return defered.promise;
};
exports.qRunner = qRunner;

// define a q function that calls an object's function and saves data into an
// array
var qExec = function(obj, func, argA, argB, argC) {
	return function(bundle) {
		var defered = q.defer();
		obj[func](argA, argB, argC)
		.then(function(data) {
			bundle.push({'functionCall':func, 'retData': data});
			defered.resolve(bundle);
		}, function(err) {
			bundle.push({'functionCall':func, 'errData': err});
			defered.resolve(bundle);
		});
		return defered.promise;
	};
};
exports.qExec = qExec;

var pResults = function(results, pIndividual, expectedErrorsList) {
	var defered = q.defer();
	var numSuccess = 0;
	var numFail = 0;
	if(pIndividual) {
		console.log(' - Num Results', results.length);
	}
	results.forEach(function(result) {
		var message = '   - ';
		var data;
		var keys = Object.keys(result);
		if(keys.indexOf('retData') >= 0) {
			message += 'Success: ';
			data = result.retData;
			numSuccess += 1;
		} else {
			if(expectedErrorsList.indexOf(result.functionCall) < 0) {
				message += 'Error: ';
				data = result.errData;
				numFail += 1;
			} else {
				message += 'Expected Error: ';
				data = result.errData;
				numSuccess += 1;
			}

		}
		message += result.functionCall;
		if(pIndividual) {
			console.log(message + util.format(', %j',data));
		}
	});

	if(!pIndividual) {
		var num = results.length;
		var ratio = (numSuccess/num*100).toFixed(3);
		console.log(' - Num Results %d, %d% successful', num, ratio);
	}

	defered.resolve(results);
	return defered.promise;
};
exports.pResults = pResults;

var testResults = function(expectedResults, results) {
	if(results.length !== expectedResults.length) {
		assert.isOk(false, 'num results does not match');
	}
	var i = 0;
	for(i = 0; i < results.length; i++) {
		var expectedResult = expectedResults[i];
		var result = results[i];
		var fCall = 'proper function not called';
		assert.strictEqual(expectedResult.functionCall, result.functionCall, fCall);
		var type = 'value';
		if(expectedResult.type) {
			type = expectedResult.type;
		}
		if(type === 'value') {
			var datamsg = 'bad value detected';
			assert.strictEqual(expectedResult.retData, result.retData, datamsg);
		} else if (type === 'range') {
			var rangemsg = 'value out of range';
			var valueInRange = true;
			if(result.retData < expectedResult.min) {
				valueInRange = false;
				rangemsg += ': value to low, val: ' + result.retData.toString();
				rangemsg += ', minVal: ' + expectedResult.min.toString();
			}
			if(result.retData > expectedResult.max) {
				valueInRange = false;
				rangemsg += ': value to high, val: ' + result.retData.toString();
				rangemsg += ', maxVal: ' + expectedResult.max.toString();
			}
			assert.isOk(valueInRange, rangemsg);
		}
	}
};
exports.testResults = testResults;

var testResultsArray = function(expectedResults, results) {
	if(results.length !== expectedResults.length) {
		assert.isOk(false, 'num results does not match');
	}
	var i = 0;
	var j = 0;
	for(i = 0; i < results.length; i++) {
		var expectedResult = expectedResults[i];
		var result = results[i];
		var fCall = 'proper function not called';
		assert.strictEqual(expectedResult.functionCall, result.functionCall, fCall);

		if(result.retData.length !== expectedResult.retData.length) {
			assert.isOk(false, 'length of retData does not match');
		}
		for(j = 0; j < result.retData.length; j++) {
			var res = result.retData[j];
			var expectedRes = expectedResult.retData[j];
			var addrmsg = 'Wrong address read';
			assert.strictEqual(expectedRes.address, res.address, addrmsg);
			var errmsg = 'wrong error boolean result';
			assert.strictEqual(expectedRes.isErr, res.isErr, errmsg);

			var type = 'value';
			if(expectedRes.type) {
				type = expectedRes.type;
			}
			if(type === 'value') {
				var datamsg = 'bad value detected';
				assert.strictEqual(expectedRes.data, res.data, datamsg);
			} else if (type === 'range') {
				var rangemsg = 'value out of range';
				var valueInRange = true;
				if(res.data < expectedRes.min) {
					valueInRange = false;
					rangemsg += ': value to low, val: ' + res.data.toString();
					rangemsg += ', minVal: ' + expectedRes.min.toString();
				}
				if(res.data > expectedRes.max) {
					valueInRange = false;
					rangemsg += ': value to high, val: ' + res.data.toString();
					rangemsg += ', maxVal: ' + expectedRes.max.toString();
				}
				assert.isOk(valueInRange, rangemsg);
			}
		}
	}
};
exports.testResultsArray = testResultsArray;

var testDeviceObject = function(device, expDevice) {
	var savedAttributes = device.savedAttributes;
	var expSavedAttributes = expDevice.mockDeviceConfig;

	var expKeys = Object.keys(expSavedAttributes);
	var keyTransforms = {
		'ipAddress': 'ipAddress',
		'ip': 'ipAddress',
	};

	expKeys.forEach(function(expKey) {
		var resKey = expKey;
		if(keyTransforms[expKey]) {
			resKey = keyTransforms[expKey];
		}

		var expRes = expSavedAttributes[expKey];
		var res = savedAttributes[resKey];
		if(res) {
			if(res.val) {
				assert.strictEqual(res.val, expRes, 'Key: '+resKey+', wrong val');
			} else {
				if(res !== expRes) {
					console.log('Looking for', resKey);
					console.log('Expected Val', expRes);
					console.log('Actual Result', res);
					// console.log(
					// 	'Available Data',
					// 	Object.keys(savedAttributes),
					// 	savedAttributes
					// );
				}
				assert.strictEqual(res, expRes, 'Key: '+expKey+', wrong val');
			}
		} else {
			console.log('(no-res) Looking for', expKey);
			console.log('Expected Val', expRes);
			console.log('Available Data', Object.keys(savedAttributes));
			assert.isOk(false, 'Expected key: '+expKey+', not found.');
		}
	});
};
exports.testDeviceObject = testDeviceObject;

var testDeviceObjects = function(devices, expDevices) {
	try {
		assert.strictEqual(devices.length, expDevices.length, 'Num Devices not correct');
		expDevices.forEach(function(expDevice, i) {
			var device = devices[i];
			testDeviceObject(
				device,
				expDevice
			);
		});
	} catch(err) {
		assert.isOk(false, 'Error Running Test' + err.toString());
	}
};
exports.testDeviceObjects = testDeviceObjects;
