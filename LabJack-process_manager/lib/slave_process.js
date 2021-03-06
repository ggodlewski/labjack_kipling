/**
 * The slave_process is in charge of receiving and responding properly
 * to sendReceive messages from the master_process.
 *
 * @author Chris Johnson (LabJack Corp.)
**/

// Enable to print out important processor debugging data
if(false) {
	console.log('');
	console.log('*********************');
	console.log('Subprocess Started!');
	console.log('Node Version', process.versions.node);
	console.log('Exec Path', process.execPath);
	console.log('*********************');
	console.log('');

}
var dict = require('dict');
var q = require('q');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var net = require('net');
var fs = require('fs');

// include various constants from the constants file
var pm_constants = require('./process_manager_constants');
var PM_MESSAGE = pm_constants.message;
var PM_STOP_CHILD_PROCESS = pm_constants.stopChildProcess;
var PM_CHILD_PROCESS_STARTED = pm_constants.childProcessStarted;
var PM_GET_PROCESS_INFO = pm_constants.getProcessInfo;
var PM_EMIT_MESSAGE = pm_constants.emitMessage;



// valid user listener types
var SP_Q_LISTENER_TYPE = 'q';
var SP_CALLBACK_LISTENER_TYPE = 'callback';

var IS_DEBUG = false;
var print = function(argA, argB) {
	if(IS_DEBUG) {
	    var msg = 'SP:';
	    if(argA) {
	        if(argB) {
	            console.log(msg, argA, argB);
	        } else {
	            console.log(msg, argA);
	        }
	    } else {
	        console.log(msg);
	    }
	}
};

var readStream = null;
var writeStream = null;
var createStreamInterface = false;
var exitListenerFunc = undefined;
if(createStreamInterface) {
	try {
		readStream = fs.createReadStream(null, {fd: 4});
		writeStream = fs.createReadStream(null, {fd: 5, flags: 'r+', 'encoding': 'ascii'});
		// readStreamB = fs.createReadStream(null, {fd: 5});
		readStream.on('readable', function() {
			console.log("S: my piped data 0");
			var chunk;
			while (null !== (chunk = readStream.read())) {
				console.log('S: got %d bytes of data', chunk.length, ':', chunk.toString('ascii'));
			}
			// .write(Buffer('awesome'));
		});
		// readStream.on('data', function(buff) {
		// 	console.log("my piped data 1", buff);
		// });
		readStream.on('end', function() {
			console.log("S: readStream Ended");
		});
		readStream.on('error', function(err) {
			console.log("S: readStream Error", err);
		});
		console.log("S: hh", writeStream.push);
		console.log("S: here", writeStream);
		// writeStream.push(new Buffer("HERE"));
		
		writeStream.on('open', function() {
			console.log("* S: Writing Data");
			var succ = writeStream.write('awesome','ascii', function(err) {
				console.log('* S: Write Stream Callback', err);
			});
			console.log("* S: Write Success", succ);
		});
		fs.write(5, 'Start Pipe', function(err) {
			console.log("* S: Write Callback", err);
		});
		// writeStream.write(Buffer('awesome'));

	} catch(err) {
		console.log("ERR", err);
	}
	// var pipe = new net.Socket({ fd: 1, readable: true });
	// pipe.on('data', function(buf) {
	// 	console.log("my piped data", buf);
	// });
	// print(fs.fstatSync(0));
	// print(fs.fstatSync(1));
	// print(fs.fstatSync(2));
	// print(fs.fstatSync(3));
	// print(fs.fstatSync('4'));
	// console.log("pInfo", process.stdio);
}
var slave_process_env;
if(process.env.slave_process_env) {
	slave_process_env = JSON.parse(process.env.slave_process_env);
	print('Passed Arguments via json', slave_process_env);
}


