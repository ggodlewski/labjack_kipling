var path = require('path'), fs=require('fs');

// find . | grep package.json.lerna_backup | while read NAME ; do mv $NAME $(echo $NAME | sed s/.lerna_backup//) ; done

var walk = function(directoryName) {
    fs.readdir(directoryName, function(e, files) {
        files.forEach(function(file) {
            var f = fs.statSync(path.join(directoryName, file));
            if (f.isDirectory()) {
                walk(file);
            } else {
                if (file.endsWith('lerna_backup')) {
                    // console.log(path.join(directoryName, file).replace('.lerna_backup', ''));
                    fs.renameSync(path.join(directoryName, file), path.join(directoryName, file).replace('.lerna_backup', ''));
                }
            }
        });
    });
};

walk(__dirname);
