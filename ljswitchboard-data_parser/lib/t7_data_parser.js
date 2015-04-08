
var shared_data_parser = require('./shared_data_parser');
var checkStr = shared_data_parser.checkStr;

var ipDataType = {
	'decode': shared_data_parser.parseIP,
	'encode': shared_data_parser.encodeIP
};

var firmwareVersionRounder = shared_data_parser.firmwareVersionRounder;
var decodeCurrentSourceCalVal = function(val) {
	var res = {
		'val': 0,
		'str': '',
		'unit': 'uA',
	};
	var rVal = (val * 1000000).toFixed(3);
	res.val = parseFloat(rVal);
	res.str = rVal;
	return res;
};
var T7_LIST = {
	'AIN#(0:254)': {
		'decode': function(val) {
			var res = {
				'val': parseFloat(val.toFixed(6)),
				'rounded': 0,
				'unit': 'V',
				'str': ''
			};
			var strVal = '';
			
			// Decide whether or not to convert units for sigfig reasons.
			if((-0.1 < val) && (val < 0.1)) {
				var rVal = val * 1000;
				res.unit = 'mV';
				res.str = rVal.toFixed(6);
				res.rounded = parseFloat(res.str);
			} else {
				res.str = val.toFixed(6);
				res.rounded = parseFloat(res.str);
			}
			if(val == -9999) {
				res.str = '-9999';
			}
			return res;
		}
	},
	'DAC#(0:1)': {
		'decode': function(val) {
			var res = {
				'val': 0,
				'unit': 'V',
				'str': ''
			};
			res.str = val.toFixed(3);
			res.val = parseFloat(res.str);
			return res;
		}
	},
	'TEMPERATURE_DEVICE_K':{
		'decode': function(val) {
			return {
				'val': parseFloat(val.toFixed(4)),
				'str': val.toFixed(4),
				'unit': 'K',
			};
		},
	},
	'CURRENT_SOURCE_200UA_CAL_VALUE': {
		'decode': decodeCurrentSourceCalVal,
	},
	'CURRENT_SOURCE_10UA_CAL_VALUE': {
		'decode': decodeCurrentSourceCalVal,
	},
	'WIFI_STATUS': {
		'valToString': {
			2900: 'Associated',
			2901: 'Associating',
			2902: 'Association Failed',
			2903: 'Un-Powered',
			2904: 'Booting Up',
			2905: 'Could Not Start',
			2906: 'Applying Settings',
			2907: 'DHCP Started',
			2908: 'Unknown',
			2909: 'Other'
		},
		'decode': function(res) {
			var str = checkStr(T7_LIST.WIFI_STATUS.valToString[res]);
			var isConnected = false;
			if(res === 2900) {
				isConnected = true;
			}
			return {'str': str, 'isConnected': isConnected, 'val': str};
		},
	},
	'WIFI_RSSI': {
		'images': [
			{'val':  0,'img':'wifiRSSI-0'},
			{'val':-45,'img':'wifiRSSI-4'},
			{'val':-60,'img':'wifiRSSI-3'},
			{'val':-65,'img':'wifiRSSI-2'},
			{'val':-75,'img':'wifiRSSI-1'},
			{'val':-80,'img':'wifiRSSI-0'},
			{'val':-200,'img':'wifiRSSI-0'},
			{'val':-201,'img':'wifiRSSI-not-active'},
		],
		'decode': function(res) {
			var unit = 'dB';
			var imgName = '';
			var str = res.toString() + 'dB';
			var WIFI_RSSI_IMAGES = T7_LIST.WIFI_RSSI.images;

			if(res < WIFI_RSSI_IMAGES[0].val) {
				WIFI_RSSI_IMAGES.some(function(rssiData){
					if(res < rssiData.val) {
					} else {
						imgName = rssiData.img;
						return true;
					}
				});
			} else {
				imgName = WIFI_RSSI_IMAGES[0].img;
			}

			if(imgName === '') {
				imgName = WIFI_RSSI_IMAGES[WIFI_RSSI_IMAGES.length-1].img;
			}
			return {
				'unit': unit,
				'imageName': imgName,
				'str': str
			};
		}
	},
	'WIFI_VERSION': {
		'decode': firmwareVersionRounder,
	},
	'HARDWARE_INSTALLED': {
		'decode': function(res) {
				// Deconstruct the HARDWARE_INSTALLED bitmask
				var highResADC = ((res & 0xFF) >> 0) & 0x1;
				var wifi = ((res & 0xFF) >> 1) & 0x1;
				var rtc = ((res & 0xFF) >> 2) & 0x1;
				var sdCard = ((res & 0xFF) >> 3) & 0x1;

				highResADC = highResADC == 1;
				wifi = wifi == 1;
				rtc = rtc == 1;
				sdCard = sdCard == 1;
				
				var subclass = '';
				var isPro = false;
				var productType = 'T7';
				if(highResADC || wifi || rtc) {
					subclass = '-Pro';
					isPro = true;
					productType += subclass;
				}

				// Wifi bit-fix, (if isPro, then wifi is installed)
				if(isPro) {
					wifi = true;
				}
				return {
					'highResADC': highResADC,
					'wifi': wifi,
					'rtc': rtc,
					'sdCard': sdCard,
					'res': res,
					'subclass': subclass,
					'isPro': isPro,
					'productType': productType
				};
			},
	},
	'WIFI_IP': ipDataType,
	'WIFI_SUBNET': ipDataType,
	'WIFI_GATEWAY': ipDataType,
	'WIFI_IP_DEFAULT': ipDataType,
	'WIFI_SUBNET_DEFAULT': ipDataType,
	'WIFI_GATEWAY_DEFAULT': ipDataType,
	'ETHERNET_IP': ipDataType,
	'ETHERNET_SUBNET': ipDataType,
	'ETHERNET_GATEWAY': ipDataType,
	'ETHERNET_DNS': ipDataType,
	'ETHERNET_ALTDNS': ipDataType,
	'ETHERNET_IP_DEFAULT': ipDataType,
	'ETHERNET_SUBNET_DEFAULT': ipDataType,
	'ETHERNET_GATEWAY_DEFAULT': ipDataType,
	'ETHERNET_DNS_DEFAULT': ipDataType,
	'ETHERNET_ALTDNS_DEFAULT': ipDataType,
};

exports.T7_LIST = T7_LIST;