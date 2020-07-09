var fs = require('fs');
var path = require('path');
var q = require('q');

var TEMP_PROJECT_FILES_DIRECTORY = 'temp_project_files';
var startingDir = process.cwd();
var TEMP_PROJECT_FILES_PATH = path.join(startingDir, TEMP_PROJECT_FILES_DIRECTORY);

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

function rewireLocalDependency(dependency) {
    var defered = q.defer();

    console.log('rewireLocalDependency', dependency);
    var projectDir = path.resolve(__dirname, '..', '..');
    console.log('projectDir', projectDir);

    var packageJson = JSON.parse(fs.readFileSync(path.join(dependency.directory, 'package.json')));

    for (var name in packageJson.dependencies) {
        var ver = packageJson.dependencies[name];
        if (ver === '*') {
            packageJson.dependencies[name] = 'file:' + path.join(projectDir, name);
        }
    }

    fs.writeFileSync(path.join(dependency.directory, 'package.json'), JSON.stringify(packageJson, null, 2));

    defered.resolve();

    return defered.promise;
}

function rewireLocalDependencies() {
    var promises = projectDirectories.map(rewireLocalDependency);

    q.allSettled(promises)
    .then(function() {
        console.log('Finished rewiring local dependencies');
    });
}

rewireLocalDependencies();