function createNewMessageManager(listeners) {
	this.numMessagesReceived = 0;
	this.numInternalMessagesReceived = 0;
	this.numUserMessagesReceived = 0;
	this.numResponces = 0;

	var savedListener = listeners;
	var internalMessages = [
		PM_STOP_CHILD_PROCESS,
		PM_GET_PROCESS_INFO
	];
	var getProcessInfo = function(bundle) {
		var defered = q.defer();

		var retData = {
			'slave_process': {
				'numMessagesReceived': self.numMessagesReceived,
				'numInternalMessagesReceived': self.numInternalMessagesReceived,
				'numUserMessagesReceived': self.numUserMessagesReceived,
				'numResponces': self.numResponces
			},
			'cwd': process.cwd(),
			'execPath': process.execPath,
			'execArgv': process.execArgv,
			'argv': process.argv,
			'pid': process.pid,
			'version': process.version,
			// 'versions': process.versions,
			'arch': process.arch,
			'platform': process.platform,
			// 'config': process.config,
			'memoryUsage': process.memoryUsage(),
			'uptime': process.uptime()
		};
		bundle.successData = retData;
		bundle.isHandled = true;
		defered.resolve(bundle);
		return defered.promise;
	};
	var stopChildprocess = function(bundle) {
		var retData;
		var defered = q.defer();
		if(exitListenerFunc) {
			var exitHandler = exitListenerFunc();
			var isPromise = false;
			if(typeof(exitHandler) !== 'undefined') {
				if(typeof(exitHandler.then) === 'function') {
					isPromise = true;
				}
			}
			if(isPromise) {
				exitHandler.then(function() {
					retData = 1;
					bundle.successData = retData;
					bundle.isHandled = true;
					defered.resolve(bundle);
				});
			} else {
				retData = 1;
				bundle.successData = retData;
				bundle.isHandled = true;
				defered.resolve(bundle);
			}
		} else {
			retData = 1;
			bundle.successData = retData;
			bundle.isHandled = true;
			defered.resolve(bundle);
		}
		return defered.promise;
	};
	var internalMessageBindings = {};
	internalMessageBindings[PM_STOP_CHILD_PROCESS] = stopChildprocess;
	internalMessageBindings[PM_GET_PROCESS_INFO] = getProcessInfo;

	var isInternalMessage = function(messageType) {
		var isInternalMessage = false;
		if(internalMessages.indexOf(messageType) >= 0) {
			isInternalMessage = true;
		}
		return isInternalMessage;
	};
	var getMessageType = function(message) {
		return message.type;
	};

	var handleMessageError = function(bundle) {
		var errDefered = q.defer();
		errDefered.reject(bundle);
		return errDefered.promise;
	};
	
	var markMessageHandler = function(bundle) {
		var defered = q.defer();
		var messageType = getMessageType(bundle.message);
		if(isInternalMessage(messageType)) {
			self.numInternalMessagesReceived += 1;
			bundle.isInternalMessage = true;
		} else {
			self.numUserMessagesReceived += 1;
			bundle.executeUserListener = true;
		}
		defered.resolve(bundle);
		return defered.promise;
	};
	var handleInternalMessage = function(bundle) {
		var defered = q.defer();
		if(bundle.isInternalMessage) {
			// handle internal message
			if(internalMessageBindings[bundle.message.type]) {
				internalMessageBindings[bundle.message.type](bundle)
				.then(defered.resolve, defered.reject);
			} else {
				console.log("Internal Message Type Encountered", bundle.message);
				print('internal message type encountered', bundle.message);
				bundle.successData = 'internal message handled';
				bundle.isHandled = true;
				defered.resolve(bundle);
			}
		} else {
			defered.resolve(bundle);
		}
		return defered.promise;
	};
	var executeListener = function(bundle) {
		var defered = q.defer();
		if((!bundle.isHandled) && (bundle.executeUserListener)) {
			print('in executeListener', bundle.message);
			var onSuccess = function(res) {
					if(bundle.responseRequired) {
					print(
						'userData in executeListener-q', 
						res
					);
					bundle.successData = res;
					bundle.isHandled = true;
					defered.resolve(bundle);
				}
			};
			var onError = function(err) {
				if(bundle.responseRequired) {
					print(
						'userError noticed in executeListener-q', 
						err
					);
					bundle.returnError = true;
					bundle.isHandled = true;
					bundle.errorType = 'userError';
					bundle.errorData = err;
					defered.resolve(bundle);
				}
			};
			var onSyntaxErr = function(syntaxError) {
				if(bundle.responseRequired) {
					print(
						'syntaxError encountered in executeListener-q', 
						syntaxError
					);
					bundle.returnError = true;
					bundle.isHandled = true;
					bundle.errorType = 'syntaxError';
					bundle.errorData = syntaxError;
					defered.resolve(bundle);
				}
			};
			if(bundle.responseRequired) {
				if(savedListener.type === SP_Q_LISTENER_TYPE) {
					savedListener.func(bundle.message.data)
					.then(onSuccess, onError, onSyntaxErr);
				} else if (savedListener.type === SP_CALLBACK_LISTENER_TYPE) {
					try {
						savedListener.func(
							bundle.message.data,
							onError,
							onSuccess
						);
					} catch(syntaxError) {
						onSyntaxErr(syntaxError);
					}
				} else {
					throw new error('savedListener.type not valid, slave_process, OUCH!', savedListener.type);
				}
			} else {
				self.emit(bundle.message.type, bundle.message.data);
				defered.resolve(bundle);
			}
		} else {
			defered.resolve(bundle);
		}
		return defered.promise;
	};
	var respond = function(bundle) {
        var defered = q.defer();

        // build a newMessage object that wraps the message with a message id
        // that will later resolve or reject on the promise object.
        var newMessage = {};
        newMessage.id = bundle.id;
        newMessage.type = bundle.message.type;
        newMessage.isError = bundle.returnError;
        if(bundle.returnError) {
        	newMessage.errorType = bundle.errorType;
        	newMessage.data = bundle.errorData;
        } else {
        	newMessage.data = bundle.successData;
        }
        
        // increment response counter
        self.numResponces += 1;

        // Print Debug message
        print('Responding to message', newMessage);
        
        // send the newMessage object to the child process
        process.send(newMessage);
        
        defered.resolve(bundle);
        return defered.promise;
    };
	var respondToMessage = function(bundle) {
		var defered = q.defer();
		if(bundle.isHandled) {
			respond(bundle)
			.then(defered.resolve, defered.reject);
		} else {
			defered.resolve(bundle);
		}
		
		return defered.promise;
	};
	var cleanupMessage = function(bundle) {
		var defered = q.defer();
		var keys = Object.keys(bundle);
		keys.forEach(function(key) {
			bundle[key] = undefined;
			delete bundle[key];
		});
		bundle = undefined;
		defered.resolve();
		return defered.promise;
	};

	this.messageListener = function(m) {
		self.numMessagesReceived += 1;

		var messageBundle = {
			'id':m.id,
			'message':m,
			'isHandled': false,
			'isInternalMessage': false,
			'executeUserListener': false,
			'responseRequired': m.responseRequired,
			'returnError': false,
			'successData': null,
			'errorType': '',
			'errorData': null
		};
		markMessageHandler(messageBundle)
		.then(handleInternalMessage, handleMessageError)
		.then(executeListener, handleMessageError)
		.then(respondToMessage, handleMessageError)
		.then(cleanupMessage, cleanupMessage);
	};
	var setupProcessStartedMessage = function(retData) {
		var defered = q.defer();
		var data = {
			'id': PM_CHILD_PROCESS_STARTED,
        	'message': {'type': PM_CHILD_PROCESS_STARTED},
        	'returnError': false,
        	'successData': retData
		};
		defered.resolve(data);
		return defered.promise;
	};

	this.finishSetup = function(retData) {
		var defered = q.defer();
		setupProcessStartedMessage(retData)
		.then(respond)
		.then(cleanupMessage)
        .then(defered.resolve, defered.reject);
        return defered.promise;
	};

	var setupEmitMessage = function(m) {
		var defered = q.defer();
		var data = {
			'id': PM_EMIT_MESSAGE,
        	'message': {'type': m.eventType},
        	'returnError': false,
        	'successData': m
		};
		defered.resolve(data);
		return defered.promise;
	};

	this.emitMessage = function(m) {
		var defered = q.defer();
		setupEmitMessage(m)
		.then(respond)
		.then(cleanupMessage)
		.then(defered.resolve, defered.reject);
        return defered.promise;
	};

	EventEmitter.call(this);
	var self = this;
}
util.inherits(createNewMessageManager, EventEmitter);

