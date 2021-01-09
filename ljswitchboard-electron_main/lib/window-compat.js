'use strict';

const electron = require('electron');
const BrowserWindow = electron.BrowserWindow;

/**
 * Class created as a helper during porting from nwjs to electron (previously gui.window)
 *
 */
class NwFakeWindow {
    get() {
        return BrowserWindow.getFocusedWindow();
    }

    open(url, windowData) {
        if (!windowData) {
            windowData = {};
        }

        const options = Object.assign({}, windowData, {
            webPreferences: Object.assign({}, windowData.webPreferences, {
                preload: `${__dirname}/preload.js`,
                nodeIntegration: true,
                enableRemoteModule: true,
                worldSafeExecuteJavaScript: true
            })
        });

        const window = new BrowserWindow(options);
        if (process.env.NODE_ENV === 'development' && windowData.name !== 'splash_win') {
            window.webContents.openDevTools();
        }

        window.loadURL(url);

        /*
            window.loadURL(url.format({
              pathname: path.join(__dirname, 'index.html'),
              protocol: 'file:',
              slashes: true
            }));
        */

        return window;
    }
}

exports.NwFakeWindow = NwFakeWindow;