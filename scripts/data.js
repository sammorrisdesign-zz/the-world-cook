var fs = require('fs-extra');
var deasync = require('deasync');
var gsjson = require('google-spreadsheet-to-json');
var markdown = require('markdown').markdown;
var cheerio = require('cheerio');

var helpers = require('./helpers.js');

var isDone = false;
var data = {};

function organiseIntoRecipe(data) {
    var organisedData = {};

    for (var i in data.recipes) {
        organisedData[helpers.handlise(data.recipes[i].country)] = data.recipes[i];
    }

    for (var i in organisedData) {
        organisedData[i].level = 'recipe';

        if (data[i + 'Steps']) {
            organisedData[i].steps = data[i + 'Steps'];
        }

        if (data[i + 'Ingredients']) {
            organisedData[i].ingredients = data[i + 'Ingredients'];
        }
    }

    return organisedData;
}

function injectIngredientsIntoSteps(data) {
    for (var i in data) {
        if (data[i].steps) {
            for (var step in data[i].steps) {
                data[i].steps[step].instructions = markdown.toHTML(data[i].steps[step].instructions);
                data[i].steps[step].instructions = data[i].steps[step].instructions.replace(/<a href="/g, '<span class=\'recipe-step__ingredient\' data-ingredient=\'').replace(/">/g, '\'>').replace(/<\/a>/g, '</span>');

                var $ = cheerio.load(data[i].steps[step].instructions);

                $('.recipe-step__ingredient').each(function(ingredientNum, el) {
                    if ($(el).attr('data-ingredient').indexOf(' ') >= 0) {
                        var units = $(el).attr('data-ingredient').split(' ');
                        var ingredientName = units[0].replace(/-/g, ' ').toUpperCase();
 
                        if (units.length == 3) {
                            $(el).attr('data-ingredient', units[0]);

                            for (var ingredient in data[i].ingredients) {
                                if (data[i].ingredients[ingredient].ingredient.toUpperCase() === ingredientName) {
                                    data[i].ingredients[ingredient].isHalfable = true;

                                    if (data[i].ingredients[ingredient].halfSteps !== typeof Array) {
                                        data[i].ingredients[ingredient].halfSteps = [];
                                    }

                                    data[i].ingredients[ingredient].halfSteps.push({
                                        stepNum: parseInt(step) + 1,
                                        imperial: prettifyAmount(units[1]),
                                        metric: prettifyAmount(units[2])
                                    });
                                }
                            }

                        }
                    }
                }.bind(this));

                data[i].steps[step].instructions = $('p').html();
            }
        }
    }

    return data;
}


function convertTempsToHTML(data) {
    var regEx = RegExp(/[0-9]{3}F\/[0-9]{3}C/g);

    for (var i in data) {
        for (var step in data[i].steps) {
            var string = data[i].steps[step].instructions;
            var match;
            var matches = [];

            while ((match = regEx.exec(string)) != null) {
                matches.unshift(match.index);
            }

            matches.forEach(function(index) {
                var fahrenheit = string.substring(index, index + 3);
                var celsius = string.substring(index + 5, index + 8);

                string = string.substring(0, index) + '<span class=\'recipe-step__temp recipe-step__temp--fahrenheit\'>' + fahrenheit + '&deg;F</span><span class=\'recipe-step__temp recipe-step__temp--celsius\'>' + celsius + '&deg;C</span>' + string.substring(index + 9, string.length);
            });

            data[i].steps[step].instructions = string;
        }
    }

    return data;
}

