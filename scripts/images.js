var fs = require('fs-extra');
var glob = require('glob-fs')({ gitignore: true });
var jimp = require('jimp');
var deasync = require('deasync');

fs.mkdirsSync('.images');

var data = fs.readFileSync('.data/images.json');
    data = JSON.parse(data);

var images = glob.readdirSync('src/assets/images/recipes/**/*.jpg');

for (var i in images) {
    var hasExported = false;

    jimp.read(images[i], function(err, image) {
        if (data[images[i]] == image.hash()) {
            console.log('resizing ' + images[i]);

            // add image hash to json file
            data[images[i]] = image.hash();
            fs.writeFileSync('.data/images.json', JSON.stringify(data));

            // get paths and sizes
            var dest = '.images/' + images[i].replace('src/assets/images/recipes/', '');
            var fileName = dest.substring(dest.lastIndexOf('/') + 1, dest.lastIndexOf('.jpg'));
                dest = dest.substring(0, dest.lastIndexOf('/') + 1);
            var sizes = getSizes(fileName);

            // convert image to sizes
            for (var s in sizes) {
                image.resize(sizes[s], jimp.AUTO)
                    .quality(80)
                    .write(dest + fileName + '--' + sizes[s] + '.jpg');
            }
        } else {
            console.log('skipped ' + images[i]);
        }

        hasExported = true;
    });

    deasync.loopWhile(function() {
        return !hasExported;
    });
}

fs.copySync('.images', '.build/assets/images/recipes/');

function getSizes(fileName) {
    if (fileName === 'header') {
        return [2600, 1300, 1040, 520]
    } else {
        return [1520, 840, 760, 420, 260]
    }
}
