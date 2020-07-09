var fs = require('fs');
var path = require('path');
var q = require('q');
const emptyDirectory = require('./empty_directory');
const childProcess = require('child_process');

var TEMP_PROJECT_FILES_DIRECTORY = 'temp_project_files';
var startingDir = process.cwd();
var TEMP_PROJECT_FILES_PATH = path.join(startingDir, TEMP_PROJECT_FILES_DIRECTORY);

const TEMP_PUBLISH_DIRECTORY = 'temp_publish';
const TEMP_PUBLISH_PATH = path.join(startingDir, TEMP_PUBLISH_DIRECTORY);

var buildData = require('../package.json');

var projectDirectories = [];
kipling_dependencies = buildData.kipling_dependencies;

function normalizeAndJoin(dirA, dirB) {
    // console.log('HERE', dirA, dirB);
    return path.normalize(path.join.apply(this, arguments));
}

projectDirectories = kipling_dependencies.map(function(kipling_dependency) {
    var key = '';
    for(var i = 0; i < 50; i ++) {
        if(typeof(kipling_dependency[i]) === 'undefined') {
            key += ' ';
        } else {
            key += kipling_dependency[i];
        }
    }
    return {
        'name': kipling_dependency,
        'key': key,
        'directory': normalizeAndJoin(TEMP_PROJECT_FILES_PATH, kipling_dependency)
    };
});

function localPublish(directory, name) {
    const existingFiles = fs.readdirSync(TEMP_PUBLISH_PATH);
    for (var fileNo1 = 0; fileNo1 < existingFiles.length; fileNo1++) {
        var fileName1 = existingFiles[fileNo1];
        if (fileName1.startsWith(name + '.')) {
            return path.join(TEMP_PUBLISH_PATH, fileName1);
        }
    }

    console.log(childProcess.execSync(`npm pack ${directory} --loglevel silent`, {
        'cwd': TEMP_PUBLISH_PATH
    }).toString('utf-8'));

    const files = fs.readdirSync(TEMP_PUBLISH_PATH);
    for (var fileNo = 0; fileNo < files.length; fileNo++) {
        var fileName = files[fileNo];
        if (fileName.startsWith(name + '-')) {
            return path.join(TEMP_PUBLISH_PATH, fileName);
        }
    }

    throw new Error('Error publishing locally ' + directory);
}


function rewireLocalDependency(dependency) {
    var defered = q.defer();

    var projectDir = path.resolve(__dirname, '..', '..');
    var packageJson = JSON.parse(fs.readFileSync(path.join(dependency.directory, 'package.json')).toString('UTF-8'));

    for (var name in packageJson.dependencies) {
        var ver = packageJson.dependencies[name];
        if (ver === '*') {
            const dir = path.join(projectDir, name);
            if (fs.existsSync(dir)) {
                var tgzPath = localPublish(dir, name);
                packageJson.dependencies[name] = 'file:' + tgzPath;
            }
        }
    }

    fs.writeFileSync(path.join(dependency.directory, 'package.json'), JSON.stringify(packageJson, null, 2));

    defered.resolve();

    return defered.promise;
}

function rewireLocalDependencies() {
    emptyDirectory.emptyDirectoryOrDie(TEMP_PUBLISH_PATH);

    var promises = projectDirectories.map(rewireLocalDependency);

    q.allSettled(promises)
    .then(function() {
        console.log('Finished rewiring local dependencies');
    });
}

rewireLocalDependencies();
