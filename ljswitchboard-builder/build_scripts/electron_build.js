'use strict';

require('./utils/error_catcher');
const path = require('path');
const {getBuildDirectory} = require('./utils/get_build_dir');

const builder = require('electron-builder');
const Platform = builder.Platform;

const config = require('../package.json').build;

const OUTPUT_PROJECT_FILES_PATH = path.join(getBuildDirectory(), 'output');

const buildOS = {
    'darwin': 'darwin',
    'win32': 'win32'
}[process.platform] || 'linux';

const buildOpts = {
    projectDir: OUTPUT_PROJECT_FILES_PATH,
    publish: 'never',
    config
};


if ('darwin' === buildOS) {
    buildOpts.mac = ['default'];
} else if ('win32' === buildOS) {
    buildOpts.win = ['default'];
} else {
    buildOpts.linux = ['default'];
}

// Promise is returned
builder
    .build(buildOpts)
    .then(() => {
        // handle result
    })
    .catch((err) => {
        console.error(err);
        // handle error
        process.exit(1);
    });