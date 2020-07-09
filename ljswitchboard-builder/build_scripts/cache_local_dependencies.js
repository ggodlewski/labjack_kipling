var fs = require('fs');
var path = require('path');
const childProcess = require('child_process');

var startingDir = process.cwd();

const TEMP_PUBLISH_DIRECTORY = 'temp_publish';
const TEMP_PUBLISH_PATH = path.join(startingDir, TEMP_PUBLISH_DIRECTORY);

function cacheLocal() {

    const files = fs.readdirSync(TEMP_PUBLISH_PATH);
    for (var fileNo = 0; fileNo < files.length; fileNo++) {
        var fileName = path.join(TEMP_PUBLISH_PATH, files[fileNo]);

        console.log(childProcess.execSync(`npm cache add ${fileName}`, {
            'cwd': __dirname
        }).toString('utf-8'));
    }
}

cacheLocal();