var messageManager;

// Start defining external interfaces
exports.init = function(listener) {
	// Make sure the listeners object is valid
	if(typeof(listener) === 'undefined') {
		throw new error('listeners argument is not defined');
	}
	if(typeof(listener.type) === 'undefined') {
		throw new error('listeners.type is not defined');
	}
	if((listener.type !== SP_Q_LISTENER_TYPE) && (listener.type !== SP_CALLBACK_LISTENER_TYPE)) {
		throw new error('listeners.type is not valid', listener.type);
	}
	if(typeof(listener.func) === 'undefined') {
		throw new error('listeners.func is not defined');
	}


    // Create a new messageManager object
	messageManager = new createNewMessageManager(listener);
	

	// Link the messageManager to the processes message event
	process.on('message', messageManager.messageListener);

    // Attach some event listeners to the processManager
    // messageManager.on(PM_CRITICAL_ERROR, criticalErrorListener);
    // messageManager.on(PM_MESSAGE_BUFFER_FULL, criticalErrorListener);

    return messageManager;
};
exports.finishedInit = function(retData) {
	var defered = q.defer();
	// Indicate that this process is ready to receive messages
	messageManager.finishSetup(retData)
	.then(defered.resolve, defered.reject);
    return defered.promise;
};

exports.getSlaveProcessInfo = function() {
	return slave_process_env;
};

exports.getStats = function() {
	return {};
};
exports.sendMessage = function(data) {
	if((typeof(data) !== 'undefined')) {
		var message = {
			'eventType': PM_EMIT_MESSAGE,
			'data': data
		};
		return messageManager.emitMessage(message);
	}
};
exports.send = function(type, data) {
	if((typeof(type) !== 'undefined') && (typeof(data) !== 'undefined')) {
		var message = {
			'eventType': type,
			'data': data
		};
		return messageManager.emitMessage(message);
	}
};
exports.attachOnExitListener = function(onExitFunc) {
	exitListenerFunc = onExitFunc;
}