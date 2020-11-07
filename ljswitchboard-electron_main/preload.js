console.info('preload start');

require('module').Module._initPaths(); // Fix node_modules path

process.argv.forEach(arg => {
    if (arg.startsWith('--packageName=')) {
        global.packageName = arg.substr('--packageName='.length);
    }
});
console.log("global.packageName:", global.packageName);

const electron = require('electron');
const getInjector = require('lj-di').getInjector;
const injector = getInjector({ electron });
global.lj_di_injector = injector;

const package_loader = global.lj_di_injector.get('package_loader');
global.package_loader = package_loader;

if (-1 === ['ljswitchboard-electron_splash_screen', 'core'].indexOf(global.packageName)) {
    global.handlebars = require('handlebars');
    global.io_manager = package_loader.getPackage('io_manager');
    global.module_manager = package_loader.getPackage('module_manager');
}

window.addEventListener('message', (event) => {
}, false);

electron.ipcRenderer.on('postMessage', (event, data) => {
    const event2 = new CustomEvent(data.channel);
    event2.payload = data.payload;
    window.dispatchEvent(event2);
    // window.postMessage({type: data.channel, payload: data.payload}, '*');
});

console.info('preload end');