function convertUnitsToHTML(data) {
    var regEx = RegExp(/\{[^}]*\}/g);

    for (var i in data) {
        for (var step in data[i].steps) {
            var string = data[i].steps[step].instructions;
            var match;
            var matches = [];

            while ((match = regEx.exec(string)) != null) {
                matches.unshift(match.index);
            }

            matches.forEach(function(index) {
                var endIndex = string.indexOf('}');
                var bothUnits = string.substring(index, endIndex);
                var divide = string.indexOf(':');
                var imperial = string.substring(index + 1, divide);
                var metric = string.substring(divide + 1, endIndex);

                string = string.substring(0, index) + '<span class=\'recipe-step__unit recipe-step__unit--imperial\'>' + imperial + '</span><span class=\'recipe-step__unit recipe-step__unit--metric\'>' + metric + '</span>' + string.substring(endIndex + 1, string.length);
            });

            data[i].steps[step].instructions = string;
        }
    }

    return data;
}

function convertDescriptionsToHTML(data) {
    for (var i in data) {
        if (data[i].description) {
            
            data[i].description = markdown.toHTML(data[i].description);
        }
    }

    return data;
}

function prettifyAmount(string) {
    if (string == '' || string == undefined) { return string; }
    string = string.toString();
    string = string.replace('1/2', '&frac12;');
    string = string.replace('1/4', '&frac14;');
    return string;
}

function cleanIngredientAmounts(data) {
    for (var i in data) {
        if (data[i].ingredients) {
            for (ingredient in data[i].ingredients) {
                data[i].ingredients[ingredient].metric = prettifyAmount(data[i].ingredients[ingredient].metric);
                data[i].ingredients[ingredient].imperial = prettifyAmount(data[i].ingredients[ingredient].imperial);
            }
        }
    }

    return data;
}

function createIngredientHandles(data) {
    for (var i in data) {
        var ingredients = [];

        if (data[i].ingredients) {
            for (ingredient in data[i].ingredients) {
                var handlisedIngredient = helpers.handlise(data[i].ingredients[ingredient].ingredient);

                if (ingredients.includes(handlisedIngredient)) {
                    data[i].ingredients[ingredient].handle = handlisedIngredient + '-1';
                } else {
                    data[i].ingredients[ingredient].handle = handlisedIngredient;
                }

                ingredients.push(handlisedIngredient);
            }
        }
    }

    return data;
}

function createRelated(data) {
    for (var i in data) {
        var thisGroup = data[i].group;
        data[i].related = [];

        for (var sub in data) {
            if (thisGroup == data[sub].group) {
                var related = data[sub];

                data[i].related.push({
                    colour: related.colour,
                    recipe: related.recipe,
                    time: related.time,
                    additionalTime: related.additionalTime,
                    slug: related.slug,
                    country: related.country,
                    date: related.date,
                    isScheduled: related.isScheduled,
                    isBeta: related.isBeta
                });
            }
        }
    }

    return data;
}

function addScheduleStatus(data) {
    for (var i in data) {
//         var currentDate = new Date();
        var currentDate = new Date('June 30 2018');
        var publishDate = new Date('June ' + data[i].date + ' 2018');

        data[i].isScheduled = publishDate > currentDate || publishDate == currentDate;
    }

    return data;
}

function getData() {
    gsjson({
        spreadsheetId: '1i-wdm0_QJPuku8FTXIxDOyian3Drqz5KllnChMBjUCg',
        allWorksheets: true,
        credentials: require('../keys.json').google
    }).then(function(result) {
        // organise response in a useable way
        for (var worksheet in result) {
            for (var worksheetTitle in result[worksheet]) {
                data[worksheetTitle] = result[worksheet][worksheetTitle];
            }
        }

        data = organiseIntoRecipe(data);
        data = injectIngredientsIntoSteps(data);
        data = convertTempsToHTML(data);
        data = convertUnitsToHTML(data)
        data = convertDescriptionsToHTML(data);
        data = cleanIngredientAmounts(data);
        data = createIngredientHandles(data);
        data = addScheduleStatus(data);
        data = createRelated(data);

        fs.writeFileSync('.data/data.json', JSON.stringify(data));

        console.log('data updated');

        isDone = true;
    }).catch(function(err) {
        console.log(err.message);
        console.log(err.stack);
        isDone = true;

        return;
    });

    deasync.loopWhile(function() {
        return !isDone;
    });
}

getData();
