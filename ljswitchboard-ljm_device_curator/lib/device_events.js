

exports.DEVICE_DISCONNECTED = 'DEVICE_DISCONNECTED';
exports.DEVICE_RECONNECTED = 'DEVICE_RECONNECTED';
exports.DEVICE_ERROR = 'DEVICE_ERROR';
exports.DEVICE_RECONNECTING = 'DEVICE_RECONNECTING';
exports.DEVICE_ATTRIBUTES_CHANGED = 'DEVICE_ATTRIBUTES_CHANGED';
exports.DEVICE_INITIALIZING = 'DEVICE_INITIALIZING';

/* Events designed for Lua scripting */
exports.LUA_SCRIPT_DEBUG_DATA = 'LUA_SCRIPT_DEBUG_DATA';
exports.LUA_SCRIPT_STARTED = 'LUA_SCRIPT_STARTED';
exports.LUA_SCRIPT_STOPPED = 'LUA_SCRIPT_STOPPED';

/* Events designed for firmware upgrading */
exports.DEVICE_STARTED_FIRMWARE_UPGRADE = 'DEVICE_STARTED_FIRMWARE_UPGRADE';
exports.DEVICE_FINISHED_FIRMWARE_UPGRADE = 'DEVICE_FINISHED_FIRMWARE_UPGRADE';

/* Events designed for the Kipling3 dashboard */
exports.DASHBOARD_DATA_UPDATE = 'DASHBOARD_DATA_UPDATE';